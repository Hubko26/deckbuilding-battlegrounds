---
name: arena-ai
description: Pravidlá hry Zvieracia aréna a odporúčaná stratégia pre AI súpera. Použi, keď hráš ako bot (Claude-bot driver), ladíš heuristického bota v src/bot.js, alebo balansuješ karty.
---

# Zvieracia aréna – pravidlá a stratégia AI

## Pravidlá v skratke

- 1v1 autobattler + deckbuilding. Hrdina má 50 HP; prehráva, kto klesne na 0.
- **Mutácia („Pravidlo dnešnej arény")**: každá hra má jedno náhodné globálne
  pravidlo pre oboch hráčov (`state.mutator`, Claude ho dostáva v stave ako
  `mutator`). Prispôsob stratégiu: `echoDeath` deathrattly 2× (undead/summon
  raj), `bloodMoon` preživší +1/+1 navždy (stavaj na prežitie), `freeRefresh`
  refresh zadarmo (rolluj agresívne za trojicami), `twinEvolve` evolve z 2
  kópií (páry majú hodnotu trojíc), `plenty` 4 spoločné karty, `richSell`
  predaj za 2 (lacnejšie pivotovanie), `smallArena` 35 HP (tempo > scaling),
  `marathon` 65 HP (greed/scaling vyhráva), `gift` kúzlo do ruky každé kolo
  (víly profitujú), `echoCry` battlecry 2× (draci/battlecry telá raj).
- Kolo = nákupná fáza hráča A → nákupná fáza hráča B → automatický boj.
  V nepárnom kole začína p1, v párnom p2.
- Peniaze: `min(kolo + 2, 10)` na začiatku kola, neminuté prepadnú.
- Obchod: 3 spoločné karty (zdieľané, kúpená sa hneď nahradí) + súkromné
  (`min(tier+1, 6)`) + **spell slot** (1 kúzlo, súkromný, vlastný tier –
  kúzla neberú miesto príšerám; ostatné sloty ponúkajú LEN príšery,
  kúpa: `Engine.buySpell(state, pid)`). Tier spoločných = NIŽŠÍ z tierov
  oboch hráčov; súkromné idú podľa vlastného tieru. Príšera stojí 3,
  kúzla majú vlastnú cenu (Minca/Štít 1, Jablko/Umlčanie/Kniha/Koreň/
  Vlna/Živelná sila/Blesk/Klobúk/Vichor/Poklad 2, Srdce/Zrkadlo 3;
  Živelná sila (id `iskra`) = TRVALO všetky výboje/výbuchy +1 damage a
  dočasné buffy Živlov +1 (E004 Pri útoku, E007 Po nákupe, E008 Pri
  vyložení), stackuje sa, kupuj pri elemental builde; Vichor (t4) = cieľ útočí v boji dvakrát a „Pri útoku" spustí
  pri každom útoku – hoď na E004/O006 alebo na najväčší útok, ideálne
  spolu so Svätožiarou; Umlčanie = v najbližšom boji náhodná súperova
  príšerka so schopnosťou stratí efekt aj Obrancu – counter na
  deathrattle a Pred bojom motory; Blesk (t3) = na začiatku boja výboj
  za 3+dmgBoost na náhodného súpera; Kúzelný klobúk (t4) = premeň
  vlastnú príšerku na náhodnú o tier vyššiu – hoď na najslabšie telo;
  Zrkadlo (t5) = kópia 1. stupňa cieľa do balíčka – akcelerátor trojíc,
  cieľ vždy karta, ktorej máš najviac kópií; Poklad škriatka (t5) =
  +2 zlato hneď a +2 v ďalšom kole). Refresh 1, freeze mrazí súkromné aj spell slot.
  Pooly: každý hráč má vlastný pool 6 kópií každej príšery, spoločná
  ponuka 3 kópie – tretiu kópiu nevidíš častejšie než prvú, skôr menej;
  zlatá (9 kópií) z obchodu len ak súper kartu nekupuje, inak Zrkadlo/
  Kniha. Predaj vracia kópiu do poolu. Po každom
  boji sa obchod rolluje nanovo; zmrazená karta prežije do nového kola
  a rozmrazí sa (freeze platí jedno kolo).
- Tier obchodu 1–6, upgrade v štýle Battlegrounds (základ 5/8/9/11/12,
  cena klesá o 1 každé kolo na aktuálnom tieri, minimum 2).
- Kúpená karta ide do balíčka. Ruka sa doťahuje na 5 na začiatku vlastnej
  fázy; nezahrané karty idú na konci fázy do kôpky (discard). Prázdny
  balíček = kôpka sa zamieša. Vyloženie na plochu je zadarmo, max 5.
- Po boji idú VŠETKY karty z plochy do kôpky (aj preživšie); tokeny miznú.
  Damage hrdinovi = súčet TIEROV preživších súperových príšer (evolve
  stupeň nehrá rolu) – prežité vysoké tiery bolia, gold t1 dá stále 1.
- Evolve: 3 rovnaké kópie (karta + stupeň) KDEKOĽVEK (plocha, ruka,
  balíček, kôpka) sa automaticky spoja: bronz → strieborná (staty ×2)
  → zlatá (×4); efekty ×2/×3. Evolvnutá karta si nechá buffy DVOCH
  najsilnejších kópií (dočasné aj perma rast) – buffnuté kópie sa
  oplatí evolvovať. Predaj karty = +1 peniaz, karta preč z hry.
- Rasy: Beast 🐾, Elemental ✨, Undead 💀, Fairy 🧚, Dragon 🐲. Keywords: Pri
  vyložení (battlecry), Pri smrti (deathrattle), Obranca (taunt), Pred
  bojom, Po nákupe, Pri útoku, Po kúzle (afterSpell – spustí sa každým
  zoslaným kúzlom, kým je víla na ploche), Božský štít (prvé zranenie
  sa zruší; z kúzla Svätožiara), Pečať (Imprint = trvalá rasová aura,
  na karte „Pečať +1/+1 Zvieratám"). Buffy z boja sú dočasné; trvalé sú buffy
  z nákupnej fázy a AURY (`futureRace`: „VŠETKY tvoje X, aj v balíčku,
  navždy") – aury sa sčítavajú a aplikujú aj hneď na plochu a ruku.
- Rasové archetypy (trojuholník counterov):
  - **Beast = telá a mrchožrút**: B007 (1×) a B005 (t2, 2×) vyvolávajú
    Mláďa 🐣 s Obrancom (1/1, škáluje len evolvom) – Obranca ho nechá
    padnúť skoro, combo s B004 (rast navždy) a B009 (chránený mrchožrút).
    B004 (t2) = „Keď zomrie tvoje Mláďa: +1/+1 NAVŽDY" (rast ostáva na
    kópii karty cez balíček) – vykladaj ho vedľa B007/B005 každé kolo.
    B009 = scavenger („Keď zomrie tvoje Zviera:
    +2/+2 pre seba", bojové, dočasné) – chráň ho a kŕm smrťami zvierat
    (B005/B007 mláďatá = lacné smrti zvierat).
    B003/B008 rastú Po nákupe NAVŽDY (rast sa drží na kópii karty cez
    cyklus balíčka) – kupuj ich skoro a vykladaj každé kolo.
  - **Undead = horda + Pretečenie**: U001 2×, U005 2× (Pred bojom),
    U006 2×, U009 3× kostík (1/1); U002 (t1 battlecry) = v najbližšom
    boji všetky kostíky +1/+1 (stackuje sa, každé kolo znova – vykladaj ho
    pred bojom vždy, keď máš vyvolávačov); undead token, čo sa nezmestí na plnú
    plochu, dá celé staty jednej náhodnej živej vlastnej príšerke. U007 battlecry
    charga: ďalšie vyvolanie v boji vyvolá +1 navyše (stackuje sa).
    U010 (t6, 8/10 Obranca) položí undead auru +1/+1 PRI SMRTI (nie pri
    vyložení) – musí padnúť; kostíky a balíček ju dostanú navždy. Combo
    s U004 reviveAs / Pierkom = aura dvakrát.
    U004 (t2, cielený battlecry): označená príšerka po smrti vstane ako
    1/1 (stupeň 2/2, 3/3) – deathrattle prebehne PRED vstávaním, takže
    revivnutý deathrattler zomrie dvakrát a druhá dávka kostíkov pri
    plnej ploche pretečie do buffov. Ako bot cieľ VŽDY na U001/U006/U009
    (akcia `play` s `target`); aury sa na vstávajúceho aplikujú.
  - **Elemental = výboje + Živelná sila**: `dmgWeakEnemy` mieri na
    NÁHODNÉHO nepriateľa a pri evolve škáluje POČET zásahov (1/2/3),
    nie silu; E001 3, E006 (Pri smrti) 4, `dmgAllEnemies` E010 3 všetkým
    jednou vlnou. E002 (t1) Pri smrti 2× Bublina 🫧 (1/1, pri smrti výboj
    1) – lacné telá + reťaz výbojov. E007 (t4) Po nákupe Živelná sila +1
    navždy – drž ho na ploche každé kolo, je to hlavný motor rasy.
    Aury E003 t2 / E008 t4 / E009 t5 (+1/+1 navždy).
    Counter na undead hordu, slabé proti veľkým beast telám.
    E005 (t3) = keď súper vyvolá token, výboj za 1 (+Živelná sila) a ak
    token padne, +1/+1 NAVŽDY – proti undead/mláďatám vykladaj vždy,
    kupuj k nemu Živelnú silu (kostíky s U002/aurou inak prežijú).
    E004 Whifflet (Pri útoku: +1/+1 všetkým vrátane tokenov) škáluje OBE
    čísla so Živelnou silou – daj ho úplne doľava a s Vichorom rozdá 2×.
  - **Fairy = Po kúzle motor**: F001 battlecry draw (1/2/3 podľa
    stupňa, NIE Po kúzle), F005 vracia zlato, F006
    battlecry pridá Iskričku ✨ (jednorazové kúzlo +1 útok – nejde do
    balíčka, po ťahu zmizne; spúšťa Po kúzle), F009 (t5, 6/6) Po kúzle
    +2/+2 všetkým kamarátom (dočasné, aj iné rasy), F008 (t6) Po kúzle
    VŠETKY tvoje príšerky každej rasy +1/+1 NAVŽDY (aj balíček, tokeny –
    každé kúzlo s ňou na ploche = permanentná aura; na t6 kupuj kúzla
    húfne). Self-rast F002/F004 je
    PERMANENTNÝ (prežije cyklus balíčka) – kúzla do nich sú investícia
    navždy. Kupuj kúzla húfne – každé kúzlo spustí všetky víly na
    ploche; víly vykladaj PRED hraním kúziel. Kúzla: Svätožiara (Božský
    štít), Fénixovo pierko (revive 1 HP), Žabia kliatba (HP súperovej
    príšerky na 1 – anti-beast). Draw kúzlo v hre nie je (Zvitok
    odstránený). POZOR: zahrané kúzlo ide do kôpky až na konci ťahu –
    v tom istom ťahu sa nedá znova dotiahnuť (žiadne draw comba).
  - **Dragon = žoldnieri pre každý build**: telá nad krivkou + cielené
    battlecry. t1: D007 = Živelná sila +1 pri každom vyložení (navždy,
    ako kúzlo ⚡ – v elemental builde kupuj každého, cykluje balíčkom),
    D001 v najbližšom boji náhodný súper −1/−1 (odložené, hraj vždy). Vyššie tiery mieria na RASU vybranej
    príšerky – D002/D008 buff do boja
    (VŠETKY ne-aurové dračie staty platia celé kolo: dostanú ich aj
    neskôr vyložené karty a tokeny vyvolané v boji – kombuje so summon
    buildmi; rovnako D005 Pred bojom aj D006 Po nákupe),
    D003/D009 permanentná aura +1/+1, D004 discover rasy, D010 (t6)
    evolvne cieľ o stupeň. Ako bot VŽDY cieľ smeruj na svoju dominantnú
    rasu (akcia `play` s `target`); draka kupuj do hocijakého buildu,
    keď je telo nad krivkou alebo battlecry živí tvoju rasu.
  - **Ogre = veľké staty, chaos efekty** (môžu udrieť aj vlastníka):
    O001 hod mincou (battlecry +4/+4 alebo −2/−2), O006 Pri útoku 50 %
    sa trafí sám za ½ útoku, O002 (5/6) Pred bojom spustí schopnosť
    náhodnej príšerky na bojisku – aj súperovej (deathrattle bez smrti,
    Pred bojom druhýkrát; dobrý s vlastnými deathrattle summonmi, riskantný
    proti undead horde), O003 Pred bojom 2 dmg
    VŠETKÝM (aj tvojim – zlé so swarm buildmi, dobré proti nim),
    O007 Pri smrti 5 dmg náhodnej príšerke (aj tvojej), O010 (t6 taunt)
    Pri smrti 50 % vstane s 1 HP na NÁHODNEJ strane (aj u súpera!).
    Vanilla telá nad krivkou: O004/O005/O008/O009 – bezpečný nákup.
  - **Tokeny dostávajú permanentné aury** (`futureRace`) – kostík aj
    Mláďa s aurami škálujú; navyše škálujú stupňom rodiča. Dočasný dračí
    buff (D002/D006/D008) tokeny v boji dostanú tiež.
- Boj: útoky sa striedajú, útočí ďalšia príšera zľava doprava; cieľ
  náhodný, Obrancovia majú prednosť; damage obojstranný.

## Odporúčaná stratégia – postup v každom ťahu (v tomto poradí)

Odvodené z logov reálnych hier (2026-09-07) a z heuristického hard bota,
ktorý po týchto úpravách otáča prehraté hry (replay: −3 : 23 → 22 : 5).
Boti prehrávali na 4 veciach: miešanie rás, nafúknutý balíček plný
štartovacieho balastu a kúziel, plocha s 3–4 telami, upgrade s deravou
plochou. Rob VŠETKY kroky, každý ťah:

1. **Predaj balast z ruky ešte pred vykladaním.** Balast = telo s 0 útoku
   (prehratý hod mincou), a od 3. kola každá karta cudzej rasy tieru 1–2
   bez páru (od tieru 3 aj s párom). Štartovací balíček je 10 náhodných
   t1 kariet – človek ich vypredá do 6. kola, ty tiež. Nechaj si toľko tiel,
   aby si zaplnil plochu (aspoň 4); zvyšný balast zahraj a predaj nabudúce.
   Cieľ: balíček ≤ 12–14 kariet vlastnej rasy. Každá mŕtva karta = horšia
   ruka každé ďalšie kolo.
2. **Vylož príšerky – najprv obyčajné (najsilnejšie), battlecry buffery
   a Pečate ako posledné**, nech zasiahnu plnú plochu. Dračí cielený
   battlecry vždy s `target` na kartu dominantnej rasy; U004 s `target`
   na U001/U006/U009. Bojuj s PLNOU plochou (5).
3. **Výmena na plnej ploche**: ak máš v ruke telo aspoň o 3 staty
   (útok + život + 2 za schopnosť) lepšie než najslabšie na ploche, predaj
   najslabšie a vylož lepšie.
4. **Upgrade tieru podľa plánu**: t2 v 3.–4. kole, t3 v 6., t4 v 8.–9.,
   t5 v 11., t6 v 13.+ (pravidlo: `kolo ≥ tier·2−1`). Upgraduj len keď je
   plocha plná (5) alebo keď ti po upgrade ostanú aspoň 3 zlata a plocha
   má aspoň 4 telá. S 1–3 telami na ploche NEUPGRADUJ – telá majú prednosť.
5. **Nakupuj podľa tejto priority** (všetko zlato, neminuté prepadne):
   a) tretia kópia = trojica (aj kópie v balíčku a kôpke – `copiesOwnedTowardTriple`),
   b) Pečať (aura) vlastnej rasy (E003/E008/E009, B002/B006/B010,
      U003/U008/U010, F008; draci D003/D009 s targetom na tvoju rasu),
   c) motor rasy (undead U002/U005/U006, elemental E007/E004 + Živelná
      sila/D007, beast B004/B007/B005/B003/B008, fairy F002/F004 + kúzla),
   d) druhá kópia rozbehnutej trojice,
   e) najlepšie telo vlastnej rasy najvyššieho dostupného tieru,
   f) drak s battlecry pre tvoju rasu (D002/D008 buff, D004 discover).
   NIKDY: príšera cudzej rasy tieru 1–2 po 3. kole (okrem trojice), tretie
   a ďalšie kúzlo v ne-vílovom balíčku, Vlna/Štít „lebo ostalo zlato".
   Radšej nech 1–2 zlata prepadnú, než kúpiť balast do balíčka.
