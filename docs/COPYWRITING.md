# Lazorik — český copywriting

Sada hotových textů pro web, README, sociální sítě a CLI. Tón:
**sebevědomý, technický, bez korporátního balastu.** Mluvíme „ty" jako
v komunitě, ne „vy" jako v bance.

---

## Landing page

### Hero

**Nadpis:** AI agent do terminálu, který nezničí tvůj kód.

**Podnadpis:** Lazorik je open-source kódovací agent v TypeScriptu.
Čte soubory, píše kódy, spouští příkazy — a každý svůj tah ti umí
vrátit zpět. Bezpilotní režim plánování. Snapshot každého souboru.
Žádné závislosti navíc, žádná čínská telemetrie.

**CTA primární:** `npm i -g lazorikcode` — nainstalovat zdarma
**CTA sekundární:** Podívat se na GitHub

### Value bloky

**1. Undo, kterému můžeš věřit**
Agent před každým zápisem zachytí původní stav souboru. Jedna šarže =
jeden tah. `/undo` vrátí všechno, `/redo` to zase dopředu. Snapshoty
žijí mimo tvůj projekt, takže je agent nikdy nesmaže.

**2. Plan mode — nejdřív plán, pak kód**
Dej agentovi příkaz v režimu plan a jen čte. Až plán odsouhlasíš,
přepni do code. Žádné „ups, smazal jsem ti produkční SQL".

**3. Příkazy pod dohledem**
`run_command` prochází allowlistem. Cokoliv mimo seznam, jde přes
explicitní potvrzení. Agent ti neudělá `rm -rf /` ani náhodou.

**4. Free modely hned od první spuštění**
Zen gateway i OpenRouter mají free modely. Zadej klíč, vyber model
přes `lazorik models`, a jedeme. Bez karty, bez trialu.

### Srovnávací tabulka (sekce „Proč ne rovnou opencode?")

| | Lazorik | opencode |
|---|---|---|
| Undo celého tahu | vestavěné, snapshoty mimo repo | přes git |
| Režim plan/code | ano | ano |
| Česká podpora a fakturace | ano | ne |
| Sídlo a data v EU | ano | US |
| Závislosti | nula runtime | víc |
| Model | Zen + OpenRouter free | Zen + další |

### FAQ (krátké odpovědi)

- **Je to zdarma?** Ano, CLI je MIT a free modely fungují bez placení.
- **Kam posíláš moje data?** Nikam, dokud si nevybereš placený model.
  Klíče i session žijí lokálně v tvé konfiguraci.
- **Běží to na Windows?** Ano — primárně na něm vyvíjíme.
- **Jak vyděláváte?** Později na placeném gateway a firemním tieru.
  CLI zůstane zdarma.

---

## README hero (EN/CZ mix, doporučený formát)

```markdown
# lazorik

> AI coding agent for your terminal — safety-first, zero-dependency,
> made in Czechia.

- streaming odpovědi, `/undo` každého tahu, plan/code režimy
- Zen + OpenRouter free modely, žádná karta
- Node 20+, TypeScript strict, **0 runtime závislostí**
```

---

## CLI greeting (po `lazorik` po startu)

```
Ahoj! Jsem lazorik — tvoje AI dvojka do termináře.
Zadej úkol, nebo napiš /help na příkazy. Jsi v režimu code.
```

(pro plan režimu: `… Jsi v režimu plan — jen čtu, nic nepřepisuju.`)

---

## Sociální sítě

### LinkedIn / X — launch příspěvek

Postavil jsem lazorik: open-source AI agenta do terminálu.
TypeScript, nula runtime závislostí, MIT.

Nejdůležitější vlastnost není AI — je to undo.
Agent před každým zápisem zachytí původní soubor,
takže `/undo` ti vrátí celý tah zpět. I když to
agent přehnal.

Zen + OpenRouter free modely, plan/code režimy,
streaming odpovědi.

GitHub: github.com/l4zorik/buznacli

### GIF popisky (pro demo)

1. „Streaming — odpověď roste token po tokenu"
2. „`/undo` — jeden příkaz a soubory jsou zpět"
3. „Plan mode — agent čte, ale nepíše"

---

## Tagline varianty (A/B)

1. AI agent do terminálu, který nezničí tvůj kód.
2. Kód s AI dvojkou. S jistotou vrátit zpět.
3. Tvůj AI pár programátor. S ruční brzdou.
4. Open-source coding agent. Bezpečnost first, vyrobeno v Česku.

---

## E-mail / newsletter šablona (uvítací)

**Předmět:** Vítej v lazoriku — začni ve třech krocích

Ahoj,

díky, že sis nainstaloval lazorik. Tady je, co dál:

1. `lazorik setup` — přidej API klíč (Zen nebo OpenRouter, free stačí)
2. `lazorik` — otevři REPL a zkus „založ mi hello world v Pythonu"
3. Zapomeň na undo? Neboj — `/undo` ti každý tah vrátí zpět.

Kdyby něco, napiš na [kontakt]. Odpovídám česky i anglicky.

— Jan
