import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apiKeySource,
  loadCredentials,
  resolveApiKey,
  saveCredential,
  type CredentialsFile,
} from "../src/config/credentials.js";
import { CliError } from "../src/errors.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lazorik-cred-"));
  file = path.join(dir, "credentials.json");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("resolveApiKey", () => {
  it("prefers the environment variable", () => {
    const stored: CredentialsFile = { openai: "stored-key" };
    const key = resolveApiKey("openai", { OPENAI_API_KEY: "env-key" }, stored);
    expect(key).toBe("env-key");
  });

  it("falls back to stored credentials", () => {
    const stored: CredentialsFile = { anthropic: "stored-key" };
    const key = resolveApiKey("anthropic", {}, stored);
    expect(key).toBe("stored-key");
  });

  it("throws a setup hint when nothing is configured", () => {
    expect(() => resolveApiKey("openrouter", {}, {})).toThrow(CliError);
    expect(() => resolveApiKey("openrouter", {}, {})).toThrow(/lazorik setup/);
  });
});

describe("credential file", () => {
  it("round-trips a saved key", async () => {
    saveCredential("openai", "sk-test-123", file);
    const raw = await fs.readFile(file, "utf8");
    expect(raw).toContain("sk-test-123");
    expect(loadCredentials(file)).toEqual({ openai: "sk-test-123" });
  });

  it("merges keys across providers", () => {
    saveCredential("openai", "k1", file);
    saveCredential("anthropic", "k2", file);
    expect(loadCredentials(file)).toEqual({ openai: "k1", anthropic: "k2" });
  });

  it("rejects empty keys", () => {
    expect(() => saveCredential("openai", "   ", file)).toThrow(CliError);
  });

  it("ignores a missing or corrupt file", async () => {
    expect(loadCredentials(path.join(dir, "nope.json"))).toEqual({});
    await fs.writeFile(file, "not-json", "utf8");
    expect(loadCredentials(file)).toEqual({});
  });
});

describe("apiKeySource", () => {
  it("reports env, stored and missing correctly", () => {
    expect(apiKeySource("openai", { OPENAI_API_KEY: "x" }, {})).toBe("env");
    expect(apiKeySource("openai", {}, { openai: "y" })).toBe("stored");
    expect(apiKeySource("openai", {}, {})).toBe("missing");
  });
});
