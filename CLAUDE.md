# CLAUDE.md

Zvieracia aréna – detský autobattler + deckbuilding (6+), 1v1 proti botovi alebo
multiplayer (LAN cez lokálny server, internet cez PeerJS kód miestnosti). Čisté
HTML/JS **bez buildu**, hostovateľné na GitHub Pages. Jazyk projektu (komentáre,
commity, UI) je slovenčina.

## Príkazy

- `npm test` – testy (`node --test`, Node >= 20). Púšťaj po každej zmene engine.
- `npm run sim [-- N]` – balance simulácia bot vs bot (race matchupy, per-card
  winrate). Púšťaj pri zmene kariet/balance.
- `npm run scenario -- "B002:2 B001" "U009 U005" [n=500]` – odohrá N bojov
  zadaného mid-game scenára (boardy, aury, chargy).
- `npm run replay -- arena-games.json [last|<id>] [round=N] [verbose=1]` –
  presný replay zaznamenanej hry. Hra loguje seed + akcie do localStorage
  (posledných 10 hier); hráč ich stiahne v konzole prehliadača cez
  `arenaLogSave()`. Pri hlásení chyby si vyžiadaj tento súbor.
- `node server.mjs` – lokálny server na `http://localhost:5180` (aj LAN multiplayer).
- Žiadny build, lint ani bundler – súbory sa servírujú tak, ako sú.

## Štruktúra

- `src/engine.js` – **celá herná logika bez DOM**. Sem patria pravidlá.
- `src/cards.js` – dáta kariet (rasy, schopnosti, ceny), trojjazyčne SK/CZ/EN.
- `src/bot.js` – heuristický súper (easy/normal/hard); hrá len cez Engine API.
- `src/game.js` – UI, animácie, prehrávanie eventov z engine.
- `src/net.js` – multiplayer (replikácia akcií), `src/sfx.js` – zvuky.
- `src/claude-bot.js` – Claude súper (obtiažnosť „🧠 Claude“): ťah hrá
  Anthropic API priamo z prehliadača s hráčovým kľúčom (localStorage,
  nikdy v repe); akcie sa logujú jednotlivo, replay funguje bez API.
  Pri zlyhaní API dohrá ťah hard bot.
- `test/engine.test.mjs`, `test/bot.test.mjs` – testy engine a bota.
- `DESIGN.md` – herné pravidlá a rozhodnutia; pri zmene pravidiel ho aktualizuj.
- `.claude/skills/arena-ai/SKILL.md` – pravidlá + stratégia pre AI bota; tiež
  udržuj v súlade s engine.

## Architektúra a invarianty

- **Engine je čistý a deterministický**: žiadny DOM, VŠETKA náhoda ide cez
  `state.rng` (nikdy `Math.random`). Multiplayer replikuje akcie – rovnaký seed
  + rovnaká sekvencia volaní musí dať identický stav na oboch klientoch.
- Funkcie engine vracajú **zoznam eventov** pre UI animácie (alebo `null` pri
  nelegálnom ťahu); stav menia in-place na `state`.
- Karty držia trvalé sloty (`inst.slot`) – nič sa nepreskladáva samo.

## Kľúčové herné pravidlá (výber; detaily v DESIGN.md)

- Kolo: nákupná fáza A → nákupná fáza B → automatický boj. Hrdina má 35 HP.
- Kúpená karta ide **do balíčka** (nie do ruky); ruka sa doťahuje na 5.
- Evolve: 3 rovnaké kópie (karta + stupeň) **kdekoľvek** (plocha, ruka, balíček,
  kôpka) sa automaticky spoja; staty ×2/×4.
- Obchod:
  - 3 **spoločné** karty (zdieľané oboma hráčmi) + **súkromné** `min(tier+1, 6)`.
  - **Tier spoločných kariet = NIŽŠÍ z tierov oboch hráčov** – hráč s nižším
    tierom nesmie v spoločnej ponuke vidieť karty nad svoj tier, ani keď súper
    refreshne. Súkromná ponuka ide podľa **vlastného** tieru.
  - **Po každom boji sa obchod rolluje nanovo** (spoločné aj nezmrazené
    súkromné) – `startRound` v engine.
  - **Freeze** platí jedno kolo: zmrazená súkromná karta prežije refresh aj
    koniec kola, v novom kole sa automaticky rozmrazí.

## Konvencie

- Pri zmene pravidiel zmeň engine + testy + DESIGN.md + arena-ai SKILL.md naraz.
- Commit správy po slovensky, stručne popisujú zmenu z pohľadu hráča.
