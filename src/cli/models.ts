import { parseArgs } from "node:util";
import { loadSettings, saveSettings } from "../config/store.js";
import { CliError } from "../errors.js";
import { isProviderName } from "../config/store.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  MODEL_CATALOG,
  findModel,
  listFreeModels,
} from "../models.js";

export interface ModelsIo {
  out: (line: string) => void;
}

export async function commandModels(
  argv: string[],
  io: ModelsIo = { out: (line) => console.log(line) },
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      set: { type: "string" },
      provider: { type: "string" },
      free: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    io.out(
      [
        "Usage: lazorik models [options]",
        "",
        "Lists the curated model catalog (OpenRouter free tier + MiMo).",
        "",
        "Options:",
        "  --free             Show only free models",
        "  --set <model-id>   Set as default model for the provider",
        "  --provider <name>  Provider for --set (default: current config)",
        "",
        "Examples:",
        "  lazorik models",
        "  lazorik models --free",
        "  lazorik models --set inclusionai/ling-3.1-flash",
        "  lazorik models --set xiaomi/mimo-v2.6-flash --provider openrouter",
      ].join("\n"),
    );
    return 0;
  }

  const { settings } = loadSettings();

  if (values.set !== undefined) {
    const id = values.set.trim();
    const info = findModel(id);
    if (!info) {
      io.out(`Note: "${id}" is not in the curated catalog (using it anyway).`);
    }
    const providerRaw = values.provider ?? settings.provider;
    if (!isProviderName(providerRaw)) {
      throw new CliError(`Unknown provider: ${providerRaw}`);
    }
    const next = structuredClone(settings);
    next.models[providerRaw] = id;
    saveSettings(next);
    io.out(`Default model for ${providerRaw} set to: ${id}`);
    if (info && !info.free) {
      io.out("Heads-up: this model is not free — check OpenRouter pricing.");
    }
    return 0;
  }

  const freeOnly = values.free === true || positionals[0] === "free";
  const models = freeOnly ? listFreeModels() : [...MODEL_CATALOG];
  const currentDefault = settings.models[settings.provider];

  io.out(
    freeOnly
      ? "Free models (OpenRouter, $0 in / $0 out):"
      : "Model catalog (★ = current default for your provider):",
  );
  io.out("");

  for (const model of models) {
    const star = model.id === currentDefault ? "★ " : "  ";
    const price = model.free ? "FREE" : "paid";
    io.out(
      `${star}${model.id}  [${price}, tools=${model.tools ? "yes" : "no"}, ${model.contextK}K]`,
    );
    io.out(`     ${model.name} — ${model.note}`);
  }

  io.out("");
  io.out(
    `Current default (${settings.provider}): ${currentDefault ?? `${DEFAULT_OPENROUTER_MODEL} (openrouter default)`}`,
  );
  io.out("Set one with: lazorik models --set <model-id>");
  return 0;
}
