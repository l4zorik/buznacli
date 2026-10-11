import { describe, expect, it } from "vitest";
import { runAgentLoop, type AgentEvent } from "../src/agent/loop.js";
import { autoApproveConfirmer } from "../src/safety/confirm.js";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import { ToolRegistry, type ToolContext } from "../src/tools/registry.js";
import type { AssistantTurn, Provider, ToolCall } from "../src/types.js";

function scriptedProvider(turns: AssistantTurn[]): Provider {
  let index = 0;
  return {
    name: "openai",
    async chat(): Promise<AssistantTurn> {
      const turn = turns[index];
      if (!turn) {
        throw new Error("Scripted provider exhausted");
      }
      index += 1;
      return turn;
    },
  };
}

function echoRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "echo",
    description: "Echo",
    parameters: { type: "object", properties: { m: { type: "string" } } },
    validateArgs(args: unknown): { m: string } {
      if (!args || typeof args !== "object" || typeof (args as { m?: unknown }).m !== "string") {
        throw new Error("bad args");
      }
      return { m: (args as { m: string }).m };
    },
    async run(args: { m: string }): Promise<string> {
      return `echo:${args.m}`;
    },
  });
  return registry;
}

function makeCtx(): ToolContext {
  return {
    root: "/tmp/ws",
    confirmer: autoApproveConfirmer,
    ignore: IgnoreMatcher.withDefaults(),
    allowedCommands: ["node"],
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: args };
}

describe("runAgentLoop", () => {
  it("returns immediately when the model answers without tools", async () => {
    const provider = scriptedProvider([
      { text: "Ahoj!", toolCalls: [], stopReason: "stop" },
    ]);
    const result = await runAgentLoop("pozdrav", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 5,
    });
    expect(result).toMatchObject({ status: "done", text: "Ahoj!", steps: 1 });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({ role: "user", content: "pozdrav" });
    expect(result.messages[1]).toMatchObject({ role: "assistant", content: "Ahoj!" });
  });

  it("executes tool calls and feeds results back to the model", async () => {
    const provider = scriptedProvider([
      {
        text: "",
        toolCalls: [toolCall("c1", "echo", { m: "hi" })],
        stopReason: "tool_calls",
      },
      { text: "Hotovo.", toolCalls: [], stopReason: "stop" },
    ]);

    const seen: AgentEvent[] = [];
    const result = await runAgentLoop("udělej echo", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 5,
      onEvent: (event) => seen.push(event),
    });

    expect(result.status).toBe("done");
    expect(result.text).toBe("Hotovo.");
    expect(result.steps).toBe(2);
    expect(seen.filter((e) => e.type === "tool_start")).toHaveLength(1);
    expect(seen.filter((e) => e.type === "tool_end")).toHaveLength(1);
  });

  it("stops at the step limit", async () => {
    const provider = scriptedProvider(
      Array.from({ length: 3 }, (_, i) => ({
        text: "",
        toolCalls: [toolCall(`c${i}`, "echo", { m: String(i) })],
        stopReason: "tool_calls" as const,
      })),
    );

    const result = await runAgentLoop("nekonečně", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 2,
    });

    expect(result.status).toBe("limit_reached");
    expect(result.steps).toBe(2);
  });

  it("passes tool errors back to the model instead of crashing", async () => {
    const provider = scriptedProvider([
      {
        text: "",
        toolCalls: [toolCall("c1", "missing_tool", {})],
        stopReason: "tool_calls",
      },
      { text: "Omlouvám se, opravím to.", toolCalls: [], stopReason: "stop" },
    ]);

    const result = await runAgentLoop("zavolej chybný nástroj", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 5,
    });

    expect(result.status).toBe("done");
    expect(result.text).toContain("Omlouvám se");
  });

  it("continues conversation history across turns", async () => {
    const requests: Array<{ messages: Array<{ role: string }> }> = [];
    const turns: AssistantTurn[] = [
      { text: "Jedna.", toolCalls: [], stopReason: "stop" },
      { text: "Dva.", toolCalls: [], stopReason: "stop" },
    ];
    let index = 0;
    const provider: Provider = {
      name: "openai",
      async chat(request): Promise<AssistantTurn> {
        requests.push({ messages: request.messages.map((m) => ({ role: m.role })) });
        const turn = turns[index]!;
        index += 1;
        return turn;
      },
    };

    const first = await runAgentLoop("číslo jedna", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 5,
    });
    const second = await runAgentLoop("číslo dva", {
      provider,
      tools: echoRegistry(),
      ctx: makeCtx(),
      system: "sys",
      maxSteps: 5,
      history: first.messages,
    });

    expect(second.text).toBe("Dva.");
    expect(requests[1]?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(first.messages).toHaveLength(2);
    expect(second.messages).toHaveLength(4);
  });
});
