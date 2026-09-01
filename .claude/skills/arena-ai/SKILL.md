---
name: arena-ai
description: Pravidlá hry Zvieracia aréna a odporúčaná stratégia pre AI súpera. Použi, keď hráš ako bot (Claude-bot driver), ladíš heuristického bota v src/bot.js, alebo balansuješ karty.
---

# Zvieracia aréna – pravidlá a stratégia AI

## Pravidlá v skratke

- 1v1 autobattler + deckbuilding. Hrdina má 35 HP; prehráva, kto klesne na 0.
- **Mutácia („Pravidlo dnešnej arény")**: každá hra má jedno náhodné globálne
  pravidlo pre oboch hráčov (`state.mutator`, Claude ho dostáva v stave ako
  `mutator`). Prispôsob stratégiu: `echoDeath` deathrattly 2× (undead/summon
  raj), `bloodMoon` preživší +1/+1 navždy (stavaj na prežitie), `freeRefresh`
  refresh zadarmo (rolluj agresívne za trojicami), `twinEvolve` evolve z 2
  kópií (páry majú hodnotu trojíc), `plenty` 4 spoločné karty, `richSell`
  predaj za 2 (lacnejšie pivotovanie), `smallArena` 25 HP (tempo > scaling),
  `marathon` 45 HP (greed/scaling vyhráva), `gift` kúzlo do ruky každé kolo
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
  Vlna/Iskra/Blesk/Klobúk/Poklad 2, Srdce/Zrkadlo 3; Večná iskra =
  TRVALO všetky výboje/výbuchy +1 damage, stackuje sa, kupuj pri
  elemental builde; Umlčanie = v najbližšom boji náhodná súperova
  príšerka so schopnosťou stratí efekt aj Obrancu – counter na
  deathrattle a Pred bojom motory; Blesk (t3) = na začiatku boja výboj
  za 3+dmgBoost na náhodného súpera; Kúzelný klobúk (t4) = premeň
  vlastnú príšerku na náhodnú o tier vyššiu – hoď na najslabšie telo;
  Zrkadlo (t5) = kópia 1. stupňa cieľa do balíčka – akcelerátor trojíc,
  cieľ vždy karta, ktorej máš najviac kópií; Poklad škriatka (t5) =
  +2 zlato hneď a +2 v ďalšom kole). Refresh 1, freeze mrazí súkromné aj spell slot. Po každom
  boji sa obchod rolluje nanovo; zmrazená karta prežije do nového kola
  a rozmrazí sa (freeze platí jedno kolo).
- Tier obchodu 1–6, upgrade v štýle Battlegrounds (základ 5/8/9/11/12,
  cena klesá o 1 každé kolo na aktuálnom tieri, minimum 2).
- Kúpená karta ide do balíčka. Ruka sa doťahuje na 5 na začiatku vlastnej
  fázy; nezahrané karty idú na konci fázy do kôpky (discard). Prázdny
  balíček = kôpka sa zamieša. Vyloženie na plochu je zadarmo, max 5.
- Po boji idú VŠETKY karty z plochy do kôpky (aj preživšie); tokeny miznú.
  Damage hrdinovi = súčet stupňov preživších súperových príšer (1/2/3).
- Evolve: 3 rovnaké kópie (karta + stupeň) KDEKOĽVEK (plocha, ruka,
  balíček, kôpka) sa automaticky spoja: bronz → strieborná (staty ×2)
  → zlatá (×4); efekty ×2/×3. Evolvnutá karta si nechá buffy DVOCH
  najsilnejších kópií (dočasné aj perma rast) – buffnuté kópie sa
  oplatí evolvovať. Predaj karty = +1 peniaz, karta preč z hry.
