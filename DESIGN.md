# Zvieracia aréna – návrh hry

Detský autobattler + deckbuilding pre 1v1 (hráč proti botovi, neskôr multiplayer cez
WebRTC/PeerJS). Kombinuje nákupný obchod v štýle Hearthstone Battlegrounds s vlastným
balíčkom kariet v štýle klasického Hearthstonu. Cieľový vek 6+, dieťa musí vedieť čítať.
Čisté HTML/JS bez buildu, hostovateľné na GitHub Pages.

## Herná slučka

Hra sa hrá na kolá. Každé kolo:

1. **Nákupná fáza hráča A** (v nepárnom kole začína hráč 1, v párnom hráč 2)
2. **Nákupná fáza hráča B**
3. **Automatický boj** – príšerky sa bijú samy, hrdina porazeného dostane damage

Hrá sa, kým jeden z hrdinov nepríde o všetky životy (štart: **25 HP**).

## Ekonomika

- Peniaze na začiatku kola: `min(číslo kola + 2, 10)` – t. j. 3 v prvom kole, +1 každé
  kolo, strop 10. Neminuté peniaze prepadávajú.
- Cena karty v obchode: **3** (fixná).
- Predaj karty (z ruky alebo z plochy): **+1** peniaz, karta zmizne z hry.
- Refresh obchodu: **2** peniaze.

## Obchod (v strede medzi hráčmi)

- **3 spoločné karty** – vidia ich obaja hráči; kúpená je okamžite nahradená novou,
  ktorú môže kúpiť aj súper. Tier spoločných kariet je obmedzený vyšším z tierov oboch
  hráčov. Spoločné karty sú len neutrálne.
- **Súkromné karty** – každý hráč má vlastné, súper ich nevidí. Počet:
  `min(tier + 1, 6)` (na tieri 1 sú 2, každý upgrade pridá jednu, strop 6). Miešajú sa
  v nich karty vlastnej classy a neutrálne, tier obmedzený vlastným tierom.
- **Freeze** ❄ – len na vlastných súkromných kartách; zmrazená karta prežije refresh
  aj koniec kola.
- **Refresh** – vymení 3 spoločné a všetky nezmrazené súkromné karty.
- Hráči vidia, čo súper nakúpil (zoznam v logu po jeho ťahu) – dá sa podľa toho stavať
  stratégia.

## Tier obchodu

Tiery 1–6 v štýle Battlegrounds. Cena upgradu klesá o 1 každé kolo strávené na aktuálnom
tieri (minimum 0):

| na tier | 2 | 3 | 4 | 5 | 6 |
|---------|---|---|---|---|---|
| základná cena | 5 | 7 | 8 | 9 | 10 |

Upgrade zvýši tier ponúkaných kariet a pridá jednu súkromnú kartu do obchodu.

## Balíček, ruka, plocha

- Každá classa štartuje s balíčkom **10 kariet** (pozri nižšie).
- **Kúpená karta sa zamieša do balíčka** (nie do ruky).
- Na začiatku vlastnej nákupnej fázy si hráč **dotiahne 5 kariet** (ruka je vždy
  čerstvá). Prázdny balíček → discard pile sa zamieša a stane sa novým balíčkom.
- Príšerky sa hrajú z ruky na plochu **zadarmo** (peniaze sú len na obchod). Max
  **5 príšeriek** na ploche.
- Na konci nákupnej fázy idú **nezahrané karty z ruky do discard pile**.
- Príšerky **ostávajú na ploche medzi kolami** (aj s buffmi). Padlé príšerky idú do
  discard pile – vrátia sa cyklom balíčka. Preživšie sa po boji vyliečia naplno.

## Evolve

- **3 rovnaké príšerky (rovnaká karta, rovnaký stupeň) na ploche + v ruke** sa
  automaticky zlúčia na vyšší stupeň: bronz → **strieborná** → **zlatá**.
- Kópie v balíčku sa nerátajú, kým sa nedotiahnu. Výnimka: ak kúpená karta
  dokompletuje trojicu s kópiami v ruke/na ploche, ide **rovno do ruky**
  (nie do balíčka) a trojica sa spojí okamžite – ako v Battlegrounds.
- Zlatá je koniec (ďalší stupeň sa dá doplniť neskôr, ale je to very late game).
- Staty: strieborná = **×2**, zlatá = **×4** základu. Čísla schopností: strieborná ×2,
  zlatá ×3 (resp. efekt sa triggerne 2×/3× – pri vyvolávaní tokenov).
- Buffy z troch zlúčených kusov sa nezachovajú (v prototype; zjednodušenie).
- Kúzla sa neevolvujú.

## Boj (automatický)

1. Začína strana s väčším počtom príšeriek (remíza → náhodne).
2. Najprv sa spustia schopnosti **Pred bojom** (začínajúca strana prvá, v poradí plochy).
3. Strany sa striedajú v útokoch. Útočí vždy ďalšia príšerka v poradí (cyklicky).
   Cieľ je náhodný; **Obrancovia** (taunt) majú prednosť. Damage je obojstranný.
