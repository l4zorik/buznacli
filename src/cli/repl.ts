import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { runAgentLoop, type AgentEvent } from "../agent/loop.js";
import { buildSystemPrompt } from "../agent/context.js";
import {
  isAgentMode,
  resolveToolsForMode,
  type AgentMode,
} from "../agent/modes.js";
import {
  credentialsPath,
  saveCredential,
} from "../config/credentials.js";
import {
  deleteSession,
  loadSession,
  saveSession,
} from "../config/sessions.js";
import { loadSettings } from "../config/store.js";
import { CliError } from "../errors.js";
import { createProvider, DEFAULT_MODELS } from "../providers/index.js";
import type { ProviderName } from "../types.js";
import {
  autoApproveConfirmer,
  createInteractiveConfirmer,
} from "../safety/confirm.js";
import { IgnoreMatcher } from "../safety/gitignore.js";
import { createDefaultRegistry, type ToolContext } from "../tools/index.js";
import type { Message } from "../types.js";
import { commandDoctor } from "./doctor.js";
import { commandModels } from "./models.js";
import { question, readSecret, commandSetup } from "./setup.js";
import { formatEvent } from "./run.js";
import { dim, green, red, renderHeader, renderPrompt, yellow } from "./ui.js";

const VERSION = "0.1.0";

const HELP_COMMANDS = `Commands:
  /help          show this help
  /mode [plan|code]  show or switch mode (plan = read-only)
  /models        list free model catalog
  /new           clear conversation history (and the saved session)
  /doctor        run diagnostics for this workspace
  /exit          quit (also: exit, quit, q, Ctrl+D)
`;

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  zen: "OpenCode Zen",
};

/**
 * First-run key flow: offer to paste the active provider's key right away.
 * Input is hidden, the key is stored in the config dir (chmod 600 where
 * supported) and never printed — only the env/stored status is reported.
 */
async function promptForKey(providerName: ProviderName): Promise<boolean> {
  const label = PROVIDER_LABELS[providerName];
  console.log(
    dim(
      `No API key for ${label} yet. It is stored outside any project and never printed.`,
    ),
  );
  const answer = await question(`Paste your ${label} API key now? [Y/n] `);
  if (answer !== "" && !/^y(es)?$/i.test(answer)) {
    return false;
  }
  const key = await readSecret(
    `${label} API key (input hidden, saved to ${credentialsPath()}): `,
  );
  if (key === "") {
    console.error(red("Empty key — nothing saved."));
    return false;
  }
  const savedTo = saveCredential(providerName, key);
  console.log(
    green(
      `Saved ${label} key to ${savedTo} (permissions 600 where supported).`,
    ),
  );
  return true;
}

