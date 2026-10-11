import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertReadablePath,
  assertWritablePath,
  isSensitiveRelative,
  resolveWithinRoot,
  toPosix,
} from "../src/safety/paths.js";
import { SafetyError } from "../src/errors.js";

const ROOT = path.resolve(path.sep === "\\" ? "D:\\workspace\\demo" : "/workspace/demo");

describe("toPosix", () => {
  it("normalizes Windows separators", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c");
  });
});

describe("resolveWithinRoot", () => {
  it("resolves nested relative paths inside the root", () => {
    const resolved = resolveWithinRoot(ROOT, "src/index.ts");
    expect(resolved).toBe(path.join(ROOT, "src", "index.ts"));
  });

  it("allows paths that stay inside the root after normalization", () => {
    const resolved = resolveWithinRoot(ROOT, "src/../src/index.ts");
    expect(resolved).toBe(path.join(ROOT, "src", "index.ts"));
  });

  it("rejects parent traversal", () => {
    expect(() => resolveWithinRoot(ROOT, "../outside.ts")).toThrow(SafetyError);
    expect(() => resolveWithinRoot(ROOT, "src/../../outside.ts")).toThrow(SafetyError);
    expect(() => resolveWithinRoot(ROOT, "..\\..\\windows\\system32")).toThrow(SafetyError);
  });

  it("rejects absolute paths outside the root", () => {
    const outside = path.resolve(path.sep === "\\" ? "D:\\other\\file.ts" : "/other/file.ts");
    expect(() => resolveWithinRoot(ROOT, outside)).toThrow(SafetyError);
  });

  it("allows absolute paths inside the root", () => {
    const inside = path.join(ROOT, "ok.ts");
    expect(resolveWithinRoot(ROOT, inside)).toBe(inside);
  });

  it("rejects empty paths and NUL bytes", () => {
    expect(() => resolveWithinRoot(ROOT, "")).toThrow(SafetyError);
    expect(() => resolveWithinRoot(ROOT, "a\0b")).toThrow(SafetyError);
  });
});

describe("isSensitiveRelative", () => {
  it.each([
    ".env",
    ".env.local",
    "config/.env.production",
    ".git/config",
    ".ssh/id_rsa",
    ".ssh/id_ed25519.pub",
    ".aws/credentials",
    "certs/server.pem",
    "id_rsa",
    "secrets.json",
    "config/secrets.yaml",
    ".npmrc",
  ])("detects %s as sensitive", (rel) => {
    expect(isSensitiveRelative(rel)).toBe(true);
  });

  it.each([
    "src/index.ts",
    "package.json",
    "README.md",
    "src/environment.ts",
    "keyboard.ts",
    "nested/secretive-notes.md",
  ])("does not flag %s", (rel) => {
    expect(isSensitiveRelative(rel)).toBe(false);
  });
});

describe("assertReadablePath / assertWritablePath", () => {
  it("returns the absolute path for normal files", () => {
    expect(assertReadablePath(ROOT, "src/app.ts")).toBe(
      path.join(ROOT, "src", "app.ts"),
    );
    expect(assertWritablePath(ROOT, "src/app.ts")).toBe(
      path.join(ROOT, "src", "app.ts"),
    );
  });

  it("blocks sensitive files", () => {
    expect(() => assertReadablePath(ROOT, ".env")).toThrow(SafetyError);
    expect(() => assertWritablePath(ROOT, ".env")).toThrow(SafetyError);
    expect(() => assertWritablePath(ROOT, ".git/config")).toThrow(SafetyError);
  });

  it("blocks traversal", () => {
    expect(() => assertReadablePath(ROOT, "../.ssh/id_rsa")).toThrow(SafetyError);
  });
});
