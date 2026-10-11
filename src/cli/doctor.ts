import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { configPath, loadSettings } from "../config/store.js";
import {
  apiKeySource,
  credentialsPath,
  loadCredentials,
} from "../config/credentials.js";

type Status = "ok" | "warn" | "fail";

interface CheckResult {
  status: Status;
  label: string;
  detail: string;
}

function checkNodeVersion(): CheckResult {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 20) {
    return { status: "ok", label: "Node.js", detail: `v${process.versions.node}` };
  }
  return {
    status: "fail",
    label: "Node.js",
    detail: `v${process.versions.node} found, >= 20 required`,
  };
}

function checkGit(): CheckResult {
  try {
    const version = execFileSync("git", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { status: "ok", label: "Git", detail: version };
  } catch {
    return { status: "warn", label: "Git", detail: "git not found on PATH" };
  }
}

function checkConfig(): CheckResult {
  try {
    const { settings, file, exists } = loadSettings();
    return {
      status: exists ? "ok" : "warn",
      label: "Config",
      detail: exists
        ? `${file} (provider=${settings.provider}, maxSteps=${settings.maxSteps}, autoApprove=${settings.autoApprove})`
        : `${file} not found — using defaults`,
    };
  } catch (error) {
    return {
      status: "fail",
      label: "Config",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkApiKey(): CheckResult {
  const { settings } = loadSettings();
  const source = apiKeySource(settings.provider, process.env, loadCredentials());
  if (source === "env") {
    return {
      status: "ok",
      label: `API key (${settings.provider})`,
      detail: "from environment variable (value never printed)",
    };
  }
  if (source === "stored") {
    return {
      status: "ok",
      label: `API key (${settings.provider})`,
      detail: `stored in ${credentialsPath()} (value never printed)`,
    };
  }
  return {
    status: "fail",
    label: `API key (${settings.provider})`,
    detail: "not configured — run `lazorik setup`",
  };
}

function checkWorkspace(root: string): CheckResult[] {
  const results: CheckResult[] = [];
  results.push({
    status: fs.existsSync(root) ? "ok" : "fail",
    label: "Workspace",
    detail: root,
  });

  const gitHead = path.join(root, ".git");
  results.push({
    status: fs.existsSync(gitHead) ? "ok" : "warn",
    label: "Git repository",
    detail: fs.existsSync(gitHead) ? "yes" : "no — git_diff will not work",
  });

  const gitignore = path.join(root, ".gitignore");
  results.push({
    status: fs.existsSync(gitignore) ? "ok" : "warn",
    label: ".gitignore",
    detail: fs.existsSync(gitignore) ? gitignore : "missing — only default ignores apply",
  });

  return results;
}

export async function commandDoctor(argv: string[]): Promise<number> {
  const root = path.resolve(argv[0] ?? process.cwd());
  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkGit(),
    checkConfig(),
    checkApiKey(),
    ...checkWorkspace(root),
  ];

  console.log(`lazorikcode doctor — config: ${configPath()}`);
  console.log(`workspace: ${root}`);
  console.log("");

  let failures = 0;
  for (const check of checks) {
    const icon =
      check.status === "ok" ? "[ok]" : check.status === "warn" ? "[warn]" : "[fail]";
    console.log(`${icon.padEnd(7)} ${check.label}: ${check.detail}`);
    if (check.status === "fail") {
      failures += 1;
    }
  }

  console.log("");
  console.log(
    failures === 0
      ? "All critical checks passed."
      : `${failures} critical check(s) failed.`,
  );
  return failures === 0 ? 0 : 1;
}
