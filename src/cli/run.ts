import path from "node:path";
import { parseArgs } from "node:util";
import { runAgentLoop } from "../agent/loop.js";
import { buildSystemPrompt } from "../agent/context.js";
import { isAgentMode, resolveToolsForMode, type AgentMode } from "../agent/modes.js";
import { loadSettings } from "../config/store.js";
import { apiKeySource } from "../config/credentials.js";
import { CliError } from "../errors.js";
import { createProvider, DEFAULT_MODELS } from "../providers/index.js";
import { IgnoreMatcher } from "../safety/gitignore.js";
import { UndoStack } from "../safety/undo.js";
import {
  autoApproveConfirmer,
  createInteractiveConfirmer,
} from "../safety/confirm.js";
import { createDefaultRegistry, type ToolContext } from "../tools/index.js";
import type { AgentEvent } from "../agent/loop.js";
import type { ProviderName } from "../types.js";
import { dim, green, red } from "./ui.js";

export interface RunCommandIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

export function formatEvent(event: AgentEvent, io: RunCommandIo): void {
  switch (event.type) {
    case "step":
      io.err(
        dim(
          `\n[step ${event.index}${event.maxSteps === 0 ? "" : `/${event.maxSteps}`}]`,
        ),
      );
      break;
    case "assistant_text":
      io.out(event.text);
      break;
    case "tool_start":
      io.err(dim(`→ ${event.name} ${JSON.stringify(event.args)}`));
      break;
    case "tool_end": {
      const preview =
        event.output.length > 400 ? `${event.output.slice(0, 400)}…` : event.output;
      const mark = event.isError ? red("✗") : green("✓");
      io.err(`${mark} ${event.name}: ${preview.replace(/\n/g, "\n  ")}`);
      break;
    }
    case "limit_reached":
      io.err(red(`\nReached step limit (${event.steps}). Stopping.`));
      break;
    case "done":
      break;
  }
}

export async function commandRun(
  argv: string[],
  io: RunCommandIo = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      "max-steps": { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      mode: { type: "string" },
      yes: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    io.out(
      [
        "Usage: lazorik run [options] <prompt>",
        "",
        "Options:",
        "  --root <dir>        Workspace root (default: cwd)",
        "  --max-steps <n>     Agent step limit",
        "  --provider <name>   openai | anthropic | openrouter | zen",
        "  --model <name>      Override model for this run",
        "  --mode <name>       plan (read-only) | code (default from config)",
        "  --max-steps <n>     Step limit; 0 = unlimited (default)",
        "  --yes               Auto-approve writes and commands",
        "  --quiet             Print only the final answer",
      ].join("\n"),
    );
    return values.help ? 0 : 2;
  }

  const prompt = positionals.join(" ").trim();
  if (prompt === "") {
    throw new CliError("Prompt must not be empty");
  }

  const root = path.resolve(values.root ?? process.cwd());
  const { settings } = loadSettings();

  const providerName = (values.provider ?? settings.provider) as ProviderName;
  const model = values.model ?? settings.models[providerName];
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
  const effectiveMode: AgentMode =
    values.mode !== undefined && isAgentMode(values.mode) ? values.mode : settings.mode;

  const provider = createProvider({
    provider: providerName,
    ...(model ? { model } : {}),
  });

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

  const quiet = values.quiet === true;
  const onEvent = quiet
    ? undefined
    : (event: AgentEvent) => formatEvent(event, io);

  const keySource = apiKeySource(providerName);
  io.err(
    `provider=${provider.name} model=${model ?? DEFAULT_MODELS[providerName]} mode=${effectiveMode} root=${root} autoApprove=${autoApprove} key=${keySource}`,
  );

  const result = await runAgentLoop(prompt, {
    provider,
    tools: resolveToolsForMode(createDefaultRegistry(), effectiveMode),
    ctx,
    system: await buildSystemPrompt(root, effectiveMode),
    maxSteps,
    maxTokens: settings.maxTokens,
    ...(onEvent ? { onEvent } : {}),
  });

  if (quiet || result.text === "") {
    io.out(result.text);
  }
  const sealed = await undo.sealBatch();
  if (sealed && !quiet) {
    io.err(
      dim(
        `(${sealed.files.length} file snapshot${sealed.files.length === 1 ? "" : "s"} saved — run \`lazorik\` here and /undo to revert)`,
      ),
    );
  }
  io.err(
    result.status === "done"
      ? `\nDone in ${result.steps} step(s).`
      : `\nStopped at step limit (${result.steps}).`,
  );
  return result.status === "done" ? 0 : 1;
}
