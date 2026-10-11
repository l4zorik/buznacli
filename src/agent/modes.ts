import type { ToolRegistry } from "../tools/index.js";

export type AgentMode = "plan" | "code";

export const ALL_MODES: readonly AgentMode[] = ["plan", "code"];

export const PLAN_MODE_TOOLS: readonly string[] = [
  "list_files",
  "read_file",
  "git_diff",
];

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "plan" || value === "code";
}

export function resolveToolsForMode(
  registry: ToolRegistry,
  mode: AgentMode,
): ToolRegistry {
  if (mode === "code") {
    return registry;
  }
  return registry.subset(PLAN_MODE_TOOLS);
}

export const MODE_SYSTEM_SUFFIX: Record<AgentMode, string> = {
  plan: `Mode: PLAN (read-only).
You may explore, read files and inspect the git diff, but you must not change anything.
Do not call write_file or run_command — those tools are disabled in this mode.
Finish with a concrete implementation plan: goal, touched files, step-by-step changes, risks and how to verify.`,
  code: `Mode: CODE.
You may edit files and run approved developer commands. Keep changes small and verify with typecheck/tests when possible.`,
};

export function applyModeToPrompt(system: string, mode: AgentMode): string {
  return `${system}\n\n${MODE_SYSTEM_SUFFIX[mode]}`;
}
