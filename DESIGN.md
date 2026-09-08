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

Hrá sa, kým jeden z hrdinov nepríde o všetky životy (štart: **50 HP**).

## Ekonomika

- Peniaze na začiatku kola: `min(číslo kola + 2, 10)` – t. j. 3 v prvom kole, +1 každé
  kolo, strop 10. Neminuté peniaze prepadávajú.
- Cena karty v obchode: príšery **3** (fixná), kúzla majú vlastnú cenu
  (Minca/Štít 1, Jablko/Umlčanie/Kniha/Koreň/Vlna/Živelná sila/Svätožiara/
  Pierko/Kliatba/Vichor/Blesk/Klobúk/Ovčia premena/Poklad 2, Srdce/Zrkadlo/
  Hviezdna moc 3). Minca je od **tieru 2** – na t1 bola
  automatická kúpa a rozbiehala snowball.
- Predaj karty (z ruky alebo z plochy): **+1** peniaz, karta zmizne z hry.
  **Buyback** ↩️: poslednú predanú kartu v ťahu si môžeš **raz za ťah** vziať
  späť za to, čo predaj dal (1, pri `richSell` 2) – vráti sa do ruky tá istá
  inštancia aj s buffmi, kópie sa vezmú späť z poolu (`Engine.buyBack`).
  Poistka proti omylu pri ťahaní karty na obchod.
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
- **Pooly kariet** (per hráč, štýl Battlegrounds): každý hráč má vlastný
  pool **6 kópií** každej príšery (súkromná ponuka, štartovací balíček,
  Kniha prianí, D004 discover, Zrkadlo, Klobúk), spoločná ponuka losuje zo
  spoločného poolu **3 kópií**. Losuje sa vážene podľa zostávajúcich kópií;
  karta v obchode je z poolu vybratá, nekúpená sa vracia (refresh, nové
  kolo, nevybraný discover). **Predaj vracia kópie do poolov, z ktorých
  boli** (`inst.src = { common: n, p1: n }`; evolve zdroje sčíta, predaj
  striebornej vráti 3). Odhodenie na kôpku nič nevracia (kartu stále
  vlastníš). Zlatá z obchodu = všetkých 6 vlastných + 3 spoločné kópie, čiže
  len ak súper kartu nekupuje – inak cez Zrkadlo/Knihu/Klobúk. Prázdny pool
  pre daný tier → záložné losovanie bez limitu (prázdny slot nechceme),
  taká karta nemá `src`. Kúzla a tokeny pool nemajú.
- Hráči vidia, čo súper nakúpil (zoznam v logu po jeho ťahu) – dá sa podľa toho stavať
  stratégia.

## Tier obchodu

Tiery 1–6 v štýle Battlegrounds. Cena upgradu klesá o 1 každé kolo strávené na aktuálnom
tieri, ale **minimum je 2** – upgrade nikdy nie je (skoro) zadarmo:

| na tier | 2 | 3 | 4 | 5 | 6 |
|---------|---|---|---|---|---|
| základná cena | 5 | 8 | 9 | 11 | 12 |

Drahšie než HS Battlegrounds (5/7/8/11/10), lebo trojice tu chodia zadarmo
cyklom balíčka – hráč neplatí refreshe na ich hľadanie, takže zlata zvyšuje
viac a lacný upgrade by šiel stihnúť každé kolo.

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
  nie silu – strieborný výboj dá 2× základný damage náhodným cieľom.
- **Buffy sa pri evolve prenášajú**: evolvnutá karta si nechá bonusy
  (dočasné aj permanentný rast `pa/ph`) **dvoch najsilnejších** zo
  spotrebovaných kópií; bonus tretej prepadne (evolve nie je čistý
  súčet, inak by staty inflatovali). Bonus sa počíta NAD základ stupňa
  bez aury – auru dostane nová inštancia znova, nedupluje sa. Kópie
  v balíčku/kôpke nesú len perma rast. Rovnako Galaxy Dragon (D010):
  cieľ si buffy berie so sebou.
- Kúzla sa neevolvujú.

## Boj (automatický)

1. Začína strana s väčším počtom príšeriek (remíza → náhodne).
2. Najprv sa spustia schopnosti **Pred bojom** (začínajúca strana prvá, v poradí plochy).
3. Strany sa striedajú v útokoch. Útočí vždy ďalšia príšerka v poradí (cyklicky).
   Cieľ je náhodný; **Obrancovia** (taunt) majú prednosť. Damage je obojstranný.
4. Smrť spúšťa **Pri smrti** (deathrattle) – vyvolané tokeny sa objavia na mieste
   padlej príšerky, ak je miesto.
5. Boj končí, keď jedna strana nemá príšerky (limit ťahov → remíza bez damage).
6. Hrdina porazeného dostane damage = súčet TIEROV preživších súperových príšeriek
   (tier 1–6 karty; evolve stupeň nehrá rolu – zlatá jednotka dá stále 1).
7. Tokeny, ktoré prežili, ostávajú na ploche; padlé tokeny miznú z hry (nejdú do
   discard pile – nie sú súčasťou balíčka).

## Rozmach (cleave)

`def.cleave` = šanca 0–1, že útok zasiahne **aj susedov cieľa** (podľa
slotov na ploche) rovnakým číslom ako hlavný úder. Zatiaľ len **O010**
(t6 ogr, 50 %). Dôvod: ogri mali **pomalý endgame** – vanilla telá a chaos
efekty, ale žiadnu kartu, ktorá hru ukončí. 10 útoku do troch tiel naraz je
hrozba hodná t6.

- Šanca je fixná a **NEnásobí sa evolve stupňom**; rastie damage, lebo ten
  je útok príšerky (strieborná 20, zlatá 40).
- **Bez suseda sa vôbec nehádže** – roll sa nemíňa naprázdno, boj ostáva
  deterministický rovnako na oboch klientoch (multiplayer).
- **Umlčanie 🤫 Rozmach odoberá** (rovnako ako Obrancu).
- S **Vichrom 🌪️** sa hádže pri každom z dvoch útokov.
- Nie je to backstab – Rozmach nemá zlú vetvu, je to čistý upside.

## Kľúčové schopnosti (keywords)

| Keyword | SK label | Kedy |
|---------|----------|------|
| Battlecry | **Pri vyložení** | keď kartu zahráš z ruky |
| Deathrattle | **Pri smrti** | keď príšerka padne v boji |
| Taunt | **Obranca** | súper ju musí napadnúť prvú |
| Start of fight | **Pred bojom** | na začiatku automatického boja |
| End of turn | **Po nákupe** | na konci tvojej nákupnej fázy |
| On attack | **Pri útoku** | keď príšerka útočí (dočasný efekt, len v boji) |
| After a spell | **Po kúzle** | keď zošleš kúzlo, kým je víla na ploche |
| Divine Shield | **Božský štít** | prvé zranenie sa zruší (štít praskne); z kúzla Svätožiara |
| Windfury | **Vichor** | príšerka útočí vo svojom ťahu dvakrát (druhý útok len ak prežila); z kúzla Vichor |
| Imprint | **Pečať** | trvalá rasová aura (`futureRace`/`futureRaceOf`/`futureAll`): „Pečať +1/+1 Zvieratám" – všetky tvoje príšerky rasy (plocha, ruka, balíček, tokeny aj budúce) dostanú staty navždy; vysvetlené v pravidlách na úvodnej obrazovke |

Nie každá príšerka má schopnosť – niektoré majú len silu a život.

## Rasy (tribes)

Každá príšerka má rasu; kúzla rasu nemajú. Rasy poháňajú synergie („+2/+2 všetkým
Zvieratám“). Roster tvorí **50 príšer z art sád** (5 rás × 10), každá príšerka
má vlastné meno a obrázok pre každý evolučný stupeň (napr. Rattlewink →
Bonebound → Ossuary Hound). Zdrojová grafika je v ZIP (neverzuje sa),
optimalizované webp v `assets/cards/<ID>_<stupeň>.webp`.

