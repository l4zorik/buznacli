import fs from "node:fs";
import { AGENTS_FILE } from "../agent/context.js";
import {
  ensureUserRules,
  loadUserRules,
  rulesPath,
} from "../config/rules.js";
import path from "node:path";

export interface RulesIo {
  out: (line: string) => void;
}

export async function commandRules(
  argv: string[],
  io: RulesIo = { out: (line) => console.log(line) },
): Promise<number> {
  const rootFlag = argv.indexOf("--root");
  const root =
    rootFlag >= 0 && argv[rootFlag + 1]
      ? path.resolve(argv[rootFlag + 1]!)
      : process.cwd();

  const file = ensureUserRules();
  const userRules = loadUserRules(file) ?? "";

  io.out(`User rules: ${file}`);
  const agentsPath = path.join(root, AGENTS_FILE);
  io.out(
    `Project rules: ${fs.existsSync(agentsPath) ? agentsPath : `${agentsPath} (missing — run lazorik init)`}`,
  );
  io.out("");
  io.out("--- user rules ---");
  io.out(userRules);
  io.out("--- end ---");
  io.out("Edit the file above; it applies to every session.");
  io.out("Project-specific rules belong in AGENTS.md of the workspace.");
  return 0;
}
