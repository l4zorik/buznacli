import { resolveApiKey } from "../config/credentials.js";
import { CliError } from "../errors.js";
import type { Provider, ProviderName } from "../types.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";

export { createOpenAIProvider } from "./openai.js";
export { createAnthropicProvider } from "./anthropic.js";
export { ProviderHttpError } from "./http.js";
export { API_KEY_ENV_VARS } from "../config/credentials.js";

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  openrouter: "inclusionai/ling-3.1-flash",
  zen: "opencode/mimo-v2.6-flash-free",
};

export const BASE_URL_ENV_VARS: Record<ProviderName, string> = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
  zen: "ZEN_BASE_URL",
};

/** OpenCode Zen gateway — OpenAI-compatible chat/completions. */
export const ZEN_BASE_URL = "https://opencode.ai/zen/v1";

export interface CreateProviderOptions {
  provider: ProviderName;
  model?: string;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
}

export function createProvider(options: CreateProviderOptions): Provider {
  const env = options.env ?? process.env;
  const model = options.model || DEFAULT_MODELS[options.provider];
  const apiKey = options.apiKey ?? resolveApiKey(options.provider, env);
  const baseUrl = env[BASE_URL_ENV_VARS[options.provider]]?.trim() || undefined;

  switch (options.provider) {
    case "openai":
      return createOpenAIProvider({
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
      });
    case "anthropic":
      return createAnthropicProvider({
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
      });
    case "openrouter":
      return createOpenAIProvider({
        apiKey,
        model,
        baseUrl: baseUrl ?? "https://openrouter.ai/api/v1",
        providerName: "openrouter",
        extraHeaders: {
          "http-referer": "https://github.com/lazorikcode/lazorikcode",
          "x-title": "lazorikcode",
        },
      });
    case "zen":
      return createOpenAIProvider({
        apiKey,
        model,
        baseUrl: baseUrl ?? ZEN_BASE_URL,
        providerName: "zen",
      });
    default: {
      const exhaustive: never = options.provider;
      throw new CliError(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}
