import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAgentMode, type AgentMode } from "../agent/modes.js";
import { CliError } from "../errors.js";
import type { ProviderName } from "../types.js";
import { DEFAULT_ALLOWED_COMMANDS } from "../safety/commands.js";

export const PROVIDER_NAMES: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "openrouter",
  "zen",
];

export interface AgentSettings {
  provider: ProviderName;
  models: Partial<Record<ProviderName, string>>;
  mode: AgentMode;
  maxSteps: number;
  maxTokens: number;
  autoApprove: boolean;
  allowedCommands: string[];
}

export const DEFAULT_SETTINGS: AgentSettings = {
  provider: "openai",
  models: {},
  mode: "code",
  maxSteps: 0,
  maxTokens: 4096,
  autoApprove: false,
  allowedCommands: [...DEFAULT_ALLOWED_COMMANDS],
};

export function configDir(): string {
  const base =
    process.env["XDG_CONFIG_HOME"]?.trim() ||
    (process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming")
      : path.join(os.homedir(), ".config"));
  return path.join(base, "lazorikcode");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function isProviderName(value: unknown): value is ProviderName {
  return (
    typeof value === "string" &&
    (PROVIDER_NAMES as readonly string[]).includes(value)
  );
}

function parseIntOr(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return fallback;
  }
  return Math.floor(num);
}

/** maxSteps: 0 = unlimited; otherwise 1–1000. */
function parseMaxSteps(value: unknown): number {
  if (value === 0 || value === "0") {
    return 0;
  }
  return parseIntOr(value, DEFAULT_SETTINGS.maxSteps, 1, 1000);
}

export function normalizeSettings(raw: unknown): AgentSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const provider = isProviderName(obj["provider"]) ? obj["provider"] : DEFAULT_SETTINGS.provider;

  const rawModels =
    obj["models"] && typeof obj["models"] === "object" && !Array.isArray(obj["models"])
      ? (obj["models"] as Record<string, unknown>)
      : {};
  const models: Partial<Record<ProviderName, string>> = {};
  for (const name of PROVIDER_NAMES) {
    const value = rawModels[name];
    if (typeof value === "string" && value.trim() !== "") {
      models[name] = value.trim();
    }
  }

  const rawCommands = Array.isArray(obj["allowedCommands"])
    ? obj["allowedCommands"].filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : DEFAULT_SETTINGS.allowedCommands;

  return {
    provider,
    models,
    mode: isAgentMode(obj["mode"]) ? obj["mode"] : DEFAULT_SETTINGS.mode,
    maxSteps: parseMaxSteps(obj["maxSteps"]),
    maxTokens: parseIntOr(obj["maxTokens"], DEFAULT_SETTINGS.maxTokens, 256, 64_000),
    autoApprove: obj["autoApprove"] === true,
    allowedCommands: rawCommands.length > 0 ? rawCommands : [...DEFAULT_ALLOWED_COMMANDS],
  };
}

export function loadSettings(explicitPath?: string): {
  settings: AgentSettings;
  file: string;
  exists: boolean;
} {
  const file = explicitPath ?? configPath();
  if (!fs.existsSync(file)) {
    return { settings: { ...DEFAULT_SETTINGS }, file, exists: false };
  }
  try {
    const content = fs.readFileSync(file, "utf8");
    const parsed: unknown = JSON.parse(content);
    return { settings: normalizeSettings(parsed), file, exists: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Cannot read config at ${file}: ${message}`);
  }
}

export function saveSettings(settings: AgentSettings, explicitPath?: string): string {
  const file = explicitPath ?? configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return file;
}
