import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
import { credentialsPath, saveCredential } from "../config/credentials.js";
import { deleteSession, loadSession, saveSession, sessionId } from "../config/sessions.js";
import { configDir, loadSettings } from "../config/store.js";
import { CliError } from "../errors.js";
import { createProvider, DEFAULT_MODELS } from "../providers/index.js";
import type { ProviderName } from "../types.js";
import {
  autoApproveConfirmer,
  createInteractiveConfirmer,
} from "../safety/confirm.js";
import { IgnoreMatcher } from "../safety/gitignore.js";
import { UndoStack } from "../safety/undo.js";
import { createDefaultRegistry, type ToolContext } from "../tools/index.js";
import type { Message } from "../types.js";
import { commandDoctor } from "./doctor.js";
import { expandFileRefs } from "./fileRefs.js";
import { commandInit } from "./init.js";
import { commandModels } from "./models.js";
import { commandRules } from "./rules.js";
import { question, readSecret, commandSetup } from "./setup.js";
import { formatEvent } from "./run.js";
import { Spinner } from "./spinner.js";
import {
  dim,
  green,
  red,
  renderAssistantText,
  renderHeader,
  renderPrompt,
  yellow,
} from "./ui.js";

const VERSION = "0.1.0";

const HELP_COMMANDS = `Commands:
  /help            show this help
  /mode [plan|code]  show or switch mode (plan = read-only)
  /undo            revert the agent's last write batch (git-aware)
  /redo            re-apply what /undo reverted
  /models          list free model catalog
  /new             clear history, session and snapshots
  /details         toggle tool execution details
  /init            create or update AGENTS.md for this project
  /rules           show your personal rules.md
  /connect         add/change the API key for the current provider
  /export          export the conversation to Markdown
  /editor          compose a message in $EDITOR
  /doctor          run diagnostics for this workspace
  /exit            quit (also: exit, quit, q, Ctrl+D)

Shortcuts in messages:
  @path/to/file    inline a workspace file (fuzzy match, gitignore-aware)
  !git status      run an allowlisted shell command (with confirmation)
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
    green(`Saved ${label} key to ${savedTo} (permissions 600 where supported).`),
  );
  return true;
}

function exportConversation(history: Message[], root: string): string {
  const parts: string[] = [
    `# lazorik session`,
    ``,
    `Workspace: ${root}`,
    `Exported: ${new Date().toISOString()}`,
    ``,
  ];
  for (const message of history) {
    if (message.role === "user") {
      parts.push(`## You`, ``, message.content, ``);
      continue;
    }
    if (message.role === "assistant") {
      parts.push(`## lazorik`, ``, message.content || "_(no text)_", ``);
      for (const call of message.toolCalls ?? []) {
        parts.push(`- tool call: \`${call.name}\``, ``);
      }
      continue;
    }
    const preview =
      message.content.length > 400
        ? `${message.content.slice(0, 400)}…`
        : message.content;
    parts.push(`> ${message.name}: ${preview.replace(/\n/g, "\n> ")}`, ``);
  }
  const file = path.join(configDir(), `session-${sessionId(root)}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${parts.join("\n")}\n`, "utf8");
  return file;
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
  const undo = new UndoStack(root);
  const ctx: ToolContext = {
    root,
    confirmer: autoApprove ? autoApproveConfirmer : createInteractiveConfirmer(),
    ignore,
    allowedCommands: settings.allowedCommands,
    undo,
  };
  const allTools = createDefaultRegistry();
  const promptForMode = async (m: AgentMode): Promise<string> =>
    buildSystemPrompt(root, m);
  let system = await promptForMode(mode);
  let details = true;

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
      } · session saved automatically`,
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

  const spinner = new Spinner();

  const runTurn = async (promptText: string): Promise<void> => {
    const startedAt = Date.now();
    const onEvent = (event: AgentEvent): void => {
      switch (event.type) {
        case "step":
          spinner.start("thinking");
          break;
        case "assistant_text":
          spinner.clearLine();
          console.log(renderAssistantText(event.text));
          break;
        case "tool_start":
          spinner.update(event.name);
          if (details) {
            formatEvent(event, {
              out: (l) => console.log(l),
              err: (l) => console.error(l),
            });
          }
          break;
        case "tool_end":
          spinner.update(`${event.name} done`);
          if (details) {
            formatEvent(event, {
              out: (l) => console.log(l),
              err: (l) => console.error(l),
            });
          }
          break;
        case "limit_reached":
          spinner.stop();
          formatEvent(event, {
            out: (l) => console.log(l),
            err: (l) => console.error(l),
          });
          break;
        case "done":
          spinner.stop();
          break;
      }
    };

    const result = await runAgentLoop(promptText, {
      provider,
      tools: resolveToolsForMode(allTools, mode),
      ctx,
      system,
      maxSteps,
      maxTokens: settings.maxTokens,
      history,
      onEvent,
    });
    spinner.stop();
    history = result.messages;
    persist();
    const sealed = await undo.sealBatch();
    if (sealed) {
      console.error(
        dim(
          `(${sealed.files.length} file snapshot${sealed.files.length === 1 ? "" : "s"} — /undo reverts this turn)`,
        ),
      );
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(dim(`${result.steps} step(s) · ${elapsed}s`));
    if (result.status === "limit_reached") {
      console.error(yellow(`(step limit ${maxSteps} reached — continue or /new)`));
    }
  };

  rl.prompt();
  for await (const line of rl) {
    let input = line.trim();
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
      await undo.clear();
      console.log(dim("History cleared (saved session and snapshots removed)."));
      rl.prompt();
      continue;
    }
    if (lowered === "/undo") {
      const summary = await undo.undoLast();
      if (!summary) {
        console.log(dim("Nothing to undo."));
        rl.prompt();
        continue;
      }
      for (const file of summary.restored) {
        console.log(green(`restored ${file}`));
      }
      for (const file of summary.removed) {
        console.log(green(`removed created file ${file}`));
      }
      if (summary.gitHeadChanged) {
        console.log(
          yellow(
            "warning: HEAD moved since the snapshot — workspace also has git history to fall back on",
          ),
        );
      }
      rl.prompt();
      continue;
    }
    if (lowered === "/redo") {
      const summary = await undo.redoLast();
      if (!summary) {
        console.log(dim("Nothing to redo."));
        rl.prompt();
        continue;
      }
      for (const file of summary.restored) {
        console.log(green(`re-applied ${file}`));
      }
      for (const file of summary.removed) {
        console.log(green(`re-removed ${file}`));
      }
      rl.prompt();
      continue;
    }
    if (lowered === "/details") {
      details = !details;
      console.log(`Tool details: ${details ? green("on") : dim("off")}`);
      rl.prompt();
      continue;
    }
    if (lowered === "/models") {
      await commandModels([]);
      rl.prompt();
      continue;
    }
    if (lowered === "/init") {
      await commandInit([root]);
      system = await promptForMode(mode);
      rl.prompt();
      continue;
    }
    if (lowered === "/rules") {
      await commandRules([]);
      rl.prompt();
      continue;
    }
    if (lowered === "/connect") {
      await commandSetup([]);
      rl.prompt();
      continue;
    }
    if (lowered === "/export") {
      const file = exportConversation(history, root);
      console.log(dim(`conversation exported to ${file}`));
      rl.prompt();
      continue;
    }
    if (lowered === "/editor") {
      const editor =
        process.env["EDITOR"]?.trim() ||
        process.env["VISUAL"]?.trim() ||
        (process.platform === "win32" ? "notepad" : "vi");
      const tmp = path.join(os.tmpdir(), `lazorik-${Date.now()}.md`);
      fs.writeFileSync(tmp, "", "utf8");
      console.log(dim(`opening ${editor} — save and close to send, leave empty to cancel`));
      const child = spawn(editor, [tmp], {
        stdio: "inherit",
        shell: true,
        cwd: root,
      });
      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        child.on("error", () => resolve());
      });
      const content = fs.readFileSync(tmp, "utf8").trim();
      fs.rmSync(tmp, { force: true });
      if (content === "") {
        console.log(dim("empty — nothing sent"));
        rl.prompt();
        continue;
      }
      await runTurn(content);
      rl.prompt();
      continue;
    }
    if (lowered === "/doctor") {
      await commandDoctor([root]);
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

    // !command — run an allowlisted shell command inline (opencode-style).
    if (input.startsWith("!")) {
      const command = input.slice(1).trim();
      if (command === "") {
        rl.prompt();
        continue;
      }
      spinner.start(`$ ${command}`);
      const result = await allTools.execute("run_command", { command }, ctx);
      spinner.stop();
      if (result.isError) {
        console.error(red(result.output));
      } else {
        console.log(result.output);
      }
      history.push({
        role: "user",
        content: `Ran shell command: ${command}\nOutput:\n${result.output}`,
      });
      persist();
      rl.prompt();
      continue;
    }

    // @file references — inline workspace files into the prompt.
    const refs = await expandFileRefs(input, root, ignore);
    if (refs.resolved.length > 0) {
      console.log(
        dim(`inlined ${refs.resolved.map((r) => r.rel).join(", ")}`),
      );
    }
    for (const amb of refs.ambiguous) {
      console.log(
        yellow(`ambiguous @${amb.ref} — candidates: ${amb.candidates.join(", ")}`),
      );
    }
    for (const miss of refs.unresolved) {
      console.log(yellow(`no readable file for @${miss}`));
    }
    input = refs.prompt;

    await runTurn(input);
    rl.prompt();
  }

  rl.close();
  persist();
  console.log(dim("bye"));
  return 0;
}
