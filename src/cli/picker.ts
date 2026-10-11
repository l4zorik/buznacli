import readline from "node:readline";
import { bold, cyan, dim, green, yellow } from "./ui.js";

/**
 * Zero-dependency interactive list picker (opencode-style model dialog):
 * arrow keys / j-k navigate, type-to-filter (fuzzy subsequence), Enter
 * selects, Esc cancels. Built on raw-mode keypress events so it works
 * in any TTY terminal (Windows VT sequences included).
 */

export interface PickOption<T> {
  label: string;
  hint?: string;
  badge?: string;
  value: T;
}

export interface PickResult<T> {
  value: T;
  index: number;
}

/**
 * Subsequence fuzzy score: higher is better, -1 = no match.
 * Rewards prefix hits and consecutive character runs — good enough
 * for model ids like "mimo" matching "opencode/mimo-v2.6-flash-free".
 */
export function fuzzyScore(query: string, text: string): number {
  if (query === "") {
    return 0;
  }
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      score += 1 + consecutive * 2;
      if (ti === 0 || !/[a-z0-9]/.test(t[ti - 1] ?? "")) {
        score += 2; // word-boundary bonus
      }
      consecutive += 1;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : -1;
}

export interface FilteredOption<T> {
  option: PickOption<T>;
  index: number;
  score: number;
}

export function filterOptions<T>(
  query: string,
  options: readonly PickOption<T>[],
): FilteredOption<T>[] {
  const scored: FilteredOption<T>[] = [];
  options.forEach((option, index) => {
    const score = Math.max(
      fuzzyScore(query, option.label),
      option.hint ? fuzzyScore(query, option.hint) / 2 : -1,
    );
    if (score >= 0) {
      scored.push({ option, index, score });
    }
  });
  if (query !== "") {
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
  }
  return scored;
}

const ESC = String.fromCharCode(27);
const VISIBLE_MAX = 12;

export interface PickOptions {
  /** Mark the currently active entry (compared by reference or label). */
  current?: string;
}

export async function pickOption<T>(
  title: string,
  options: readonly PickOption<T>[],
  opts: PickOptions = {},
): Promise<PickResult<T> | undefined> {
  if (!process.stdin.isTTY || options.length === 0) {
    return undefined;
  }
  return new Promise((resolve) => {
    let filter = "";
    let selected = 0;
    let view = filterOptions("", options);
    let renderedLines = 0;

    const clear = (): void => {
      for (let i = 0; i < renderedLines; i += 1) {
        process.stdout.write(`${ESC}[1A${ESC}[2K`);
      }
      renderedLines = 0;
    };

    const render = (): void => {
      clear();
      const lines: string[] = [];
      lines.push(bold(title));
      lines.push(
        dim("  ↑/↓ or j/k navigate · type to filter · enter select · esc cancel"),
      );
      lines.push("");
      if (view.length === 0) {
        lines.push(dim("  (no match)"));
      }
      const start = Math.max(
        0,
        Math.min(selected - Math.floor(VISIBLE_MAX / 2), view.length - VISIBLE_MAX),
      );
      const end = Math.min(view.length, start + VISIBLE_MAX);
      if (start > 0) {
        lines.push(dim(`  ⋯ ${start} more above`));
      }
      for (let i = start; i < end; i += 1) {
        const entry = view[i];
        if (!entry) {
          continue;
        }
        const cursor = i === selected ? cyan("❯ ") : "  ";
        const isCurrent = entry.option.label === opts.current;
        const marker = isCurrent ? green("● ") : "○ ";
        const badge = entry.option.badge
          ? ` ${yellow(`[${entry.option.badge}]`)}`
          : "";
        const label = i === selected ? bold(entry.option.label) : entry.option.label;
        const hint = entry.option.hint ? dim(`  ${entry.option.hint}`) : "";
        lines.push(`${cursor}${marker}${label}${badge}${hint}`);
      }
      if (view.length > end) {
        lines.push(dim(`  ⋯ ${view.length - end} more below`));
      }
      process.stdout.write(`${lines.join("\n")}\n`);
      renderedLines = lines.length;
    };

    const finish = (result: PickResult<T> | undefined): void => {
      cleanup();
      clear();
      process.stdout.write("\n");
      resolve(result);
    };

    const onKeypress = (str: string, key: readline.Key): void => {
      if (key) {
        if (key.name === "up" || (key.ctrl && key.name === "p")) {
          selected = Math.max(0, selected - 1);
          render();
          return;
        }
        if (key.name === "down" || (key.ctrl && key.name === "n")) {
          selected = Math.min(Math.max(view.length - 1, 0), selected + 1);
          render();
          return;
        }
        if (!key.ctrl && !key.meta && key.name === "k") {
          selected = Math.max(0, selected - 1);
          render();
          return;
        }
        if (!key.ctrl && !key.meta && key.name === "j") {
          selected = Math.min(Math.max(view.length - 1, 0), selected + 1);
          render();
          return;
        }
        if (key.name === "home") {
          selected = 0;
          render();
          return;
        }
        if (key.name === "end") {
          selected = Math.max(view.length - 1, 0);
          render();
          return;
        }
        if (key.name === "return") {
          const entry = view[selected];
          finish(entry ? { value: entry.option.value, index: entry.index } : undefined);
          return;
        }
        if (key.name === "escape" || (key.ctrl && key.name === "c")) {
          finish(undefined);
          return;
        }
        if (key.name === "backspace") {
          filter = filter.slice(0, -1);
          selected = 0;
          view = filterOptions(filter, options);
          render();
          return;
        }
      }
      if (str && str.length === 1 && str >= " ") {
        filter += str;
        selected = 0;
        view = filterOptions(filter, options);
        render();
      }
    };

    const cleanup = (): void => {
      process.stdin.off("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKeypress);
    render();
  });
}
