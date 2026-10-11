import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AgentMode } from "../agent/modes.js";
import type { Message, ProviderName } from "../types.js";
import { configDir } from "./store.js";

export const SESSION_VERSION = 1;

/**
 * One data structure per workspace: resume = restore this struct.
 * History, provider, model and mode travel together (rule from
 * docs/LESSONS-OPENCODE.md — upstream lost exactly these on resume).
 */
export interface SessionState {
  version: number;
  root: string;
  provider: ProviderName;
  model: string;
  mode: AgentMode;
  history: Message[];
  /** Set by saveSession; optional on input. */
  updatedAt?: string;
}

export function sessionsDir(base: string = configDir()): string {
  return path.join(base, "sessions");
}

function isRole(value: unknown): value is Message["role"] {
  return value === "user" || value === "assistant" || value === "tool";
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }
  const msg = value as Record<string, unknown>;
  return isRole(msg["role"]) && typeof msg["content"] === "string";
}

/** Stable file id for a workspace path (case- and slash-insensitive). */
export function sessionId(root: string): string {
  const normalized = path.resolve(root).replace(/\\/g, "/").toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function sessionPath(root: string, base: string = configDir()): string {
  return path.join(sessionsDir(base), `${sessionId(root)}.json`);
}

export function loadSession(
  root: string,
  base: string = configDir(),
): SessionState | undefined {
  const file = sessionPath(root, base);
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const raw = parsed as Record<string, unknown>;
    if (raw["version"] !== SESSION_VERSION) {
      return undefined;
    }
    if (typeof raw["root"] !== "string" || raw["root"] !== path.resolve(root)) {
      return undefined;
    }
    if (!Array.isArray(raw["history"])) {
      return undefined;
    }
    return {
      version: SESSION_VERSION,
      root: path.resolve(root),
      provider:
        typeof raw["provider"] === "string"
          ? (raw["provider"] as ProviderName)
          : "openai",
      model: typeof raw["model"] === "string" ? raw["model"] : "",
      mode: raw["mode"] === "plan" ? "plan" : "code",
      history: raw["history"].filter(isMessage),
      updatedAt:
        typeof raw["updatedAt"] === "string" ? raw["updatedAt"] : "",
    };
  } catch {
    return undefined;
  }
}

export function saveSession(
  state: SessionState,
  base: string = configDir(),
): string {
  const file = sessionPath(state.root, base);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload: SessionState = {
    ...state,
    root: path.resolve(state.root),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is not supported on some Windows setups — best effort.
  }
  return file;
}

export function deleteSession(root: string, base: string = configDir()): boolean {
  try {
    fs.rmSync(sessionPath(root, base), { force: true });
    return true;
  } catch {
    return false;
  }
}