4. Smrť spúšťa **Pri smrti** (deathrattle) – vyvolané tokeny sa objavia na mieste
   padlej príšerky, ak je miesto.
5. Boj končí, keď jedna strana nemá príšerky (limit ťahov → remíza bez damage).
6. Hrdina porazeného dostane damage = súčet stupňov preživších súperových príšeriek
   (bronz 1, strieborná 2, zlatá 3).
7. Tokeny, ktoré prežili, ostávajú na ploche; padlé tokeny miznú z hry (nejdú do
   discard pile – nie sú súčasťou balíčka).

## Kľúčové schopnosti (keywords)

| Keyword | SK label | Kedy |
|---------|----------|------|
| Battlecry | **Pri vyložení** | keď kartu zahráš z ruky |
| Deathrattle | **Pri smrti** | keď príšerka padne v boji |
| Taunt | **Obranca** | súper ju musí napadnúť prvú |
| Start of fight | **Pred bojom** | na začiatku automatického boja |
| End of turn | **Po nákupe** | na konci tvojej nákupnej fázy |

Nie každá príšerka má schopnosť – niektoré majú len silu a život.

## Rasy (tribes)

Každá príšerka má rasu; kúzla rasu nemajú. Rasy poháňajú synergie („+2/+2 všetkým
Zvieratám“) – dôležitý pilier deckbuilding rozhodnutí. V1 obsahuje **4 rasy**:

| Rasa | SK | Príklady |
|------|----|----------|
| beast | Zviera | väčšina zvieratiek, ryby, vtáky |
| dragon | Drak | Dráčik, Kráľ drakov |
| elemental | Živel | Iskrička, Fénix, Lávový obor, Bublina, Plamienok |
| fairy | Víla | Jednorožec, Starý dub |

Undead, Human a Ogre sú v pláne, ale pridajú sa až s väčším poolom kariet –
pri ~40 príšerkách by 7 rás znamenalo príliš riedke synergie (a priveľa pojmov
pre 6-ročné deti naraz). Dátový model je pripravený (pole `race` na karte).

## Kúzla

Sú v obchode (neutrálne aj classové). Hrajú sa v nákupnej fáze, potom idú do discard
pile (vracajú sa cyklom balíčka). Typy: buff príšerky, Discover (vyber 1 z 3 kariet do
ruky), peniaze navyše.

## Classy (3 na štart)

Každá classa = hrdina, štartovací balíček 10 kariet a classové karty v súkromnej časti
obchodu. Neutrálne karty sú prienik, ktorý chcú kupovať všetci.

| Classa | Hrdina | Téma |
|--------|--------|------|
| 🌲 Les | Ježko Pichliač 🦔 | rast a buffy (Po nákupe, buffy kamarátov) |
| 🌊 More | Chobotnička Ela 🐙 | Obrancovia a Pri smrti (tokeny, bubliny) |
| 🔥 Sopka | Dráčik Iskra 🐲 | útok a damage (Pred bojom, Pri vyložení) |

Štartovacie balíčky (trojice → skorý evolve):

- **Les:** 3× Ježko vojak, 3× Veverička, 2× Sova, 2× Medveď
- **More:** 3× Rybka, 3× Krab, 2× Medúza, 2× Korytnačka
- **Sopka:** 3× Salamandra, 3× Iskrička, 2× Fénixík, 2× Dráčik

Kompletný zoznam kariet je v `src/cards.js` (dáta sú zdrojom pravdy).

## Technika

- Čistý JS bez frameworku a bez buildu, `index.html` v koreňi repa → GitHub Pages.
- `src/engine.js` – čistá herná logika bez DOM, deterministická (injektovaný generátor
  náhody) kvôli unit testom (`node --test`).
- `src/bot.js` – heuristický bot (kupuje trojice, upgraduje tier, vykladá najsilnejšie).
- `src/cards.js` – dáta kariet, texty schopností sa generujú zo šablón (SK/CZ/EN).
- `src/game.js` – UI, animácie boja prehrávajú event log z enginu.
- Grafika: emoji príšerky + farebné rámy podľa stupňa (bronz/striebro/zlato). Neskôr
  vymeniteľné za vlastné obrázky.
- Multiplayer (later): PeerJS/WebRTC, kód miestnosti, žiadny vlastný server.
- Bot je vymeniteľný driver – UI volá len `Bot.botTurn(state, pid, difficulty)`.
  Heuristický bot má obtiažnosti easy/normal/hard. Plán: **Claude bot** – malý
  lokálny server, ktorému hra pošle serializovaný stav a ktorý vráti zoznam akcií
  (rovnaké Engine API); obtiažnosť sa nastaví promptom. Fallback: keď server
  nebeží (napr. na GitHub Pages), hrá heuristický bot.
