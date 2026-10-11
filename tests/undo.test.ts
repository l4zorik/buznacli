import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IgnoreMatcher } from "../src/safety/gitignore.js";
import { UndoStack } from "../src/safety/undo.js";
import { autoApproveConfirmer } from "../src/safety/confirm.js";
import { createDefaultRegistry, type ToolContext } from "../src/tools/index.js";
import { SafetyError } from "../src/errors.js";

describe("UndoStack", () => {
  let root: string;
  let base: string;
  let undo: UndoStack;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-undo-"));
    base = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-undo-store-"));
    undo = new UndoStack(root, base);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(base, { recursive: true, force: true });
  });

  function write(rel: string, content: string): void {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }

  it("restores an overwritten file", async () => {
    write("a.txt", "original");
    await undo.capture(path.join(root, "a.txt"));
    fs.writeFileSync(path.join(root, "a.txt"), "agent version", "utf8");
    await undo.sealBatch();

    fs.writeFileSync(path.join(root, "a.txt"), "even newer", "utf8");
    const summary = await undo.undoLast();

    expect(summary?.restored).toEqual(["a.txt"]);
    expect(fs.readFileSync(path.join(root, "a.txt"), "utf8")).toBe("original");
  });

  it("removes a file the agent created", async () => {
    await undo.capture(path.join(root, "brand-new.txt"));
    fs.writeFileSync(path.join(root, "brand-new.txt"), "created", "utf8");
    await undo.sealBatch();

    const summary = await undo.undoLast();
    expect(summary?.removed).toEqual(["brand-new.txt"]);
    expect(fs.existsSync(path.join(root, "brand-new.txt"))).toBe(false);
  });

  it("undoes a whole turn as one batch", async () => {
    write("one.txt", "1");
    write("two.txt", "2");
    await undo.capture(path.join(root, "one.txt"));
    await undo.capture(path.join(root, "two.txt"));
    await undo.capture(path.join(root, "three.txt"));
    fs.writeFileSync(path.join(root, "one.txt"), "changed1", "utf8");
    fs.writeFileSync(path.join(root, "two.txt"), "changed2", "utf8");
    fs.writeFileSync(path.join(root, "three.txt"), "new", "utf8");
    const batch = await undo.sealBatch();
    expect(batch?.files).toHaveLength(3);

    const summary = await undo.undoLast();
    expect(summary?.restored.sort()).toEqual(["one.txt", "two.txt"]);
    expect(summary?.removed).toEqual(["three.txt"]);
    expect(fs.readFileSync(path.join(root, "one.txt"), "utf8")).toBe("1");
    expect(fs.readFileSync(path.join(root, "two.txt"), "utf8")).toBe("2");
  });

  it("keeps the first captured state when the same file is written twice in a turn", async () => {
    write("x.txt", "v1");
    await undo.capture(path.join(root, "x.txt"));
    fs.writeFileSync(path.join(root, "x.txt"), "v2", "utf8");
    await undo.capture(path.join(root, "x.txt"));
    const batch = await undo.sealBatch();
    expect(batch?.files).toHaveLength(1);

    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "x.txt"), "utf8")).toBe("v1");
  });

  it("undoes batches newest first", async () => {
    write("f.txt", "base");
    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "turn1", "utf8");
    await undo.sealBatch();

    await undo.capture(path.join(root, "f.txt"));
    fs.writeFileSync(path.join(root, "f.txt"), "turn2", "utf8");
    await undo.sealBatch();

    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("turn1");
    await undo.undoLast();
    expect(fs.readFileSync(path.join(root, "f.txt"), "utf8")).toBe("base");
    expect(await undo.undoLast()).toBeUndefined();
  });

  it("sealBatch is a no-op without captures", async () => {
    expect(await undo.sealBatch()).toBeUndefined();
    expect(await undo.undoLast()).toBeUndefined();
  });

  it("refuses to capture paths outside the workspace root", async () => {
    await expect(undo.capture(path.join(os.tmpdir(), "outside.txt"))).rejects.toThrow(
      SafetyError,
    );
  });

  it("clear drops all stored batches", async () => {
    write("c.txt", "orig");
    await undo.capture(path.join(root, "c.txt"));
    fs.writeFileSync(path.join(root, "c.txt"), "changed", "utf8");
    await undo.sealBatch();
    expect(await undo.count()).toBe(1);

    await undo.clear();
    expect(await undo.count()).toBe(0);
    expect(await undo.undoLast()).toBeUndefined();
    expect(fs.readFileSync(path.join(root, "c.txt"), "utf8")).toBe("changed");
  });

  it("prunes old batches beyond the cap", async () => {
    for (let i = 0; i < 22; i += 1) {
      await undo.capture(path.join(root, "f.txt"));
      await undo.sealBatch();
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(await undo.count()).toBeLessThanOrEqual(20);
  });

  it("records git HEAD when the workspace is a repo", async () => {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    write("g.txt", "tracked");
    execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"], {
      cwd: root,
      stdio: "ignore",
    });

    await undo.capture(path.join(root, "g.txt"));
    const batch = await undo.sealBatch();
    expect(batch?.gitHead).toMatch(/^[0-9a-f]{40}$/);
  });

  it("write_file snapshots through ctx.undo and /undo reverts it", async () => {
    write("app.txt", "before agent");
    const ctx: ToolContext = {
      root,
      confirmer: autoApproveConfirmer,
      ignore: await IgnoreMatcher.fromWorkspace(root),
      allowedCommands: [],
      undo,
    };
    const registry = createDefaultRegistry();
    const result = await registry.execute(
      "write_file",
      { path: "app.txt", content: "agent wrote this" },
      ctx,
    );
    expect(result.isError).toBe(false);
    expect(fs.readFileSync(path.join(root, "app.txt"), "utf8")).toBe(
      "agent wrote this",
    );

    await undo.sealBatch();
    const summary = await undo.undoLast();
    expect(summary?.restored).toEqual(["app.txt"]);
    expect(fs.readFileSync(path.join(root, "app.txt"), "utf8")).toBe("before agent");
  });
});
