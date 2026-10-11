#!/usr/bin/env node
import { CliError } from "./errors.js";
import { commandConfig } from "./cli/config.js";
import { commandDoctor } from "./cli/doctor.js";
import { commandInit } from "./cli/init.js";
import { commandModels } from "./cli/models.js";
import { commandRepl } from "./cli/repl.js";
import { commandRules } from "./cli/rules.js";
import { commandRun } from "./cli/run.js";
import { commandSetup } from "./cli/setup.js";

const HELP = `lazorikcode — open source CLI kódovací agent (příkaz: lazorik)

Usage:
  lazorik                          Interaktivní kódovací session v aktuálním adresáři
  lazorik "<prompt>"               One-shot odpověď (zkrateka pro run)
  lazorik run [options] <prompt>   One-shot agentní smyčka
  lazorik init                     Vytvoří AGENTS.md kostru pro projekt
  lazorik rules                    Ukáž/edituj svá vlastní pravidla (rules.md)
  lazorik setup                    Vložit API klíč (skrytý vstup, ukládá se mimo projekt)
  lazorik models [--free]          Katalog modelů (free modely Zen + OpenRouter)
  lazorik config [options]         Zobrazit/upravit konfiguraci
  lazorik doctor [workspace]       Diagnostika prostředí
  lazorik help                     Tato nápověda
  lazorik version                  Verze

Režimy:
  plan   read-only analýza (jen list_files, read_file, git_diff)
  code   plný přístup (zápisy a povolené příkazy s potvrzením)
  V session: /mode plan | /mode code | přepnutí: --mode

Pravidla (odvození, pořadí):
  1. výchozí prompt lazorik
  2. tvoje pravidla: rules.md v konfiguraci (lazorik rules)
  3. pravidla projektu: AGENTS.md ve workspace (lazorik init)
  4. přípona režimu (plan/code)

Limity:
  defaultně žádné — maxSteps 0 (unlimited); omezit: --max-steps N / config

API klíče:
  při prvním spuštění  nabídne vložení klíče aktivního providera (skrytý vstup)
  lazorik setup        uloží klíč do credentials.json (mimo projekty, práva 600)
  env s předností       OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENCODE_API_KEY

Poskytovatelé:
  openai | anthropic | openrouter | zen   (zen = OpenCode Zen, free MiMo 2.6)
  výběr: lazorik setup --provider zen / lazorik config --provider zen
  free modely: lazorik models --free  (např. opencode/mimo-v2.6-flash-free)

Příklady:
  lazorik setup --provider anthropic
  lazorik rules
  lazorik init
  lazorik --mode plan
  lazorik "Prozkoumej projekt a navrhni opravy"
  lazorik run --yes "Spusť testy a oprav chyby"
  lazorik doctor
`;

const VERSION = "0.1.0";

const KNOWN_COMMANDS = new Set([
  "run",
  "init",
  "models",
  "rules",
  "setup",
  "config",
  "doctor",
  "help",
  "version",
]);

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case "run":
      return commandRun(rest);
    case "init":
      return commandInit(rest);
    case "models":
      return commandModels(rest);
    case "rules":
      return commandRules(rest);
    case "setup":
      return commandSetup(rest);
    case "config":
      return commandConfig(rest);
    case "doctor":
      return commandDoctor(rest);
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
      return 0;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    case undefined:
      return commandRepl([]);
    default:
      if (command.startsWith("-")) {
        return commandRepl(argv);
      }
      if (!KNOWN_COMMANDS.has(command)) {
        return commandRun(argv);
      }
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 2;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return /(?:^|[\\/])(?:index\.(?:ts|js)|lazorik(?:code)?(?:\.js)?|my-cli-agent(?:\.js)?)$/.test(
    entry,
  );
}

if (isDirectRun()) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof CliError) {
        console.error(`Error: ${error.message}`);
        process.exitCode = error.exitCode;
        return;
      }
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error(`Error: ${String(error)}`);
      process.exitCode = 1;
    });
}
