import fs from "node:fs/promises";
import path from "node:path";
import { resolveWithinRoot, toPosix } from "../safety/paths.js";
import {
  asObject,
  optionalString,
  type Tool,
  type ToolContext,
} from "./registry.js";

const MAX_ENTRIES = 400;

interface ListFilesArgs {
  path?: string;
  recursive: boolean;
}

export const listFilesTool: Tool<ListFilesArgs> = {
  name: "list_files",
  description:
    "List files and directories inside the workspace, respecting .gitignore and default ignores (node_modules, dist, ...). Non-recursive by default.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory relative to the workspace root (default: root)",
      },
      recursive: {
        type: "boolean",
        description: "Recurse into subdirectories. Default false.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  validateArgs(args: unknown): ListFilesArgs {
    const obj = asObject(args);
    const p = optionalString(obj, "path");
    return {
      ...(p !== undefined ? { path: p } : {}),
      recursive: obj["recursive"] === true,
    };
  },
  async run(args: ListFilesArgs, ctx: ToolContext): Promise<string> {
    const startRel = args.path ?? ".";
    const absolute = resolveWithinRoot(ctx.root, startRel);
    const entries: string[] = [];

    async function walk(dir: string, depth: number): Promise<void> {
      if (entries.length >= MAX_ENTRIES) {
        return;
      }
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      dirents.sort((a, b) => a.name.localeCompare(b.name));
      for (const dirent of dirents) {
        if (entries.length >= MAX_ENTRIES) {
          return;
        }
        const abs = path.join(dir, dirent.name);
        const rel = toPosix(path.relative(ctx.root, abs));
        if (ctx.ignore.ignores(rel, dirent.isDirectory())) {
          continue;
        }
        entries.push(dirent.isDirectory() ? `${rel}/` : rel);
        if (dirent.isDirectory() && args.recursive && depth < 16) {
          await walk(abs, depth + 1);
        }
      }
    }

    const stats = await fs.stat(absolute);
    if (!stats.isDirectory()) {
      return toPosix(path.relative(ctx.root, absolute));
    }

    await walk(absolute, 0);
    if (entries.length === 0) {
      return "(empty)";
    }
    const suffix = entries.length >= MAX_ENTRIES ? `\n[truncated at ${MAX_ENTRIES} entries]` : "";
    return `${entries.join("\n")}${suffix}`;
  },
};
