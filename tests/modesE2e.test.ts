import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commandRun } from "../src/cli/run.js";

interface CapturedRequest {
  tools: Array<{ function?: { name?: string } }>;
  messages: Array<Record<string, unknown>>;
}

const captured: CapturedRequest[] = [];
let server: http.Server;
let baseUrl: string;
let dir: string;
let nextId = 0;

function openAiResponse(toolCall?: { name: string; arguments: string }): string {
  const message = toolCall
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: `call_${(nextId += 1)}`,
            type: "function",
            function: toolCall,
          },
        ],
      }
    : { role: "assistant", content: "Hotovo — pokus o zápis zaznamenán." };
  return JSON.stringify({
    choices: [
      {
        finish_reason: toolCall ? "tool_calls" : "stop",
        message,
      },
    ],
  });
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        tools?: Array<{ function?: { name?: string } }>;
        messages?: Array<Record<string, unknown>>;
        stream?: boolean;
      };
      captured.push({
        tools: body.tools ?? [],
        messages: body.messages ?? [],
      });
      const hasToolResult = (body.messages ?? []).some((m) => m["role"] === "tool");
      const payload = hasToolResult
        ? openAiResponse()
        : openAiResponse({
            name: "write_file",
            arguments: JSON.stringify({ path: "pwned.txt", content: "owned" }),
          });
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const parsed = JSON.parse(payload) as {
          choices: Array<{
            finish_reason: string;
            message: {
              content?: string | null;
              tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
            };
          }>;
        };
        const choice = parsed.choices[0];
        const delta: Record<string, unknown> = {};
        if (choice?.message.content) {
          delta["content"] = choice.message.content;
        }
        if (choice?.message.tool_calls) {
          delta["tool_calls"] = choice.message.tool_calls.map((tc, index) => ({
            index,
            id: tc.id,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
        res.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: choice?.finish_reason ?? "stop" }],
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server failed to start");
  }
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lazorik-e2e-"));
  captured.length = 0;
  process.env["OPENAI_API_KEY"] = "test-key";
  process.env["OPENAI_BASE_URL"] = baseUrl;
});

afterEach(async () => {
  delete process.env["OPENAI_API_KEY"];
  delete process.env["OPENAI_BASE_URL"];
  await fs.rm(dir, { recursive: true, force: true });
});

async function runCli(args: string[]): Promise<{
  code: number;
  out: string[];
  err: string[];
}> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await commandRun(args, {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  });
  return { code, out, err };
}

describe("plan mode e2e (mock provider)", () => {
  it("does not expose write/exec tools and refuses the write", async () => {
    const result = await runCli([
      "--root",
      dir,
      "--provider",
      "openai",
      "--mode",
      "plan",
      "--yes",
      "zkus zapsat soubor",
    ]);

    expect(result.code).toBe(0);
    expect(result.err.join("\n")).toContain("mode=plan");

    const toolNames = captured[0]?.tools.map((t) => t.function?.name) ?? [];
    expect(toolNames).toContain("read_file");
    expect(toolNames).not.toContain("write_file");
    expect(toolNames).not.toContain("run_command");

    const toolResult = captured[1]?.messages.find((m) => m["role"] === "tool");
    expect(JSON.stringify(toolResult)).toContain("Unknown tool: write_file");

    await expect(fs.access(path.join(dir, "pwned.txt"))).rejects.toThrow();
  });

  it("includes the plan suffix in the system prompt", async () => {
    await runCli([
      "--root",
      dir,
      "--provider",
      "openai",
      "--mode",
      "plan",
      "--yes",
      "analyzuj",
    ]);
    const system = captured[0]?.messages.find((m) => m["role"] === "system");
    expect(JSON.stringify(system)).toContain("PLAN (read-only)");
  });
});

describe("code mode e2e (mock provider)", () => {
  it("exposes all tools and performs the approved write", async () => {
    const result = await runCli([
      "--root",
      dir,
      "--provider",
      "openai",
      "--mode",
      "code",
      "--yes",
      "zkus zapsat soubor",
    ]);

    expect(result.code).toBe(0);
    expect(result.err.join("\n")).toContain("mode=code");

    const toolNames = captured[0]?.tools.map((t) => t.function?.name) ?? [];
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("run_command");

    const system = captured[0]?.messages.find((m) => m["role"] === "system");
    expect(JSON.stringify(system)).toContain("Mode: CODE");

    const written = await fs.readFile(path.join(dir, "pwned.txt"), "utf8");
    expect(written).toBe("owned");
    expect(result.err.join("\n")).toContain("write_file");
  });
});
