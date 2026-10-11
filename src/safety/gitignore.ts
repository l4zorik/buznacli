import fs from "node:fs/promises";
import path from "node:path";

export interface IgnoreRule {
  source: string;
  negated: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  ".next/",
  ".cache/",
  "*.log",
  ".DS_Store",
];

function escapeRegexChar(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/**
 * Converts a single gitignore glob (without trailing slash, without a
 * leading slash) into an anchored regular expression.
 */
export function globToRegExp(glob: string, options: { anchored: boolean }): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    out += escapeRegexChar(char);
  }

  const prefix = options.anchored ? "^" : "^(?:.*/)?";
  return new RegExp(`${prefix}${out}$`);
}

export function parseIgnoreLine(line: string): IgnoreRule | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return null;
  }

  let pattern = trimmed;
  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  }

  let dirOnly = false;
  if (pattern.endsWith("/")) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }

  const anchoredStart = pattern.startsWith("/");
  if (anchoredStart) {
    pattern = pattern.slice(1);
  }
  const anchored = anchoredStart || pattern.includes("/");

  return {
    source: trimmed,
    negated,
    dirOnly,
    regex: globToRegExp(pattern, { anchored }),
  };
}

export function parseIgnoreSource(source: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const line of source.split(/\r?\n/)) {
    const rule = parseIgnoreLine(line);
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}

export class IgnoreMatcher {
  private readonly rules: IgnoreRule[];

  constructor(rules: IgnoreRule[] = []) {
    this.rules = rules;
  }

  static fromSources(sources: string[]): IgnoreMatcher {
    const rules: IgnoreRule[] = [];
    for (const source of sources) {
      rules.push(...parseIgnoreSource(source));
    }
    return new IgnoreMatcher(rules);
  }

  static withDefaults(extraSources: string[] = []): IgnoreMatcher {
    return IgnoreMatcher.fromSources([
      DEFAULT_IGNORE_PATTERNS.join("\n"),
      ...extraSources,
    ]);
  }

  static async fromWorkspace(root: string): Promise<IgnoreMatcher> {
    const sources: string[] = [];
    try {
      const content = await fs.readFile(path.join(root, ".gitignore"), "utf8");
      sources.push(content);
    } catch {
      // No .gitignore — defaults still apply.
    }
    return IgnoreMatcher.withDefaults(sources);
  }

  ignores(relPosixPath: string, isDir = false): boolean {
    const normalized = relPosixPath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    if (normalized === "" || normalized === ".") {
      return false;
    }

    const segments = normalized.split("/").filter(Boolean);
    let ignored = false;

    for (let i = 0; i < segments.length; i += 1) {
      const prefix = segments.slice(0, i + 1).join("/");
      const segmentIsDir = i < segments.length - 1 || isDir;
      for (const rule of this.rules) {
        if (rule.dirOnly && !segmentIsDir) {
          continue;
        }
        if (rule.regex.test(prefix)) {
          ignored = !rule.negated;
        }
      }
    }

    return ignored;
  }
}
