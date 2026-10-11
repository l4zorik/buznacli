import readline from "node:readline";
import { parseArgs } from "node:util";
import {
  isProviderName,
  loadSettings,
  saveSettings,
} from "../config/store.js";
import {
  API_KEY_ENV_VARS,
  credentialsPath,
  saveCredential,
} from "../config/credentials.js";
import { CliError } from "../errors.js";
import { DEFAULT_MODELS } from "../providers/index.js";

export function readSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin });
      rl.once("line", (line) => {
        rl.close();
        resolve(line.trim());
      });
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    const iface = rl as unknown as { _writeToOutput?: (s: string) => void };
    process.stderr.write(question);
    iface._writeToOutput = (s: string) => {
      if (s.includes(question) || s.includes("\n")) {
        process.stderr.write(s);
      }
    };
    rl.question("", (answer) => {
      iface._writeToOutput = undefined;
      rl.close();
      process.stderr.write("\n");
      resolve(answer.trim());
    });
  });
}

export function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function chooseProvider(current: string): Promise<string> {
  process.stderr.write(
    [
      "",
      "Select provider:",
      "  1) openai     (env OPENAI_API_KEY)",
      "  2) anthropic  (env ANTHROPIC_API_KEY)",
      "  3) openrouter (env OPENROUTER_API_KEY)",
      "  4) zen        (env OPENCODE_API_KEY — OpenCode Zen, free MiMo models)",
      "",
    ].join("\n"),
  );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = (await question(`Provider [1-4] (default: ${current}): `)).toLowerCase();
    if (answer === "") {
      return current;
    }
    if (answer === "1" || answer === "openai") return "openai";
    if (answer === "2" || answer === "anthropic") return "anthropic";
    if (answer === "3" || answer === "openrouter") return "openrouter";
    if (answer === "4" || answer === "zen") return "zen";
    process.stderr.write("Please enter 1, 2, 3 or 4.\n");
  }
  return current;
}

export async function commandSetup(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      provider: { type: "string" },
      key: { type: "string" },
      model: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      [
        "Usage: lazorik setup [options]",
        "",
        "Stores an API key outside of any project directory.",
        "",
        "Options:",
        "  --provider <name>  openai | anthropic | openrouter | zen",
        "  --key <key>        Non-interactive mode (key via flag/env preferred in scripts)",
        "  --model <name>     Default model for the provider",
        "",
        "Keys are stored in:",
        `  ${credentialsPath()}`,
        "Environment variables always take precedence over stored keys.",
      ].join("\n"),
    );
    return 0;
  }

  const { settings } = loadSettings();
  let provider = settings.provider;

  if (values.provider !== undefined) {
    if (!isProviderName(values.provider)) {
      throw new CliError(
        `Unknown provider "${values.provider}". Use: openai, anthropic, openrouter or zen.`,
      );
    }
    provider = values.provider;
  } else if (process.stdin.isTTY) {
    provider = (await chooseProvider(settings.provider)) as typeof provider;
  }

  let key = values.key?.trim() ?? "";
  if (key === "") {
    if (!process.stdin.isTTY) {
      throw new CliError(
        "No TTY available. Pass --key or set the provider environment variable.",
      );
    }
    key = await readSecret(
      `Paste ${provider} API key (input hidden, stored in ${credentialsPath()}): `,
    );
  }
  if (key === "") {
    throw new CliError("API key must not be empty.");
  }

  const savedTo = saveCredential(provider, key);

  let model = values.model?.trim() ?? "";
  if (model === "" && process.stdin.isTTY) {
    const defaultModel = settings.models[provider] ?? DEFAULT_MODELS[provider];
    const answer = await question(`Default model [${defaultModel}]: `);
    model = answer;
  }

  const next = structuredClone(settings);
  next.provider = provider;
  if (model !== "") {
    next.models[provider] = model;
  }
  saveSettings(next);

  console.log(`Saved ${provider} API key to ${savedTo} (file permissions 600 where supported).`);
  console.log(`Provider set to: ${provider}`);
  console.log(`Env override available: ${API_KEY_ENV_VARS[provider]}`);
  console.log("");
  console.log("Next: cd <your-project> && lazorik");
  return 0;
}