6. **Refresh len výnimočne**: max 1× za ťah, iba ak nič v ponuke nespĺňa
   a)–e) A ostanú ti aspoň 4 zlata. Ako jednorázový plán výsledok refreshu
   nevidíš – radšej kúp priemerné telo svojej rasy. Nikdy refresh ako
   poslednú akciu (obchod sa po boji rolluje zadarmo).
7. **Freeze**: dobrá karta v súkromnej ponuke (trojica, Pečať tvojej rasy),
   na ktorú už nemáš → `freeze`, kúpiš ju v novom kole.
8. **Kúzla až po vyložení**: buffy (Jablko, Srdce, Koreň) na najsilnejšiu
   príšerku; Vichor na kartu s „Pri útoku" (E004, O006) alebo najväčší
   útok, ideálne so Svätožiarou; Živelná sila a Umlčanie/Kliatba/Blesk
   vždy hneď; Mincu hneď na začiatku ťahu; víly vyložiť PRED kúzlami.
9. **Usporiadaj plochu** (`move`, slot 0 útočí prvý): „Pri útoku" karty
   (E004, O006) úplne vľavo → tvrdé telá podľa útoku → Obrancovia tam,
   kde kryjú motor → škálovače (B004, B009, E005, E007, F002, F004)
   úplne vpravo, nech útočia posledné a prežijú.
