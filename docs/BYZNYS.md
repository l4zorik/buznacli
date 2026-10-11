# Byznys plán — lazorik (CZ)

Model převzatý z opencode: **open-source jádro zdarma → placený gateway/pro
vrstva → firemní tier**. Distribuci dělá důvěra komunity, peníze přicházejí
z hostované služby, ne z CLI.

## 1. Pozicování

**AI kódovací agent pro české vývojáře a firmy — bezpečnější než opencode,
s českou podporou a sídlem v EU.**

Tři pilíře odlišení:

1. **Bezpečnost first** — snapshot-guard (undo/redo každého tahu), plan/code
   režimy, allowlist příkazů, ochrana citlivých souborů. „Agent, který
   nezničí repo."
2. **EU / GDPR** — data, klíče a fakturace v EU; DPA pro firmy; žádný
   přenos konverzací mimo EU u firemního tieru.
3. **Česky** — podpora, fakturace v Kč, dokumentace a onboarding v češtině.

## 2. Byznys model (jako opencode)

| Vrstva | Co | Cena | Účel |
|---|---|---|---|
| **Open core** | CLI `lazorik`, MIT, GitHub | 0 Kč | distribuce, důvěra, komunita |
| **Zen-like gateway** | hostovaný přístup k modelům (free i paid), billing v Kč | usage-based / kredity | hlavní příjem, free modely jako lákadlo |
| **Pro** | vyšší limity, priorita, prioritní modely, e-mail podpora | předplatné | solo vývojáři, freelancers |
| **Firma** | SSO, audit log, týmové politiky, on-prem/VPN, DPA, invoice | od měsíčního poplatku | české firmy a agentury |

### Free modely jako akviziční trychtýř
Stejně jako opencode Zen: zdarma dává `opencode/mimo-v2.6-flash-free`
a OpenRouter `:free` vrstvy. Uživatel si zvykne na workflow → až potřebuje
silnější model, sáhne po placené vrstvě. CLI to řeší přes `lazorik models`
a `lazorik setup` — nula friction.

### Pozor na gateway
Reálně existují dvě cesty:

- **A) Reseller** — přeprodej OpenRouter/Zen s marží (rychlý start, nízká marže,
  závislost na partnerovi).
- **B) Přímé smlouvy** — Anthropic/OpenAI/Google partner agreements
  (vyšší marže, kapitál, compliance).

Doporučení: začít A, migrace do B až při stabilním měsíčním obratu.
Gateway NENÍ priorita č. 1 — priorita je distribuce CLI.

## 3. Pricing (výchozí návrh, Kč)

| Plán | Cena | Co je v tom |
|---|---|---|
| Community | 0 Kč | CLI, free modely, undo/redo, session, komunitní podpora |
| Pro | 490 Kč/měs | placené modely (kredit), prioritní fronta, e-mail podpora do 48 h |
| Firma | od 4 990 Kč/měs | SSO, audit, DPA, on-prem option, SLA, fakturace v Kč |

- 14 dní Pro zdarma, bez karty.
- Roční platba −2 měsíce.
- DPH 21 %; EU B2C přes One-Stop-Shop; B2B s DIČ reverse charge.

## 4. Právní forma a provoz

- **Start:** OSVČ (IČO) — nízké náklady, rychlý start; fakturace přes
  Fakturoid nebo Stripe (CZK + SEPA + Apple/Google Pay).
- **Až přijdou firemní smlouvy a obrat:** založit s.r.o. (kvůli odpovědnosti,
  DPA a enterprise důvěryhodnosti). S.r.o. jde založit i později, CLI brand
  zůstává.
- Povinné: obchodní podmínky, GDPR zpracování (gateway = personální údaje
  e-mail + API provoz), cookie lišta na webu, štítek „vyrobeno v EU".

## 5. Go-to-market (CZ)

1. **GitHub first** — README v CZ+EN, good-first-issues, Show HN (EN verze).
2. **Media** — Zdroják.cz, Lupa.cz, CzechCrunch (tech), Machine Learning
   Republika newsletter.
3. **LinkedIn + X** — pravidelný build-in-public, demo GIF streaming+undo.
4. **Komunita** — Czechitas (ženská dev komunita), místní meetupy
   (JS, Python, DevOps), školy (ČVUT, MU, UPOL).
5. **Obsah** — srovnávač „opencode vs lazorik" (upřímný, tabulka),
   článek „Jak jsem postavil AI agenta v TypeScriptu bez závislostí".

## 6. Metriky, na které koukat

- GitHub stars + weekly active CLI sessions (anonymní opt-in telemetrie
  NE — z principu; jen check-update ping).
- % uživatelů, kteří přejdou free → Pro (cíl 3–5 %).
- Počet firemních trialů/měsíc (cíl: 5 po 3 měsících).

## 7. Roadmap vztaná k byznysu

1. ~~CLI MVP~~ (hotovo)
2. Streaming (hotovo)
3. Landing page + fakturace (Stripe/Fakturoid) — bez toho nejde prodávat
4. Gateway MVP (reseller přes OpenRouter, kredity v Kč)
5. Pro plán (limity + billing)
6. Firma tier (SSO, DPA, audit)