| Rasa | SK | Téma |
|------|----|------|
| beast | Zviera | veľké telá – aury, taunty a trvalý rast |
| elemental | Živel | výbuchy – single aj AoE damage, evolve = viac zásahov |
| undead | Nemŕtvy | horda kostíkov + Pretečenie |
| fairy | Víla | Po kúzle – schopnosti spúšťané zoslaním kúzla |
| dragon | Drak | žoldnieri – cielené battlecry zosilňujú rasu cieľa |
| ogre | Ogr | derpy chaos – veľké staty; smolný roll („backstab") dá Pečať celej rase |

Roster: **60 príšer z art sád** (6 rás × 10). Ďalšie rasy (Human)
sa pridajú s ďalšími art sadami – dátový model je pripravený
(pole `race` na karte).

### Rasové archetypy (implementované)

Tri rasy tvoria trojuholník counterov: **Elemental > Undead** (multi-hit
a výbuchy zabíjajú 1/1 kostíkov), **Beast > Elemental** (malé pingy sa
strácajú na veľkých telách), **Undead > Beast** (viac tiel = viac útokov
v cykle, Pretečenie škáluje aj po zaplnení plochy). Mechaniky sú rozložené
cez rôzne keywordy (Pri smrti, Pred bojom, Pri útoku), nie len deathrattle.

**🐾 Beast – telá a mrchožrút**

- B007 (t1, Pri smrti) a B005 (t2, 2×) vyvolávajú **Mláďa** 🐣 – fixný
  token 1/1 **s Obrancom** (token má `taunt: true`), škáluje len evolvom
  rodiča (2/2, 4/4). Obranca berie údery a padne skoro → kŕmi sovu B004
  („Keď zomrie tvoje Mláďa") a chráni mrchožrúta B009. Trvalé počítadlo rastu bolo odstránené:
  infinity škálovanie vyrábalo uber karty (mirror winrate až 91 %).
- B004 (t2) je **trvalý mrchožrút** (`raceDeath` + `perm`): „Keď zomrie
  tvoje Zviera: +1/+1 pre seba NAVŽDY" (evolve ×2/×3) – kŕmi ho každé
  padnuté vlastné zviera vrátane Mláďat (tokeny majú rasu). Prvý
  permanentný rast z boja – bojuje kópia, engine zapíše `pa/ph` na originál
  na ploche, ktorý ide po boji do kôpky. Pôvodne len Mláďa (príliš úzke);
  bývalý battlecry draw bol kópia F001 a mimo témy.
- B009 (t4) je **mrchožrút** (`raceDeath`): „Keď zomrie tvoje Zviera:
  +2/+2 pre seba" – rast je bojový a dočasný, viazaný na padlé vlastné
  zvieratá (synergia s Mláďaťom a trade-ami), evolve ×2/×3.
- B003 (t1) a B008 (t3) rastú v nákupnej fáze **NAVŽDY** („Po nákupe:
  +1/+1 resp. +2/+2 pre seba" s `perm: true`): rast sa uloží na konkrétnu
  kópiu karty (`pa`/`ph`) a prežije boj aj cyklus kôpka → balíček → ruka.
  Bez toho boli tieto karty de facto vanilla (rast sa po boji zahodil).
  Evolve tri kópie spája na čistú kartu – trvalý rast kópií sa pri ňom
  stráca (rovnaké zjednodušenie ako pri buffoch).

**💀 Undead – horda kostríkov + Pretečenie**

- Viac kariet vyvoláva kostíkov a vo väčších počtoch: U001 (t1, Pri smrti)
  2×, U005 (t3, Pred bojom) 2×, U006 (t3, taunt, Pri smrti) 2×, U009
  (t5, Pri smrti) 3×. Nemŕtve telá sú štatovo podpriemerné (U005 3/4,
  U009 5/4). Kostík je **1/1** (bol 2/1 – dvojica z U001 dávala t1 karte
  4/2 za 3 zlata) a padne na jediný ping (elemental counter).
- **U002 (t1, Pri vyložení)**: „v najbližšom boji všetky tvoje Kostíky
  +1/+1" (`fightToken`, `p.fightTokenBuffs[kostik]`, evolve ×2/×3,
  stackuje sa, po boji sa nuluje ako dračie `fightRaceBuffs`). Vracia
  kostíkom úderný 2/2 – t1 undead stojí na U002 + U001. Navždy by bolo
  prisilné (aury už kostíky berú). Pôvodný výboj bol elemental mechanika.
- **U004 (t2, Pri vyložení, cielené)**: označená príšerka po smrti vstane
  ako 1/1 (stupeň 2/2, 3/3). Karta NAOZAJ zomrie – deathrattle aj
  scavengery prebehnú PRED vstávaním (kostíky zaplnia plochu, druhá smrť
  ich pretečie do buffov). Aury (permanentná rasová aj dračia bojová) sa
  na vstávajúcu aplikujú; pri plnej ploche ostáva ležať. Nahradila tretiu
  undead auru (+0/+1) – undead boli slabí a aura bola redundantná
  k U008/U010.
- U007 (t4, Pri vyložení) dáva jednorazovú chargu (`summonCharge`):
  „tvoje ďalšie vyvolanie v boji vyvolá o 1 viac". Chargy sa stackujú
  a minú sa prvým vyvolaním. Strieborný dáva +2, zlatý +3 (čísla ×stupeň).
  **Chargy (aj Iskra) platia len najbližší boj** – nevyužité po boji
  prepadnú, nech sa nehromadia naprieč kolami.
- **Pretečenie**: keď sa vyvolávaný nemŕtvy token nezmestí na plnú plochu
  (max 5), nezmizne naprázdno – jeho celé staty dostane jedna náhodná živá
  vlastná príšerka (výber cez `state.rng`). Platí len
  v boji a je dočasné ako všetky bojové buffy. AoE výbuchy čistia plochu,
  čím tokenom uvoľňujú sloty – prirodzená anti-synergia s Pretečením.

**✨ Elemental – explozívny archetyp**

- **E005 Lovec tokenov** (t3, 3/4, `onEnemySummon`): „Keď súper vyvolá
  token: zasiahni ho výbojom za 1; ak zomrie, +1/+1 pre seba NAVŽDY."
  Hook hneď po položení tokenu v boji (U001 2× kostík = 2 výboje), výboj
  škáluje so Živelnou silou a stupňom (1/2/3), rast ×stupeň cez `pa/ph`.
  Kostík 1/1 padne, kostík s U002 (2/2) alebo aurou prežije – živly musia
  Živelnou silou držať krok s undead aurami. Pretečenie (token mimo plochy)
  lovca nespustí – únik pre undead cez plnú plochu. Jediný navždy-rast
  živlov mimo aur; nahradil výboj 3, ktorý bol kópia E001.
- Výboje (`dmgWeakEnemy`): E001 (t1, Pred bojom 3), E006 (t3, Pri smrti
  **4**), Bublina (token, Pri smrti 1) – mieria na **náhodného** živého
  nepriateľa (predtým najslabší: spoľahlivé kosenie tokenov bolo nudné a
  proti veľkým telám úplne mŕtve). Evolve = **viac zásahov po základnej
  sile** (1/2/3), nie väčší zásah. Ladder t1 3 → t3 4 → t6 výbuch 3.
- **E002 Bubbleskip** (t1, 1/3 Obranca): „Pri smrti: vyvolaj 2× Bublinu"
  🫧 – Bublina 1/1 elemental token s „Pri smrti: výboj 1" (+Živelná
  sila, vždy JEDEN zásah – `hits: 1`; strieborná E002 dáva Bubliny 2/2,
  nie dvojitý výboj). Živly tak majú telá navyše aj
  reťazové výbuchy; na plnú plochu sa Bublina nezmestí (Pretečenie je len
  undead). Súperov Lovec tokenov (E005) Bubliny loví – a každá mu pri
  smrti odpovie výbojom.
- **E007 Sproutsnout** (t4, 4/7): „Po nákupe: Živelná sila +1" (navždy,
  evolve +2/+3), kým je na ploche – motor identity, živly už nezávisia od
  jediného spell slotu. Kúp-vylož-predaj = 2 zlata za +1, cena kúzla.
- **E008 Prismite** (t4, 5/5): cielený battlecry **+1/+1 vybranej príšerke**
  (`buffOne`, do konca boja, hocijaká rasa) – dočasný buff Živla, takže ho
  Živelná sila škáluje v oboch číslach (⚡+2 → +3/+3), evolve ×2/×3. Živly
  majú aury E003 t2 +1/+1 a **E009 t5 +2/+2**; Prismite už auru nedáva.
