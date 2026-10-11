import { dim } from "./ui.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CSI = `${String.fromCharCode(27)}[`;
const CLEAR_LINE = `${CSI}2K`;
const CARRIAGE_RETURN = "\r";

/**
 * Tiny stderr spinner for TTY sessions (opencode-style activity feedback).
 * Non-TTY stderr (pipes, CI) renders nothing. All writes go to stderr so
 * assistant answers on stdout stay clean.
 */
export class Spinner {
  private timer: NodeJS.Timeout | undefined;
  private frame = 0;
  private startedAt = 0;
  private label = "";
  private visible = false;

  constructor(private readonly stream: NodeJS.WriteStream = process.stderr) {}

  private get enabled(): boolean {
    return this.stream.isTTY === true;
  }

  start(label: string): void {
    this.label = label;
    if (!this.enabled) {
      return;
    }
    if (this.timer) {
      this.update(label);
      return;
    }
    this.startedAt = Date.now();
    this.frame = 0;
    this.visible = true;
    this.timer = setInterval(() => this.tick(), 90);
    this.tick();
  }

  update(label: string): void {
    if (!this.timer) {
      return;
    }
    this.label = label;
    this.tick();
  }

  private tick(): void {
    const elapsed = Math.round((Date.now() - this.startedAt) / 1000);
    const frame = FRAMES[this.frame % FRAMES.length] ?? "·";
    this.frame += 1;
    const line = `${dim(frame)} ${this.label} ${dim(`(${elapsed}s)`)}`;
    this.stream.write(`${CARRIAGE_RETURN}${CLEAR_LINE}${line}`);
    this.visible = true;
  }

  /** Erase the spinner line without stopping (before printing output). */
  clearLine(): void {
    if (!this.enabled || !this.visible) {
      return;
    }
    this.stream.write(`${CARRIAGE_RETURN}${CLEAR_LINE}`);
    this.visible = false;
  }

  stop(): void {
    this.clearLine();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
