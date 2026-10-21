# CLAUDE.md

Zvieracia aréna – detský autobattler + deckbuilding (6+), 1v1 proti botovi alebo
multiplayer (LAN cez lokálny server, internet cez PeerJS kód miestnosti). Čisté
HTML/JS **bez buildu**, hostovateľné na GitHub Pages. Jazyk projektu (komentáre,
commity, UI) je slovenčina.

## Príkazy

- `npm test` – testy (`node --test`, Node >= 20). Púšťaj po každej zmene engine.
- `npm run sim [-- N]` – balance simulácia bot vs bot (race matchupy, per-card
  winrate). Púšťaj pri zmene kariet/balance.
- `npm run ideal -- [n=100 hp=100 races=beast,undead trinkets=1 verbose=1]` –
  ideálne strety rás („perfect roll": každý hráč vidí v obchode len svoju
  rasu, 100 HP, hard bot bez handicapov): matica winrate, škálovanie sily
  plochy po kolách, tier po kolách, top karty. `tierCost=5,8,10,13,16`,
  `tierDrop=0.5`, `tierMin=4` = experimenty s cenou upgradu. Bot hrá rasy
  rôzne dobre (víly a psíkov slabo) – výsledok porovnávaj s logmi hráčov.
  `exp=insect` zapne experimentálnu rasu Hmyz (aj v `target`), `variant=…`
  skúša alternatívy z `src/cards-insect.js`.
- `npm run target [-- n=100 hp=50 races=...]` – cielenie rasy: obchod a štart
  ako v hre, hard bot od 1. kola cieli zadanú rasu (lov rasy refreshom,
  skorší upgrade za silnou kartou, draci ako žoldnieri), matica sa odohrá
  4× s rôznymi seedmi – priemer a rozptyl (min–max). Default bez víl.
- `npm run pve [-- n=100 rounds=20 races=beast,insect verbose=1]` – PvE
  damage output rás: hard bot hrá sám jednu rasu (perfect roll) a každé
  kolo bije Strážcu arény (DMG Meter, bez odmeny); tabuľka damage po
  kolách 1–20, medián, sila plochy, tier, súhrn. Injekcie zdieľa
  `tools/sim-lib.mjs` s ideal-sim.
- `npm run scenario -- "B002:2 B001" "U009 U005" [n=500]` – odohrá N bojov
  zadaného mid-game scenára (boardy, aury, chargy).
- `npm run power [-- race=beast md=1]` – tabuľka teoretickej sily kariet
  (`Bot.cardPower`: telo + odhad schopnosti v stat bodoch). Rovnaké čísla
  dostáva Claude bot v katalógu; pri zmene kariet si tabuľku pozri.
- `npm run replay -- arena-games.json [last|<id>] [round=N] [verbose=1]` –
  presný replay zaznamenanej hry. Hra loguje seed + akcie do localStorage
  (posledných 10 hier); hráč ich stiahne v konzole prehliadača cez
  `arenaLogSave()`. Pri hlásení chyby si vyžiadaj tento súbor.
- `node server.mjs` – lokálny server na `http://localhost:5180` (aj LAN multiplayer).
- `npm run botloop [-- local] [code=1234]` – dvaja hard boti hrajú dookola
  v headless Chrome/Edge (GitHub Pages, s `local` localhost:5180); hra je
  stále v zozname „Práve sa hrá" na sledovanie. To isté v okne: `?botloop`.
- Žiadny build, lint ani bundler – súbory sa servírujú tak, ako sú.
- Pre-commit hook (`tools/bump-version.py --stage`) prepočíta `?v=` hashe
  v index.html a zapíše čas buildu do `version.js`; úvodná obrazovka ho
  porovná s posledným commitom na GitHube (aktuálna / stará verzia).

## Štruktúra

- `src/engine.js` – **celá herná logika bez DOM**. Sem patria pravidlá.
- `src/i18n.js` – prepínač jazyka + **všetky texty hry** (`L`: UI, `L.botTaunts`,
  `L.chess`, `L.cards`: rasy, mená kúziel/tokenov, šablóny schopností) SK/CZ/EN.
  Nový text patrí SEM, nie do cards.js/game.js.