- Telá na krivku: E001 2/2, E004 4/4, E005 3/5, E006 4/4 (boli 1/2, 4/3,
  3/4, 4/3 – živly platili za výboje telom aj číslom).
- AoE výbuch (`dmgAllEnemies`): len E010 (t6, Pred bojom: **3** všetkým).
  Jedna veľká vlna – engine pošle jeden `aoeDmg` event a UI zasiahne
  všetkých NARAZ, žiadne projektily po jednom.
- **Tokeny dostávajú permanentné aury** (`futureRace`) – kostíky aj mláďatá
  s aurami škálujú do late game (predtým aury tokeny nebrali a undead
  scaling zaostával). Kostík navyše škáluje stupňom rodiča.
- Kúzlo **Živelná sila** ⚡ (t3, cena 2, bývalá Večná iskra): trvalý
  „ability power" (`dmgBoost`) – „navždy: tvoje výboje a výbuchy +1 damage,
  bonusy Pri útoku +1 útok". Stackuje sa – elemental ekvivalent
  permanentných aur (malý krok +1, aby nesnowballoval). Zosilňuje výboje
  (`dmgWeakEnemy`), výbuchy (`dmgAllEnemies`, `dmgAllBoth`, `dmgRandomAny`),
  Blesk aj **dočasné buffy Živlov**: E004 „Pri útoku: +1/+1 Živlom"
  (`buffRace`) a E008 „Pri vyložení: +1/+1 vybranej príšerke" (`buffOne`) –
  z živelnej karty dostanú +boost na útok aj život. Bonus sa nenásobí stupňom; výboje/výbuchy platia pre
  všetky rasy, buffy len pre Živly (F007 buffRace víl nie). Permanentné
  aury (`futureRace`) NEzosilňuje – aura +1 navždy by snowballovala.
  **Buffy kúziel** škáluje tiež (`sparkBonus`): Jablko, Koreň, Srdce, Vlna,
  Iskrička dostanú +boost na každé NENULOVÉ číslo (Koreň +0/+4 → +0/+5,
  Jablko +2/+2 → +3/+3); kúzla bez statov (Štít, Svätožiara, Pierko, Vichor)
  sa nemenia. Platí len pre kúzlo (`castSpell`), nie pre rovnaký efekt
  z príšerky (F009 Po kúzle buffAllFriends ostáva +2/+2).
  UI: popisky výbojov/výbuchov/Pri útoku aj kúziel v obchode a ruke ukazujú
  číslo aj s bonusom majiteľa a zvýrazňujú ho zelenou (trieda `.boosted`).
- **E004 Whifflet** (t2, 4/4, Pri útoku: **+1/+1 všetkým Živlom**):
  buffuje len vlastnú rasu (vrátane Bublín – tokeny majú rasu), nie celú
  plochu. OBE čísla škáluje Živelná sila (⚡+2 → +3/+3 za útok); s Vichorom
  útočí dvakrát a rozdá ho dvakrát. Nízkotierový dôvod kupovať ⚡ –
  „Pri útoku" karty sú zároveň hlavný cieľ Vichoru.

**🧚 Fairy – Po kúzle (implementované)**

- Schopnosti víl sa spúšťajú **zoslaním kúzla**, kým je víla na ploche
  (keyword `afterSpell`, opakovateľná obdoba battlecry). Kúzla zaberajú
  miesto v ruke a balíčku na úkor príšer – víly túto cenu premieňajú
  na výhodu.
- Roster: F002 rast +1/+1 **NAVŽDY**, F003 buff náhodného kamaráta,
  F001 **Pri vyložení** potiahni kartu (evolve 1/2/3 – Po kúzle draw
  tvoril s F005 nekonečný motor: kúzlo vrátilo zlato aj kartu),
  F004 taunt +1/+2 **NAVŽDY**, F005 vráť 1 🪙,
  F006 (4/4) **Pri vyložení: pridaj do ruky Iskričku** ✨,
  F007 taunt +1/+1 Vílam, F009 (t5, 6/6) +2/+2 všetkým tvojim príšerkám
  (dočasné, aj iné rasy – prebrala bývalú t6 schopnosť, vanilka 8/8
  bola mimo vílej témy), **F008 (t6, 7/8) Po kúzle: VŠETKY tvoje
  príšerky každej rasy +1/+1 NAVŽDY** (`futureAll` – zapíše sa do
  `raceBuffs` všetkých rás naraz, takže ju berú aj tokeny, balíček,
  evolve aj reviveAs; evolve ×2/×3). Finálna víla = endgame akcelerátor,
  t6 musí rásť rýchlejšie než t5. Header obchodu ukáže spoločný základ
  všetkých rás raz ako ⭐, rasové aury len zvyšok nad ním.
- **Iskrička** ✨ (spell token z F006): +1/+0 vybranej príšerke.
  **Jednorazová** – NEJDE do balíčka: po zoslaní, odhodení aj na konci
  ťahu zmizne z hry (`token: true` na kúzle). Zoslanie spúšťa Po kúzle
  víly – F006 tak kŕmi vlastný motor. Evolve škáluje počet (1/2/3).
  Pôvodné svetluškové summony (F006/F009) sme odstránili – pri plnej
  ploche boli mŕtve schopnosti.
- **Self-rast víl (F002, F004) je permanentný** (`perm: true`, ako
  Hopple/Snortlet) – prežije boj aj cyklus balíčka; kúzla do víl sú
  investícia navždy. Plošné buffy (F003/F007/F008) ostávajú dočasné –
  za lacné opakovateľné kúzla by permanentný plošný rast snowballoval.
- F010 (t4, Pri vyložení): **+1/+1 za každé kúzlo zahrané v tejto hre**
  (`spellScale`, počítadlo `p.spellsCast`) – škáluje s celou hrou, ale
  prepočíta sa pri každom vyložení, žiadny trvalý buff (nesnowballuje).
  Bonus za kúzlo sa **nenásobí stupňom** (evolve rastie len cez základné
  staty ×2/×4) – so škálovaním ×2/×3 za kúzlo mala karta 36/36 v 5. kole.
- Podporné kúzla (pre všetkých, ale víly z nich ťažia dvakrát):
  - **Svätožiara** 😇 (t3): vybraná príšerka získa **Božský štít** –
    prvé zranenie sa zruší, štít praskne (`inst.shield`; Žabia kliatba
    a iné ne-damage efekty ho obchádzajú),
  - **Fénixovo pierko** 🪶 (t3): vybraná príšerka sa po smrti raz vráti
    s 1 životom (`inst.revive`; deathrattle sa pri návrate nespúšťa),
  - **Žabia kliatba** 🐸 (t4): odložená kliatba – v najbližšom boji sa
    náhodnej súperovej príšerke zmení život na 1 (anti-beast tech),
  - ~~Zvitok múdrosti~~ 📜 (draw 2) **odstránený**: víly s ním každú hru
    pretočili celý balíček a všetky kúzla – motor Po kúzle nemal strop.
    Jediný draw v hre je F001 (battlecry 1/2/3).
- **Karanténa kúziel**: zahrané kúzlo ide do kôpky až NA KONCI ťahu
  (`p.spentSpells`). Bez toho by draw (reshuffle kôpky pri prázdnom
  balíčku) vrátil kúzlo do ruky a zoslanie je zadarmo → nekonečný
  cyklus draw → Po kúzle → permanentný rast v jednom ťahu.
- Balance (simulácia): fairy build ~48 % vs beast aj elemental, ~30 % vs
  undead – horda malé vílie telá zožerie; je to vedomý counter (kruh sa
  uzatvára cez elementálov, ktorí hordu kosia).

### Claude súper (obtiažnosť „🧠 Claude“)

- Ťah bota hrá **Claude (model claude-opus-5)** cez Messages API priamo
  z prehliadača (`anthropic-dangerous-direct-browser-access`). **BYO key**:
  hráč vloží vlastný Anthropic API kľúč, žije len v localStorage – nikdy
  v repozitári ani na serveri.
