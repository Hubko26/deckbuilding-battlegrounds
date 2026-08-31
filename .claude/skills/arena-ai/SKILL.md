---
name: arena-ai
description: Pravidlá hry Zvieracia aréna a odporúčaná stratégia pre AI súpera. Použi, keď hráš ako bot (Claude-bot driver), ladíš heuristického bota v src/bot.js, alebo balansuješ karty.
---

# Zvieracia aréna – pravidlá a stratégia AI

## Pravidlá v skratke

- 1v1 autobattler + deckbuilding. Hrdina má 35 HP; prehráva, kto klesne na 0.
- Kolo = nákupná fáza hráča A → nákupná fáza hráča B → automatický boj.
  V nepárnom kole začína p1, v párnom p2.
- Peniaze: `min(kolo + 2, 10)` na začiatku kola, neminuté prepadnú.
- Obchod: 3 spoločné karty (zdieľané, kúpená sa hneď nahradí) + súkromné
  (`min(tier+1, 6)`) + **spell slot** (1 kúzlo, súkromný, vlastný tier –
  kúzla neberú miesto príšerám; ostatné sloty ponúkajú LEN príšery,
  kúpa: `Engine.buySpell(state, pid)`). Tier spoločných = NIŽŠÍ z tierov
  oboch hráčov; súkromné idú podľa vlastného tieru. Príšera stojí 3,
  kúzla majú vlastnú cenu (Minca/Štít 1, Jablko/Umlčanie/Kniha/Koreň/Vlna 2,
  Srdce/Iskra 3; Večná iskra = trvalé +1 damage výbojom a výbuchom,
  stackuje sa – kupuj pri elemental builde; Umlčanie = v najbližšom boji
  náhodná súperova príšerka so schopnosťou stratí efekt aj Obrancu –
  counter na Mláďa a deathrattle motory, kupuj proti beast/undead). Refresh 1, freeze mrazí súkromné aj spell slot. Po každom
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
  → zlatá (×4); efekty ×2/×3. Predaj karty = +1 peniaz, karta preč z hry.
- Rasy: Beast 🐾, Elemental ✨, Undead 💀. Keywords: Pri vyložení
  (battlecry), Pri smrti (deathrattle), Obranca (taunt), Pred bojom,
  Po nákupe, Pri útoku. Buffy z boja sú dočasné; trvalé sú buffy
  z nákupnej fázy a AURY (`futureRace`: „VŠETKY tvoje X, aj v balíčku,
  navždy") – aury sa sčítavajú a aplikujú aj hneď na plochu a ruku.
- Rasové archetypy (trojuholník counterov):
  - **Beast = rastúce telá**: B007/B008 vyvolávajú Mláďa 🐣. Počítadlo
    rastu (`tokenGrowth`) kŕmi LEN B007 (Pri smrti, +1/+1, evolve krok
    +2/+3); B008 (Pred bojom) vyvoláva Mláďa v aktuálnej veľkosti bez
    zvyšovania počítadla. B007 kupuj skoro, B008 je payoff.
  - **Undead = horda + Pretečenie**: U001 2×, U005 2× (Pred bojom),
    U006 2×, U009 3× kostík (2/1); undead token, čo sa nezmestí na plnú
    plochu, rozdelí svoje staty živým vlastným príšerkám.
  - **Elemental = výbuchy**: `dmgWeakEnemy` mieri na NAJSLABŠIEHO
    nepriateľa a pri evolve škáluje POČET zásahov (1/2/3), nie silu;
    `dmgAllEnemies` (E002, E010) bije všetkých naraz jednou vlnou.
    Counter na undead hordu, slabé proti veľkým beast telám.
  - **Tokeny nedostávajú aury** (`futureRace`) – kostík ostáva 2/1
    (škáluje len stupňom rodiča), Mláďa rastie vlastným počítadlom.
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
