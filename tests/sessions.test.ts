import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteSession,
  loadSession,
  saveSession,
  sessionId,
  sessionPath,
} from "../src/config/sessions.js";
import type { SessionState } from "../src/config/sessions.js";

const ROOT = "D:\\work\\demo-project";
const HISTORY: SessionState["history"] = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "hi", toolCalls: [] },
  { role: "tool", toolCallId: "t1", name: "read_file", content: "ok" },
];

describe("session persistence", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "lazorik-sessions-"));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  function makeState(): SessionState {
    return {
      version: 1,
      root: ROOT,
      provider: "zen",
      model: "opencode/mimo-v2.6-flash-free",
      mode: "code",
      history: HISTORY,
      updatedAt: "",
    };
  }

  it("round-trips a session through save/load", () => {
    const file = saveSession(makeState(), base);
    expect(file).toBe(sessionPath(ROOT, base));
    const loaded = loadSession(ROOT, base);
    expect(loaded).toBeDefined();
    expect(loaded?.root).toBe(path.resolve(ROOT));
    expect(loaded?.provider).toBe("zen");
    expect(loaded?.model).toBe("opencode/mimo-v2.6-flash-free");
    expect(loaded?.mode).toBe("code");
    expect(loaded?.history).toEqual(HISTORY);
    expect(loaded?.updatedAt).not.toBe("");
  });

  it("returns undefined for a workspace without a session", () => {
    expect(loadSession(ROOT, base)).toBeUndefined();
  });

  it("returns undefined for corrupt or wrong-version files", () => {
    const file = sessionPath(ROOT, base);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    fs.writeFileSync(file, "not json", "utf8");
    expect(loadSession(ROOT, base)).toBeUndefined();

    fs.writeFileSync(file, JSON.stringify({ version: 99, root: ROOT }), "utf8");
    expect(loadSession(ROOT, base)).toBeUndefined();

    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, root: "C:\\other", history: [] }),
      "utf8",
    );
    expect(loadSession(ROOT, base)).toBeUndefined();
  });

  it("drops malformed messages but keeps valid ones", () => {
    const file = sessionPath(ROOT, base);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        root: path.resolve(ROOT),
        provider: "openrouter",
        model: "x",
        mode: "plan",
        history: [
          { role: "user", content: "ok" },
          { role: "weird", content: "bad" },
          { role: "assistant", content: 42 },
          null,
        ],
      }),
      "utf8",
    );
    const loaded = loadSession(ROOT, base);
    expect(loaded?.history).toEqual([{ role: "user", content: "ok" }]);
    expect(loaded?.mode).toBe("plan");
  });

  it("deleteSession removes the file and is idempotent", () => {
    saveSession(makeState(), base);
    expect(deleteSession(ROOT, base)).toBe(true);
    expect(loadSession(ROOT, base)).toBeUndefined();
    expect(deleteSession(ROOT, base)).toBe(true);
  });

  it("sessionId is stable across separators and case", () => {
    expect(sessionId("D:\\Work\\Demo")).toBe(sessionId("d:/work/demo"));
    expect(sessionId(ROOT)).toHaveLength(16);
  });

  it("stores sessions under a sessions/ subdir outside the project", () => {
    saveSession(makeState(), base);
    expect(fs.existsSync(path.join(base, "sessions"))).toBe(true);
    expect(path.relative(base, sessionPath(ROOT, base)).startsWith("sessions")).toBe(
      true,
    );
  });
});