- Jeden request na ťah: kompaktný stav (len legálne viditeľné info) +
  pravidlá; Claude vráti JSON `{actions, taunt}`. Akcie sa vykonajú cez
  Engine API, nelegálne sa ticho preskočia; každá úspešná sa loguje
  jednotlivo → `tools/replay.mjs` prehrá hru presne bez API.
- **Trash-talk bublina = reálna Claudova hláška** – hráč na pick obrazovke
  vyplní len MENO; profily hráčov (meme texty pre kamošov) sú natvrdo
  v `PLAYER_PROFILES` v claude-bot.js (kľúč = meno malými písmenami).
  Neznáme meno = generický roast. Detsky štipľavé, jazyk podľa UI.
  Konzervované hlášky sa v Claude móde nepoužívajú.
- **Whitelist mien**: Claude mód sa spustí len s menom zo zoznamu
  `ALLOWED_PLAYERS` v claude-bot.js (teraz Adam a David); iné meno
  dostane hlášku a hra nezačne.
- Zlyhanie API (zlý kľúč, offline, rate limit) → ťah dohrá hard
  heuristický bot + správa v logu; hra nikdy nezamrzne.
- **Banter navyše**: uvítacia bublina hneď po štarte („{meno}, zase
  meškáš na náš súboj!“); chat políčko pod doskou – hráč odpíše, Claude
  reaguje bublinou (samostatný lacný request, história ide aj do
  ťahových promptov); Claude vidí hráčove akcie z minulého kola
  (verejné info: nákupy, predaje, vyloženia) a vysmieva konkrétne
  chyby; prehra hráča = záverečný výsmech v okne výsledku.

### Plánované rasové mechaniky

**🐲 Dragon (Drak) – žoldnieri: zosilňujú rasu cieľa (implementované)**

- Draci nemajú vlastnú kmeňovú synergiu – zosilňujú akúkoľvek rasu,
  ktorú práve hráš. **Cielený battlecry** (prvý v hre): hráč pustí draka
  z ruky priamo na vlastnú príšerku a efekt sa aplikuje na JEJ rasu;
  drop mimo príšerky = fallback (najsilnejšia vlastná príšerka), takže
  efekt nikdy nevyhorí naprázdno. Bot/Claude hrá cez rovnaký fallback,
  Claude vie posielať `target` v akcii `play`.
- **Všetky ne-aurové dračie staty platia celé aktuálne kolo**: dočasné rasové
  buffy (`buffRaceOf`, `buffRandomRace`, `buffTopRace`) sú **aura do konca
  najbližšieho boja** (`p.fightRaceBuffs`): dostanú ju aj karty vyložené po
  drakovi a tokeny vyvolané počas boja (vedomá výnimka – permanentné rasové
  aury tokeny neberú). Po boji sa nuluje. Platí to aj pre `buffTopRace`
  (D007, Pred bojom) – hoci sa spúšťa až v boji, tokeny vyvolané po ňom
  buff dostanú rovnako ako pri battlecry drakoch.
