import fs from "node:fs";
import path from "node:path";
import { credentialsDir } from "./credentials.js";

export function rulesPath(): string {
  return path.join(credentialsDir(), "rules.md");
}

export const RULES_SKELETON = `# My rules for lazorik
# These apply to every session, on top of the base system prompt.
# Examples:
# - Always answer in Czech.
# - Prefer small commits with imperative subjects.
# - Never touch files outside the workspace.
# - When unsure, ask before changing public APIs.
`;

export function loadUserRules(file: string = rulesPath()): string | null {
  try {
    const content = fs.readFileSync(file, "utf8");
    const trimmed = content.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

export function ensureUserRules(file: string = rulesPath()): string {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, RULES_SKELETON, "utf8");
  }
  return file;
}
