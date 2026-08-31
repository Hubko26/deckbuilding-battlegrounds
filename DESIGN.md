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

Hrá sa, kým jeden z hrdinov nepríde o všetky životy (štart: **35 HP**).

## Ekonomika

- Peniaze na začiatku kola: `min(číslo kola + 2, 10)` – t. j. 3 v prvom kole, +1 každé
  kolo, strop 10. Neminuté peniaze prepadávajú.
- Cena karty v obchode: príšery **3** (fixná), kúzla majú vlastnú cenu
  (Minca 1, Jablko/Kniha/Koreň/Vlna 2, Srdce 3).
- Predaj karty (z ruky alebo z plochy): **+1** peniaz, karta zmizne z hry.
- Refresh obchodu: **1** peniaz.

## Obchod (v strede medzi hráčmi)

- Obchod je vykreslený v **hornom rade slotov** dosky. Súperove karty počas
  nákupu NEVIDNO – jeho board sa ukáže až v boji (na mieste obchodu).
- **3 spoločné karty** – vidia ich obaja hráči; kúpená je okamžite nahradená novou,
  ktorú môže kúpiť aj súper. Tier spoločných kariet je obmedzený **nižším** z tierov
  oboch hráčov – hráč s nižším tierom nesmie v spoločnej ponuke vidieť karty nad svoj
  tier (ani cez súperov refresh).
- **Súkromné karty** – každý hráč má vlastné, súper ich nevidí. Počet:
  `min(tier + 1, 6)` (na tieri 1 sú 2, každý upgrade pridá jednu, strop 6). Tier
  obmedzený vlastným tierom – len tu hráč vidí karty svojho (vyššieho) tieru.
- **Po každom boji sa obchod rolluje nanovo** – celá spoločná ponuka aj všetky
  nezmrazené súkromné karty.
- **Freeze** ❄ – len na vlastných súkromných kartách; zmrazená karta prežije refresh
  aj koniec kola. V novom kole sa automaticky rozmrazí (freeze platí jedno kolo,
  štýl Battlegrounds).
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
- **Manuálne odhodenie**: kartu z ruky aj z plochy môžeš potiahnuť na kôpku –
  odhodí sa bez peňazí a ostáva v cykle balíčka (na rozdiel od predaja).
  Hodí sa pre karty hrané len kvôli battlecry, ktoré by v boji zavadzali.
- Po boji idú **všetky príšerky z plochy do discard pile** – padlé aj preživšie
  (vrátia sa cyklom balíčka). Plocha sa každé kolo stavia nanovo z ruky.
  Tokeny vyvolané v boji miznú z hry.

## Evolve

- **3 rovnaké príšerky (rovnaká karta, rovnaký stupeň) KDEKOĽVEK** – plocha,
  ruka, balíček aj kôpka – sa automaticky zlúčia na vyšší stupeň:
  bronz → **strieborná** → **zlatá**. Kópie sa spotrebujú v poradí
  plocha → ruka → balíček → kôpka; výsledok ide na plochu (ak tam bola
  kópia), inak do ruky. Spojenie zo skrytých kópií ohlási popup.
- Obchod ukazuje na kartách badge **n/3** (koľko kópií už vlastníš).
- Zlatá je koniec (ďalší stupeň sa dá doplniť neskôr, ale je to very late game).
- Staty: strieborná = **×2**, zlatá = **×4** základu. Čísla schopností: strieborná ×2,
  zlatá ×3. Vyvolávané tokeny sa škálujú SILOU, nie počtom: strieborný
  deathrattle vyvolá tokeny stupňa 2 (2/2), zlatý stupňa 3 (4/4).
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
| On attack | **Pri útoku** | keď príšerka útočí (dočasný efekt, len v boji) |

Nie každá príšerka má schopnosť – niektoré majú len silu a život.

## Rasy (tribes)

Každá príšerka má rasu; kúzla rasu nemajú. Rasy poháňajú synergie („+2/+2 všetkým
Zvieratám“). Roster tvorí **30 príšer z art sady** (3 rasy × 10), každá príšerka
má vlastné meno a obrázok pre každý evolučný stupeň (napr. Rattlewink →
Bonebound → Ossuary Hound). Zdrojová grafika je v ZIP (neverzuje sa),
optimalizované webp v `assets/cards/<ID>_<stupeň>.webp`.

| Rasa | SK | Téma |
|------|----|------|
| beast | Zviera | staty, taunty, rast |
| elemental | Živel | Pred bojom damage a buffy |
| undead | Nemŕtvy | Pri smrti – tokeny, buffy, damage |

Ďalšie rasy (Dragon, Fairy, Human, Ogre) sa pridajú s ďalšími art sadami –
dátový model je pripravený (pole `race` na karte).

### Plánované rasové mechaniky

Návrhy pre ďalšie art sady a rework existujúcich rás (zatiaľ neimplementované).

**🧚 Fairy (Víla) – nová rasa: mágia a kúzla**

- Víly sú orientované na kúzla: ich schopnosti sa spúšťajú **zoslaním kúzla**.
  Kúzla zaberajú miesto v ruke a v balíčku na úkor príšer (doťah 5, ruka max 8) –
  to je prirodzená cena hrania „spell" archetypu a víly ju premieňajú na výhodu.
