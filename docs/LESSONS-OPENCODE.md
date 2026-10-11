# Lessons from opencode → rules for lazorikcode

Map of the latest opencode (anomalyco/opencode) state and mistakes, and how
lazorikcode steers around them from day one. Sources: GitHub releases
(v1.18.27–v1.19.0, Oct 2026), docs (opencode.ai), repo pulse (~4.5k open
issues, ~213k stars, 20k+ commits).

## What opencode is (v1.19.0, Oct 11 2026)

- Monorepo (bun, turbo): TUI + desktop app + web + SDK/server + plugins + LSP + MCP + ACP.
- Agents: `build` (full access), `plan` (read-only), `general` subagent.
- Session model with resume/fork, `/init` writes AGENTS.md, `/undo`/`/redo`,
  `/share`, `/connect` for provider keys, Zen curated model list.
- V2 exists next to V1; both claim the `opencode` command — upgrade friction.

## Their mistakes, our rules

| Upstream incident (release) | Our rule in lazorikcode |
|---|---|
| v1.18.33: debug configuration output leaked credentials/sensitive headers | Keys are never printed. Doctor/status report only `env` / `stored` / `missing`. No debug dump of config with secrets. |
| v1.18.27: slow model startups failed; SSE cancel errors were unhandled; chunk timeouts missing | Every fetch has an `AbortController` timeout; every spawn has a timeout + kill; abort errors are caught and converted to results. |
| v1.18.33: Cloudflare AI Gateway models ignored timeouts | Timeouts live in the provider transport (`postJson`), not in provider-specific code paths — one place, always on. |
| v1.18.34: Windows `path.sep` bug in plugin names | All relative paths are normalized via `toPosix` before matching/logging; tests run on Windows paths. |
| v1.18.35: xAI rejected unsupported image formats in tool results | Per-provider quirks stay inside `src/providers/*`. Content that a provider cannot take is stripped before send, never sent to fail. |
| v1.18.31: session model/mode/reasoning state lost on resume/fork | Session state (history, provider, model, mode) is one data structure passed through the loop; resume = restore that struct. |
| v1.18.27: Anthropic `thinking.blockBinding` broke older Claude deployments | Feature defaults are conservative; anything model-specific is gated by an explicit check, opt-in via config. |
| v1.19.0: automatic updates removed after user backlash (`/update` now explicit) | No silent auto-updates, ever. Upgrades are explicit user commands. |
| V1/V2 both install as `opencode` — migration pain | One binary name (`lazorik`); breaking changes require a major bump and a migration note, never a surprise. |
| ~4.5k open issues from a huge surface (TUI, desktop, IDE, MCP, LSP, plugins…) | Tiny MVP surface: 5 tools, 3 providers, 1 loop. Features land only after the safety net (tests) for the current layer exists. |
| Security hardening late (v1.19.0: PTY origin/ticket validation) | Anything that later becomes a server/socket gets origin validation before it ships; local ≠ trusted. |
| Plan/build mode split as an afterthought | Read-only mode is a first-class flag on the tool context from the start (roadmap: `--mode plan` disables write/exec tools). |

## What we deliberately copy

- AGENTS.md project instructions loaded into the system prompt (their `/init`).
- Explicit permissions/confirmations for writes and commands.
- Providers behind one interface; agent loop provider-agnostic.
- Open source skeleton: MIT, CONTRIBUTING, AGENTS.md, tests in CI gate.

## Roadmap ordered by their pain (not by novelty)

1. ~~**Mode `plan`**~~ — done: `plan`/`code` modes with tool filtering
   (`src/agent/modes.ts`), `/mode` in REPL, `--mode` flags, `config --mode`.
2. ~~**AGENTS.md `/init`**~~ — done: `lazorik init` generates the skeleton,
   `buildSystemPrompt` loads it (+ mode suffix) into every request.
3. ~~**Session persistence**~~ — done: per-workspace JSON in the config dir
   (`src/config/sessions.ts`), one struct (history + provider + model + mode),
   auto-save each turn, resume on start, `/new` and `--fresh` reset.
4. **`/undo` via git** — before write batches, record a snapshot when in a repo.
5. **Streaming responses** — with chunk timeouts and cancel handling from day one.
6. **MCP tools** — only after the permission model is proven; validate origins.
7. **TUI** — last; the REPL loop is the contract the TUI will wrap.
