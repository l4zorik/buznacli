import path from "node:path";
import { SafetyError } from "../errors.js";
import { assertReadablePath } from "../safety/paths.js";
import { runProcess } from "./exec.js";
import {
  asObject,
  optionalString,
  type Tool,
  type ToolContext,
} from "./registry.js";

const MAX_DIFF_BYTES = 128 * 1024;

interface GitDiffArgs {
  path?: string;
  staged: boolean;
  statOnly: boolean;
}

export const gitDiffTool: Tool<GitDiffArgs> = {
  name: "git_diff",
  description:
    "Show the current Git diff of the workspace (optionally staged, optionally for one path, optionally stat only). Fails if the workspace is not a Git repository.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Optional path (relative to root) to limit the diff",
      },
      staged: {
        type: "boolean",
        description: "Show staged changes (git diff --staged). Default false.",
      },
      stat_only: {
        type: "boolean",
        description: "Only show diffstat, not the full patch. Default false.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  validateArgs(args: unknown): GitDiffArgs {
    const obj = asObject(args);
    const p = optionalString(obj, "path");
    return {
      ...(p !== undefined ? { path: p } : {}),
      staged: obj["staged"] === true,
      statOnly: obj["stat_only"] === true,
    };
  },
  async run(args: GitDiffArgs, ctx: ToolContext): Promise<string> {
    const target =
      args.path !== undefined ? assertReadablePath(ctx.root, args.path) : undefined;

    const gitArgs = ["diff", "--no-color"];
    if (args.staged) {
      gitArgs.push("--staged");
    }
    if (args.statOnly) {
      gitArgs.push("--stat");
    }
    if (target !== undefined) {
      gitArgs.push("--", path.relative(ctx.root, target));
    }

    const outcome = await runProcess(`git ${gitArgs.map(quoteArg).join(" ")}`, {
      cwd: ctx.root,
      maxOutputBytes: MAX_DIFF_BYTES,
    });

    if (outcome.code !== 0) {
      const detail = outcome.stderr.trim() || outcome.stdout.trim();
      throw new Error(
        `git diff failed (exit ${outcome.code ?? "null"}): ${detail || "unknown error"}`,
      );
    }

    const combined = `${outcome.stdout}${outcome.stderr}`.trim();
    if (combined === "") {
      return "No changes.";
    }
    return outcome.truncated
      ? `${combined}\n[diff truncated]`
      : combined;
  },
};

function quoteArg(arg: string): string {
  if (/[\s"']/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}
