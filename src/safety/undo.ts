import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { configDir } from "../config/store.js";
import { sessionId } from "../config/sessions.js";
import { SafetyError } from "../errors.js";
import { relativeToRoot, resolveWithinRoot } from "./paths.js";

const execFileAsync = promisify(execFile);

export const UNDO_VERSION = 1;
const MAX_BATCHES = 20;

interface CapturedFile {
  path: string;
  existed: boolean;
  content?: string;
}

interface UndoBatchFile {
  version: number;
  root: string;
  gitHead: string | null;
  createdAt: string;
  files: CapturedFile[];
}

export interface UndoSummary {
  restored: string[];
  removed: string[];
  gitHead: string | null;
  gitHeadChanged: boolean;
}

export interface UndoRecorder {
  /** Record the original state of a file right before it is modified. */
  capture(absolutePath: string): Promise<void>;
}

async function currentGitHead(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Per-workspace undo stack: before every write_file the original file state
 * is captured into a batch; one batch = one agent turn. `/undo` restores the
 * newest batch. Backups live in the user config dir (never inside projects)
 * and each batch records the git HEAD at capture time, so the REPL can warn
 * when the repository moved on since the snapshot (git-native safety net —
 * inside a repo the user can also `git restore` manually).
 */
export class UndoStack implements UndoRecorder {
  private open: CapturedFile[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly root: string,
    private readonly baseDir: string = path.join(
      configDir(),
      "undo",
      sessionId(root),
    ),
  ) {}

  async capture(absolutePath: string): Promise<void> {
    const absolute = resolveWithinRoot(this.root, absolutePath);
    const rel = relativeToRoot(this.root, absolute);
    if (this.seen.has(rel)) {
      return;
    }
    this.seen.add(rel);
    let existed = true;
    let content: string | undefined;
    try {
      content = await fs.readFile(absolute, "utf8");
    } catch {
      existed = false;
    }
    this.open.push(existed ? { path: rel, existed, content } : { path: rel, existed });
  }

  /** Close the current batch (files written during one turn). */
  async sealBatch(): Promise<UndoBatchFile | undefined> {
    if (this.open.length === 0) {
      return undefined;
    }
    const batch: UndoBatchFile = {
      version: UNDO_VERSION,
      root: path.resolve(this.root),
      gitHead: await currentGitHead(this.root),
      createdAt: new Date().toISOString(),
      files: [...this.open],
    };
    this.open = [];
    this.seen.clear();
    await fs.mkdir(this.baseDir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`;
    await fs.writeFile(
      path.join(this.baseDir, name),
      `${JSON.stringify(batch, null, 2)}\n`,
      "utf8",
    );
    await this.prune();
    return batch;
  }

  private async batchFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.baseDir);
      return entries
        .filter((name) => name.endsWith(".json"))
        .sort()
        .reverse()
        .map((name) => path.join(this.baseDir, name));
    } catch {
      return [];
    }
  }

  async count(): Promise<number> {
    return (await this.batchFiles()).length;
  }

  private async prune(): Promise<void> {
    const files = await this.batchFiles();
    for (const file of files.slice(MAX_BATCHES)) {
      await fs.rm(file, { force: true });
    }
  }

  async undoLast(): Promise<UndoSummary | undefined> {
    const files = await this.batchFiles();
    const file = files[0];
    if (!file) {
      return undefined;
    }
    let batch: UndoBatchFile;
    try {
      batch = JSON.parse(await fs.readFile(file, "utf8")) as UndoBatchFile;
    } catch {
      await fs.rm(file, { force: true });
      return undefined;
    }
    if (batch.version !== UNDO_VERSION || !Array.isArray(batch.files)) {
      await fs.rm(file, { force: true });
      return undefined;
    }

    const restored: string[] = [];
    const removed: string[] = [];
    for (const entry of batch.files) {
      if (typeof entry.path !== "string") {
        continue;
      }
      const absolute = resolveWithinRoot(this.root, entry.path);
      if (entry.existed && typeof entry.content === "string") {
        await fs.mkdir(path.dirname(absolute), { recursive: true });
        await fs.writeFile(absolute, entry.content, "utf8");
        restored.push(entry.path);
      } else {
        await fs.rm(absolute, { force: true });
        removed.push(entry.path);
      }
    }

    await fs.rm(file, { force: true });
    const head = await currentGitHead(this.root);
    return {
      restored,
      removed,
      gitHead: batch.gitHead,
      gitHeadChanged: batch.gitHead !== null && batch.gitHead !== head,
    };
  }

  /** Drop all snapshots for this workspace (used by /new). */
  async clear(): Promise<void> {
    this.open = [];
    this.seen.clear();
    await fs.rm(this.baseDir, { recursive: true, force: true });
  }
}

export function assertUndoablePath(root: string, absolutePath: string): string {
  const absolute = resolveWithinRoot(root, absolutePath);
  if (path.resolve(absolute) === path.resolve(root)) {
    throw new SafetyError("Cannot snapshot the workspace root itself");
  }
  return absolute;
}
