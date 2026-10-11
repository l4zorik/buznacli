import fs from "node:fs/promises";
import path from "node:path";
import { loadUserRules, rulesPath } from "../config/rules.js";
import { applyModeToPrompt, type AgentMode } from "./modes.js";

export const BASE_SYSTEM_PROMPT = `You are lazorik, an open source CLI coding agent working inside a local workspace.
Rules:
- Explore with list_files and read_file before making changes.
- Prefer small, precise edits. Use write_file for new or fully rewritten files.
- Use run_command only for development tasks (tests, typecheck, build, linters, git status/log).
- Always explain briefly what you are doing and finish with a concise summary in the user's language.`;

export const AGENTS_FILE = "AGENTS.md";

export async function loadAgentsMd(root: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(root, AGENTS_FILE), "utf8");
    const trimmed = content.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

export interface SystemPromptOptions {
  userRulesFile?: string;
}

export async function buildSystemPrompt(
  root: string,
  mode: AgentMode = "code",
  options: SystemPromptOptions = {},
): Promise<string> {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  const userRules = loadUserRules(options.userRulesFile ?? rulesPath());
  if (userRules) {
    parts.push(`Your personal rules:\n${userRules}`);
  }

  const agents = await loadAgentsMd(root);
  if (agents) {
    parts.push(`Project instructions from ${AGENTS_FILE}:\n${agents}`);
  }

  return applyModeToPrompt(parts.join("\n\n"), mode);
}
