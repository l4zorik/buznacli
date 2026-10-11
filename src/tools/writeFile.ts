import fs from "node:fs/promises";
import path from "node:path";
import { SafetyError } from "../errors.js";
import { assertWritablePath, toPosix } from "../safety/paths.js";
import {
  asObject,
  requireString,
  type Tool,
  type ToolContext,
} from "./registry.js";

const MAX_WRITE_BYTES = 1024 * 1024;

interface WriteFileArgs {
  path: string;
  content: string;
  createDirs: boolean;
}

export const writeFileTool: Tool<WriteFileArgs> = {
  name: "write_file",
  description:
    "Write content to a file inside the workspace (overwrites existing files). Requires user confirmation. Set create_dirs to true to create missing parent directories.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file, relative to the workspace root",
      },
      content: {
        type: "string",
        description: "Full content to write into the file",
      },
      create_dirs: {
        type: "boolean",
        description: "Create missing parent directories (default false)",
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  validateArgs(args: unknown): WriteFileArgs {
    const obj = asObject(args);
    return {
      path: requireString(obj, "path"),
      content:
        typeof obj["content"] === "string"
          ? obj["content"]
          : (() => {
              throw new Error('Argument "content" must be a string');
            })(),
      createDirs: obj["create_dirs"] === true,
    };
  },
  async run(args: WriteFileArgs, ctx: ToolContext): Promise<string> {
    const absolute = assertWritablePath(ctx.root, args.path);
    const rel = toPosix(path.relative(ctx.root, absolute));

    if (ctx.ignore.ignores(rel, false)) {
      throw new SafetyError(
        `Refusing to write to ignored path: ${rel} (matches .gitignore or default ignores)`,
      );
    }

    const bytes = Buffer.byteLength(args.content, "utf8");
    if (bytes > MAX_WRITE_BYTES) {
      throw new Error(
        `Content too large (${bytes} bytes, limit ${MAX_WRITE_BYTES})`,
      );
    }

    const parent = path.dirname(absolute);
    const parentRel = path.relative(ctx.root, parent) || ".";
    const parentIgnored = parentRel !== "." && ctx.ignore.ignores(parentRel, true);
    if (parentIgnored) {
      throw new SafetyError(
        `Refusing to write inside ignored directory: ${parentRel}`,
      );
    }

    let exists = true;
    try {
      await fs.access(absolute);
    } catch {
      exists = false;
    }

    const approved = await ctx.confirmer.confirm(
      `${exists ? "Overwrite" : "Create"} file ${rel} (${bytes} bytes)?`,
    );
    if (!approved) {
      throw new SafetyError(`User denied write to ${rel}`);
    }

    if (args.createDirs) {
      await fs.mkdir(parent, { recursive: true });
    } else {
      try {
        await fs.access(parent);
      } catch {
        throw new Error(
          `Parent directory does not exist: ${toPosix(path.relative(ctx.root, parent)) || "."} (use create_dirs: true)`,
        );
      }
    }

    await ctx.undo?.capture(absolute);
    await fs.writeFile(absolute, args.content, "utf8");
    return `${exists ? "Overwrote" : "Created"} ${rel} (${bytes} bytes)`;
  },
};
