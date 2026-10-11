import { spawn } from "node:child_process";
import path from "node:path";
import { SafetyError } from "../errors.js";
import {
  checkCommand,
  suggestCommandCwd,
} from "../safety/commands.js";
import {
  asObject,
  optionalString,
  requireString,
  type Tool,
  type ToolContext,
} from "./registry.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 200 * 1024;

interface RunCommandArgs {
  command: string;
  cwd?: string;
}

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface RunCommandOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

export function runProcess(
  command: string,
  options: RunCommandOptions = {},
): Promise<RunCommandOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true,
      env: options.env ?? process.env,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let collected = 0;
    let truncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      collected += chunk.length;
      if (collected <= maxOutputBytes) {
        stdoutChunks.push(chunk);
      } else {
        truncated = true;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      collected += chunk.length;
      if (collected <= maxOutputBytes) {
        stderrChunks.push(chunk);
      } else {
        truncated = true;
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        truncated,
        timedOut,
      });
    });
  });
}

export const runCommandTool: Tool<RunCommandArgs> = {
  name: "run_command",
  description:
    "Run a developer command from an allowlist (npm, npx, pnpm, yarn, node, git, tsc, eslint, vitest, ...) inside the workspace. Requires user confirmation. Shell metacharacters, pipes and non-allowlisted executables are rejected.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute, e.g. \"npm test\"",
      },
      cwd: {
        type: "string",
        description:
          "Optional working directory relative to the workspace root",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  validateArgs(args: unknown): RunCommandArgs {
    const obj = asObject(args);
    const cwd = optionalString(obj, "cwd");
    return {
      command: requireString(obj, "command"),
      ...(cwd !== undefined ? { cwd } : {}),
    };
  },
  async run(args: RunCommandArgs, ctx: ToolContext): Promise<string> {
    const check = checkCommand(args.command, ctx.allowedCommands);
    if (!check.ok) {
      throw new SafetyError(check.reason);
    }

    const cwd = suggestCommandCwd(ctx.root, args.cwd);
    const relCwd = path.relative(ctx.root, cwd) || ".";
    if (relCwd.startsWith("..") || path.isAbsolute(relCwd)) {
      throw new SafetyError(`cwd escapes workspace root: ${args.cwd ?? "."}`);
    }

    const approved = await ctx.confirmer.confirm(
      `Run command in ${relCwd}: ${args.command}`,
    );
    if (!approved) {
      throw new SafetyError(`User denied command: ${args.command}`);
    }

    const outcome = await runProcess(args.command, { cwd });

    const parts: string[] = [
      `exit code: ${outcome.code ?? "null"}${outcome.signal ? ` (signal ${outcome.signal})` : ""}`,
    ];
    if (outcome.timedOut) {
      parts.push("timed out");
    }
    if (outcome.stdout) {
      parts.push(`stdout:\n${outcome.stdout}`);
    }
    if (outcome.stderr) {
      parts.push(`stderr:\n${outcome.stderr}`);
    }
    if (outcome.truncated) {
      parts.push(`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`);
    }
    return parts.join("\n");
  },
};
