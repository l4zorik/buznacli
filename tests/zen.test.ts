import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_KEY_ENV_VARS } from "../src/config/credentials.js";
import { PROVIDER_NAMES } from "../src/config/store.js";
import {
  DEFAULT_MODELS,
  BASE_URL_ENV_VARS,
  ZEN_BASE_URL,
  createProvider,
} from "../src/providers/index.js";
import {
  DEFAULT_OPENROUTER_MODEL,
  MODEL_CATALOG,
  findModel,
  listFreeModels,
} from "../src/models.js";

describe("zen provider registration", () => {
  it("is a known provider with mimo 2.6 as default model", () => {
    expect(PROVIDER_NAMES).toContain("zen");
    expect(DEFAULT_MODELS["zen"]).toBe("opencode/mimo-v2.6-flash-free");
    expect(API_KEY_ENV_VARS["zen"]).toBe("OPENCODE_API_KEY");
    expect(BASE_URL_ENV_VARS["zen"]).toBe("ZEN_BASE_URL");
    expect(ZEN_BASE_URL).toBe("https://opencode.ai/zen/v1");
  });

  it("creates a zen provider (name + openai-compatible adapter)", () => {
    const provider = createProvider({ provider: "zen", apiKey: "test-key" });
    expect(provider.name).toBe("zen");
  });

  it("points at the OpenCode Zen chat/completions endpoint by default", async () => {
    const seen: { url?: string; auth?: string; model?: string } = {};
    const server = http.createServer((req, res) => {
      seen.url = req.url;
      seen.auth = req.headers.authorization;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          model?: string;
        };
        seen.model = body.model;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              { finish_reason: "stop", message: { role: "assistant", content: "ok" } },
            ],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock server failed to start");
    }

    try {
      const provider = createProvider({
        provider: "zen",
        apiKey: "zen-key-123",
        env: { ZEN_BASE_URL: `http://127.0.0.1:${address.port}` },
      });
      const turn = await provider.chat({ messages: [], tools: [] });
      expect(turn.text).toBe("ok");
      expect(seen.url).toBe("/chat/completions");
      expect(seen.auth).toBe("Bearer zen-key-123");
      expect(seen.model).toBe("opencode/mimo-v2.6-flash-free");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

describe("model catalog", () => {
  it("lists mimo-v2.6-flash-free as a free zen model", () => {
    const mimo = findModel("opencode/mimo-v2.6-flash-free");
    expect(mimo).toBeDefined();
    expect(mimo?.free).toBe(true);
    expect(mimo?.provider).toBe("zen");
    expect(mimo?.tools).toBe(true);
  });

  it("findModel is case-insensitive", () => {
    expect(findModel("OpenCode/MiMo-V2.6-Flash-Free")?.id).toBe(
      "opencode/mimo-v2.6-flash-free",
    );
  });

  it("free list contains both zen and openrouter entries", () => {
    const free = listFreeModels();
    expect(free.some((m) => m.provider === "zen")).toBe(true);
    expect(free.some((m) => m.provider === "openrouter")).toBe(true);
    expect(free.every((m) => m.free)).toBe(true);
  });

  it("every catalog entry has id, provider and a note", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.id).not.toBe("");
      expect(model.note).not.toBe("");
      expect(PROVIDER_NAMES).toContain(model.provider);
    }
  });

  it("openrouter default is a free tool-capable model", () => {
    const def = findModel(DEFAULT_OPENROUTER_MODEL);
    expect(def?.free).toBe(true);
    expect(def?.tools).toBe(true);
  });
});
