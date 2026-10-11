import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SafetyError } from "../src/errors.js";
import {
  autoApproveConfirmer,
  denyAllConfirmer,
  type Confirmer,
} from "../src/safety/confirm.js";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import { writeFileTool } from "../src/tools/writeFile.js";
import { readFileTool } from "../src/tools/readFile.js";
import type { ToolContext } from "../src/tools/registry.js";

let root: string;

async function makeContext(confirmer: Confirmer): Promise<ToolContext> {
  return {
    root,
    confirmer,
    ignore: await IgnoreMatcher.fromWorkspace(root),
    allowedCommands: ["node"],
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "my-cli-agent-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("write_file tool", () => {
  it("creates a new file when approved", async () => {
    const ctx = await makeContext(autoApproveConfirmer);
    const args = writeFileTool.validateArgs({
      path: "src/hello.ts",
      content: "export const hello = 'hi';\n",
    });
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    const output = await writeFileTool.run(args, ctx);
    expect(output).toContain("Created src/hello.ts");
    const written = await fs.readFile(path.join(root, "src", "hello.ts"), "utf8");
    expect(written).toContain("hello");
  });

  it("refuses writes when the user denies confirmation", async () => {
    const ctx = await makeContext(denyAllConfirmer);
    const args = writeFileTool.validateArgs({ path: "a.txt", content: "x" });
    await expect(writeFileTool.run(args, ctx)).rejects.toThrow(SafetyError);
    await expect(fs.access(path.join(root, "a.txt"))).rejects.toThrow();
  });

  it("refuses to write sensitive paths", async () => {
    const ctx = await makeContext(autoApproveConfirmer);
    const args = writeFileTool.validateArgs({ path: ".env", content: "SECRET=1" });
    await expect(writeFileTool.run(args, ctx)).rejects.toThrow(SafetyError);
  });

  it("refuses to write ignored paths", async () => {
    const ctx = await makeContext(autoApproveConfirmer);
    const args = writeFileTool.validateArgs({
      path: "dist/bundle.js",
      content: "x",
    });
    await expect(writeFileTool.run(args, ctx)).rejects.toThrow(/ignored/);
  });

  it("requires create_dirs for missing parents", async () => {
    const ctx = await makeContext(autoApproveConfirmer);
    const args = writeFileTool.validateArgs({ path: "new-dir/file.txt", content: "x" });
    await expect(writeFileTool.run(args, ctx)).rejects.toThrow(/Parent directory/);

    const withDirs = writeFileTool.validateArgs({
      path: "new-dir/file.txt",
      content: "x",
      create_dirs: true,
    });
    await writeFileTool.run(withDirs, ctx);
    const stat = await fs.stat(path.join(root, "new-dir", "file.txt"));
    expect(stat.isFile()).toBe(true);
  });

  it("round-trips through read_file", async () => {
    const ctx = await makeContext(autoApproveConfirmer);
    await writeFileTool.run(
      writeFileTool.validateArgs({ path: "note.md", content: "# T" }),
      ctx,
    );
    const content = await readFileTool.run(
      readFileTool.validateArgs({ path: "note.md" }),
      ctx,
    );
    expect(content).toContain("# T");
  });

  it("blocks reading sensitive files", async () => {
    await fs.writeFile(path.join(root, ".env"), "KEY=1");
    const ctx = await makeContext(autoApproveConfirmer);
    await expect(
      readFileTool.run(readFileTool.validateArgs({ path: ".env" }), ctx),
    ).rejects.toThrow(SafetyError);
  });
});