- Rasy: Beast 🐾, Elemental ✨, Undead 💀, Fairy 🧚, Dragon 🐲. Keywords: Pri
  vyložení (battlecry), Pri smrti (deathrattle), Obranca (taunt), Pred
  bojom, Po nákupe, Pri útoku, Po kúzle (afterSpell – spustí sa každým
  zoslaným kúzlom, kým je víla na ploche), Božský štít (prvé zranenie
  sa zruší; z kúzla Svätožiara). Buffy z boja sú dočasné; trvalé sú buffy
  z nákupnej fázy a AURY (`futureRace`: „VŠETKY tvoje X, aj v balíčku,
  navždy") – aury sa sčítavajú a aplikujú aj hneď na plochu a ruku.
- Rasové archetypy (trojuholník counterov):
  - **Beast = telá a mrchožrút**: B007 vyvoláva fixné Mláďa 🐣 (1/1,
    škáluje len evolvom), B005 (t2) pri smrti vyvolá 2× Mláďa.
    B009 = scavenger („Keď zomrie tvoje Zviera:
    +2/+2 pre seba", bojové, dočasné) – chráň ho a kŕm smrťami zvierat
    (B005/B007 mláďatá = lacné smrti zvierat).
    B003/B008 rastú Po nákupe NAVŽDY (rast sa drží na kópii karty cez
    cyklus balíčka) – kupuj ich skoro a vykladaj každé kolo.
  - **Undead = horda + Pretečenie**: U001 2×, U005 2× (Pred bojom),
    U006 2×, U009 3× kostík (2/1); undead token, čo sa nezmestí na plnú
    plochu, dá celé staty jednej náhodnej živej vlastnej príšerke. U007 battlecry
    charga: ďalšie vyvolanie v boji vyvolá +1 navyše (stackuje sa).
    U004 (t2, cielený battlecry): označená príšerka po smrti vstane ako
    1/1 (stupeň 2/2, 3/3) – deathrattle prebehne PRED vstávaním, takže
    revivnutý deathrattler zomrie dvakrát a druhá dávka kostíkov pri
    plnej ploche pretečie do buffov. Ako bot cieľ VŽDY na U001/U006/U009
    (akcia `play` s `target`); aury sa na vstávajúceho aplikujú.
  - **Elemental = výboje**: `dmgWeakEnemy` mieri na NAJSLABŠIEHO
    nepriateľa a pri evolve škáluje POČET zásahov (1/2/3), nie silu;
    `dmgAllEnemies` (E010) bije všetkých naraz jednou vlnou.
    Counter na undead hordu, slabé proti veľkým beast telám.
  - **Fairy = Po kúzle motor**: F001 battlecry draw (1/2/3 podľa
    stupňa, NIE Po kúzle), F005 vracia zlato, F006
    battlecry pridá Iskričku ✨ (jednorazové kúzlo +1 útok – nejde do
    balíčka, po ťahu zmizne; spúšťa Po kúzle), F009 vanilka 8/8,
    F008 (t6) +2/+2 všetkým. Self-rast F002/F004 je
    PERMANENTNÝ (prežije cyklus balíčka) – kúzla do nich sú investícia
    navždy. Kupuj kúzla húfne – každé kúzlo spustí všetky víly na
    ploche; víly vykladaj PRED hraním kúziel. Kúzla: Svätožiara (Božský
    štít), Fénixovo pierko (revive 1 HP), Žabia kliatba (HP súperovej
    príšerky na 1 – anti-beast), Zvitok múdrosti (draw 2 – cykluje
    k telám). POZOR: zahrané kúzlo ide do kôpky až na konci ťahu –
    v tom istom ťahu sa nedá znova dotiahnuť (žiadne draw comba).
  - **Dragon = žoldnieri pre každý build**: telá nad krivkou + cielené
    battlecry na RASU vybranej príšerky – D002/D008 buff do boja
    (VŠETKY ne-aurové dračie staty platia celé kolo: dostanú ich aj
    neskôr vyložené karty a tokeny vyvolané v boji – kombuje so summon
    buildmi; rovnako D005 Pred bojom aj D006 Po nákupe),
    D003/D009 permanentná aura +1/+1, D004 discover rasy, D010 (t6)
    evolvne cieľ o stupeň. Ako bot VŽDY cieľ smeruj na svoju dominantnú
    rasu (akcia `play` s `target`); draka kupuj do hocijakého buildu,
    keď je telo nad krivkou alebo battlecry živí tvoju rasu.
  - **Ogre = veľké staty, chaos efekty** (môžu udrieť aj vlastníka):
    O001 hod mincou (battlecry +4/+4 alebo −2/−2), O006 Pri útoku 50 %
    sa trafí sám za ½ útoku, O002 battlecry zožerie NÁHODNÉHO suseda
    (staty NAVŽDY, karta zmizne z hry – vykladaj ho na prázdnu plochu,
    alebo vedľa karty, ktorú chceš obetovať), O003 Pred bojom 2 dmg
    VŠETKÝM (aj tvojim – zlé so swarm buildmi, dobré proti nim),
    O007 Pri smrti 5 dmg náhodnej príšerke (aj tvojej), O010 (t6 taunt)
    Pri smrti 50 % vstane s 1 HP na NÁHODNEJ strane (aj u súpera!).
    Vanilla telá nad krivkou: O004/O005/O008/O009 – bezpečný nákup.
  - **Tokeny dostávajú permanentné aury** (`futureRace`) – kostík aj
    Mláďa s aurami škálujú; navyše škálujú stupňom rodiča. Dočasný dračí
    buff (D002/D006/D008) tokeny v boji dostanú tiež.
- Boj: útoky sa striedajú, útočí ďalšia príšera zľava doprava; cieľ
  náhodný, Obrancovia majú prednosť; damage obojstranný.

## Odporúčaná stratégia (v poradí dôležitosti)

Overené z logov reálnych hier: hráči, čo vyhrávajú, robia VŠETKY body
1–3 a 6–8; boti prehrávajú hlavne na miešaní rás, mŕtvych kartách
v balíčku a neusporiadanej ploche.

1. **Trojice sú najsilnejšia mena.** Kúpa, ktorá kompletizuje trojicu
   (rátaj VŠETKY vlastnené kópie vrátane balíčka a kôpky), má prednosť
   takmer pred všetkým – zdvojnásobuje staty a zosilňuje efekt.
2. **Vyber si dominantnú rasu čo najskôr** (podľa toho, čoho vlastníš
   najviac) a od ~3. kola kupuj TAKMER VÝHRADNE ju. Rasové buffy
   (`buffRace`) a aury škálujú s počtom kariet rasy; miešaná plocha
   prehráva so synergiou aj pri rovnakých statoch. Výnimky: dokončenie
   trojice, drak ako žoldnier (battlecry cieli na TVOJU rasu), jasne
   nadkrivkové telo o tier vyššie.
3. **Riedenie balíčka predajom – OD KOLA 1.** Štartové a cudzorasové
   karty predávaj hneď, ako sa rozhodneš pre rasu (aj 2–3 karty v jednom
   kole; predaj = +1 zlato navyše k tempu). Každá mŕtva karta v balíčku
   = horšia ruka každé ďalšie kolo. V neskorej hre predávaj aj slabé
   tier-1 karty vlastnej rasy, ktoré už nič nebuffujú.
4. **Aury (`futureRace`) kupuj a hraj vždy, keď patria tvojej rase** –
   permanentne zväčšujú celý balíček; čím skôr, tým viac kôl sa sčítavajú.
   Aury cudzej rasy kupuj, len ak plánuješ prechod.
5. **Poradie vykladania**: najprv obyčajné príšery, POTOM battlecry
   buffery (buffRace/buffAllFriends/buffFriend/aury) – battlecry zasiahne
   plnú plochu. Kúzla na buff (Jablko, Srdce, Vlna, Koreň) až po vyložení,
   cieľ = najsilnejšia príšera (alebo Obranca pre Koreň). Dračí cielený
   battlecry VŽDY na príšeru dominantnej rasy. Bojuj s PLNOU plochou
   (5) – každá prázdna pozícia je stratený útok aj HP.
6. **Usporiadaj plochu KAŽDÉ kolo** (`moveOnBoard`): poradie zľava
   doprava = poradie útoku. „Pri útoku" karty čo najviac doľava (útočia
   skôr, buff platí dlhšie); Obrancov (taunt) rozmiestni tak, aby kryli
   deathrattle a motorové karty; krehké scaling karty (B009, víly)
   doprava.
7. **Recykluj battlecry telá** (`discardCard`): battlecry/aura karta,
   ktorá už na ploche nič nerobí, ide pred bojom discardom do kôpky –
   o pár kôl ju zahráš znova aj s efektom. Nepredávaj ju, ak efekt
   stále živí build.
8. **Ekonomika**: Mincu (1g → +2g, od tieru 2) kupuj takmer vždy. Upgrade
   tieru, keď cena klesne na ~2–3 a ostane aspoň na kartu; neupgraduj,
   keď vieš dokončiť trojicu. Refresh (1g) len so zvyšným zlatom, ktoré
   by prepadlo, a NIKDY ako posledná akcia ťahu – obchod sa po boji
   rolluje sám zadarmo. Freeze (`toggleFreeze`) použi, keď v ponuke
   ostáva karta, ktorú chceš, ale už na ňu nemáš – prežije do nového kola.
9. **Counterpick podľa súperovho nákupu** (vidíš ho v logu): proti undead
   horde kupuj elementálov (multi-hit/AoE), proti elementálom veľké beast
   telá a aury, proti beastom undead hordu. Mláďa karty (B007/B008) kupuj
   čo najskôr – zdieľané počítadlo rastie celú hru. S plnou undead plochou
   sú ďalšie summony stále hodnotné (Pretečenie = buffy).

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
