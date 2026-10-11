import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/config/store.js";

describe("normalizeSettings", () => {
  it("defaults mode to code", () => {
    expect(normalizeSettings({}).mode).toBe("code");
    expect(DEFAULT_SETTINGS.mode).toBe("code");
  });

  it("defaults maxSteps to 0 (unlimited)", () => {
    expect(normalizeSettings({}).maxSteps).toBe(0);
    expect(DEFAULT_SETTINGS.maxSteps).toBe(0);
  });

  it("keeps explicit 0 as unlimited", () => {
    expect(normalizeSettings({ maxSteps: 0 }).maxSteps).toBe(0);
    expect(normalizeSettings({ maxSteps: "0" }).maxSteps).toBe(0);
  });

  it("accepts explicit limits and rejects invalid ones", () => {
    expect(normalizeSettings({ maxSteps: 42 }).maxSteps).toBe(42);
    expect(normalizeSettings({ maxSteps: -5 }).maxSteps).toBe(0);
    expect(normalizeSettings({ maxSteps: 99999 }).maxSteps).toBe(0);
    expect(normalizeSettings({ maxSteps: "abc" }).maxSteps).toBe(0);
  });

  it("accepts plan mode", () => {
    expect(normalizeSettings({ mode: "plan" }).mode).toBe("plan");
  });

  it("rejects unknown modes", () => {
    expect(normalizeSettings({ mode: "yolo" }).mode).toBe("code");
    expect(normalizeSettings({ mode: 7 }).mode).toBe("code");
  });

  it("keeps other settings intact", () => {
    const s = normalizeSettings({
      provider: "anthropic",
      mode: "plan",
      maxSteps: 42,
      autoApprove: true,
    });
    expect(s.provider).toBe("anthropic");
    expect(s.mode).toBe("plan");
    expect(s.maxSteps).toBe(42);
    expect(s.autoApprove).toBe(true);
  });
});
