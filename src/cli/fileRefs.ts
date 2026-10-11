import fs from "node:fs/promises";
import path from "node:path";
import { IgnoreMatcher } from "../safety/gitignore.js";
import { assertReadablePath, toPosix } from "../safety/paths.js";

const MAX_REF_FILE_BYTES = 128 * 1024;
const MAX_WALKED_FILES = 5000;

export interface FileRefResult {
  prompt: string;
  resolved: Array<{ ref: string; rel: string }>;
  unresolved: string[];
  ambiguous: Array<{ ref: string; candidates: string[] }>;
}

const REF_PATTERN = /(^|[\s(])@([^\s@()[\]{}'`,;:]+)/g;

async function walkFiles(
  root: string,
  ignore: IgnoreMatcher,
  limit: number,
): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [root];
  while (queue.length > 0 && out.length < limit) {
    const dir = queue.pop() ?? root;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= limit) {
        break;
      }
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (entry.isDirectory()) {
        if (!ignore.ignores(`${rel}/`, true)) {
          queue.push(abs);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (ignore.ignores(rel, false)) {
        continue;
      }
      out.push(rel);
    }
  }
  return out;
}

function fuzzyCandidates(ref: string, files: string[]): string[] {
  const needle = ref.toLowerCase().replace(/\\/g, "/");
  const scored: Array<{ rel: string; score: number }> = [];
  for (const rel of files) {
    const hay = rel.toLowerCase();
    let score = -1;
    if (hay === needle) {
      score = 1000;
    } else if (hay.endsWith(`/${needle}`) || hay.endsWith(needle)) {
      score = 800 - (hay.length - needle.length);
    } else if (hay.includes(needle)) {
      score = 500 - (hay.length - needle.length);
    } else {
      let i = 0;
      for (const ch of hay) {
        if (ch === needle[i]) {
          i += 1;
        }
        if (i === needle.length) {
          break;
        }
      }
      if (i === needle.length) {
        score = 200;
      }
    }
    if (score >= 0) {
      scored.push({ rel, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length);
  return scored.slice(0, 5).map((s) => s.rel);
}

function pickFuzzy(
  ref: string,
  files: string[],
): { rel?: string; candidates: string[] } {
  const candidates = fuzzyCandidates(ref, files);
  if (candidates.length === 0) {
    return { candidates: [] };
  }
  const best = candidates[0] as string;
  const needle = ref.toLowerCase().replace(/\\/g, "/");
  const bestHay = best.toLowerCase();
  const strong =
    bestHay === needle ||
    bestHay.endsWith(`/${needle}`) ||
    bestHay.includes(needle);
  if (candidates.length === 1 && strong) {
    return { rel: best, candidates };
  }
  const second = candidates[1];
  if (strong && second !== undefined) {
    const secondHay = second.toLowerCase();
    const clearlyTighter =
      bestHay.includes(needle) && !secondHay.includes(needle);
    if (clearlyTighter) {
      return { rel: best, candidates };
    }
    return { candidates };
  }
  if (strong) {
    return { rel: best, candidates };
  }
  return { candidates };
}

async function readFileForRef(
  abs: string,
): Promise<string | undefined> {
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return undefined;
  }
  if (!stat.isFile() || stat.size > MAX_REF_FILE_BYTES) {
    return undefined;
  }
  const buf = await fs.readFile(abs);
  if (buf.includes(0)) {
    return undefined;
  }
  return buf.toString("utf8");
}

/**
 * Expand @file references the way opencode does: resolve each @path against
 * the workspace (exact or fuzzy, gitignore-aware), inline the file contents
 * into the final prompt. Sensitive paths (.env, keys…) are refused via the
 * same guard as the read tool.
 */
export async function expandFileRefs(
  input: string,
  root: string,
  ignore: IgnoreMatcher,
): Promise<FileRefResult> {
  const refs: string[] = [];
  for (const match of input.matchAll(REF_PATTERN)) {
    const ref = match[2];
    if (ref) {
      refs.push(ref);
    }
  }
  if (refs.length === 0) {
    return { prompt: input, resolved: [], unresolved: [], ambiguous: [] };
  }

  const files = await walkFiles(root, ignore, MAX_WALKED_FILES);
  const resolved: Array<{ ref: string; rel: string; content: string }> = [];
  const unresolved: string[] = [];
  const ambiguous: Array<{ ref: string; candidates: string[] }> = [];

  for (const ref of refs) {
    let abs: string | undefined;
    try {
      abs = assertReadablePath(root, ref);
    } catch {
      unresolved.push(ref);
      continue;
    }
    let content = await readFileForRef(abs);
    let rel = toPosix(path.relative(root, abs));
    if (content === undefined) {
      const pick = pickFuzzy(ref, files);
      if (!pick.rel) {
        if (pick.candidates.length > 0) {
          ambiguous.push({ ref, candidates: pick.candidates });
        } else {
          unresolved.push(ref);
        }
        continue;
      }
      abs = path.join(root, pick.rel);
      content = await readFileForRef(abs);
      rel = pick.rel;
      if (content === undefined) {
        unresolved.push(ref);
        continue;
      }
    }
    resolved.push({ ref, rel, content });
  }

  let prompt = input;
  if (resolved.length > 0) {
    const blocks = resolved.map((item) => {
      const fence = item.content.includes("```") ? "````" : "```";
      return `File @${item.rel}:\n${fence}\n${item.content.replace(/\n$/, "")}\n${fence}`;
    });
    prompt = `${input}\n\n${blocks.join("\n\n")}`;
  }

  return {
    prompt,
    resolved: resolved.map((item) => ({ ref: item.ref, rel: item.rel })),
    unresolved,
    ambiguous,
  };
}
