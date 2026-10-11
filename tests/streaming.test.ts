import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent/loop.js";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import { autoApproveConfirmer } from "../src/safety/confirm.js";
import { createDefaultRegistry } from "../src/tools/index.js";
import { createOpenAIProvider } from "../src/providers/openai.js";
import { createAnthropicProvider } from "../src/providers/anthropic.js";
import { streamSse } from "../src/providers/http.js";
import type { AssistantTurn, ChatRequest, Provider } from "../src/types.js";

type SseScript = Array<{ data?: string; delayMs?: number; comment?: string }>;

let server: http.Server;
let baseUrl: string;
let lastBody: Record<string, unknown> | undefined;

async function startServer(script: (req: http.IncomingMessage, body: Record<string, unknown>) => SseScript): Promise<void> {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      lastBody = body;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const events = script(req, body);
      let i = 0;
      const writeNext = (): void => {
        if (i >= events.length) {
          res.end();
          return;
        }
        const event = events[i] ?? {};
        i += 1;
        const chunk = event.comment
          ? `: ${event.comment}\n\n`
          : `data: ${event.data}\n\n`;
        res.write(chunk);
        if (event.delayMs) {
          setTimeout(writeNext, event.delayMs);
        } else {
          setImmediate(writeNext);
        }
      };
      setImmediate(writeNext);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server failed to start");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("OpenAI streaming", () => {
  it("accumulates text deltas and reports them live", async () => {
    await startServer(() => [
      { data: JSON.stringify({ choices: [{ delta: { content: "Ahoj" } }] }) },
      { data: JSON.stringify({ choices: [{ delta: { content: " světe" } }] }) },
      { data: JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }) },
      { data: "[DONE]" },
    ]);
    const provider = createOpenAIProvider({
      apiKey: "k",
      model: "m",
      baseUrl,
    });
    const deltas: string[] = [];
    const turn = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onText: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(["Ahoj", " světe"]);
    expect(turn.text).toBe("Ahoj světe");
    expect(turn.stopReason).toBe("stop");
    expect(lastBody?.["stream"]).toBe(true);
  });

  it("rebuilds tool calls from streamed argument chunks", async () => {
    const args = JSON.stringify({ path: "a.txt", content: "hi" });
    await startServer(() => [
      {
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "call_1", function: { name: "write_file", arguments: args.slice(0, 10) } },
                ],
              },
            },
          ],
        }),
      },
      {
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: args.slice(10) } }],
              },
            },
          ],
        }),
      },
      { data: JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) },
      { data: "[DONE]" },
    ]);
    const provider = createOpenAIProvider({ apiKey: "k", model: "m", baseUrl });
    const turn = await provider.chat({
      messages: [{ role: "user", content: "write" }],
      tools: [],
      onText: () => {},
    });
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]?.name).toBe("write_file");
    expect(turn.toolCalls[0]?.arguments).toEqual({ path: "a.txt", content: "hi" });
    expect(turn.stopReason).toBe("tool_calls");
  });

  it("aborts when the stream goes idle", async () => {
    await startServer(() => [
      { comment: "keep-alive" },
      { data: JSON.stringify({ choices: [{ delta: { content: "x" } }] }), delayMs: 5000 },
    ]);
    await expect(
      streamSse({
        url: `${baseUrl}/v1`,
        providerLabel: "openai",
        headers: {},
        body: {},
        idleTimeoutMs: 400,
        onEvent: () => {},
      }),
    ).rejects.toThrow(/idle/i);
  }, 10_000);

  it("supports external cancellation", async () => {
    await startServer(() => [
      { comment: "hold" },
      { data: JSON.stringify({ choices: [{ delta: { content: "late" } }] }), delayMs: 5000 },
    ]);
    const provider = createOpenAIProvider({ apiKey: "k", model: "m", baseUrl });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("zrušeno uživatelem")), 100);
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "hi" }],
        tools: [],
        onText: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow(/zrušeno/i);
  }, 10_000);
});

describe("Anthropic streaming", () => {
  it("accumulates text and tool_use blocks from SSE events", async () => {
    await startServer(() => [
      { data: JSON.stringify({ type: "message_start", message: {} }) },
      { data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text" } }) },
      { data: JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Nahoře" } }) },
      { data: JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " dole" } }) },
      { data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
      { data: JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "read_file" } }) },
      { data: JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } }) },
      { data: JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"x.ts"}' } }) },
      { data: JSON.stringify({ type: "content_block_stop", index: 1 }) },
      { data: JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" } }) },
      { data: JSON.stringify({ type: "message_stop" }) },
    ]);
    const provider = createAnthropicProvider({ apiKey: "k", model: "m", baseUrl });
    const deltas: string[] = [];
    const turn = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      onText: (d) => deltas.push(d),
    });
    expect(deltas.join("")).toBe("Nahoře dole");
    expect(turn.text).toBe("Nahoře dole");
    expect(turn.toolCalls).toEqual([
      { id: "toolu_1", name: "read_file", arguments: { path: "x.ts" } },
    ]);
    expect(turn.stopReason).toBe("tool_calls");
  });
});

describe("agent loop streaming", () => {
  it("forwards onTextDelta into the provider request", async () => {
    let sawOnText = false;
    const provider: Provider = {
      name: "openai",
      async chat(request: ChatRequest): Promise<AssistantTurn> {
        sawOnText = typeof request.onText === "function";
        request.onText?.("live ");
        request.onText?.("token");
        return { text: "live token", toolCalls: [], stopReason: "stop" };
      },
    };
    const root = process.cwd();
    const result = await runAgentLoop("ahoj", {
      provider,
      tools: createDefaultRegistry(),
      ctx: {
        root,
        confirmer: autoApproveConfirmer,
        ignore: await IgnoreMatcher.fromWorkspace(root),
        allowedCommands: [],
      },
      system: "sys",
      maxSteps: 1,
      onTextDelta: () => {},
    });
    expect(sawOnText).toBe(true);
    expect(result.text).toBe("live token");
  });
});
