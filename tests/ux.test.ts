import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandFileRefs } from "../src/cli/fileRefs.js";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import { UndoStack } from "../src/safety/undo.js";

describe("UndoStack redo", () => {
  let root: string;
  let base: string;
  let redoDir: string;
  let undo: UndoStack;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-redo-"));
    base = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-redo-store-"));
    redoDir = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-redo-pile-"));
    undo = new UndoStack(root, base, redoDir);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(redoDir, { recursive: true, force: true });
  });

  it("redo re-applies an undone overwrite", async () => {
    fs.writeFileSync(path.join(root, "f.txt"), "orig", "utf8");
    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "agent", "utf8");
    await undo.sealBatch();

    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("orig");
    expect(await undo.redoCount()).toBe(1);

    const summary = await undo.redoLast();
    expect(summary?.restored).toEqual(["f.txt"]);
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("agent");
    expect(await undo.redoCount()).toBe(0);
  });

  it("redo re-creates an undone new file", async () => {
    await undo.capture(path.join(root, "new.txt"));
    fs.writeFileSync(path.join(root, "new.txt"), "made by agent", "utf8");
    await undo.sealBatch();

    await undo.undoLast();
    expect(fs.existsSync(path.join(root, "new.txt"))).toBe(false);

    await undo.redoLast();
    expect(fs.readFileSync(path.join(root, "new.txt"), "utf8")).toBe(
      "made by agent",
    );
  });

  it("undo and redo can ping-pong", async () => {
    fs.writeFileSync(path.join(root, "f.txt"), "v1", "utf8");
    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "v2", "utf8");
    await undo.sealBatch();

    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("v1");
    await undo.redoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("v2");
    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("v1");
  });

  it("new sealed batch clears the redo pile", async () => {
    fs.writeFileSync(path.join(root, "f.txt"), "v1", "utf8");
    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "v2", "utf8");
    await undo.sealBatch();
    await undo.undoLast();
    expect(await undo.redoCount()).toBe(1);

    await undo.capture(path.join(root, "g.txt"));
    fs.writeFileSync(path.join(root, "g.txt"), "x", "utf8");
    await undo.sealBatch();
    expect(await undo.redoCount()).toBe(0);
  });

  it("redoLast with nothing to redo returns undefined", async () => {
    expect(await undo.redoLast()).toBeUndefined();
  });

  it("clear wipes the redo pile too", async () => {
    fs.writeFileSync(path.join(root, "f.txt"), "v1", "utf8");
    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "v2", "utf8");
    await undo.sealBatch();
    await undo.undoLast();
    await undo.clear();
    expect(await undo.redoCount()).toBe(0);
  });
});

describe("expandFileRefs", () => {
  let root: string;
  let ignore: IgnoreMatcher;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-refs-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "app.ts"), "export const x = 1;\n");
    fs.writeFileSync(path.join(root, "README.md"), "# readme\n");
    ignore = await IgnoreMatcher.fromWorkspace(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("inlines an exact file reference", async () => {
    const result = await expandFileRefs(
      "look at @src/app.ts please",
      root,
      ignore,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]?.rel).toBe("src/app.ts");
    expect(result.prompt).toContain("export const x = 1;");
    expect(result.prompt).toContain("look at @src/app.ts please");
  });

  it("resolves a fuzzy reference to a unique file", async () => {
    const result = await expandFileRefs("check @app.ts", root, ignore);
    expect(result.resolved[0]?.rel).toBe("src/app.ts");
    expect(result.prompt).toContain("export const x = 1;");
  });

  it("leaves unknown refs unresolved", async () => {
    const result = await expandFileRefs("see @nope/missing.ts", root, ignore);
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toContain("nope/missing.ts");
    expect(result.prompt).toBe("see @nope/missing.ts");
  });

  it("passes input without refs unchanged", async () => {
    const result = await expandFileRefs("plain question", root, ignore);
    expect(result.prompt).toBe("plain question");
    expect(result.resolved).toHaveLength(0);
  });

  it("blocks sensitive paths like .env", async () => {
    fs.writeFileSync(path.join(root, ".env"), "SECRET=1\n");
    const result = await expandFileRefs("read @.env", root, ignore);
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toContain(".env");
    expect(result.prompt).not.toContain("SECRET=1");
  });
});

describe("renderAssistantText", () => {
  it("frames fenced code blocks and styles inline code", async () => {
    const { renderAssistantText, stripAnsi } = await import("../src/cli/ui.js");
    process.env["NO_COLOR"] = "1";
    try {
      const out = renderAssistantText(
        "Run `npm test`:\n```ts\nconst a = 1;\n```\ndone **ok**",
      );
      expect(stripAnsi(out)).toContain("┌─ ts");
      expect(stripAnsi(out)).toContain("│ const a = 1;");
      expect(stripAnsi(out)).toContain("└─");
      expect(stripAnsi(out)).toContain("Run npm test:");
      expect(stripAnsi(out)).toContain("done ok");
    } finally {
      delete process.env["NO_COLOR"];
    }
  });

  it("closes an unterminated fence", async () => {
    const { renderAssistantText, stripAnsi } = await import("../src/cli/ui.js");
    process.env["NO_COLOR"] = "1";
    try {
      const out = stripAnsi(renderAssistantText("```\ncode"));
      expect(out).toContain("└─");
    } finally {
      delete process.env["NO_COLOR"];
    }
  });
});