- Nový keyword **„Po kúzle"** – spustí sa vždy, keď zošleš kúzlo, kým je víla
  na ploche (obdoba battlecry, ale opakovateľná):
  - „Po kúzle: **potiahni kartu**." – vlajková synergia; kompenzuje ruku
    preplnenú kúzlami a roztáča deckbuilding motor,
  - „Po kúzle: +1/+1 tejto víle" – rast počas nákupnej fázy,
  - „Po kúzle: buffni náhodnú vílu / vyvolaj slabý token",
  - vyššie tiery: „Po kúzle: vráť si 1 🪙" alebo „ďalšie kúzlo v tomto
    kole stojí o 1 menej".
- Kúzla samotné ostávajú bez rasy – víly reagujú na zoslanie, nie na
  vlastníctvo. Fairy aury (`futureRace`) fungujú štandardne.

**💀 Undead – rework: horda kostríkov + Pretečenie**

- Téma rasy sa vyhrocuje: **veľa slabých tiel**. Viac deathrattle kariet
  vyvoláva kostríkov a vo väčších počtoch (2–3 naraz, na vyšších tieroch viac);
  jednotlivé nemŕtve telá ostávajú štatovo podpriemerné.
- Nová pasívna mechanika **Pretečenie**: keď sa vyvolávaný nemŕtvy (typicky
  kostrík) nezmestí na plnú plochu (max 5), nezmizne naprázdno – jeho staty
  sa **prerozdelia medzi ostatné žijúce vlastné príšery** (rovným dielom,
  zvyšok náhodne). Plná plocha tak premieňa ďalšie tokeny na buffy a undead
  „wide" stratégia škáluje aj po zaplnení dosky.
  - Platí v boji a je dočasná ako všetky bojové buffy (po boji idú karty do
    kôpky ako čisté kópie). Implementačne: vetva „board plný" v `summon`
    efekte namiesto ticheho zahodenia tokenu.

**🐾 Beast – deathrattle s rastúcou príšerou**

- Nová beast karta: „Pri smrti: vyvolaj Mláďa." – Mláďa je **zakaždým
  silnejšie**: každé ďalšie vyvolanie počas hry má o +2/+2 viac. Počítadlo
  rastu je trvalé pre hráča na celú hru (obdoba permanentných aur,
  `raceBuffs`), takže karta prirodzene škáluje do late game.
- Evolve zvyšuje **krok rastu** (strieborná +4/+4, zlatá +6/+6 za vyvolanie),
  nie počet vyvolaných – drží líniu „beast = jedno silnejúce telo",
  kontrast k undead horde.

### Synergie

- **Rasové buffy** sú viazané na rasu: Zvieratá boostujú Zvieratá, Nemŕtvi
  Nemŕtvych… (`buffRace`). Kúzla a niektoré karty (napr. Whifflet – Pri útoku
  +1/+0 všetkým) buffujú naprieč rasami – to je priestor na cross-race combá.
- **Permanentné aury** (`futureRace`): „Pri vyložení: VŠETKY tvoje Zvieratá
  (aj v balíčku, navždy) dostanú +1/+1.“ Platí do konca hry na každú novú
  inštanciu danej rasy (dotiahnutú, kúpenú, evolvnutú aj tokeny) – keďže sa
  balíček cykluje, po jednom kole pokrýva všetko. Aury sa sčítavajú, hráč
  ich vidí v hlavičke obchodu (🐾 ✨ 💀 +a/+h) a buffnuté staty na kartách
  svietia zelenou. Každá rasa má dve aury (skorú malú a neskorú veľkú):
  Beast B006/B010, Elemental E003/E009, Undead U008/U010 – hra tak
  prirodzene rastie do vyšších čísel.
- **Dočasné boosty** – všetko, čo sa udeje v boji (Pri útoku, Pred bojom,
  Pri smrti buffy), platí len do konca boja: po boji idú karty do discard
  pile ako čisté kópie.

## Kúzla

Sú v obchode (neutrálne aj classové). Hrajú sa v nákupnej fáze, potom idú do discard
pile (vracajú sa cyklom balíčka). Typy: buff príšerky, Discover (vyber 1 z 3 kariet do
ruky), peniaze navyše.

## Bez class – superschopnosti (hero powers)

Classy nie sú: **každý hráč hrá z rovnakého poolu kariet**, aby sa nemusel
riešiť balance counterpickov. Namiesto class si hráč pri spustení hry vyberie
**superschopnosť** (hero power) – zatiaľ nie je žiadna implementovaná, výber
príde neskôr. Štartovací balíček = **10 náhodných príšer tieru 1** (duplicity
vítané, rozbiehajú evolve).

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
- Multiplayer po LAN: `node server.mjs` servíruje hru + WebSocket relay
  (bez závislostí). Klienti replikujú akcie: oba behy dostanú rovnaký seed
  a aplikujú rovnaké Engine volania, stav je deterministicky identický
  (žiadne posielanie stavu). Server spáruje prvých dvoch čakajúcich hráčov.
- Bot je vymeniteľný driver – UI volá len `Bot.botTurn(state, pid, difficulty)`.
  Heuristický bot má obtiažnosti easy/normal/hard. Plán: **Claude bot** – malý
  lokálny server, ktorému hra pošle serializovaný stav a ktorý vráti zoznam akcií
  (rovnaké Engine API); obtiažnosť sa nastaví promptom. Fallback: keď server
  nebeží (napr. na GitHub Pages), hrá heuristický bot.
