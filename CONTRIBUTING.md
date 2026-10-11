# Contributing to lazorikcode

Thanks for helping. This project is developed open source style, modeled on
lessons from [opencode](https://github.com/anomalyco/opencode) — see
[`docs/LESSONS-OPENCODE.md`](docs/LESSONS-OPENCODE.md).

## Development workflow

```bash
npm install
npm run typecheck
npm test
npm run build
```

All three (typecheck, tests, build) must pass before a PR.

## Ground rules (learned from opencode's issue history)

1. **Safety first.** Any change to `src/safety/` or tool execution requires
   tests in `tests/`. Path handling must stay Windows-safe (`toPosix`).
2. **Never log secrets.** Keys are only ever reported as `env` / `stored` /
   `missing` — never their values, never in debug output.
3. **Explicit timeouts everywhere.** Every network call and every spawned
   command must have a timeout and must handle abort/cancel errors.
4. **Small MVP surface.** opencode carries ~4.5k open issues because the
   surface grew faster than the safety net. We add features only when the
   current layer is tested.
5. **No silent auto-updates.** Upgrades are always explicit user actions.
6. **Per-provider quirks are isolated.** Provider-specific workarounds live in
   `src/providers/*` only, never in the agent loop.
7. **Errors go back to the model.** Tool failures become tool results with
   `isError: true`; they must not crash the loop.

## Commit style

Short imperative subject. Mention the area: `safety:`, `tools:`,
`providers:`, `agent:`, `cli:`, `docs:`, `tests:`.

## Releasing

Bump `package.json` version, run the full check suite, tag, publish.
