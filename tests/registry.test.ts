import { describe, expect, it } from "vitest";
import { ToolNotFoundError } from "../src/errors.js";
import { denyAllConfirmer } from "../src/safety/confirm.js";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import {
  ToolRegistry,
  type Tool,
  type ToolContext,
  asObject,
  requireString,
} from "../src/tools/registry.js";
import { createDefaultRegistry } from "../src/tools/index.js";

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root: "/tmp/workspace",
    confirmer: denyAllConfirmer,
    ignore: IgnoreMatcher.withDefaults(),
    allowedCommands: ["node"],
    ...overrides,
  };
}

interface EchoArgs {
  message: string;
}

const echoTool: Tool<EchoArgs> = {
  name: "echo",
  description: "Echo a message",
  parameters: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  validateArgs(args: unknown): EchoArgs {
    const obj = asObject(args);
    return { message: requireString(obj, "message") };
  },
  async run(args: EchoArgs): Promise<string> {
    return args.message;
  },
};

const failingTool: Tool<Record<string, never>> = {
  name: "boom",
  description: "Always fails",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  validateArgs(): Record<string, never> {
    return {} as Record<string, never>;
  },
  async run(): Promise<string> {
    throw new Error("kaboom");
  },
};

describe("ToolRegistry", () => {
  it("registers tools and exposes definitions", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    expect(registry.has("echo")).toBe(true);
    expect(registry.names()).toEqual(["echo"]);
    expect(registry.list()).toEqual([
      {
        name: "echo",
        description: "Echo a message",
        parameters: echoTool.parameters,
      },
    ]);
  });

  it("rejects duplicate tool names", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    expect(() => registry.register(echoTool)).toThrow(/already registered/);
  });

  it("executes a valid tool call", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const result = await registry.execute(
      "echo",
      { message: "hello" },
      makeContext(),
    );
    expect(result).toEqual({ output: "hello", isError: false });
  });

  it("throws for unknown tools", async () => {
    const registry = new ToolRegistry();
    await expect(
      registry.execute("nope", {}, makeContext()),
    ).rejects.toThrow(ToolNotFoundError);
  });

  it("returns an error result when validation fails", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const result = await registry.execute("echo", { message: 42 }, makeContext());
    expect(result.isError).toBe(true);
    expect(result.output).toContain("message");
  });

  it("returns an error result when the tool throws", async () => {
    const registry = new ToolRegistry();
    registry.register(failingTool);
    const result = await registry.execute("boom", {}, makeContext());
    expect(result.isError).toBe(true);
    expect(result.output).toContain("kaboom");
  });

  it("provides the default tool set", () => {
    const registry = createDefaultRegistry();
    expect(registry.names().sort()).toEqual([
      "git_diff",
      "list_files",
      "read_file",
      "run_command",
      "write_file",
    ]);
    for (const definition of registry.list()) {
      expect(definition.parameters.type).toBe("object");
      expect(definition.description.length).toBeGreaterThan(10);
    }
  });
});
