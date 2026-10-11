import type { ProviderName } from "./types.js";

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderName;
  free: boolean;
  tools: boolean;
  contextK: number;
  note: string;
}

/**
 * Curated model catalog. Free entries are OpenRouter zero-price models
 * (verified via openrouter.ai/api/v1/models?max_price=0, Oct 2026) and
 * OpenCode Zen free models (https://opencode.ai/docs/zen/, Oct 2026 —
 * chat/completions endpoint only, the Responses/SystemOne ones are skipped).
 * Zen model IDs use the `opencode/<id>` config format.
 */
export const MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: "opencode/mimo-v2.6-flash-free",
    name: "Xiaomi MiMo-V2.6-Flash Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "Zen free — MiMo 2.6 Flash (309B-A15B), výchozí model pro zen",
  },
  {
    id: "opencode/mimo-v2.5-free",
    name: "Xiaomi MiMo-V2.5 Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "Zen free — předchozí generace MiMo",
  },
  {
    id: "opencode/ling-3.1-flash-free",
    name: "Ling 3.1 Flash Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — hybrid reasoning MoE (stejná Ling jako na OpenRouteru)",
  },
  {
    id: "opencode/ling-3.0-flash-fin-free",
    name: "Ling 3.0 Flash Fin Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — finančně laděná Ling flash",
  },
  {
    id: "opencode/nemotron-3-ultra-free",
    name: "NVIDIA Nemotron 3 Ultra Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "Zen free — frontier reasoning MoE 550B-A55B",
  },
  {
    id: "opencode/nemotron-3.5-lightning-free",
    name: "NVIDIA Nemotron 3.5 Lightning Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "Zen free — rychlý MoE 30B-A3B",
  },
  {
    id: "opencode/exo-free",
    name: "Exo Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — limitovaná doba, sběr zpětné vazby",
  },
  {
    id: "opencode/space-bunny-free",
    name: "Space Bunny Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — stealth model, zero-retention poskytovatel",
  },
  {
    id: "opencode/longcat-2.5-preview-free",
    name: "LongCat 2.5 Preview Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — preview, zero-retention poskytovatel",
  },
  {
    id: "opencode/step-5-preview-free",
    name: "Step 5 Preview Free",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — preview, zero-retention poskytovatel",
  },
  {
    id: "opencode/big-pickle",
    name: "Big Pickle",
    provider: "zen",
    free: true,
    tools: true,
    contextK: 262,
    note: "Zen free — stealth model, zdarma po omezenou dobu",
  },
  {
    id: "inclusionai/ling-3.1-flash",
    name: "Ling 3.1 Flash",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "hybrid reasoning MoE; free — stejná Ling flash jako v opencode Zen",
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "Poolside Laguna S 2.1",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "coding agent, Terminal-Bench 2.1 70.2% — nejlepší free kódění",
  },
  {
    id: "cohere/north-mini-code:free",
    name: "Cohere North Mini Code",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 256,
    note: "agentic coding MoE 30B-A3B",
  },
  {
    id: "thinkingmachines/inkling-small:free",
    name: "Thinking Machines Inkling Small",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "multimodální MoE 276B-A12B, coding index 53",
  },
  {
    id: "thinkingmachines/inkling:free",
    name: "Thinking Machines Inkling",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "flagship MoE 975B-A41B, agenty a tool-use",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA Nemotron 3 Ultra",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "frontier reasoning MoE 550B-A55B, 1M context",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "NVIDIA Nemotron 3 Super",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "hybrid MoE 120B-A12B, efektivní",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 1_048,
    note: "rychlý MoE 30B-A3B, high-throughput",
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 31B",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "dense multimodal (text+image+video)",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Google Gemma 4 26B A4B",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "MoE 26B-A4B, multimodal",
  },
  {
    id: "apodex/apodex-1.1-mini:free",
    name: "Apodex 1.1 Mini",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 262,
    note: "reasoning-first, long-horizon research",
  },
  {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots3-Note Preview",
    provider: "openrouter",
    free: true,
    tools: true,
    contextK: 512,
    note: "MoE 280B-A16B, vision; expirace 2026-12-31",
  },
  {
    id: "xiaomi/mimo-v2.6-flash",
    name: "Xiaomi MiMo-V2.6-Flash",
    provider: "openrouter",
    free: false,
    tools: true,
    contextK: 1_048,
    note: "MiMo 2.6 Flash (open source, 309B-A15B) — ~$0.14/M; zdarma je na zen: opencode/mimo-v2.6-flash-free",
  },
  {
    id: "xiaomi/mimo-v2.6-pro",
    name: "Xiaomi MiMo-V2.6-Pro",
    provider: "openrouter",
    free: false,
    tools: true,
    contextK: 1_048,
    note: "MiMo 2.6 Pro (1T-A42B) — ~$0.435/M, 1. místo open-weight žebříčků",
  },
];

export const DEFAULT_OPENROUTER_MODEL = "inclusionai/ling-3.1-flash";

export function listFreeModels(): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => m.free);
}

export function findModel(id: string): ModelInfo | undefined {
  const needle = id.trim().toLowerCase();
  return MODEL_CATALOG.find((m) => m.id.toLowerCase() === needle);
}