export async function commandRepl(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      "max-steps": { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      mode: { type: "string" },
      fresh: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(
      [
        "Usage: lazorik [options]",
        "",
        "Starts an interactive coding session in the current directory.",
        "",
        "Options:",
        "  --root <dir>        Workspace root (default: cwd)",
        "  --max-steps <n>     Agent step limit per message",
        "  --provider <name>   openai | anthropic | openrouter | zen",
        "  --model <name>      Override model for this session",
        "  --mode <name>       plan (read-only) | code (default from config)",
        "  --fresh             Do not resume the saved session",
        "  --yes               Auto-approve writes and commands",
        "",
        HELP_COMMANDS,
      ].join("\n"),
    );
    return 0;
  }

  if (!process.stdin.isTTY) {
    throw new CliError(
      "Interactive session needs a TTY. Use: lazorik run \"<prompt>\" for one-shot mode.",
    );
  }

  const root = path.resolve(values.root ?? process.cwd());
  const { settings } = loadSettings();
  const providerName = (values.provider ?? settings.provider) as ProviderName;
  const model = values.model ?? settings.models[providerName];
  const effectiveModel = model ?? DEFAULT_MODELS[providerName];
  const maxSteps = values["max-steps"]
    ? Number.parseInt(values["max-steps"], 10)
    : settings.maxSteps;
  if (!Number.isFinite(maxSteps) || maxSteps < 0 || maxSteps > 1000) {
    throw new CliError(
      `Invalid --max-steps value: ${values["max-steps"]} (use 0 for unlimited or 1-1000)`,
    );
  }
  if (values.mode !== undefined && !isAgentMode(values.mode)) {
    throw new CliError(`Invalid --mode value: ${values.mode}. Use plan or code.`);
  }
  let mode: AgentMode =
    values.mode !== undefined && isAgentMode(values.mode) ? values.mode : settings.mode;

  let provider;
  try {
    provider = createProvider({
      provider: providerName,
      ...(model ? { model } : {}),
    });
  } catch (error) {
    const missingKey =
      error instanceof CliError && error.message.includes("No API key");
    if (!missingKey || !process.stdin.isTTY) {
      throw error;
    }
    const proceed = await promptForKey(providerName);
    if (!proceed) {
      console.error(dim("Run `lazorik setup` whenever you are ready."));
      return 1;
    }
    provider = createProvider({
      provider: providerName,
      ...(model ? { model } : {}),
    });
  }

  const resume = values.fresh !== true;
  const saved = resume ? loadSession(root) : undefined;
  let history: Message[] = saved?.history ?? [];

  const ignore = await IgnoreMatcher.fromWorkspace(root);
  const autoApprove = values.yes === true || settings.autoApprove;
  const ctx: ToolContext = {
    root,
    confirmer: autoApprove ? autoApproveConfirmer : createInteractiveConfirmer(),
    ignore,
    allowedCommands: settings.allowedCommands,
  };
  const allTools = createDefaultRegistry();
  const promptForMode = async (m: AgentMode): Promise<string> =>
    buildSystemPrompt(root, m);
  let system = await promptForMode(mode);

  const persist = (): void => {
    if (history.length === 0) {
      deleteSession(root);
      return;
    }
    saveSession({
      version: 1,
      root,
      provider: providerName,
      model: effectiveModel,
      mode,
      history,
    });
  };

  console.log(
    renderHeader({
      version: VERSION,
      provider: provider.name,
      model: effectiveModel,
      mode,
      root,
      maxSteps,
      resumedMessages: history.length,
    }),
  );
  console.log(
    `  ${dim(
      `autoApprove: ${autoApprove} · AGENTS.md: ${
        system.includes("Project instructions") ? "loaded" : "not found"
      } · session: saved automatically`,
    )}`,
  );
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: renderPrompt(mode),
  });
  rl.on("SIGINT", () => {
    console.error(`\n${dim("(SIGINT — use /exit to quit)")}`);
  });

  rl.prompt();
  for await (const line of rl) {
    const input = line.trim();
    if (input === "") {
      rl.prompt();
      continue;
    }

    const lowered = input.toLowerCase();
    if (["/exit", "/quit", "/q", "exit", "quit", "q"].includes(lowered)) {
      break;
    }
    if (lowered === "/new") {
      history = [];
      deleteSession(root);
      console.log(dim("History cleared (saved session removed)."));
      rl.prompt();
      continue;
    }
    if (lowered === "/doctor") {
      await commandDoctor([root]);
      rl.prompt();
      continue;
    }
    if (lowered === "/models") {
      await commandModels([]);
      rl.prompt();
      continue;
    }
    if (lowered === "/help") {
      console.log(HELP_COMMANDS);
      rl.prompt();
      continue;
    }
    if (lowered === "/mode" || lowered.startsWith("/mode ")) {
      const arg = input.slice("/mode".length).trim().toLowerCase();
      if (arg === "") {
        console.log(`Current mode: ${mode} (plan = read-only, code = full access)`);
      } else if (isAgentMode(arg)) {
        mode = arg;
        system = await promptForMode(mode);
        rl.setPrompt(renderPrompt(mode));
        console.log(`Mode: ${mode}`);
      } else {
        console.log(`Unknown mode "${arg}". Use: plan | code`);
      }
      rl.prompt();
      continue;
    }

    const result = await runAgentLoop(input, {
      provider,
      tools: resolveToolsForMode(allTools, mode),
      ctx,
      system,
      maxSteps,
      maxTokens: settings.maxTokens,
      history,
      onEvent: (event: AgentEvent) =>
        formatEvent(event, {
          out: (l) => console.log(l),
          err: (l) => console.error(l),
        }),
    });
    history = result.messages;
    persist();
    if (result.status === "limit_reached") {
      console.error(
        yellow(`(step limit ${maxSteps} reached — continue or /new)`),
      );
    }
    rl.prompt();
  }

  rl.close();
  persist();
  console.log(dim("bye"));
  return 0;
}