10. **Recykluj battlecry telá** (`discard`, nie predaj) len pri karte, ktorej
    hodnota je battlecry a telo je slabé (F001 draw, D004 discover) – Pečate
    a aury nie, tie už svoje spravili a telo je nad krivkou.

### Nákupné zoznamy podľa rasy (priorita zľava doprava)

- **Undead**: U002 (t1, kostíky +1/+1 v boji – vykladaj každé kolo), U001,
  U003 (t2 Pečať), U004 (t2, target U001/U006/U009), U005/U006 (t3), U008
  (t4 Pečať), U007 (t4 charga), U009 (t5), U010 (t6, Pečať pri smrti –
  Obranca, nech padne). Proti undead: E005 lovec tokenov, E010, O003.
- **Elemental**: E002 (t1 Bubliny), E001, E003 (t2 Pečať), E004 (t2 – vľavo,
  s Vichorom 2×), Živelná sila ⚡ + D007 vždy (každý +1 navždy), E005 (t3,
  proti tokenom), E006, E007 (t4 – hlavný motor, drž na ploche každé kolo),
  E008 (t4 Pečať), E009 (t5 Pečať), E010 (t6). Slabí proti beast telám.
- **Beast**: B003 (t1 rast navždy), B007 (t1 Mláďa s Obrancom) + B004 (t2
  sova – rastie navždy za padnuté Mláďa), B005 (t2), B002 (t3 Pečať), B008
  (t3 rast navždy), B006 (t4 Pečať), B009 (t4 mrchožrút, vpravo), B010 (t5
  Pečať). B001 vanilla predaj, keď máš lepšie.
