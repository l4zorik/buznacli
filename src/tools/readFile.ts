import fs from "node:fs/promises";
import path from "node:path";
import { assertReadablePath, toPosix } from "../safety/paths.js";
import {
  asObject,
  optionalString,
  requireString,
  type Tool,
  type ToolContext,
} from "./registry.js";

const MAX_READ_BYTES = 256 * 1024;

interface ReadFileArgs {
  path: string;
}

export const readFileTool: Tool<ReadFileArgs> = {
  name: "read_file",
  description:
    "Read a text file from the workspace. Returns the file content. Fails on binary files or files larger than 256 KB.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file, relative to the workspace root",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  validateArgs(args: unknown): ReadFileArgs {
    const obj = asObject(args);
    return { path: requireString(obj, "path") };
  },
  async run(args: ReadFileArgs, ctx: ToolContext): Promise<string> {
    const absolute = assertReadablePath(ctx.root, args.path);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${args.path}`);
    }
    if (stats.size > MAX_READ_BYTES) {
      throw new Error(
        `File too large (${stats.size} bytes, limit ${MAX_READ_BYTES})`,
      );
    }

    const buffer = await fs.readFile(absolute);
    if (buffer.includes(0)) {
      throw new Error(`Binary file: ${args.path}`);
    }

    const rel = toPosix(path.relative(ctx.root, absolute));
    return `File: ${rel}\n---\n${buffer.toString("utf8")}`;
  },
};
