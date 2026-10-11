import { parseArgs } from "node:util";
import { isAgentMode } from "../agent/modes.js";
import {
  isProviderName,
  loadSettings,
  saveSettings,
  type AgentSettings,
} from "../config/store.js";
import { CliError } from "../errors.js";
import { DEFAULT_MODELS } from "../providers/index.js";

export async function commandConfig(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      mode: { type: "string" },
      "max-steps": { type: "string" },
      "max-tokens": { type: "string" },
      "auto-approve": { type: "boolean" },
      show: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      [
        "Usage: lazorik config [options]",
        "",
        "Options:",
        "  --provider <name>   openai | anthropic | openrouter | zen",
        "  --model <name>      Default model for the selected provider",
        "  --mode <name>       Default session mode: plan | code",
        "  --max-steps <n>     Step limit per message; 0 = unlimited (default)",
        "  --max-tokens <n>    Max tokens per model response",
        "  --auto-approve      Do not ask before writes/commands (use with care)",
        "  --show              Print current configuration",
      ].join("\n"),
    );
    return 0;
  }

  const { settings, file, exists } = loadSettings();
  const next: AgentSettings = structuredClone(settings);

  if (values.provider !== undefined) {
    if (!isProviderName(values.provider)) {
      throw new CliError(
        `Unknown provider "${values.provider}". Use: openai, anthropic, openrouter or zen.`,
      );
    }
    next.provider = values.provider;
  }

  if (values.model !== undefined) {
    const model = values.model.trim();
    if (model === "") {
      throw new CliError("--model must not be empty");
    }
    next.models[next.provider] = model;
  }

  if (values.mode !== undefined) {
    if (!isAgentMode(values.mode)) {
      throw new CliError(`Unknown mode "${values.mode}". Use: plan | code`);
    }
    next.mode = values.mode;
  }

  if (values["max-steps"] !== undefined) {
    const n = Number.parseInt(values["max-steps"], 10);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      throw new CliError(
        "--max-steps must be 0 (unlimited) or an integer between 1 and 1000",
      );
    }
    next.maxSteps = n;
  }

  if (values["max-tokens"] !== undefined) {
    const n = Number.parseInt(values["max-tokens"], 10);
    if (!Number.isFinite(n) || n < 256 || n > 64_000) {
      throw new CliError("--max-tokens must be an integer between 256 and 64000");
    }
    next.maxTokens = n;
  }

  if (values["auto-approve"] === true) {
    next.autoApprove = true;
  }

  const mutating =
    values.provider !== undefined ||
    values.model !== undefined ||
    values.mode !== undefined ||
    values["max-steps"] !== undefined ||
    values["max-tokens"] !== undefined ||
    values["auto-approve"] === true;

  if (mutating) {
    const savedTo = saveSettings(next);
    console.log(`Saved configuration to ${savedTo}`);
  }

  const effective = mutating ? next : settings;
  const show = values.show === true || !mutating;
  if (show) {
    console.log(`Config file: ${file}${exists ? "" : " (missing, defaults in use)"}`);
    console.log(`provider:        ${effective.provider}`);
    console.log(`models:          ${JSON.stringify(effective.models)}`);
    console.log(`mode:            ${effective.mode}`);
    console.log(
      `default models:  ${JSON.stringify(
        Object.fromEntries(
          Object.entries(DEFAULT_MODELS).map(([k, v]) => [k, effective.models[k as keyof typeof DEFAULT_MODELS] ?? v]),
        ),
      )}`,
    );
    console.log(`maxSteps:        ${effective.maxSteps === 0 ? "0 (unlimited)" : effective.maxSteps}`);
    console.log(`maxTokens:       ${effective.maxTokens}`);
    console.log(`autoApprove:     ${effective.autoApprove}`);
    console.log(
      `allowedCommands: ${effective.allowedCommands.length} entries (edit the config file to change)`,
    );
  }

  return 0;
}