- **Fairy**: F002/F004 (rast navždy z každého kúzla), F003, F005 (zlato),
  F001 (draw), F006 (Iskrička), F007 (t4), F010 (t4), F009 (t5), F008 (t6
  Pečať všetkým za každé kúzlo). Kúzla kupuj húfne (Minca, Jablko, Koreň,
  Svätožiara…), cast až keď sú víly na ploche. Strop kúziel neplatí.
- **Ogre**: telá nad krivkou O004/O005/O008/O009 bezpečne, O002 (t3 chaos –
  dobrý s vlastnými deathrattle), O003 len bez vlastného swarmu, O006
  vľavo s Vichorom je hazard. Ogre je splash, nie plán.
- **Draci** patria do každého buildu: D002/D008 buff rasy cieľa do boja,
  D003/D009 Pečať rasy cieľa, D004 discover rasy, D010 evolvne cieľ.
  Vždy `target` na najlepšiu kartu dominantnej rasy.

### Čo NEROBIŤ (z logov)

- Nekupuj Štít/Vlnu/Ticho za zvyšné zlato – balíček bez tiel prehráva.
- Nedrž páry cudzej rasy „na trojicu" po tieri 3 – strieborná t1 karta
  v 10. kole nič nerieši.
- Neupgraduj s 2–3 telami na ploche, ani keď je cena 2.
- Neukončuj ťah s neminutými 3+ zlatými, ak je v ponuke telo tvojej rasy.
- Nenechaj E004/O006 vpravo a B009/E005/B004 vľavo.