- Roster: D001 (t1, 3/2) battlecry **odložené oslabenie** (`shrinkEnemy`,
  `p.shrinks`): na začiatku najbližšieho boja náhodná súperova príšerka
  −1/−1 (útok min 0, život min 1; nie je to damage – štít ani deathrattle
  sa nespustia; odložené ako Kliatba, nech nezáleží na poradí nákupu);
  D007 (t1, 2/4, Pred bojom) najpočetnejšia rasa +1/+1 (`buffTopRace`, drží
  celý boj – aj pre neskoršie tokeny). Obe boli vanilky – t1 draci nesú
  dračiu identitu (žoldnier pre iný build);
  D002 (t2) battlecry rasa cieľa +1/+1 do boja (`buffRaceOf`);
  D006 (t2, Po nákupe) náhodná tvoja rasa +1/+1 (`buffRandomRace`);
  D004 (t3) battlecry **Discover karta rasy cieľa** (`discoverRace`);
  D005 (t3, 5/4) battlecry **Živelná sila +1** (`dmgBoost` – to isté, čo
  kúzlo ⚡: výboje, výbuchy a „Pri útoku" bonusy navždy +1, evolve +2/+3);
  kúzlo má jediný spell slot, živly boost ťažko nachádzali a drak cykluje
  balíčkom ako kúzlo. **Presunuté z t1 (pôvodne D007).** Dôvod: efekt je
  trvalý, stackuje sa pri KAŽDOM vyložení a karta sa vracia cyklom balíčka –
  na t1 sa dala mať v druhom kole, na stupni 2 dávala +2 a živly s ňou
  odchádzali do trhu. Na t3 je to odmena za postavený živelný build, nie
  jeho štartér;
  D003 (t4) a D009 (t5) battlecry **permanentná aura rasy cieľa** +1/+1
  (`futureRaceOf` – cielený futureRace, čísla nízko lebo vždy trafí
  dominantnú rasu); D008 (t5) taunt 6/9, battlecry rasa cieľa +2/+2;
  D010 (t6) battlecry **cieľ evolvne o stupeň** (`evolveTarget`,
  bronz→striebro→zlato, zlatú nezdvihne; buffy cieľa sa prenesú ako
  pri bežnom evolve).
- Sim po pridaní: draci 48–64 % per-card, free-vs-free 52/48 – neutrálne.

**👹 Ogre (Ogr) – derpy chaos (implementované)**

- Identita: **obrovské staty za cenu chaosu** – každý ogre má nadpriemerné
  čísla, ale jeho efekt sa môže obrátiť proti vlastníkovi. Všetka náhoda
  cez `state.rng` (multiplayer determinizmus platí ďalej).
- Roster (10 kariet, 6 schopností + 4 vanilla telá nad krivkou):
  - **O001 Hod mincou** (t1, 2/3, Pri vyložení): „Hoď mincou 🪙 – +4/+4
    alebo −2/−2." Postih nejde pod 0 útoku / 1 život. Lacný gambling filler.
  - **O006 Ožratý úder** (t2, 5/5, Pri útoku): „50 % šanca, že sa trafí sám
    za polovicu svojho útoku." Vlajkový derp; ak sa zloží sám, útok odpadá.
  - **O002 Chaos spúšťač** (t3, 5/6, Pred bojom): „spusti schopnosť
    náhodnej príšerky na bojisku – aj súperovej" (`triggerRandom`): vyberie
    náhodnú živú príšerku z oboch strán s bojovou schopnosťou (Pri smrti,
    Pred bojom, Pri útoku, mrchožrúti) a spustí ju hneď – deathrattle
    **bez smrti**, Pred bojom druhýkrát. Keď trafí súperov deathrattle,
    súper dostane tokeny zadarmo. Evolve = počet spustení (1/2/3). Seba
    a iné spúšťače preskočí (žiadna rekurzia). Nahradil „Zožer suseda"
    (4/4 bolo pod ogrou krivkou – O008 t3 má 5/7).
  - **O003 Chaos výbuch** (t4, 7/8, Pred bojom): „2 damage VŠETKÝM
    príšerkám – aj tvojim" (škáluje ×stupeň). Anti-swarm s friendly fire;
    veľké ogrie HP vlastný výbuch prežije.
  - **O007 Divoká rana** (t5, 9/7, Pri smrti): „5 damage náhodnej príšerke –
    **50 % tvojej, 50 % súperovej**." Strana sa losuje čistým hodom mincou
    (ako O010), nie rovnomerne cez všetky telá – inak by šanca na vlastný
    zásah závisela od počtu príšeriek na plochách a backstab by bol
    nespoľahlivý. Prázdna strana = zásah ide na druhú (efekt neprepadne).
    Ruská ruleta s veľkým číslom.
  - **O010 Zmätený obranca** (t6, 10/10): „Obranca. **Rozmach: 50 % šanca,
    že úder zasiahne aj susedov cieľa.** Pri smrti: 50 % šanca, že vstane
    s 1 HP na NÁHODNEJ strane plochy" – aj u súpera! Revive je raz za boj,
    pri plnej strane ostáva ležať (technicky vstáva bojová kópia).
  - Vanilla: O004 (t1, 3/4), O005 (t2, 4/5), O008 (t3, 5/7), O009 (t4, 7/7).
- Balance: očakávaná hodnota efektov mierne záporná/neutrálna, kompenzujú
  ju staty nad krivkou – hráč platí rozptylom, nie silou. UI: chaos
  momenty hlási log (🪙 hod mincou, 👹 zožratie, 🍺 vlastný zásah,
  🎲 vstávanie) + floaty nad kartami.

**Backstab – kmeňový payoff ogrov (implementované)**

Problém: **ogrov nikto nehrá.** Príčina nie je rozptyl, ale to, že ogri sú
jediná rasa **bez kmeňového payoffu**. Zvieratá majú aury a trvalý rast,
Nemŕtvi hordu, Živly škálovanie damage, Víly Po kúzle, Draci cross-race
boost – ogri nemajú ani jednu kartu, ktorá by sa starala o iných ogrov.
Preto sa nikdy nestavia „ogr build"; ogr je len občasné veľké telo do inak
postavenej plochy. Druhý problém: viaceré ogrie efekty **pomáhajú súperovi**
(O002 spustí súperov deathrattle, O010 vstane na súperovej strane), čo je
pre dieťa čistý feelbad bez kompenzácie.

Riešenie: **„backstab" (nešťastný roll, ktorý sa obrátil proti vlastníkovi)
dá Pečať +1/+1 všetkým ogrom** – permanentná rasová aura (`raceBuffs.ogre`),
platí aj na budúce kópie z balíčka a obchodu. Rozptyl tým prestáva byť čistý
downside: smolný hod platí za seba a je to zároveň ten chýbajúci kmeňový
engine. Rieši to obe príčiny naraz vrátane „pomohol som súperovi" momentov –
práve tie sú teraz zdroj rastu.

Čo je backstab (musí to byť uzavretý zoznam, inak je pravidlo nejasné):

| karta | backstab vetva |
|---|---|
| O001 Hod mincou | padol chvost (−2/−2) |
| O006 Ožratý úder | trafil sám seba |
| O002 Chaos spúšťač | spustil schopnosť **súperovej** príšerky |
| O007 Divoká rana | hod mincou poslal 5 damage na **vlastnú** stranu (50 %) |
| O010 Zmätený obranca | vstal na **súperovej** strane |
| O003 Chaos výbuch | **nepočíta sa** – friendly fire je deterministický, nie roll |

UI: log hlási „👹 Backstab!" a hneď za ním rasový buff (`futureBuff`).

Implementácia (`backstab()` v `src/engine.js`) – jedno miesto, ktoré všetky
vetvy volajú, plus event `backstab` pre UI:

- **Strop: 1 Pečať za KOLO.** Nákupná fáza aj nasledujúci boj majú rovnaké
  `state.round`, takže `p.backstabRound` pokrýva oboje. Bez stropu by O006
  hádzal pri každom útoku (s Vichrom 🌪️ dvakrát) – tri kópie = ~1,5 backstabu
  za boj a cez 10 kôl +15/+15 na celú rasu. So stropom vychádza max ~+10/+10
  za dlhú hru, porovnateľné s beast perm rastom.
- **Pečať je fixne +1/+1 a NEnásobí sa evolve stupňom** (`m`). Inak by bola
  útecha lepšia než výhra a hod mincou by stratil napätie.
- **V boji Pečať zosilní živé ogry hneď** (rovnako ako U010): ogr z vlastnej
  smoly zosilnie ešte v tom istom boji. V nákupnej fáze to isté cez
  `grantRaceAura` – preto O001 na chvoste nekončí 0/1, ale **1/2**
  (−2/−2 clamp, potom +1/+1 z vlastnej Pečate).
- **Bot**: zrušená penalizácia `ogre` mimo dominantnej rasy v `src/bot.js`
  (ogr je teraz neutrálny ako drak) – inak by rasu nikdy nezobral a matchupy
  by boli skreslené.

Otvorené po reworku:

1. **Útecha vs. výhra.** Pri 4 ogroch na ploche je chvost O001 (+1/+1 celej
   rase navždy) lepší než hlava (+4/+4 jednému). Zámerné – je to odmena za
   to, že hráč skutočne stavia ogrov – ale ak sa ukáže, že hráč hody
   *chce* prehrávať, znížiť Pečať na +0/+1 alebo zúžiť ju len na ogrov na
   ploche.
2. **Staty nad krivkou.** Ogrie telá sú nad krivkou práve preto, že
   očakávaná hodnota efektov bola záporná. Backstab ju zdvihol. Rasa bola
   nehraná, takže najprv buff a meranie; orezanie vanilla tiel
   (O004/O005/O008/O009) je až druhý krok.
3. **Vanilla ogri Pečať negenerujú, len ju berú** – zdravé napätie (kto
   hádže, kto profituje), netreba opravovať.

Návrhy pre ďalšie art sady (zatiaľ neimplementované):

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

**🦝 Zlodej – návrh (neimplementované)**

Rasa postavená na **podsúvaní blbostí súperovi** a drobnom zisku zlata. Vznikla
z nápadu „Bankári" (staty podľa neminutého zlata), ktorý bol zamietnutý: buď je
nudný (zlato prepadáva, max 10/kolo), alebo zavádza prenos zlata medzi kolami
a s ním 100-zlatové ťahy a pivot do inej rasy na tieri 6. Zlodeji zlato
neinflatujú – len ho presúvajú medzi hráčmi, a to bezpečným kanálom.

Zlodeji sú **prvá rasa, ktorá v nákupnej fáze siaha do súperovho stavu**
(dnes to robí len boj). Pravidlá, ktoré musí každá zlodejská karta dodržať:

- **Nikdy nesiahať na `foe.money`.** Prvý hráč sa strieda (`state.first`), takže
  krádež z hotovosti by bola raz plná (súper ešte nehral) a raz prázdna (už
  všetko minul). Všetko ide cez **`foe.goldNext -= n`** (príjem nikdy pod 0)
  a zisk zlodeja cez `p.goldNext += n` – jediný existujúci prenos zlata.
- **Kopírovať, nie brať.** Vzatie karty zo súperovej kôpky (rozbitá trojica) je
  pre deti čistý feelbad. „Krádež" karty = kópia do vlastného balíčka, alebo
  odkúpenie karty zo súperovej **ponuky** (jeho plán to nezničí). Pri presune
  reálnej inštancie treba zahodiť/prepísať `inst.src`, inak predaj vráti kópie
  do súperovho poolu.
- **Blbosť sa nedá zbaviť zadarmo ani so ziskom.** Manuálne odhodenie necháva
  kartu v cykle (to je dobre), ale bežný predaj dáva +1 – podsunutá karta by
  bola dar. Blbosť má **zápornú predajnú cenu: predaj stojí obeť 3 mince**
  a navyše **dá všetkým zlodejom podsúvateľa Pečať +1/+1** (`futureRace`,
  permanentne aj na budúce kópie). Implementačne: `def.sellValue = -3` +
  `def.onSold` fx mierený na `tok.owner`; `sellCard` vráti `null`, ak
  `money < 3`; buyback pre ňu vypnutý (inak by buyback za −3 dal +3 zlato).
  Tokeny sa neevolvujú (`canEvolve`), takže tri blbosti sa nezlúčia do jednej.
- **Strop blbostí v súperovom balíčku: 3.** Ďalšie podsunutie prepadne.
  Bez stropu 5 Zlodejov × endTurn = 5 blbostí/kolo a dieťa má po štyroch
  kolách ruku samých kameňov. Podsúvať prednostne cez **battlecry** (samo-
  limit: 3 zlata za kartu), nie endTurn.
- **Blbosť je bez rasy, bez deathrattle a nedá sa vyložiť** (`unplayable`).
  0/0 telo na ploche by inak mohlo prejsť spracovaním smrti pri štarte boja
  a spustiť súperove „Pri smrti Zvieraťa" (B004) – pre obeť bonus zadarmo.
- **Eventy pre prijímateľa.** UI dnes prehráva eventy aktívneho hráča; súper
  musí vidieť „dostal si Potkana" (event `plant` s `pid` obete), aj Pečať,
  ktorú predajom dal súperovi.

**Kľúčový token – Potkan 🐀** (0/0, bez rasy, nedá sa vyložiť). Dve dane
pre obeť:

1. **Pri dotiahnutí**: obeť stratí 1 mincu (min 0) a zlodej, ktorý ju podsunul
   (`tok.owner`), dostane `goldNext += 1`. Krádež zlata je **oneskorená a
   viazaná na draw** – timing symetrický pre oboch hráčov, obeť vidí, čo sa
   deje („zas potkan!").
2. **Deratizácia stojí 3 mince a dá zlodejom Pečať +1/+1.** Kým obeť
   nezaplatí, potkan ostáva v balíčku a pri každom dotiahnutí zje ďalšiu
   mincu aj slot v ruke.

**Obe vetvy živia zlodeja – to je zámer, ale aj hlavné riziko rasy.** Nechať
si ju = daň pri každom dotiahnutí a zabratý slot v ruke. Predať = 3 mince
a **trvalý** rasový buff súperovi. Tri veci treba ustrážiť:

1. **Čísla musia dávať predaj ako reálnu voľbu.** Pri dani 1 minca za draw a
   balíčku ~10 kariet sa potkan dotiahne zhruba každé druhé kolo, čiže držať
   ho stojí ~0,5 mince za kolo – proti 3 minciam za predaj **nikto nikdy
   nepredá** a Pečať sa nespustí. Buď zdvihnúť daň pri dotiahnutí (2 mince),
   alebo znížiť predajnú cenu na 2, alebo nechať zlodejov podsúvať ďalej,
   kým sa balíček neupchá (strop 3 potkany) – vtedy je predaj úľava.
2. **Strop Pečate.** `futureRace` je najsilnejší efekt v hre (permanentný,
   celá rasa, aj budúce kópie) a normálne stojí battlecry za 3 zlata. Tu ho
   zlodej dostáva zadarmo za súperovo rozhodnutie. Bez stropu (3 potkany × 5
   kôl) je to +15/+15 na rasu. Odporúčanie: **max +1/+1 z Pečate za kolo**
   a strop **+3/+3 za hru**, alebo Pečať nahradiť buffom len pre zlodejov
   **práve na ploche** (nie permanentná aura) – to je najbezpečnejšie.
3. **Rasa nesmie stáť LEN na tom, čo urobí súper.** Ak obeť nikdy nepredá,
   zlodeji nemajú škálovanie. Preto daň pri dotiahnutí (`goldNext += 1`
   podsúvateľovi) musí ostať – to je istý, na súperovi nezávislý zisk;
   Pečať je bonus navrch.

**Counter: ogr, čo zožerie susednú kartu.** Jediná cesta zbaviť sa potkana
bez zaplatenia. Návrh karty: **O0xx (t2–t3, ogr) „Pri vyložení: zožerie kartu
vedľa seba V RUKE (slot vľavo/vpravo) a získa jej staty; zožraná karta mizne
z hry."** Prečo v ruke a nie na ploche: potkan je `unplayable`, na plochu sa
nedostane, takže bežné plošné countre (Umlčanie, Kúzelný klobúk 🎩 – ten mieri
na vlastnú príšerku NA PLOCHE) naň nesiahnu. Požiadavky:

- **Nízky tier (2–3).** Ak by bol jediný counter celej rasy na t5, obeť bez
  neho je zamknutá – to je pri hre pre deti neprijateľné.
- **Užitočný aj mimo matchupu** (žerie hocijakú kartu = čistenie balíčka od
  štartových t1 príšer), inak je to mŕtva karta v 5 z 6 hier.
- **Zožratie vracia kópie do poolu** (`returnSrc`, ako predaj), inak pool
  tečie. Zožratie potkana **nespustí Pečať** – v tom je celá pointa.
- Ogr žerie „susedné" podľa `inst.slot` v ruke – sloty sú trvalé, takže si
  hráč môže poradie v ruke pripraviť. Bez suseda efekt prepadne (ogr vibe).

Kostra rostera:

- t1 **Vreckár**: Pri vyložení: podsuň Potkana.
- t2 **Špión**: Pri vyložení: kópia náhodnej karty zo súperovej kôpky do
  tvojho balíčka.
- t3 **Priekupník**: Po nákupe: +1 minca za každého Potkana v súperovom balíčku
  (strop 3).
- t5 **Kmotor**: Pri vyložení: kúp si náhodnú kartu zo súperovej súkromnej
  ponuky za 3.

Implementačná cena oproti Bankárom ~4–5×: draw hook (`drawCards`), záporný
`sellValue` + `onSold` fx, `unplayable`, cross-player eventy v UI, ogr
„zožer suseda v ruke", a **bot** – dnes hrá najsilnejšie karty a ruku
nepredáva, musí sa naučiť rozhodnúť „platiť 3 a buffnúť súpera, alebo trpieť
daň"; rovnako sekcia v arena-ai SKILL.md. Pred implementáciou celej rasy
otestovať len Potkana + Vreckára s dieťaťom: rozhodne, či podsúvanie baví
alebo hnevá.

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
  Beast B002 (t3, +1/+0 útok) / B006 (t4, +0/+1 život – obe boli +0/+1,
  kópie) / B010, Elemental E003 (+1/+1 už na t2 – živlom chýbal útok)/
  E009, Undead U008/U010 – hra tak
  prirodzene rastie do vyšších čísel. **U010 (t6) položí auru ako Pri
  smrti**, nie Pri vyložení: tank 8/10 musí padnúť, potom navždy buffne
  všetkých nemŕtvych (živých na ploche hneď, kostíkov a balíček cez
  `raceBuffs`). Combo s U004 (reviveAs), Fénixovým pierkom a mutáciou
  echoDeath = aura dvakrát; endgame akcelerátor undead buildu.
- **Dočasné boosty** – všetko, čo sa udeje v boji (Pri útoku, Pred bojom,
  Pri smrti buffy), platí len do konca boja: po boji idú karty do discard
  pile ako čisté kópie. Výnimka: trvalý rast `perm` kariet (B003/B008)
  cestuje s kópiou cez celý cyklus balíčka.

## Kúzla

Sú v obchode (neutrálne aj classové). Hrajú sa v nákupnej fáze, potom idú do discard
pile (vracajú sa cyklom balíčka). Typy: buff príšerky, Discover (vyber 1 z 3 kariet do
ruky), peniaze navyše.

- **Umlčanie** 🤫 (t2, cena 2): odložená kliatba – nabije sa (`p.silences`)
  a spotrebuje na začiatku najbližšieho boja, PRED „Pred bojom" efektmi:
  náhodná súperova príšerka **so schopnosťou alebo Obrancom** stratí efekt
  aj Obrancu na celý boj (🤫, preškrtnutý text). Battlecry aury už prebehli,
  tie nezruší – counter na Mláďa/deathrattle/Pred bojom motory. Stackuje sa
  (viac kúziel = viac umlčaných).
- **Blesk** ⛈️ (t3, cena 2): odložený výboj (`p.bolts`, vzor Umlčania) – na
  začiatku najbližšieho boja (po kliatbach, pred „Pred bojom") zasiahne
  náhodnú súperovu príšerku za **3 + dmgBoost** (je to výboj – Večná iskra
  ho zosilňuje). Stackuje sa, každý Blesk = samostatný zásah. Prvé
  ofenzívne kúzlo v hre.
- **Ovčia premena** 🐑 (t5, cena 2): najsilnejšia odložená kliatba
  (`p.polymorphs`, vzor Kliatby) – na začiatku najbližšieho boja (po Umlčaní,
  pred Kliatbou) sa **náhodná súperova príšerka zmení na Ovečku 0/1** (token
  `ovecka`, beast): stratí schopnosť, Obrancu, Božský štít, Fénixovo pierko aj
  Vichor. Nie je to damage – štít nepomôže, deathrattle sa nespustí. Ovečka
  neútočí (0), padne na prvý úder, preživšia dá hrdinovi len 1 (tier 1).
  Premena platí len na ten boj (bojová kópia plochy), pôvodná karta sa vráti
  do kôpky. Stackuje sa; Ovečku už znova nepremieňa, bez cieľa prepadne.
  Tvrdý counter na jednu veľkú kartu (zlatý tank, evolvnutý motor) – preto t5.
- **Hviezdna moc** 🌟 (t6, cena 3): jediné t6 kúzlo (`starPower` =
  `futureAll` + `dmgBoost`): **Pečať +1/+1 KAŽDEJ rase** (ako F008 – plocha
  a ruka hneď, balíček/kôpka/tokeny pri vzniku) **a Živelná sila +1**. Obe
  trvalé, Živelná sila sa nenásobí stupňom. Keďže Živelná sila zosilňuje aj
  buffy kúziel, každé ďalšie kúzlo po nej dáva viac – late-game odmena za
  t6 za plnú cenu. Bot ju hrá hneď (bez cieľa).
- **Vichor** 🌪️ (t4, cena 2): vybraná príšerka získa **Windfury**
  (`inst.windfury`) – vo svojom ťahu útočí dvakrát, druhý útok len ak
  prežila prvý. Každý útok znova spustí „Pri útoku" (E004 buff, O006
  Ožratý úder – aj riziko sa zdvojí). So Svätožiarou (Božský štít) prežije
  aj prvý výmenný úder. Dočasné ako všetky bojové buffy. UI: badge 🌪️.
- **Kúzelný klobúk** 🎩 (t4, cena 2): premení vlastnú cieľovú príšerku na
  **náhodnú o tier vyššiu** (stupeň 1, permanentné aury sa aplikujú, slot
  ostáva). Originál mizne z hry. Chaos/pivot nástroj v ogrom duchu.
- **Zrkadlo** 🪞 (t5, cena 3): vloží **kópiu 1. stupňa** cieľovej vlastnej
  príšerky do balíčka – akcelerátor trojíc pre late game. Tokeny sa
  kopírovať nedajú.
- **Poklad škriatka** 💰 (t5, cena 2): +2 peniaze hneď a +2 na začiatku
  ďalšieho kola (`p.goldNext` – jediný spôsob prenosu zlata medzi kolami).
- Kúzla t5 boli doplnené zámerne – dovtedy spell slot na t5/t6 ponúkal len
  staré nízkotierové kúzla. Plošný buff t6 („Zlatý zvon") zámerne NEpridaný:
  víly (Po kúzle) sú už na hrane OP a veľké kúzlo by ich prestrelilo.

## Bez class – superschopnosti (hero powers)

Classy nie sú: **každý hráč hrá z rovnakého poolu kariet**, aby sa nemusel
riešiť balance counterpickov. Namiesto class si hráč pri spustení hry vyberie
**superschopnosť** (hero power) – zatiaľ nie je žiadna implementovaná, výber
príde neskôr. Štartovací balíček = **10 náhodných príšer tieru 1**, pričom
**žiadna karta nie je viac než 2×** – dvojice rozbiehajú evolve, ale hotová
trojica hneď na štarte by rozbila early game.

Kompletný zoznam kariet je v `src/cards.js` (dáta sú zdrojom pravdy).

## Mutácie – „Pravidlo dnešnej arény"

Každá hra má **jednu náhodnú mutáciu** – globálne pravidlo, ktoré platí pre
oboch hráčov a mení hru (novelita + adaptácia). **Default sú VYPNUTÉ** – zapínajú sa
checkboxom na úvodnej obrazovke (voľba sa pamätá v localStorage); v hre po sieti
rozhoduje zakladateľ – flag `mut` cestuje v `start` správe (PeerJS aj LAN
server) a zapisuje sa do GameLog, takže replay hru zrekonštruuje správne
(staré záznamy bez flagu = mutácia zo seedu ako doteraz). Žrebuje sa **prvým ťahom
z `state.rng` v `newGame`**, takže multiplayer aj replay ju odvodia zo seedu
bez extra synchronizácie. `newGame(rng, null)` = bez mutácie (testy, balance
sim), `newGame(rng, "id")` = vynútená (testy konkrétnej mutácie). UI ukazuje
ikonku s názvom vľavo medzi súperovým balíčkom a kôpkou (ťuk = pripomenutie
pravidla v logu); texty v `game.js` (`L.mutators`).

| id | pravidlo |
|---|---|
| `echoDeath` | schopnosti Pri smrti sa spúšťajú 2× |
| `bloodMoon` | príšerky, čo prežijú boj, +1/+1 navždy (pa/ph na kópii) |
| `freeRefresh` | refresh obchodu zadarmo (`Engine.refreshCost(state)`) |
| `twinEvolve` | na evolve stačia 2 kópie namiesto 3 |
| `plenty` | obchod má 4 spoločné karty namiesto 3 |
| `richSell` | predaj karty dáva 2 mince |
| `smallArena` | hrdinovia 35 HP |
| `marathon` | hrdinovia 65 HP |
| `gift` | každé kolo obaja dostanú náhodné kúzlo do ruky navyše (po draw) |
| `echoCry` | battlecry sa spúšťa 2× (druhý discover sa preskočí – jeden pending) |

Zemetrasenie (smrť najslabšej príšerky po boji) zamietnuté – plocha sa po
boji aj tak vyprázdňuje.

## Mobilné UI redesign + zrušenie spoločného obchodu (návrh)

**Stav (2026-09-07):** portrét je prekopaný – hlavička sa počas hry
(`body.playing`) zbalí do ☰ menu (fixný overlay, neberie výšku), doska berie
~94 % výšky, obchod je v 2 riadkoch (spoločné / súkromné + kúzlo), môj board
má vlastný panel v strede, ruka sedí v spodnom rade slotov šablóny (medzi
kôpkou súpera a mojím balíčkom) a karty na ploche/v ruke/u súpera sú široké
podľa slotu (18 % šírky radu), nech 5 kariet nikdy nepretečie. Mobil na
ležato ešte čaká (TODO.md). Zrušenie spoločného obchodu sa NEROBÍ – namiesto
toho sú pooly per hráč (viď Obchod). Pôvodná analýza nižšie: Štyri časti: dve sú čisté UI
(nízke riziko), jedna je zmena karty (kozmetika s kolíziami) a jedna je
**zmena herných pravidiel** (dotkne sa engine, botov, testov aj balance).
Odporúčané poradie implementácie je preto UI najprv, pravidlá zvlášť.

### 1. Boj: skryť ruku a balíček/kôpku, bojujúce karty veľké

Počas automatického boja hráč nič nerobí – ruka, balíček aj kôpka sú len
šum. Dnes to čiastočne rieši len landscape-mobile query (`#stage.battle
.board.mine` sa zväčší na 24.5cqh); **portrait nemá žiadne battle
overridy** a karty ostávajú 10.4cqh – na telefóne je boj prakticky
nečitateľný.

- Návrh: v `#stage.battle` skryť `.hand` a rohové rámiky (`.corner`),
  oba boardy posunúť k stredu dosky a zdvojnásobiť výšku kariet
  (portrait ~20cqh, s viditeľným `.tx` ak sa zmestí; inak aspoň staty).
- Čisté CSS + trieda `battle`, ktorú `game.js` už nastavuje
  (`$("stage").classList.add("battle")`). Engine sa nedotýka.
- Pozor: proc badge (`.proc-badge`, top −14 %) a dmg floaty lietajú nad
  kartou – pri väčších kartách a posunutých boardoch treba skontrolovať,
  že nevytekajú mimo dosku; projektily používajú pozície elementov,
  tie sa prispôsobia samy.

### 2. Nákup: obchod veľký, v dvoch radoch, vrchný rad len obrázok

Dnes je portrait obchod jeden pruh mini-kariet (10.2cqh) – pri tieri 5–6
je to až 10 kariet (3 spoločné + 6 súkromných + kúzlo) vedľa seba, nedá
sa na ne triafať prstom. Návrh:

- Karty výrazne väčšie, v **dvoch radoch nad sebou**. Rady sa **vertikálne
  prekrývajú**: spodný rad prekryje dolnú časť vrchného radu, takže z
  vrchného radu vidno len **vrch karty = art** (žiadny popis, žiadne
  staty). To je lacnejšie než orezávať karty cez `overflow: hidden`
  wrapper a zachová existujúci drag & drop na viditeľnej ploche karty.
- Identifikáciu karty z vrchného radu rieši existujúci **hover preview /
  long-press** (`showPreview` + mobilný long-press už fungujú, netreba
  nič nové) – podržanie ukáže celú čitateľnú kartu.
- Vo viditeľnom vrchu karty ostávajú badge, ktoré tam už sú: tier
  hviezda (vľavo hore), cena (vpravo hore), počítadlo kópií `n/3`.
  Chýba tam **rasa** – rieši časť 4.
- Ťukacia plocha vrchného radu je len odkrytá polovica karty – pri
  veľkých kartách je to stále pohodlne nad 44 px, pre deti OK.
- Po zrušení spoločného obchodu (časť 3) je maximum kariet 6 príšer +
  1 kúzlo = **7 kariet → rady 4 + 3**, čo sa do dvoch veľkých radov
  zmestí pohodlne. Bez zrušenia commons by to bolo až 10 kariet a
  „veľké karty v dvoch radoch“ na portrait nevychádzajú – tieto dve
  zmeny na seba nadväzujú.
- Spodný (plne viditeľný) rad má byť ten akčnejší: súkromné karty
  nižších indexov + spell slot; presné rozdelenie doladiť pri
  implementácii.
- **Vlastné karty sa môžu prekrývať**: ruka aj vlastná plocha počas
  nákupu nepotrebujú plnú viditeľnosť – karty sa vejárovito prekryjú
  do strán (horizontálny negatívny margin, vidno ľavý pruh karty s
  artom), takže aj 5–6 kariet zaberie úzky pruh a uvoľní výšku pre
  veľký obchod. Detail karty opäť rieši long-press preview; drag & drop
  funguje z viditeľného pruhu. Poradie prekrytia (z-index) rastie
  zľava doprava, aktívna/ťahaná karta ide navrch. V boji sa vlastná
  plocha prekrývať nesmie – tam sú karty veľké a čitateľné (časť 1).

### 3. Zrušenie spoločného obchodu (LEN súkromná ponuka)

Toto **nie je UI zmena, ale zmena pravidiel** – platí globálne (engine je
jeden, multiplayer je deterministická replikácia akcií), nie len na
mobile. Dôsledky:

- **Zaniká pravidlo „tier spoločných = nižší z tierov“** aj celá
  medzihráčska interakcia obchodu: vyfúknutie karty súperovi, dokupovanie
  trojíc zo spoločnej ponuky, čítanie súperovho nákupu. Nákup sa stáva
  čistým sólo draftom – pre cieľovku (deti 6+, hra s botom) je to
  prijateľné zjednodušenie a odstráni najkomplikovanejšie pravidlo hry.
- **Ekonomika ponuky**: hráč príde o 3 sloty ponuky. Kompenzácia:
  zdvihnúť súkromné `min(tier + 1, 6)` na **`min(tier + 2, 7)`**
  (t1 = 3 karty namiesto 2+3 dnes, strop 7). Presné číslo overiť cez
  `npm run sim` – menšia ponuka spomalí evolve trojice a tým celé tempo.
- **Dotknutý kód**: `engine.js` (`state.commons`, `buyCommon`,
  `commonTierLimit`, refresh a `startRound` rolly), `bot.js` (options
  s `kind: "common"`), `claude-bot.js` (serializácia stavu, prompt,
  mapovanie akcie `buy` na commons), `game.js` + `index.html`
  (`commonsRow`), testy (cca 15 asercií na `state.commons`),
  `arena-ai/SKILL.md`, sekcia Obchod v tomto dokumente a pravidlá na
  pick obrazovke (`rules-box`).
- **Mutácia `plenty`** („+1 spoločná karta“) stráca zmysel → nahradiť
  „+1 súkromná karta“ (id môže ostať).
- **Replay kompatibilita**: staré nahrávky obsahujú akciu `buyCommon` –
  `tools/replay.mjs` ich už neprehrá. Buď v engine nechať `buyCommon`
  ako mŕtvu vetvu pre replay, alebo (jednoduchšie) zvýšiť verziu logu
  a staré nahrávky vyhlásiť za nekompatibilné.
- Multiplayeru zmena pomáha: commons boli jediný zdieľaný kus obchodu,
  bez nich sa nákupné fázy oboch hráčov navzájom vôbec neovplyvňujú.

### 4. Rasa na vrchný kraj karty

Rasová pilulka je dnes dole (`bottom: 4.2%`, medzi útokom a životom).
V orezanom vrchnom rade obchodu (časť 2) by nebola vidno – a rasa je
pri nákupe kľúčová informácia (synergie). Presun na vrchný kraj:

- Nový domov: **horný stred karty**, tesne pod okrajom rámu (medzi tier
  hviezdou vľavo a cenou vpravo), cez vrch artu.
- Kolízie na vrchu karty, ktoré treba vyriešiť: **frozen ❄** badge je
  dnes top-center (presunúť k freeze tlačidlu do rohu alebo pod rasu),
  badge kópií `n/3` je vpravo pod cenou, shield/revive badge vpravo hore
  na boardových kartách (tam rasa počas boja nie je nutná – prípadne ju
  na boardoch nechať dole a hore ju dať len v obchode; jednoduchšie je
  ale jeden layout všade).
- Zmena je čisto v `style.css` (`.card .race`), DOM sa nemení.

### Odporúčaný postup

1. **Fáza UI** (bez zmeny pravidiel): boj bez ruky/kôpok (1), rasa hore
   (4) – malé, bezpečné, hneď zlepšia mobil.
2. **Fáza pravidlá**: zrušenie commons (3) – engine + boty + testy +
   sim + aktualizácia sekcie Obchod, mutácií a SKILL.md naraz.
3. **Fáza obchod-layout** (2) až po zrušení commons – dvojradový layout
   sa navrhuje na 7 kariet, nie 10.

Otvorené otázky: presná kompenzácia počtu súkromných kariet (sim),
či nechať spoločný obchod ako mutáciu/variant pre multiplayer medzi
kamošmi, a či v boji na malom displeji ukazovať texty schopností alebo
len staty + keyword badge.

## Technika

- Čistý JS bez frameworku a bez buildu, `index.html` v koreňi repa → GitHub Pages.
- `src/engine.js` – čistá herná logika bez DOM, deterministická (injektovaný generátor
  náhody) kvôli unit testom (`node --test`).
- `src/bot.js` – heuristický bot (kupuje trojice, upgraduje tier, vykladá najsilnejšie).
  **Handicap hard bota**: keď sa zafixuje na dominantnú rasu (od 3. kola,
  ≥ 3 karty hlavnej rasy), nastaví si `p.rollBias = { race, weight: 3 }` a
  `rollCard` mu v SÚKROMNEJ ponuke losuje karty tej rasy 3× častejšie
  (spoločná ponuka bez zmeny; náhoda cez `state.rng`, replay platí).
  Heuristika sama hráča neporazí – toto mu vyrovnáva šance. Druhý
  handicap: hard bot má **+1 zlato každé kolo** od prvého (pridá si ho na
  začiatku svojho ťahu, `p.bonusRound` stráži jedno pridanie za kolo).
- `src/cards.js` – dáta kariet, texty schopností sa generujú zo šablón (SK/CZ/EN).
- `src/game.js` – UI, animácie boja prehrávajú event log z enginu.
- Grafika: emoji príšerky + farebné rámy podľa stupňa (bronz/striebro/zlato). Neskôr
  vymeniteľné za vlastné obrázky.
- Ochrana multiplayeru proti desyncu: každá akcia nesie číslo kola
  odosielateľa a nelegálna akcia súpera sa nepreskakuje ticho – oboje ukončí
  hru oznamom „hra sa rozsynchronizovala". Pri štarte si klienti porovnajú
  verzie (`?v=` hashe skriptov z index.html) – rozdielna keš = okamžité
  varovanie namiesto rozídenej hry. Fronta remote akcií má catch, takže
  jedna chybná akcia nezablokuje všetky ďalšie.
- Multiplayer po LAN: `node server.mjs` servíruje hru + WebSocket relay
  (bez závislostí). Klienti replikujú akcie: oba behy dostanú rovnaký seed
  a aplikujú rovnaké Engine volania, stav je deterministicky identický
  (žiadne posielanie stavu). Server spáruje prvých dvoch čakajúcich hráčov.
- Bot je vymeniteľný driver – UI volá len `Bot.botTurn(state, pid, difficulty)`.
  Heuristický bot má obtiažnosti easy/normal/hard. Plán: **Claude bot** – malý
  lokálny server, ktorému hra pošle serializovaný stav a ktorý vráti zoznam akcií
  (rovnaké Engine API); obtiažnosť sa nastaví promptom. Fallback: keď server
  nebeží (napr. na GitHub Pages), hrá heuristický bot.
