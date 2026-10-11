import path from "node:path";
import { isSensitiveRelative } from "./paths.js";

export const DEFAULT_ALLOWED_COMMANDS: readonly string[] = [
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "git",
  "tsc",
  "tsx",
  "eslint",
  "prettier",
  "vitest",
  "jest",
  "ls",
  "dir",
  "pwd",
  "echo",
  "cat",
  "type",
  "head",
  "tail",
  "wc",
];

const BLOCKED_COMMAND_PATTERNS: readonly RegExp[] = [
  /\bsudo\b/i,
  /\brm\s+-[a-z]*[rf]/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bchmod\s+(-[a-z]+\s+)*(777|a\+rwx)\b/i,
  /\bcurl\b[^|]*\|\s*(ba|z|k)?sh\b/i,
  /\bwget\b[^|]*\|\s*(ba|z|k)?sh\b/i,
  /iex\b|\binvoke-expression\b/i,
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /\bformat\b\s+[a-z]:/i,
];

const SHELL_METACHARACTERS: readonly RegExp[] = [
  /[;&|`$<>]/,
  /\$\(/,
  /\r|\n/,
];

export const SENSITIVE_ARGUMENT_PATTERN =
  /(^|[\s/\\])\.env(\.|$|\s)|(^|[\s/\\])\.ssh([/\\\s]|$)|(^|[\s/\\])\.aws([/\\\s]|$)|(^|[\s/\\])id_rsa|(^|[\s/\\])id_ed25519|\.pem(\s|$)|(^|[\s/\\])secrets?(\.\w+)?($|\s)/i;

export type CommandCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function stripExecutableName(token: string): string {
  let cleaned = token.trim().replace(/^["']|["']$/g, "");
  cleaned = cleaned.replace(/\\/g, "/");
  const base = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  return base.replace(/\.(exe|cmd|bat|com)$/i, "").toLowerCase();
}

export function extractFirstToken(command: string): string {
  const trimmed = command.trim();
  const match = /^"([^"]+)"|^'([^']+)'|^(\S+)/.exec(trimmed);
  if (!match) {
    return "";
  }
  return match[1] ?? match[2] ?? match[3] ?? "";
}

export function checkCommand(
  command: string,
  allowedCommands: readonly string[] = DEFAULT_ALLOWED_COMMANDS,
): CommandCheck {
  const trimmed = command.trim();
  if (trimmed === "") {
    return { ok: false, reason: "Empty command" };
  }

  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `Command matches blocked pattern: ${pattern}` };
    }
  }

  for (const pattern of SHELL_METACHARACTERS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason: "Shell metacharacters are not allowed; run commands separately",
      };
    }
  }

  if (SENSITIVE_ARGUMENT_PATTERN.test(trimmed)) {
    return { ok: false, reason: "Command references a sensitive path" };
  }

  const firstToken = extractFirstToken(trimmed);
  if (firstToken === "") {
    return { ok: false, reason: "Could not parse command" };
  }

  const executable = stripExecutableName(firstToken);
  const allow = new Set(allowedCommands.map((c) => c.toLowerCase()));
  if (!allow.has(executable)) {
    return {
      ok: false,
      reason: `Command "${executable}" is not on the allowlist (${[...allow].sort().join(", ")})`,
    };
  }

  return { ok: true };
}

export function commandTokens(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

export function suggestCommandCwd(
  root: string,
  cwdInput?: string,
): string {
  if (!cwdInput) {
    return root;
  }
  return path.resolve(root, cwdInput);
}
