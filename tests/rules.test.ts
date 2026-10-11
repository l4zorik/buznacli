import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureUserRules,
  loadUserRules,
  rulesPath,
  RULES_SKELETON,
} from "../src/config/rules.js";
import { buildSystemPrompt } from "../src/agent/context.js";

let dir: string;
let rulesFile: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lazorik-rules-"));
  rulesFile = path.join(dir, "rules.md");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("user rules store", () => {
  it("returns null when the file does not exist", () => {
    expect(loadUserRules(rulesFile)).toBeNull();
  });

  it("creates a skeleton and loads it back", () => {
    const file = ensureUserRules(rulesFile);
    expect(file).toBe(rulesFile);
    const loaded = loadUserRules(rulesFile);
    expect(loaded).toContain("My rules for lazorik");
    expect(loaded).toBe(RULES_SKELETON.trim());
  });

  it("does not overwrite an existing rules file", async () => {
    await fs.writeFile(rulesFile, "Always answer in Czech.", "utf8");
    ensureUserRules(rulesFile);
    expect(loadUserRules(rulesFile)).toBe("Always answer in Czech.");
  });

  it("keeps rules outside the project directory", () => {
    expect(rulesPath().includes(path.join(dir))).toBe(false);
  });
});

describe("buildSystemPrompt composition", () => {
  it("layers base, user rules, AGENTS.md and mode", async () => {
    const root = path.join(dir, "ws");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "# Project\nUse tabs.", "utf8");
    await fs.writeFile(rulesFile, "Answer in Czech.", "utf8");

    const prompt = await buildSystemPrompt(root, "plan", {
      userRulesFile: rulesFile,
    });

    expect(prompt).toContain("You are lazorik");
    expect(prompt).toContain("Your personal rules:");
    expect(prompt).toContain("Answer in Czech.");
    expect(prompt).toContain("Project instructions from AGENTS.md:");
    expect(prompt).toContain("Use tabs.");
    expect(prompt).toContain("PLAN (read-only)");
  });

  it("works without rules and AGENTS.md", async () => {
    const prompt = await buildSystemPrompt(path.join(dir, "empty-ws"), "code", {
      userRulesFile: path.join(dir, "missing-rules.md"),
    });
    expect(prompt).toContain("You are lazorik");
    expect(prompt).not.toContain("Your personal rules:");
    expect(prompt).not.toContain("Project instructions");
    expect(prompt).toContain("Mode: CODE");
  });
});
