import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError } from "../errors.js";
import type { ProviderName } from "../types.js";

export const API_KEY_ENV_VARS: Record<ProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  zen: "OPENCODE_API_KEY",
};

const CREDENTIAL_NAMES: readonly ProviderName[] = [
  "openai",
  "anthropic",
  "openrouter",
  "zen",
];

export type CredentialsFile = Partial<Record<ProviderName, string>>;

export function credentialsDir(): string {
  const base =
    process.env["XDG_CONFIG_HOME"]?.trim() ||
    (process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming")
      : path.join(os.homedir(), ".config"));
  return path.join(base, "lazorikcode");
}

export function credentialsPath(): string {
  return path.join(credentialsDir(), "credentials.json");
}

export function loadCredentials(file: string = credentialsPath()): CredentialsFile {
  try {
    const content = fs.readFileSync(file, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: CredentialsFile = {};
    for (const name of CREDENTIAL_NAMES) {
      const value = (parsed as Record<string, unknown>)[name];
      if (typeof value === "string" && value.trim() !== "") {
        out[name] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCredentials(
  credentials: CredentialsFile,
  file: string = credentialsPath(),
): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is not supported on some Windows setups — best effort.
  }
  return file;
}

export function saveCredential(
  provider: ProviderName,
  key: string,
  file: string = credentialsPath(),
): string {
  const trimmed = key.trim();
  if (trimmed === "") {
    throw new CliError("API key must not be empty");
  }
  const credentials = loadCredentials(file);
  credentials[provider] = trimmed;
  return saveCredentials(credentials, file);
}

export function resolveApiKey(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
  stored: CredentialsFile = loadCredentials(),
): string {
  const envVar = API_KEY_ENV_VARS[provider];
  const fromEnv = env[envVar]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromStore = stored[provider];
  if (fromStore) {
    return fromStore;
  }
  throw new CliError(
    `No API key for ${provider}. Run \`lazorik setup\` to paste one, or set ${envVar}.`,
  );
}

export function apiKeySource(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
  stored: CredentialsFile = loadCredentials(),
): "env" | "stored" | "missing" {
  if (env[API_KEY_ENV_VARS[provider]]?.trim()) {
    return "env";
  }
  if (stored[provider]) {
    return "stored";
  }
  return "missing";
}
