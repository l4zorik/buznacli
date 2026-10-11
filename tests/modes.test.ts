import { describe, expect, it } from "vitest";
import {
  applyModeToPrompt,
  isAgentMode,
  resolveToolsForMode,
  PLAN_MODE_TOOLS,
} from "../src/agent/modes.js";
import { createDefaultRegistry } from "../src/tools/index.js";

describe("isAgentMode", () => {
  it("accepts plan and code only", () => {
    expect(isAgentMode("plan")).toBe(true);
    expect(isAgentMode("code")).toBe(true);
    expect(isAgentMode("yolo")).toBe(false);
    expect(isAgentMode(undefined)).toBe(false);
    expect(isAgentMode(42)).toBe(false);
  });
});

describe("resolveToolsForMode", () => {
  it("keeps the full tool set in code mode", () => {
    const registry = createDefaultRegistry();
    const tools = resolveToolsForMode(registry, "code");
    expect(tools.names().sort()).toEqual(registry.names().sort());
  });

  it("restricts plan mode to read-only tools", () => {
    const registry = createDefaultRegistry();
    const tools = resolveToolsForMode(registry, "plan");
    expect(tools.names().sort()).toEqual([...PLAN_MODE_TOOLS].sort());
    expect(tools.has("write_file")).toBe(false);
    expect(tools.has("run_command")).toBe(false);
  });

  it("does not mutate the source registry", () => {
    const registry = createDefaultRegistry();
    resolveToolsForMode(registry, "plan");
    expect(registry.has("write_file")).toBe(true);
    expect(registry.has("run_command")).toBe(true);
  });
});

describe("applyModeToPrompt", () => {
  it("appends the plan restrictions", () => {
    const prompt = applyModeToPrompt("BASE", "plan");
    expect(prompt).toContain("BASE");
    expect(prompt).toContain("PLAN (read-only)");
    expect(prompt).toContain("write_file or run_command");
  });

  it("appends the code mode note", () => {
    const prompt = applyModeToPrompt("BASE", "code");
    expect(prompt).toContain("Mode: CODE");
  });
});
