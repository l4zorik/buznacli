import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export interface InitIo {
  out: (line: string) => void;
}

function detectPackageManager(root: string): { install: string; name: string } {
  if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) {
    return { install: "bun install", name: "bun" };
  }
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    return { install: "pnpm install", name: "pnpm" };
  }
  if (fs.existsSync(path.join(root, "yarn.lock"))) {
    return { install: "yarn install", name: "yarn" };
  }
  return { install: "npm install", name: "npm" };
}

function detectScripts(root: string): {
  typecheck?: string;
  test?: string;
  build?: string;
} {
  try {
    const raw = fs.readFileSync(path.join(root, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const scripts =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? ((parsed as { scripts?: unknown }).scripts ?? {})
        : {};
    const out: { typecheck?: string; test?: string; build?: string } = {};
    if (scripts && typeof scripts === "object") {
      const s = scripts as Record<string, unknown>;
      for (const key of ["typecheck", "test", "build"] as const) {
        if (typeof s[key] === "string") {
          out[key] = `${key}: ${s[key]}`;
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function renderAgentsMd(root: string): string {
  const pm = detectPackageManager(root);
  const scripts = detectScripts(root);
  const hasSrc = fs.existsSync(path.join(root, "src"));

  const commandLines = [
    `- install: \`${pm.install}\``,
    scripts.typecheck ? `- typecheck: \`${scripts.typecheck}\`` : null,
    scripts.test ? `- test: \`${scripts.test}\`` : null,
    scripts.build ? `- build: \`${scripts.build}\`` : null,
  ].filter((line): line is string => line !== null);

  return [
    `# AGENTS.md`,
    ``,
    `## Project`,
    `TODO: one paragraph — what this project is and the main entry points.`,
    ``,
    `## Commands`,
    ...commandLines,
    ``,
    `## Structure`,
    hasSrc ? `- src/ — main source code` : `- TODO: describe the layout`,
    `- tests/ — automated tests`,
    ``,
    `## Conventions`,
    `- TODO: naming, style, patterns agents must follow`,
    ``,
    `## Notes for the agent`,
    `- Prefer small, verifiable changes.`,
    `- Run typecheck and tests before finishing.`,
    `- Never print or commit secrets.`,
    ``,
  ].join("\n");
}

export async function commandInit(
  argv: string[],
  io: InitIo = { out: (line) => console.log(line) },
): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    io.out(
      [
        "Usage: lazorik init [options]",
        "",
        "Creates an AGENTS.md skeleton in the workspace root (like opencode /init).",
        "lazorik loads AGENTS.md into the system prompt automatically.",
        "",
        "Options:",
        "  --root <dir>  Workspace root (default: cwd)",
        "  --force       Overwrite an existing AGENTS.md",
      ].join("\n"),
    );
    return 0;
  }

  const root = path.resolve(values.root ?? process.cwd());
  const target = path.join(root, "AGENTS.md");

  if (fs.existsSync(target) && !values.force) {
    io.out(`AGENTS.md already exists at ${target} (use --force to overwrite).`);
    return 1;
  }

  fs.writeFileSync(target, renderAgentsMd(root), "utf8");
  io.out(`Created ${target}`);
  io.out("Review the TODOs, fill in the details and commit it.");
  return 0;
}
