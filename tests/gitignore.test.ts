import { describe, expect, it } from "vitest";
import { IgnoreMatcher, parseIgnoreSource } from "../src/safety/gitignore.js";

describe("parseIgnoreSource", () => {
  it("skips comments and blank lines", () => {
    const rules = parseIgnoreSource("# comment\n\nnode_modules/\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("node_modules/");
    expect(rules[0]?.dirOnly).toBe(true);
  });

  it("detects negation and anchoring", () => {
    const rules = parseIgnoreSource("!keep.log\n/root-only\n");
    expect(rules[0]?.negated).toBe(true);
    expect(rules[1]?.source).toBe("/root-only");
  });
});

describe("IgnoreMatcher", () => {
  const matcher = IgnoreMatcher.withDefaults([
    ["dist/", "coverage/", "*.log", "!important.log", "/root-only.txt", "src/generated/"].join("\n"),
  ]);

  it("ignores default build directories", () => {
    expect(matcher.ignores("node_modules", true)).toBe(true);
    expect(matcher.ignores("node_modules/typescript/package.json")).toBe(true);
    expect(matcher.ignores("dist", true)).toBe(true);
    expect(matcher.ignores("dist/index.js")).toBe(true);
    expect(matcher.ignores("coverage", true)).toBe(true);
  });

  it("ignores glob patterns at any depth", () => {
    expect(matcher.ignores("debug.log")).toBe(true);
    expect(matcher.ignores("packages/app/debug.log")).toBe(true);
  });

  it("supports negation (last match wins)", () => {
    expect(matcher.ignores("important.log")).toBe(false);
  });

  it("supports anchored patterns", () => {
    expect(matcher.ignores("root-only.txt")).toBe(true);
    expect(matcher.ignores("nested/root-only.txt")).toBe(false);
  });

  it("supports nested directory patterns", () => {
    expect(matcher.ignores("src/generated", true)).toBe(true);
    expect(matcher.ignores("src/generated/file.ts")).toBe(true);
    expect(matcher.ignores("src/lib/file.ts")).toBe(false);
  });

  it("does not treat a directory rule as a file rule", () => {
    const dirOnly = IgnoreMatcher.fromSources(["build/"]);
    expect(dirOnly.ignores("build", true)).toBe(true);
    expect(dirOnly.ignores("build", false)).toBe(false);
    expect(dirOnly.ignores("build-output.js", false)).toBe(false);
    expect(dirOnly.ignores("build/app.js")).toBe(true);
  });

  it("keeps normal source files readable", () => {
    expect(matcher.ignores("src/index.ts")).toBe(false);
    expect(matcher.ignores("package.json")).toBe(false);
    expect(matcher.ignores("README.md")).toBe(false);
  });
});
