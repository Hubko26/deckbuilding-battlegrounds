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
  (Minca/Štít 1, Jablko/Kniha/Koreň/Vlna 2, Srdce/Iskra 3).
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
- **Spell slot** – kúzla majú vlastný súkromný slot (1 kúzlo, vlastný tier),
  neberú miesto príšerám: spoločné aj súkromné sloty ponúkajú LEN príšery.
  Slot sa správa ako súkromná karta: refresh ho rolluje, Freeze ho zmrazí,
  po boji sa rolluje nanovo, kúpa ho hneď doplní novým kúzlom.
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
  **Výnimka – `dmgWeakEnemy`**: evolve škáluje POČET zásahov (1/2/3),
  nie silu – strieborný výboj dá 2× základný damage najslabším cieľom
  (counter na hordy malých tokenov, proti veľkým telám ostáva slabý).
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
| beast | Zviera | veľké telá – aury, taunty a stále väčšie Mláďatá |
| elemental | Živel | výbuchy – single aj AoE damage, evolve = viac zásahov |
| undead | Nemŕtvy | horda kostíkov + Pretečenie |

Ďalšie rasy (Dragon, Fairy, Human, Ogre) sa pridajú s ďalšími art sadami –
dátový model je pripravený (pole `race` na karte).

### Rasové archetypy (implementované)

Tri rasy tvoria trojuholník counterov: **Elemental > Undead** (multi-hit
a výbuchy zabíjajú 1/1 kostíkov), **Beast > Elemental** (malé pingy sa
strácajú na veľkých telách), **Undead > Beast** (viac tiel = viac útokov
v cykle, Pretečenie škáluje aj po zaplnení plochy). Mechaniky sú rozložené
cez rôzne keywordy (Pri smrti, Pred bojom, Pri útoku), nie len deathrattle.

**🐾 Beast – rastúce Mláďa**

- B007 (t1, Pri smrti) a B008 (t3, Pred bojom) vyvolávajú **Mláďa** 🐣.
  Mláďa je zakaždým silnejšie: trvalé počítadlo rastu (`tokenGrowth`,
  obdoba permanentných aur) však kŕmi **len B007** – rast má cenu smrti.
  Každá jeho smrť pridá +1/+1; evolve zvyšuje **krok rastu** (strieborná
  +2/+2, zlatá +3/+3), nie počet vyvolaných. B008 vyvoláva Mláďa
  v aktuálnej narastenej veľkosti, ale počítadlo nezvyšuje – „Pred bojom"
  motor bez rizika bol podľa simulácie prestrelený (mirror 91 % pri kroku
  +2 a oboch kartách kŕmiacich rast; po nerfoch ~80 % vs 72 % kontrola).

**💀 Undead – horda kostríkov + Pretečenie**

- Viac kariet vyvoláva kostíkov a vo väčších počtoch: U001 (t1, Pri smrti)
  2×, U005 (t3, Pred bojom) 2×, U006 (t3, taunt, Pri smrti) 2×, U009
  (t5, Pri smrti) 3×. Nemŕtve telá sú štatovo podpriemerné (U005 3/4,
  U009 5/4). Kostík je **2/1** – bije tvrdo (páka na veľké beast telá),
  ale padne na jediný ping (elemental counter).
- **Pretečenie**: keď sa vyvolávaný nemŕtvy token nezmestí na plnú plochu
  (max 5), nezmizne naprázdno – jeho staty sa rozdelia medzi živé vlastné
  príšerky (rovným dielom, zvyšok náhodne cez `state.rng`). Platí len
  v boji a je dočasné ako všetky bojové buffy. AoE výbuchy čistia plochu,
  čím tokenom uvoľňujú sloty – prirodzená anti-synergia s Pretečením.

**✨ Elemental – explozívny archetyp**

- Výboje (`dmgWeakEnemy`): E001/E005 (Pred bojom), E006 (Pri smrti) –
  mieria na **najslabšieho** (najmenej HP) nepriateľa: kosia tokeny
  a nekŕmia zbytočne deathrattle telá (náhodný cieľ podľa simulácie
  undead paradoxne posilňoval). Evolve = **viac zásahov po základnej
  sile** (1/2/3), nie väčší zásah.
- AoE výbuchy (`dmgAllEnemies`): E002 (t1, taunt, Pri smrti: 3 všetkým),
  E010 (t6, Pred bojom: 4 všetkým). Jedna veľká vlna – engine pošle jeden
  `aoeDmg` event a UI zasiahne všetkých NARAZ, žiadne projektily po jednom.
- **Tokeny nedostávajú aury** (`futureRace` sa na ne neaplikuje) – kostíky
  ostávajú malé a AoE/výboje ich spoľahlivo čistia; bez toho undead
  podľa simulácie bil elementálov 80:20. Mláďa škáluje vlastným rastom,
  kostík stupňom rodiča.
- Kúzlo **Večná iskra** ⚡ (t4, cena 3): všetky tvoje výboje a výbuchy
  (navždy) dávajú +1 damage. Stackuje sa (`p.dmgBoost`) – elemental
  ekvivalent permanentných aur, škáluje damage plán do late game.

### Plánované rasové mechaniky

Návrhy pre ďalšie art sady (zatiaľ neimplementované).

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

**🙋 Human (Človek) – nová rasa: Božský štít (Divine Shield)**

- Ľudia stavajú na keyworde **Božský štít**: prvý zásah, ktorý by príšerku
  zranil, sa úplne zruší (štít praskne, staty ostávajú). Štýl Hearthstone
  Divine Shield.
- Synergie: „Pri vyložení: daj Božský štít kamarátovi", „Pred bojom: obnov
  štíty všetkým Ľuďom", karty, ktoré sa buffnú, keď im praskne štít.
- Counter dynamika: multi-hit elementáli štíty efektívne lámu (veľa malých
  zásahov), horda kostíkov tiež; proti veľkým beast telám štít blokuje
  jeden obrovský hit – prirodzene zapadne do trojuholníka.
- Implementačne: `inst.shield` boolean, vetva v boji pred odpočtom HP;
  evolve môže pridať „štít sa raz obnoví".

### Synergie

- **Rasové buffy** sú viazané na rasu: Zvieratá boostujú Zvieratá, Nemŕtvi
  Nemŕtvych… (`buffRace`). Kúzla a niektoré karty (napr. Whifflet – Pri útoku
  +1/+0 všetkým) buffujú naprieč rasami – to je priestor na cross-race combá.
- **Permanentné aury** (`futureRace`): „Pri vyložení: VŠETKY tvoje Zvieratá
  (aj v balíčku, navždy) dostanú +1/+1.“ Platí do konca hry na každú novú
  inštanciu danej rasy (dotiahnutú, kúpenú, evolvnutú; tokeny NIE) – keďže sa
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
