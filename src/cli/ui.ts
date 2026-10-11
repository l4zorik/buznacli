/**
 * Zero-dependency terminal styling for the lazorikcode CLI.
 * Colors are auto-disabled on non-TTY output, with NO_COLOR set, or when
 * TERM is "dumb" — so redirected output and CI logs stay plain text.
 */

export type Style = (text: string) => string;

const ESC = String.fromCharCode(27);
const CSI = `${ESC}[`;

function isColorEnabled(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env["NO_COLOR"] !== undefined && process.env["NO_COLOR"] !== "") {
    return false;
  }
  if (process.env["TERM"] === "dumb") {
    return false;
  }
  return stream.isTTY === true;
}

function makeStyle(open: number, close: number): Style {
  return (text: string): string =>
    isColorEnabled() ? `${CSI}${open}m${text}${CSI}${close}m` : text;
}

export const bold: Style = makeStyle(1, 22);
export const dim: Style = makeStyle(2, 22);
export const italic: Style = makeStyle(3, 23);
export const underline: Style = makeStyle(4, 24);
export const red: Style = makeStyle(31, 39);
export const green: Style = makeStyle(32, 39);
export const yellow: Style = makeStyle(33, 39);
export const blue: Style = makeStyle(34, 39);
export const magenta: Style = makeStyle(35, 39);
export const cyan: Style = makeStyle(36, 39);
export const gray: Style = makeStyle(90, 39);

export function stripAnsi(text: string): string {
  const pattern = new RegExp(`${CSI}[0-9;]*m`, "g");
  return text.replace(pattern, "");
}

export interface HeaderInfo {
  version: string;
  provider: string;
  model: string;
  mode: string;
  root: string;
  maxSteps: number;
  resumedMessages: number;
}

/**
 * Startup block in the spirit of the opencode TUI: brand line with a rule,
 * model/mode line, workspace, a greeting and a dim command hint.
 */
export function renderHeader(info: HeaderInfo): string {
  const brand = bold(cyan("lazorikcode")) + dim(` v${info.version}`);
  const rule = dim("-".repeat(40));
  const model = green(info.model) + dim(" · ") + info.provider;
  const mode = info.mode === "plan" ? yellow("plan (read-only)") : green("code");
  const lines = [
    "",
    `  ${brand} ${rule}`,
    `  ${mode} mode  ·  ${model}`,
    `  ${gray(info.root)}`,
    "",
    `  ${bold("Hello! How can I help you today?")}`,
    "",
  ];
  if (info.resumedMessages > 0) {
    lines.push(
      `  ${dim(`(resumed session: ${info.resumedMessages} earlier messages)`)}`,
      "",
    );
  }
  if (info.maxSteps > 0) {
    lines.push(`  ${yellow(`step limit: ${info.maxSteps} per message`)}`, "");
  }
  lines.push(
    `  ${dim(
      "/help  /models (picker)  /mode plan|code  /undo  /redo  /sessions  /new  /exit",
    )}`,
    `  ${dim("@file inlines a file · !cmd runs an allowlisted command · /editor for long messages")}`,
    "",
  );
  return lines.join("\n");
}

export function renderPrompt(mode: string, model?: string): string {
  const short = model ? model.split("/").pop() ?? model : undefined;
  const tag =
    mode === "plan"
      ? yellow("plan")
      : green("code");
  const label = short ? `${tag}${dim("·")}${cyan(short)}` : tag;
  return `${label} ${bold(">")} `;
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_m, code: string) => cyan(code))
    .replace(/\*\*([^*]+)\*\*/g, (_m, strong: string) => bold(strong));
}

/**
 * Markdown-lite rendering for assistant output in a plain terminal:
 * fenced code blocks get a dim frame, headers go bold, inline `code` and
 * **bold** are styled. Anything else passes through unchanged.
 */
export function renderAssistantText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inCode = false;
  for (const line of lines) {
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        const lang = fence[1] ? ` ${fence[1]}` : "";
        out.push(dim(`  ┌─${lang}`));
      } else {
        inCode = false;
        out.push(dim("  └─"));
      }
      continue;
    }
    if (inCode) {
      out.push(`  ${dim("│")} ${line}`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      out.push(bold(inlineFormat(line.replace(/^#{1,6}\s/, ""))));
      continue;
    }
    out.push(inlineFormat(line));
  }
  if (inCode) {
    out.push(dim("  └─"));
  }
  return out.join("\n");
}
