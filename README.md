# lazorikcode

**lazorikcode** — open source CLI kódovací agent pro terminál. Příkaz: **`lazorik`**.
Node.js 20+, TypeScript (strict, ESM), zero runtime dependencies. Adaptéry pro
**OpenAI**, **Anthropic**, **OpenRouter** a **OpenCode Zen** (free modely,
vč. `opencode/mimo-v2.6-flash-free`) přes společné rozhraní.

Repo: <https://github.com/l4zorik/buznacli> · Licence: [MIT](LICENSE) ·
community-driven — issues a PR jsou vítané.

Vývoj probíhá ve stylu [opencode](https://github.com/anomalyco/opencode) —
s jejich poslední verzí (v1.19.0) zmapovanou v
[`docs/LESSONS-OPENCODE.md`](docs/LESSONS-OPENCODE.md) a přenesenou do našich
pravidel od prvního dne (timeouts, žádný tisk klíčů, malý povrch, testy u
každé safety změny).

## Rychlý start

```bash
npm install
npm run typecheck
npm test
npm run build
npm link          # zaregistruje globální příkaz `lazorik`

cd /k/tvuj/projekt
lazorik           # při prvním spuštění nabídne vložení API klíče
```

Bez `npm link` spouštěj přes `node dist/index.js …` nebo `npm run dev -- …`.

## Příkazy

```bash
lazorik                          # interaktivní session (opencode-styl hlavička)
lazorik --mode plan              # session v read-only režimu
lazorik --fresh                  # session neobnovovat, začít od nuly
lazorik "Oprav chyby v typech"   # one-shot (zkrateka pro run)
lazorik init                     # vytvoří AGENTS.md kostru pro projekt
lazorik models --free            # katalog free modelů (Zen + OpenRouter)
lazorik rules                    # ukáž/edituj svá vlastní pravidla (rules.md)
lazorik run --yes "Spusť testy"  # one-shot bez potvrzování
lazorik setup                    # vložit API klíč interaktivně
lazorik config --provider zen    # přepnutí providera (openai/anthropic/openrouter/zen)
lazorik config --mode plan       # výchozí režim sezení
lazorik doctor                   # diagnostika
```

V REPLu: `/help`, `/mode [plan|code]`, `/models`, `/new`, `/doctor`, `/exit`.

## Session persistence

Historie se po každém výměnném tahu automaticky ukládá per-workspace
(`sessions/<hash>.json` v uživatelské konfiguraci, mimo projekty, práva 600).
Opětovné spuštění `lazorik` ve stejném adresáři naváže, kde jsi skončil;
`/new` nebo `--fresh` začnou znovu. Data jsou jeden strukturovaný objekt
(history + provider + model + mode) — resume = obnovení téhož objektu.

## Free modely (Zen + OpenRouter)

```bash
lazorik models --free                       # jen free modely
lazorik setup --provider zen                # klíč OPENCODE_API_KEY
lazorik config --provider zen               # aktivovat zen
lazorik config --model opencode/mimo-v2.6-flash-free
```

Zen (`https://opencode.ai/zen/v1`) nabízí free tier včetně
**`opencode/mimo-v2.6-flash-free`** (MiMo 2.6 Flash) — výchozí model zen
provideru. OpenRouter free modely mají suffix `:free` (např.
`poolside/laguna-s-2.1:free`).

## Vlastní pravidla

Složení system promptu (v tomto pořadí):

1. **výchozí prompt lazorik** — bezpečnostní a pracovní pravidla
2. **tvoje pravidla** — `rules.md` v uživatelské konfiguraci
   (`lazorik rules` ho ukáže a vytvoří; platí ve všech projektech)
3. **pravidla projektu** — `AGENTS.md` ve workspace (`lazorik init`)
4. **přípona režimu** — plan (read-only) / code

## Bez limitů

Defaultně běží agent **bez limitu kroků** (`maxSteps: 0` = unlimited) —
smyčka běží, dokud model nedodá finální odpověď. Omezit lze kdykoli:
`--max-steps 25` nebo `lazorik config --max-steps 25`. Ctrl+C přeruší běh.

## Režimy plan / code

Stejně jako opencode (build/plan) má lazorik dva režimy:

- **`plan`** — read-only analýza: dostupné jen `list_files`, `read_file`,
  `git_diff`. Zápisy i příkazy jsou z registry nástrojů odebrané, model je
  nemůže zavolat; system prompt končí konkrétním implementačním plánem.
- **`code`** — plný přístup: všech 5 nástrojů, zápisy a povolené příkazy s
  potvrzením.

Volba: `--mode plan|code` (run i REPL), `/mode` v session,
`lazorik config --mode plan` (výchozí).

## API klíče

Klíče se **nikdy neukládají do projektových souborů** a nikdy se netisknou:

- **Při prvním spuštění** `lazorik` nabídne vložení klíče aktivního providera
  (výchozí OpenRouter) — vstup je skrytý, uloží se rovnou a session pokračuje.
- `lazorik setup` → `credentials.json` v uživatelské konfiguraci
  (Windows: `%APPDATA%\lazorikcode\`, Linux/macOS: `~/.config/lazorikcode/`),
  práva `600` kde jsou podporovaná.
- Proměnné prostředí mají vždy přednost: `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY` (zen).
- `lazorik doctor` hlásí jen zdroj klíče (`env` / `stored` / `missing`), ne hodnotu.

## Nástroje agenta

- `list_files` — výpis respektující `.gitignore` + default ignores
- `read_file` — čtení textu (limit 256 KB, binární soubory odmítnuty)
- `write_file` — zápis s potvrzením (nebo `--yes`)
- `run_command` — allowlist vývojářských příkazů s potvrzením
- `git_diff` — aktuální Git diff

System prompt se automaticky obohacuje o `AGENTS.md` z workspace (jako
opencode `/init`) — doporuč ho commitovat.

## Bezpečnostní vrstva

- Cesty musí zůstat uvnitř workspace rootu; citlivé soubory (`.env*`,
  `.git/`, `.ssh/`, `.aws/`, `*.pem`, `*.key`, `secrets.*`…) jsou chráněné
  pro čtení i zápis.
- `.gitignore` + default ignores (`node_modules/`, `dist/`, `build/`…) se
  nepřepisují.
- Příkazy procházejí allowlistem; shell meta znaky, `sudo`, `rm -rf`,
  pipe-to-shell a citlivé cesty jsou odmítnuty před spuštěním.
- Zápisy i příkazy čekají na potvrzení, pokud nepoužiješ `--yes`.
- Limity: počet kroků, velikost obsahu, timeout a ořez výstupu příkazů.

Nejde o plný sandbox — pro nedůvěryhodný kód použij izolovaný kontejner.

## Vývoj

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest (paths, gitignore, registry, exec, credentials, loop, writeFile)
npm run build       # dist/
```

Struktura: `src/agent` (smyčka), `src/cli` (příkazy + `ui.ts` barvy/hlavička),
`src/config` (nastavení, klíče, sessions), `src/providers` (adaptéry),
`src/safety` (cesty, gitignore, allowlist, potvrzení), `src/tools`
(registry + nástroje), `src/models.ts` (katalog modelů), `tests/`.
Pravidla pro přispěvatele: [`CONTRIBUTING.md`](CONTRIBUTING.md),
pro agenty pracující na kódu: [`AGENTS.md`](AGENTS.md).

## Licence

MIT — viz [`LICENSE`](LICENSE).
