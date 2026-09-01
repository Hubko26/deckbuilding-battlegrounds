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
  Vlna/Iskra 2, Srdce 3; Večná iskra = TRVALO všetky výboje/výbuchy
  +1 damage, stackuje sa, kupuj pri elemental builde; Umlčanie =
  v najbližšom boji náhodná súperova príšerka so schopnosťou stratí
  efekt aj Obrancu – counter na deathrattle a Pred bojom motory). Refresh 1, freeze mrazí súkromné aj spell slot. Po každom
  boji sa obchod rolluje nanovo; zmrazená karta prežije do nového kola
  a rozmrazí sa (freeze platí jedno kolo).
- Tier obchodu 1–6, upgrade v štýle Battlegrounds (základ 5/7/8/9/10,
  cena klesá o 1 každé kolo na aktuálnom tieri).
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
    plochu, rozdelí svoje staty živým vlastným príšerkám. U007 battlecry
    charga: ďalšie vyvolanie v boji vyvolá +1 navyše (stackuje sa).
  - **Elemental = výboje**: `dmgWeakEnemy` mieri na NAJSLABŠIEHO
    nepriateľa a pri evolve škáluje POČET zásahov (1/2/3), nie silu;
    `dmgAllEnemies` (E010) bije všetkých naraz jednou vlnou.
    Counter na undead hordu, slabé proti veľkým beast telám.
  - **Fairy = Po kúzle motor**: F001 draw, F005 vracia zlato, F006
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
  - **Tokeny nedostávajú permanentné aury** (`futureRace`) – kostík aj
    Mláďa škálujú len stupňom rodiča. Výnimka: dočasný dračí buff
    (D002/D006/D008) tokeny v boji dostanú.
- Boj: útoky sa striedajú, útočí ďalšia príšera zľava doprava; cieľ
  náhodný, Obrancovia majú prednosť; damage obojstranný.

## Odporúčaná stratégia (v poradí dôležitosti)

1. **Trojice sú najsilnejšia mena.** Kúpa, ktorá kompletizuje trojicu
   (rátaj VŠETKY vlastnené kópie vrátane balíčka a kôpky), má prednosť
   takmer pred všetkým – zdvojnásobuje staty a zosilňuje efekt.
2. **Vyber si dominantnú rasu čo najskôr** (podľa toho, čoho vlastníš
   najviac) a kupuj hlavne ju. Rasové buffy (`buffRace`) a aury škálujú
   s počtom kariet rasy.
3. **Aury (`futureRace`) kupuj a hraj vždy, keď patria tvojej rase** –
   permanentne zväčšujú celý balíček; čím skôr, tým viac kôl sa sčítavajú.
   Aury cudzej rasy kupuj, len ak plánuješ prechod.
4. **Poradie vykladania**: najprv obyčajné príšery, POTOM battlecry
   buffery (buffRace/buffAllFriends/buffFriend/aury) – battlecry zasiahne
   plnú plochu. Kúzla na buff (Jablko, Srdce, Vlna, Koreň) až po vyložení,
   cieľ = najsilnejšia príšera (alebo Obranca pre Koreň).
5. **Ekonomika**: Mincu (1g → +2g) kupuj takmer vždy. Upgrade tieru, keď
   cena klesne na ~2–3 a ostane aspoň na kartu; neupgraduj, keď vieš
   dokončiť trojicu. Refresh (1g) používaj pri zvyšných peniazoch,
   ktoré by prepadli.
6. **Boj**: poradie zľava doprava = poradie útoku. Obrancov (taunt) dávaj
   tak, aby chránili deathrattle karty; „Pri útoku" karty čo najviac
   doľava (útočia skôr, buff platí dlhšie).
7. **Predaj** používaj na riedenie balíčka od slabých tier-1 kariet
   v neskorej hre – zvyšuje šancu dotiahnuť silné karty.
8. **Counterpick podľa súperovho nákupu** (vidíš ho v logu): proti undead
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
