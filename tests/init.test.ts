import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commandInit, renderAgentsMd } from "../src/cli/init.js";

let dir: string;
const lines: string[] = [];
const io = { out: (line: string) => lines.push(line) };

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lazorik-init-"));
  lines.length = 0;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("renderAgentsMd", () => {
  it("detects npm and existing scripts", async () => {
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: { test: "vitest run", build: "tsc", typecheck: "tsc --noEmit" },
      }),
      "utf8",
    );
    const rendered = renderAgentsMd(dir);
    expect(rendered).toContain("# AGENTS.md");
    expect(rendered).toContain("npm install");
    expect(rendered).toContain("test: vitest run");
    expect(rendered).toContain("typecheck: tsc --noEmit");
  });

  it("detects pnpm via lockfile", async () => {
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "", "utf8");
    expect(renderAgentsMd(dir)).toContain("pnpm install");
  });
});

describe("commandInit", () => {
  it("creates AGENTS.md in the workspace root", async () => {
    const code = await commandInit(["--root", dir], io);
    expect(code).toBe(0);
    const content = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(content).toContain("# AGENTS.md");
    expect(lines.join("\n")).toContain("Created");
  });

  it("refuses to overwrite without --force", async () => {
    await commandInit(["--root", dir], io);
    lines.length = 0;
    const code = await commandInit(["--root", dir], io);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("--force");
  });

  it("overwrites with --force", async () => {
    await commandInit(["--root", dir], io);
    await fs.writeFile(path.join(dir, "AGENTS.md"), "old", "utf8");
    const code = await commandInit(["--root", dir, "--force"], io);
    expect(code).toBe(0);
    const content = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(content).not.toBe("old");
  });
});
