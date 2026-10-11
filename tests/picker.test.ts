import { describe, expect, it } from "vitest";
import { filterOptions, fuzzyScore, type PickOption } from "../src/cli/picker.js";

describe("fuzzyScore", () => {
  it("matches empty query against everything", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("matches exact substring", () => {
    expect(fuzzyScore("mimo", "opencode/mimo-v2.6-flash-free")).toBeGreaterThan(0);
  });

  it("matches subsequence across separators", () => {
    expect(fuzzyScore("mflash", "mimo-v2.6-flash-free")).toBeGreaterThan(0);
  });

  it("rejects non-subsequences", () => {
    expect(fuzzyScore("xyz", "mimo-v2.6-flash-free")).toBe(-1);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("MIMO", "opencode/mimo-v2.6-flash-free")).toBeGreaterThan(0);
  });

  it("scores prefix hits higher than scattered hits", () => {
    const prefix = fuzzyScore("free", "free-model");
    const scattered = fuzzyScore("free", "f-x-r-x-e-e-model");
    expect(prefix).toBeGreaterThan(scattered);
  });
});

describe("filterOptions", () => {
  const options: PickOption<string>[] = [
    { label: "opencode/mimo-v2.6-flash-free", hint: "zen · 1048K", value: "a" },
    { label: "inclusionai/ling-3.1-flash", hint: "openrouter · 262K", value: "b" },
    { label: "xiaomi/mimo-v2.6-pro", hint: "openrouter · 1048K", value: "c" },
  ];

  it("returns all options for empty query in original order", () => {
    const result = filterOptions("", options);
    expect(result.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("filters by label", () => {
    const result = filterOptions("mimo", options);
    expect(result.map((r) => r.option.value)).toEqual(["a", "c"]);
  });

  it("filters by hint too", () => {
    const result = filterOptions("openrouter", options);
    expect(result.map((r) => r.option.value)).toEqual(["b", "c"]);
  });

  it("sorts by score when filtering", () => {
    const result = filterOptions("flash", options);
    expect(result.map((r) => r.option.value).sort()).toEqual(["a", "b"]);
  });

  it("returns empty for no match", () => {
    expect(filterOptions("qqqq", options)).toEqual([]);
  });
});