## Rozhranie akcií (pre Claude-bot driver)

Stav hry je `state` (deterministický engine, `src/engine.js`). Legálne
akcie za hráča `pid` – vracajú events alebo `null` pri nelegálnom ťahu:

- `Engine.buyCommon(state, pid, idx)` / `Engine.buyPrivate(state, pid, idx)` /
  `Engine.buySpell(state, pid)`
- `Engine.refreshShop(state, pid)` / `Engine.toggleFreeze(state, pid, idx)`
- `Engine.upgradeTier(state, pid)` (cena `Engine.upgradeCost(state, pid)`)
- `Engine.playMinion(state, pid, handIdx)`
- `Engine.castSpell(state, pid, handIdx, targetUid?)` +
  `Engine.pickDiscover(state, pid, choiceIdx)`
- `Engine.sellCard(state, pid, "hand"|"board", idx)`
- `Engine.discardCard(state, pid, "hand"|"board", idx)` – do kôpky bez
  peňazí (karta ostáva v balíčku; napr. battlecry telo pred bojom)
- `Engine.moveOnBoard(state, pid, boardIdx, slot)`
- `Engine.endShopTurn(state, pid)` – povinný záver ťahu

Multiplayer replikuje akcie: rovnaký seed + rovnaká sekvencia volaní musí
dať identický stav (nepoužívaj inú náhodu než `state.rng`).