- `src/cards.js` – dáta kariet (rasy, schopnosti, ceny); texty ťahá z `L.cards`.
  7 rás: 6 s artom (10 kariet) + Psíci (`doggy`, 9 kariet P001–P009 podľa
  art sady). Karta bez artu dostane `noArt: true, emoji` (rám s emoji).
- `src/cards-insect.js` – **experimentálna** rasa Hmyz (bez evolve, roj,
  Kukla, Jed). Načíta sa vždy, v hre je len s voľbou „🐛 Hmyz" (default
  vypnutá) → `newGame` `opts.exp`; bez nej ju engine vynechá
  (`Cards.EXP_RACES`). Texty hmyzu sú zatiaľ v tomto súbore. Testy
  `test/insect.test.mjs`.
- `src/bot.js` – heuristický súper (easy/normal/hard); hrá len cez Engine API.
- `src/game.js` – UI, animácie, prehrávanie eventov z engine.
- `src/net.js` – multiplayer (replikácia akcií, chat, prítomnosť hráča,
  návrat do hry z logu, diváci – detaily v DESIGN.md), `src/sfx.js` – zvuky.
- `src/lobby.js` – zoznam prebiehajúcich hier na úvodnej obrazovke (adresár
  drží jeden z hráčov na PeerJS ID; testy `test/lobby.test.mjs`).
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

- **Mutácie sú vždy vypnuté** a **ban rasy vždy zapnutý** (checkboxy zrušené).
- **Ban rasy**: pred prvým kolom každý hráč
  vyberie jednu z troch rás (`Engine.pickBan`), z dvoch výberov sa jedna
  vylosuje a jej karty v celej hre nie sú (`state.banned`, filter v `rollCard`).
- **Max. 5 rás v hre** (`Engine.RACE_CAP`, `state.races`): s banom sa
  vylosuje 6 (ponuky), po bane ostane 5; bez banu 5. `Engine.raceOut`
  = rasa zabanovaná alebo nevylosovaná. Bez `opts.raceCap` (staré záznamy,
  simulácie) hrajú všetky rasy.
- Kolo: nákupná fáza A → nákupná fáza B → automatický boj. Hrdina má 50 HP.
  Damage hrdinovi za boj má strop podľa kola (`Engine.heroDmgCap`): 1–3 max 5,
  4–10 max 10, 11–15 max 15, od 16. kola bez stropu.
- **DMG Meter kolo** (každé 5. kolo, vždy): namiesto PvP boja každý bije
  Strážcu arény (∞ staty, neútočí, úder do neho zabije útočníka), bez
  damage hrdinom; kto spraví viac damage, dostane na začiatku ďalšieho ťahu
  **Discover 1 z 3 príšer tieru `min(vlastný + 1, 6)`** – motivácia zostať
  aj na nižšom tieri. `Engine.doBossBattle`, `bossReward`.
- **Trinkety** (checkbox): ponuka 1 z 3 v kole 4 (úroveň 1) a 8 (úroveň 2–3).
- Kúpená karta ide **do balíčka** (nie do ruky); ruka sa doťahuje na 5
  (prvé zoslané Pohladkanie psíkov v kole dotiahne kartu navyše).
- **Minimum kariet** podľa tieru (`Engine.deckMin`: tier 1 = 10 … tier 6 = 15,
  všetky zóny okrem tokenov): predaj pod limit nejde, evolve čaká, kým je
  kariet menej než limit. Testy: harness má limit default vypnutý
  (`loadEngine({ deckMin: true })` ho zapne).
- Evolve: 3 rovnaké kópie (karta + stupeň) **kdekoľvek** (plocha, ruka, balíček,
  kôpka) sa automaticky spoja; staty ×2/×4. Výsledok ide **vždy do ruky** (aj
  z plochy) – battlecry sa dá zahrať znova, silnejší.
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
