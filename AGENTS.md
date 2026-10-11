# AGENTS.md — instructions for agents working on lazorikcode

## What this project is

lazorikcode is a small, safety-first CLI coding agent. Launch command: `lazorik`.
Node 20+, TypeScript strict, ESM, Vitest. No runtime dependencies (only Node builtins + fetch).

## Commands

- `npm run typecheck` — must pass
- `npm test` — must pass (100+ tests)
- `npm run build` — emits `dist/`
- `npm run dev -- run "<prompt>"` — one-shot run without build
- `lazorik` after `npm link` — global interactive session

## Layout

- `src/agent/` — agent loop, system prompt (base + user rules + AGENTS.md + mode)
- `src/cli/` — commands: run, repl, init, models, rules, setup, config, doctor
  (`ui.ts` = ANSI styling, opencode-style header; no color deps)
- `src/config/` — settings store, API credentials, user rules.md, per-workspace
  session persistence (all outside projects)
- `src/providers/` — openai / anthropic / openrouter / zen adapters
  (zen = OpenCode Zen gateway, free `opencode/mimo-v2.6-flash-free`)
- `src/models.ts` — curated model catalog (free Zen + OpenRouter tiers)
- `src/safety/` — path guard, gitignore matcher, command allowlist, confirm,
  undo stack (file snapshots per turn, config-dir storage, git HEAD recorded)
- `src/tools/` — registry + list/read/write/exec/git_diff tools
- `tests/` — Vitest unit + e2e (mock provider) tests

## Defaults

- `maxSteps: 0` = unlimited (no step cap by default)
- mode: `code`; switch with `--mode plan` or `/mode`
- user rules: `rules.md` in the config dir (`lazorik rules`)
- zen default model: `opencode/mimo-v2.6-flash-free` (free tier)
- session history auto-saves per workspace; `/new` or `--fresh` resets

## Non-negotiable rules

1. Never print or commit API keys. Credentials live in the user config dir only.
2. All file paths go through `resolveWithinRoot` + sensitive-path checks.
3. Commands go through `checkCommand` allowlist before `spawn`.
4. Any safety change ships with tests.
5. Keep dependencies at zero runtime; prefer Node builtins.
6. Plan mode must stay read-only: new write-capable tools must NOT be added to
   `PLAN_MODE_TOOLS` in `src/agent/modes.ts`.
7. Follow `docs/LESSONS-OPENCODE.md` — it maps upstream opencode mistakes to
   our practices. Do not reintroduce a fixed mistake.
8. Undo snapshots stay outside projects (config dir) and every restore path
   goes through `resolveWithinRoot` — `/undo` must never touch paths
   outside the workspace root.
