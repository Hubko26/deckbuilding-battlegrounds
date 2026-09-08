// Herná logika bez DOM. Všetka náhoda ide cez state.rng (injektovaná funkcia),
// takže testy sú deterministické. Funkcie vracajú zoznam eventov pre UI animácie.

const Engine = (() => {
  const HERO_HP = 50;
  const BOARD_MAX = 5;
  const HAND_DRAW = 5;
  const HAND_MAX = 8;
  const CARD_COST = 3;
  const SELL_GAIN = 1;
  const BOLT_DMG = 3; // kúzlo Blesk: základný damage odloženého výboja
  const REFRESH_COST = 1;
  const BACKSTAB_BUFF = 1; // ogr „Backstab": Pečať +1/+1 všetkým ogrom za smolný roll
  const COMMON_COUNT = 3;
  // Pooly kariet (štýl Battlegrounds, ale per hráč): každý hráč má vlastný
  // pool POOL_PRIVATE kópií každej príšery (súkromná ponuka, štartovací
  // balíček, Kniha, Zrkadlo, Klobúk), spoločná ponuka losuje zo spoločného
  // poolu POOL_COMMON kópií. Karta v obchode je z poolu vybratá; nekúpená
  // (refresh, nové kolo, nevybraný discover) sa vracia; predaj vracia kópie
  // do poolov, z ktorých boli (inst.src = { common: n, p1: n }). Strop
  // zlatej: 6 vlastných + 3 spoločné = 9 = presne zlatá, ak súper nekúpi nič.
  const POOL_PRIVATE = 6;
  const POOL_COMMON = 3;
  const TIER_MAX = 6;
  // Drahšie než HS Battlegrounds (5/7/8/11/10): trojice tu chodia zadarmo
  // cyklom balíčka (netreba platiť refreshe), takže zlata zvyšuje viac.
  const TIER_BASE_COST = { 2: 5, 3: 8, 4: 9, 5: 11, 6: 12 };
  const TIER_MIN_COST = 2; // zľava za čakanie nikdy nezrazí cenu pod 2
  const BATTLE_CAP = 200; // poistka proti nekonečnému boju

  // Mutácie – „Pravidlo dnešnej arény": jedna na hru, platí pre oboch hráčov.
  // Žrebuje sa PRVÝM ťahom z rng v newGame → multiplayer aj replay ju odvodia
  // zo seedu bez extra synchronizácie. Texty a ikonky rieši UI (game.js).
  const MUTATORS = [
    "echoDeath",   // deathrattly sa spúšťajú 2×
    "bloodMoon",   // príšerky, čo prežijú boj, +1/+1 navždy
    "freeRefresh", // refresh obchodu zadarmo
    "twinEvolve",  // na evolve stačia 2 kópie
    "plenty",      // obchod má +1 spoločnú kartu
    "richSell",    // predaj karty dáva 2 mince
    "smallArena",  // hrdinovia 25 HP
    "marathon",    // hrdinovia 45 HP
    "gift",        // každé kolo obaja dostanú náhodné kúzlo do ruky
    "echoCry",     // battlecry sa spúšťa 2×
  ];

  const privateCount = tier => Math.min(tier + 1, 6);
  const income = round => Math.min(round + 2, 10);
  // Cena karty: príšery fixne 3, kúzla majú vlastnú cenu (def.cost).
  const cardCost = defId => Cards.byId[defId].cost ?? CARD_COST;
  // Cena refreshu závisí od mutácie („freeRefresh" = zadarmo).
  const refreshCost = state => state.mutator === "freeRefresh" ? 0 : REFRESH_COST;

  // ---------- Pomocníci ----------
  // Trvalé pozície: karta si drží slot (v ruke aj na ploche), po minutí
  // susednej karty sa nič nepreskladáva. Najmenší voľný slot.
  function freeSlot(list, max) {
    for (let s = 0; s < max; s++) if (!list.some(x => x && x.slot === s)) return s;
    return list.length;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // Deterministický generátor náhody (mulberry32) – multiplayer replikuje
  // akcie a oba klienty musia dostať rovnaké náhodné čísla z rovnakého seedu.
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // p (voliteľné): hráč, ktorému inštancia vzniká – aplikujú sa jeho permanentné
  // rasové aury („všetky budúce X dostanú +a/+h“).
  function makeInst(state, defId, rank, p) {
    const def = Cards.byId[defId];
    if (def.spell) return { uid: ++state.uidSeq, defId, rank: 1, spell: true };
    const m = Cards.STAT_MULT[rank];
    const inst = {
      uid: ++state.uidSeq, defId, rank,
      atk: def.atk * m, hp: def.hp * m, maxHp: def.hp * m,
      taunt: !!def.taunt,
    };
    // Permanentné rasové aury dostávajú AJ tokeny – kostíky s aurami
    // škálujú do late game (bez toho undead scaling zaostával).
    const aura = p && def.race && p.raceBuffs && p.raceBuffs[def.race];
    if (aura) {
      inst.atk += aura.a;
      inst.hp += aura.h;
      inst.maxHp += aura.h;
    }
    return inst;
  }

  // Náhodná PRÍŠERA z obchodného poolu (bez tokenov a kúziel), tier <= limit.
  // Kúzla majú vlastný slot (rollSpell) – neberú miesto príšerám.
  // Classy nie sú – všetci hráči ťahajú z rovnakého poolu.
  // Losovanie z poolu poolKey ("p1" | "p2" | "common"): vážené počtom
  // zostávajúcich kópií, vylosovaná karta z poolu ubudne. filter: voliteľné
  // ďalšie obmedzenie (rasa, presný tier). Prázdny pool → záložné losovanie
  // bez limitu (prázdny slot v obchode nechceme).
  // rollBias: { race, weight } na hráčovi – karty danej rasy sa v JEHO
  // súkromnej ponuke losujú weight-krát častejšie (handicap pre bota:
  // keď sa zafixuje na rasu, obchod mu ju ponúka častejšie; spoločná ponuka
  // bez zmeny). Náhoda stále cez state.rng – determinizmus a replay platia.
  function rollCard(state, tierLimit, poolKey, filter) {
    const pool = state.pools[poolKey];
    const defs = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && (!filter || filter(d)));
    const bias = poolKey !== "common" && state[poolKey] && state[poolKey].rollBias;
    const weighted = [];
    for (const d of defs) {
      const w = (pool[d.id] || 0) * (bias && d.race === bias.race ? bias.weight : 1);
      for (let i = 0; i < w; i++) weighted.push(d.id);
    }
    if (weighted.length) {
      const id = pick(weighted, state.rng);
      pool[id]--;
      return id;
    }
    return defs.length ? pick(defs, state.rng).id : null;
  }

  // Vrátenie kópií do poolu (strop = základný počet – záložne vylosované
  // karty pool nenafúknu).
  function returnToPool(state, poolKey, defId, n = 1) {
    const pool = state.pools[poolKey];
    const cap = poolKey === "common" ? POOL_COMMON : POOL_PRIVATE;
    pool[defId] = Math.min(cap, (pool[defId] || 0) + n);
  }

  // Zdroj kópií karty ({ common: 1 } / { p1: 3 }) – evolve zdroje sčíta,
  // predaj ich vráti do správnych poolov. Tokeny a záložne vylosované karty
  // zdroj nemajú.
  function addSrc(target, src) {
    if (!src) return;
    target.src = target.src || {};
    for (const [k, n] of Object.entries(src)) target.src[k] = (target.src[k] || 0) + n;
  }
  function returnSrc(state, defId, src) {
    if (!src) return;
    for (const [k, n] of Object.entries(src)) returnToPool(state, k, defId, n);
  }

  function makePools() {
    const pools = { p1: {}, p2: {}, common: {} };
    for (const d of Cards.DEFS) {
      if (d.spell) continue;
      pools.p1[d.id] = POOL_PRIVATE;
      pools.p2[d.id] = POOL_PRIVATE;
      pools.common[d.id] = POOL_COMMON;
    }
    return pools;
  }

  function rollSpell(state, tierLimit) {
    const pool = Cards.DEFS.filter(d => d.spell && d.tier <= tierLimit);
    // Tier 1 má vždy aspoň jedno kúzlo (Minca), pool nie je nikdy prázdny.
    return pick(pool, state.rng).id;
  }

  function other(pid) { return pid === "p1" ? "p2" : "p1"; }

  // ---------- Založenie hry ----------
  // Štartovací balíček: 10 náhodných príšer tieru 1. Max 2 kópie jednej karty –
  // trojica by sa hneď spojila (evolve) a lámala by early game.
  // mutatorId: undefined = vyžrebuj z rng (bežná hra), null = bez mutácie
  // (testy, balance sim), string = vynútená konkrétna mutácia.
  function newGame(rng, mutatorId) {
    const mutator = mutatorId === null ? null : (mutatorId ?? pick(MUTATORS, rng));
    const state = {
      rng, uidSeq: 0, round: 0, phase: "shop", active: null, first: "p1",
      commons: [], winner: null, pendingDiscover: null, mutator,
      pools: makePools(),
      p1: makePlayer("p1"),
      p2: makePlayer("p2"),
    };
    if (mutator === "smallArena") { state.p1.hp = 35; state.p2.hp = 35; }
    if (mutator === "marathon") { state.p1.hp = 65; state.p2.hp = 65; }
    const basics = Cards.DEFS.filter(d => d.tier === 1 && !d.spell);
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      for (let i = 0; i < 10; i++) {
        let id;
        do { id = pick(basics, rng).id; }
        while (p.deck.filter(c => c.defId === id).length >= 2);
        state.pools[pid][id]--; // štartovací balíček ide z vlastného poolu
        p.deck.push({ defId: id, rank: 1, src: { [pid]: 1 } });
      }
    }
    const commonCount = COMMON_COUNT + (mutator === "plenty" ? 1 : 0);
    for (let i = 0; i < commonCount; i++) state.commons.push(rollCard(state, 1, "common"));
    for (const pid of ["p1", "p2"]) {
      fillPrivate(state, pid);
      state[pid].spellShop = { defId: rollSpell(state, 1), frozen: false };
    }
    return state;
  }

  function makePlayer(id) {
    return {
      id, hp: HERO_HP, tier: 1, reachedRound: 1, money: 0,
      backstabRound: 0, // ogri: kolo, v ktorom naposledy padla Pečať za backstab (strop 1/kolo)
      deck: [], hand: [], board: [], discard: [], priv: [],
      bought: [], // čo nakúpil v tomto kole
      raceBuffs: {}, // permanentné aury: { beast: {a, h}, ... }
      fightTokenBuffs: {}, // bojové buffy tokenov podľa id (U002: kostík +1/+1) – po boji končia
      fightRaceBuffs: {}, // dočasné rasové buffy „do konca boja" (draci) – platia
      // aj pre neskôr vyložené karty a tokeny vyvolané POČAS boja
      spentSpells: [], // kúzla zahrané v tomto ťahu – do kôpky až na konci ťahu
      dmgBoost: 0, // trvalo: výboje/výbuchy +n damage a „Pri útoku" bonus +n útok (kúzlo Živelná sila)
      summonCharge: 0, // jednorazovo: ďalšie vyvolanie v boji vyvolá +n navyše (U007)
      silences: 0, // nabité Umlčania – spotrebujú sa na začiatku najbližšieho boja
      hexes: 0, // nabité Žabie kliatby – v najbližšom boji zmenia HP cieľa na 1
      polymorphs: 0, // nabité Ovčie premeny – v najbližšom boji zmenia súperovu príšerku na Ovečku 0/1
      shrinks: [], // nabité oslabenia (D001) – v najbližšom boji náhodný súper −a/−h
      bolts: 0, // nabité Blesky – na začiatku najbližšieho boja výboj za 3 (+dmgBoost)
      goldNext: 0, // Poklad škriatka: zlato navyše na začiatku ďalšieho kola
      rollBias: null, // { race, weight } – bot: súkromná ponuka praje jeho rase (rollCard)
      spellsCast: 0, // koľko kúziel hráč zahral za celú hru (spellScale karty)
      spellShop: null, // súkromný slot na kúzlo { defId, frozen } – neberie miesto príšerám
      giftRound: 0, // mutácia „gift": v ktorom kole hráč naposledy dostal kúzlo
    };
  }

  function fillPrivate(state, pid) {
    const p = state[pid];
    while (p.priv.length < privateCount(p.tier)) {
      p.priv.push({ defId: rollCard(state, p.tier, pid), frozen: false });
    }
  }

  // Spoločná ponuka nesmie hráčovi s nižším tierom ukazovať (ani súperovým
  // refreshom prezradiť) vyššie karty – strop je NIŽŠÍ z tierov oboch hráčov.
  // Vlastný tier platí len v súkromnej ponuke.
  function commonTierLimit(state) {
    return Math.min(state.p1.tier, state.p2.tier);
  }

  // ---------- Kolo a nákupná fáza ----------
  // Po každom boji sa obchod rolluje nanovo: celá spoločná ponuka aj
  // nezmrazené súkromné karty. Zmrazená karta prežije do nového kola
  // a rozmrazí sa – freeze platí jedno kolo (štýl Battlegrounds).
  function startRound(state) {
    state.round++;
    state.first = state.round % 2 === 1 ? "p1" : "p2";
    for (let i = 0; i < state.commons.length; i++) {
      returnToPool(state, "common", state.commons[i]);
      state.commons[i] = rollCard(state, commonTierLimit(state), "common");
    }
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.money = income(state.round) + p.goldNext; // Poklad škriatka z minulého kola
      p.lastSold = null; p.buyBackUsed = false; // buyback platí raz za ťah
      p.goldNext = 0;
      p.bought = [];
      for (const s of p.priv) if (!s.frozen) returnToPool(state, pid, s.defId);
      p.priv = p.priv.filter(s => s.frozen);
      for (const s of p.priv) s.frozen = false;
      fillPrivate(state, pid);
      if (p.spellShop.frozen) p.spellShop.frozen = false;
      else p.spellShop.defId = rollSpell(state, p.tier);
    }
    state.active = state.first;
    return beginShopTurn(state, state.active);
  }

  function beginShopTurn(state, pid) {
    const p = state[pid];
    const events = [];
    drawCards(state, p, HAND_DRAW - p.hand.length, events);
    // Mutácia „gift": raz za kolo náhodné kúzlo do ruky NAVYŠE (po dotiahnutí,
    // aby nebralo miesto normálnemu draw).
    if (state.mutator === "gift" && p.giftRound !== state.round && p.hand.length < HAND_MAX) {
      p.giftRound = state.round;
      const inst = makeInst(state, rollSpell(state, p.tier));
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: inst.defId });
    }
    checkEvolve(state, p, events);
    return events;
  }

  // Kópia karty do kôpky/balíčka; permanentný rast (pa/ph – „Po nákupe
  // navždy“ karty) cestuje s konkrétnou kópiou cez celý cyklus balíčka.
  function pileCard(inst) {
    const c = { defId: inst.defId, rank: inst.rank || 1 };
    if (inst.pa || inst.ph) { c.pa = inst.pa || 0; c.ph = inst.ph || 0; }
    if (inst.src) c.src = inst.src;
    return c;
  }

  function drawCards(state, p, n, events) {
    for (let i = 0; i < n; i++) {
      if (p.hand.length >= HAND_MAX) break;
      if (!p.deck.length) {
        if (!p.discard.length) break;
        p.deck = shuffle(p.discard.splice(0), state.rng);
        events.push({ type: "reshuffle", pid: p.id });
      }
      const c = p.deck.pop();
      const inst = makeInst(state, c.defId, c.rank, p);
      if (c.src) inst.src = c.src;
      if (c.pa || c.ph) {
        inst.pa = c.pa || 0;
        inst.ph = c.ph || 0;
        inst.atk += inst.pa;
        inst.hp += inst.ph;
        inst.maxHp += inst.ph;
      }
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: c.defId });
    }
  }

  // ---------- Evolve ----------
  // 3 rovnaké (karta + stupeň) KDEKOĽVEK – plocha, ruka, balíček aj kôpka –
  // sa automaticky spoja na vyšší stupeň. Kópie sa spotrebujú v poradí
  // plocha → ruka → balíček → kôpka. Výsledok ide na plochu (ak tam bola
  // kópia), inak do ruky; pri plnej ruke do balíčka. hidden=true, keď sa
  // použila aspoň jedna neviditeľná kópia (UI to ohlási hráčovi).
  function checkEvolve(state, p, events) {
    // Mutácia „twinEvolve": na spojenie stačia 2 kópie namiesto 3.
    const need = state.mutator === "twinEvolve" ? 2 : 3;
    for (;;) {
      const group = findEvolveGroup(p, need);
      if (!group) return;
      const consumed = consumeEvolveCopies(p, group, need);
      const bonus = mergeEvolveBonus(consumed.copies);
      const uid = placeEvolved(state, p, group, consumed, bonus);
      events.push({ type: "evolve", pid: p.id, defId: group.defId, rank: group.rank + 1, uid, hidden: consumed.hidden });
    }
  }

  // Do evolve sa počítajú len príšerky pod zlatým stupňom (kúzla a tokeny nie).
  function evolvable(defId, rank) {
    const def = Cards.byId[defId];
    return rank < 3 && !def.spell && !def.token;
  }

  // Zoskupí kópie podľa (karta, stupeň) naprieč zónami a vráti prvú skupinu,
  // ktorá má dosť kópií (poradie skupín = poradie prvého výskytu).
  function findEvolveGroup(p, need) {
    const groups = {};
    const group = (defId, rank) =>
      (groups[defId + "|" + rank] ||= { defId, rank, board: [], hand: [], deck: [], discard: [], total: 0 });
    for (const inst of p.board) {
      if (!inst.spell && evolvable(inst.defId, inst.rank)) { const g = group(inst.defId, inst.rank); g.board.push(inst); g.total++; }
    }
    for (const inst of p.hand) {
      if (!inst.spell && evolvable(inst.defId, inst.rank)) { const g = group(inst.defId, inst.rank); g.hand.push(inst); g.total++; }
    }
    p.deck.forEach((c, i) => { if (evolvable(c.defId, c.rank)) { const g = group(c.defId, c.rank); g.deck.push(i); g.total++; } });
    p.discard.forEach((c, i) => { if (evolvable(c.defId, c.rank)) { const g = group(c.defId, c.rank); g.discard.push(i); g.total++; } });
    return Object.values(groups).find(g => g.total >= need) || null;
  }

  // Odoberie `need` kópií v poradí plocha → ruka → balíček → kôpka. Pri každej
  // si zapíše bonusy NAD základ stupňa (bez aury – tú dostane evolvnutá karta
  // znova pri vzniku). Kópie v balíčku/kôpke nesú len permanentný rast (pa/ph).
  // Vráti { copies, srcAll, boardSlot, hidden }: slot prvej kópie z plochy
  // a hidden=true, ak sa použila aspoň jedna neviditeľná kópia.
  function consumeEvolveCopies(p, group, need) {
    const def = Cards.byId[group.defId];
    const aura = (def.race && p.raceBuffs[def.race]) || { a: 0, h: 0 };
    const baseA = def.atk * Cards.STAT_MULT[group.rank] + aura.a;
    const baseH = def.hp * Cards.STAT_MULT[group.rank] + aura.h;
    const out = { copies: [], srcAll: {}, boardSlot: null, hidden: false }; // srcAll: zdroje všetkých kópií (predaj striebornej vráti 3 kópie)
    const noteInst = inst => {
      out.copies.push({
        a: Math.max(0, inst.atk - baseA), h: Math.max(0, inst.maxHp - baseH),
        pa: inst.pa || 0, ph: inst.ph || 0,
      });
      addSrc(out.srcAll, inst.src);
    };
    const noteRef = c => {
      out.copies.push({ a: c.pa || 0, h: c.ph || 0, pa: c.pa || 0, ph: c.ph || 0 });
      addSrc(out.srcAll, c.src);
    };
    while (need > 0 && group.board.length) {
      const inst = group.board.shift();
      if (out.boardSlot === null) out.boardSlot = inst.slot;
      noteInst(inst);
      p.board.splice(p.board.indexOf(inst), 1);
      need--;
    }
    while (need > 0 && group.hand.length) {
      const inst = group.hand.shift();
      noteInst(inst);
      p.hand.splice(p.hand.indexOf(inst), 1);
      need--;
    }
    for (const zone of ["deck", "discard"]) {
      for (const idx of group[zone].reverse()) { // od najvyššieho indexu, nech splice nerozhodí ostatné
        if (need <= 0) break;
        noteRef(p[zone][idx]);
        p[zone].splice(idx, 1);
        out.hidden = true;
        need--;
      }
    }
    return out;
  }

  // Evolvnutá karta si nechá bonusy DVOCH najsilnejších kópií (podľa
  // celkového bonusu) – tretia prepadne, inak by evolve staty len sčítal.
  function mergeEvolveBonus(copies) {
    const sorted = [...copies].sort((x, y) => (y.a + y.h) - (x.a + x.h));
    return sorted.slice(0, 2).reduce(
      (s, c) => ({ a: s.a + c.a, h: s.h + c.h, pa: s.pa + c.pa, ph: s.ph + c.ph }),
      { a: 0, h: 0, pa: 0, ph: 0 });
  }

  // Nová karta vznikne na slote prvej kópie z plochy; inak v ruke; pri plnej
  // ruke ide ako referencia do balíčka. Vráti uid (null pre balíček).
  function placeEvolved(state, p, group, consumed, bonus) {
    const { defId, rank } = group;
    const { boardSlot, srcAll } = consumed;
    if (boardSlot === null && p.hand.length >= HAND_MAX) {
      addToDeckRef(state, p, defId, rank + 1, bonus.pa, bonus.ph, srcAll.src);
      return null;
    }
    const evolved = makeInst(state, defId, rank + 1, p);
    buff(evolved, bonus.a, bonus.h);
    if (bonus.pa || bonus.ph) { evolved.pa = bonus.pa; evolved.ph = bonus.ph; }
    if (srcAll.src) evolved.src = srcAll.src;
    if (boardSlot !== null) {
      evolved.slot = boardSlot;
      p.board.push(evolved);
      sortBoard(p);
    } else {
      evolved.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(evolved);
    }
    return evolved.uid;
  }

  // ---------- Obchod ----------
  function buyCommon(state, pid, idx) {
    const p = state[pid];
    if (idx >= state.commons.length) return null;
    const defId = state.commons[idx];
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events, { common: 1 });
    p.bought.push(defId);
    state.commons[idx] = rollCard(state, commonTierLimit(state), "common");
    return events;
  }

  function buyPrivate(state, pid, idx) {
    const p = state[pid];
    if (idx >= p.priv.length) return null;
    const defId = p.priv[idx].defId;
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events, { [pid]: 1 });
    p.bought.push(defId);
    p.priv[idx] = { defId: rollCard(state, p.tier, pid), frozen: false };
    return events;
  }

  // Kúpa kúzla zo špeciálneho slotu; slot sa hneď doplní novým kúzlom.
  function buySpell(state, pid) {
    const p = state[pid];
    const defId = p.spellShop.defId;
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events);
    p.bought.push(defId);
    p.spellShop = { defId: rollSpell(state, p.tier), frozen: false };
    return events;
  }

  // Kúpená karta ide do balíčka; globálny checkEvolve hneď spojí trojicu,
  // ak kúpou vznikla (aj z kópií schovaných v balíčku/kôpke).
  function acquireCard(state, p, defId, events, src) {
    addToDeck(state, p, defId, src);
    checkEvolve(state, p, events);
  }

  // Kúpená karta sa zamieša do balíčka (na náhodné miesto).
  function addToDeck(state, p, defId, src) {
    addToDeckRef(state, p, defId, 1, 0, 0, src);
  }

  function addToDeckRef(state, p, defId, rank, pa, ph, src) {
    const i = Math.floor(state.rng() * (p.deck.length + 1));
    const c = { defId, rank };
    if (pa || ph) { c.pa = pa || 0; c.ph = ph || 0; }
    if (src) c.src = src;
    p.deck.splice(i, 0, c);
  }

  function refreshShop(state, pid) {
    const p = state[pid];
    if (p.money < refreshCost(state)) return null;
    p.money -= refreshCost(state);
    for (let i = 0; i < state.commons.length; i++) {
      returnToPool(state, "common", state.commons[i]);
      state.commons[i] = rollCard(state, commonTierLimit(state), "common");
    }
    for (let i = 0; i < p.priv.length; i++) {
      if (p.priv[i].frozen) continue;
      returnToPool(state, pid, p.priv[i].defId);
      p.priv[i] = { defId: rollCard(state, p.tier, pid), frozen: false };
    }
    if (!p.spellShop.frozen) p.spellShop.defId = rollSpell(state, p.tier);
    return [{ type: "refresh", pid }];
  }

  // Zmraz / odmraz celú súkromnú ponuku vrátane kúzla (štýl Battlegrounds).
  function toggleFreezeAll(state, pid) {
    const p = state[pid];
    if (!p.priv.length) return null;
    const freeze = p.priv.some(s => !s.frozen) || !p.spellShop.frozen;
    for (const s of p.priv) s.frozen = freeze;
    p.spellShop.frozen = freeze;
    return [{ type: "freezeAll", pid, frozen: freeze }];
  }

  function toggleFreeze(state, pid, idx) {
    const p = state[pid];
    if (idx >= p.priv.length) return null;
    p.priv[idx].frozen = !p.priv[idx].frozen;
    return [{ type: "freeze", pid, idx, frozen: p.priv[idx].frozen }];
  }

  function upgradeCost(state, pid) {
    const p = state[pid];
    if (p.tier >= TIER_MAX) return null;
    const base = TIER_BASE_COST[p.tier + 1];
    return Math.max(TIER_MIN_COST, base - (state.round - p.reachedRound));
  }

  function upgradeTier(state, pid) {
    const p = state[pid];
    const cost = upgradeCost(state, pid);
    if (cost === null || p.money < cost) return null;
    p.money -= cost;
    p.tier++;
    p.reachedRound = state.round;
    fillPrivate(state, pid);
    return [{ type: "tierUp", pid, tier: p.tier }];
  }

  // ---------- Hranie kariet ----------
  // targetUid (voliteľné): cieľ pre CIELENÉ battlecry (draci) – príšerka na
  // vlastnej ploche. Bez cieľa si efekt vyberie fallback sám (viď applyShopFx).
  function playMinion(state, pid, handIdx, targetUid) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || inst.spell || p.board.length >= BOARD_MAX) return null;
    const target = targetUid ? p.board.find(x => x.uid === targetUid) : null;
    p.hand.splice(handIdx, 1);
    inst.slot = freeSlot(p.board, BOARD_MAX);
    p.board.push(inst);
    sortBoard(p);
    const events = [{ type: "play", pid, uid: inst.uid, defId: inst.defId }];
    const def = Cards.byId[inst.defId];
    // Dračí buff „do konca boja" platí aj pre karty vyložené po ňom.
    const fb = def.race && p.fightRaceBuffs[def.race];
    if (fb && (fb.a || fb.h)) {
      buff(inst, fb.a, fb.h);
      events.push({ type: "buff", pid, uid: inst.uid, a: fb.a, h: fb.h });
    }
    if (def.power && def.power.kw === "battlecry") {
      // Mutácia „echoCry": battlecry sa spustí dvakrát.
      const times = state.mutator === "echoCry" ? 2 : 1;
      for (let r = 0; r < times; r++) {
        applyShopFx(state, p, def.power.fx, inst.rank, inst, events, target);
      }
    }
    checkEvolve(state, p, events);
    return events;
  }

  // Po kúzle (víly): každé úspešné zoslanie kúzla spustí schopnosti víl
  // na vlastnej ploche – opakovateľná obdoba battlecry. Zároveň rastie
  // trvalé počítadlo zahraných kúziel (spellScale karty).
  function afterSpellProcs(state, p, events) {
    p.spellsCast++;
    for (const inst of [...p.board]) {
      const def = Cards.byId[inst.defId];
      if (def.power && def.power.kw === "afterSpell") {
        events.push({ type: "proc", pid: p.id, uid: inst.uid, kw: "afterSpell" });
        applyShopFx(state, p, def.power.fx, inst.rank, inst, events);
      }
    }
  }

  // targetUid: uid príšerky na vlastnej ploche (cielené kúzla). Nelegálny
  // ťah (bez cieľa, plný balíček…) vráti null a nič nezmení.
  // Zahrané kúzlo NEJDE do kôpky hneď, ale do karantény (spentSpells) –
  // do kôpky padne až na konci ťahu. Inak by ho draw (reshuffle kôpky)
  // mohol vrátiť do ruky a draw + víly by točili nekonečný cyklus
  // permanentných buffov zadarmo v jednom ťahu.
  function castSpell(state, pid, handIdx, targetUid) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || !inst.spell) return null;
    const def = Cards.byId[inst.defId];
    const cast = SPELL_CAST[def.fx.type] || castUntargeted;
    const events = cast(state, p, inst, def, targetUid);
    if (!events) return null;
    afterSpellProcs(state, p, events);
    return events;
  }

  // Zahrané kúzlo opustí ruku; jednorazové (token – Iskrička) zmiznú z hry.
  function spendSpell(p, inst, def) {
    p.hand.splice(p.hand.indexOf(inst), 1);
    if (!def.token) p.spentSpells.push({ defId: inst.defId, rank: 1 });
  }

  const ownMinion = (p, uid) => p.board.find(x => x.uid === uid);

  // gold, goldLater, buffAllFriends, dmgBoost, silence, hex, bolt, draw – bez cieľa.
  function castUntargeted(state, p, inst, def) {
    spendSpell(p, inst, def);
    const events = [{ type: "spell", pid: p.id, defId: inst.defId }];
    applyShopFx(state, p, def.fx, 1, null, events);
    return events;
  }

  // Cielené kúzla a discover. Handler najprv overí cieľ (null = nelegálny
  // ťah), až potom kúzlo minie (opustí ruku) a aplikuje efekt – poradie je
  // dôležité pre veľkosť ruky (draw, evolve do ruky).
  const SPELL_CAST = {
    buffTarget(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target) return null;
      spendSpell(p, inst, def);
      const fx = def.fx;
      const { a, h } = sparkBonus(fx, 1, p.dmgBoost); // Živelná sila zosilňuje buffy kúziel
      buff(target, a, h);
      if (fx.taunt) target.taunt = true;
      if (fx.shield) target.shield = true; // Božský štít: zablokuje prvé zranenie
      if (fx.revive) target.revive = true; // Fénixovo pierko: po smrti sa raz vráti s 1 HP
      if (fx.windfury) target.windfury = true; // Vichor: útočí dvakrát
      return [{ type: "spell", pid: p.id, defId: inst.defId, targetUid, a, h }];
    },
    // Zrkadlo: kópia 1. stupňa vybranej vlastnej príšerky do balíčka –
    // akcelerátor trojíc. Tokeny (kostík, Mláďa) kopírovať nejde.
    copyToDeck(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target || Cards.byId[target.defId].token) return null;
      spendSpell(p, inst, def);
      // Kópia ide z vlastného poolu, kým v ňom je; potom bez zdroja.
      let src;
      if (state.pools[p.id][target.defId] > 0) { state.pools[p.id][target.defId]--; src = { [p.id]: 1 }; }
      addToDeck(state, p, target.defId, src);
      const events = [{ type: "spell", pid: p.id, defId: inst.defId, targetUid }];
      checkEvolve(state, p, events);
      return events;
    },
    // Kúzelný klobúk: vlastná príšerka sa zmení na NÁHODNÚ o tier vyššiu
    // (stupeň 1, aury sa aplikujú). Originál zmizne z hry, slot ostáva.
    transform(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target) return null;
      const newTier = Math.min(Cards.byId[target.defId].tier + 1, TIER_MAX);
      const newId = rollCard(state, newTier, p.id, d => d.tier === newTier); // z vlastného poolu
      if (!newId) return null;
      spendSpell(p, inst, def);
      returnSrc(state, target.defId, target.src); // originál späť do poolu
      const fresh = makeInst(state, newId, 1, p);
      fresh.src = { [p.id]: 1 };
      fresh.slot = target.slot;
      p.board[p.board.indexOf(target)] = fresh;
      const events = [
        { type: "spell", pid: p.id, defId: inst.defId, targetUid },
        { type: "transform", pid: p.id, uid: targetUid, fromDefId: target.defId, toDefId: fresh.defId, newUid: fresh.uid },
      ];
      checkEvolve(state, p, events);
      return events;
    },
    // Discover: 3 karty z vlastného poolu (tier <= vlastný), hráč si vyberie
    // jednu (pickDiscover).
    discover(state, p, inst, def) {
      spendSpell(p, inst, def);
      const options = [];
      for (let i = 0; i < 3; i++) options.push(rollCard(state, p.tier, p.id));
      state.pendingDiscover = { pid: p.id, options, poolKey: p.id };
      return [{ type: "discoverStart", pid: p.id, options }];
    },
  };

  function pickDiscover(state, pid, choiceIdx) {
    const pd = state.pendingDiscover;
    if (!pd || pd.pid !== pid || choiceIdx >= pd.options.length) return null;
    const defId = pd.options[choiceIdx];
    state.pendingDiscover = null;
    const p = state[pid];
    // Nevybrané možnosti späť do poolu, z ktorého boli vylosované.
    pd.options.forEach((id, i) => { if (i !== choiceIdx) returnToPool(state, pd.poolKey, id); });
    const inst = makeInst(state, defId, 1, p);
    inst.src = { [pd.poolKey]: 1 };
    inst.slot = freeSlot(p.hand, HAND_MAX);
    p.hand.push(inst);
    const events = [{ type: "discoverPick", pid, defId }];
    checkEvolve(state, p, events);
    return events;
  }

  // Poradie útoku = poradie plochy zľava doprava (podľa slotov).
  function sortBoard(p) {
    p.board.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  }

  // Presun vlastnej príšerky na iný slot; obsadený slot = výmena miest.
  function moveOnBoard(state, pid, idx, slot) {
    const p = state[pid];
    const inst = p.board[idx];
    if (!inst || slot < 0 || slot >= BOARD_MAX) return null;
    if (inst.slot === slot) return null;
    const occupant = p.board.find(x => x !== inst && x.slot === slot);
    const old = inst.slot;
    inst.slot = slot;
    if (occupant) occupant.slot = old;
    sortBoard(p);
    return [{ type: "reorder", pid }];
  }

  // Manuálne odhodenie: karta ide z ruky/plochy do kôpky (bez peňazí)
  // a ostáva v cykle balíčka – na rozdiel od predaja. Pre karty hrané len
  // kvôli battlecry, ktoré by v boji zavadzali.
  function discardCard(state, pid, zone, idx) {
    const p = state[pid];
    if (zone !== "hand" && zone !== "board") return null;
    const inst = p[zone][idx];
    if (!inst) return null;
    p[zone].splice(idx, 1);
    // Jednorazové kúzlo (Iskrička) nejde do kôpky – odhodením zmizne.
    if (!Cards.byId[inst.defId].token) p.discard.push(pileCard(inst));
    return [{ type: "discard", pid, defId: inst.defId }];
  }

  function sellCard(state, pid, zone, idx) {
    const p = state[pid];
    if (zone !== "hand" && zone !== "board") return null;
    const inst = p[zone][idx];
    if (!inst) return null;
    p[zone].splice(idx, 1);
    const gain = SELL_GAIN + (state.mutator === "richSell" ? 1 : 0);
    p.money += gain;
    returnSrc(state, inst.defId, inst.src); // kópie späť do poolov, z ktorých boli
    // Buyback: posledný predaj v ťahu sa dá raz vrátiť (omyl pri ťahaní).
    p.lastSold = { inst, gain };
    return [{ type: "sell", pid, defId: inst.defId }];
  }

  // Buyback: vráti poslednú predanú kartu tohto ťahu do ruky za to, čo predaj
  // dal (1, pri richSell 2). Raz za ťah; karta sa vracia aj s buffmi (rovnaká
  // inštancia), kópie idú späť z poolu. Plná ruka = nejde.
  function buyBack(state, pid) {
    const p = state[pid];
    if (state.phase !== "shop" || state.active !== pid) return null;
    const ls = p.lastSold;
    if (!ls || p.buyBackUsed || p.money < ls.gain || p.hand.length >= HAND_MAX) return null;
    p.money -= ls.gain;
    p.buyBackUsed = true;
    p.lastSold = null;
    const inst = ls.inst;
    if (inst.src) for (const [k, n] of Object.entries(inst.src)) {
      const pool = state.pools[k];
      if (pool) pool[inst.defId] = Math.max(0, (pool[inst.defId] || 0) - n);
    }
    inst.slot = freeSlot(p.hand, HAND_MAX);
    p.hand.push(inst);
    const events = [{ type: "buyBack", pid, uid: inst.uid, defId: inst.defId }];
    checkEvolve(state, p, events);
    return events;
  }

  function applyShopFx(state, p, fx, rank, self, events, target) {
    const handler = SHOP_FX[fx.type];
    if (handler) handler({ state, p, fx, m: rank, self, events, target });
  }

  // Cieľ cieleného battlecry: zadaný cieľ (ak je stále na ploche), inak
  // najsilnejšia vlastná príšerka OKREM seba.
  function shopTarget(p, self, target) {
    if (target && p.board.includes(target)) return target;
    const others = p.board.filter(x => x !== self);
    if (!others.length) return null;
    return others.sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
  }

  // Buff + event pre UI (v nákupnej fáze aj v boji).
  function buffWithEvent(inst, pid, a, h, events) {
    buff(inst, a, h);
    events.push({ type: "buff", pid, uid: inst.uid, a, h });
  }

  // Buffne ne-kúzlové karty v daných zónach hráča, ktorých definícia spĺňa filter.
  function buffZones(p, zones, match, a, h, events) {
    for (const zone of zones) {
      for (const f of p[zone]) {
        if (f.spell || !match(Cards.byId[f.defId])) continue;
        buffWithEvent(f, p.id, a, h, events);
      }
    }
  }

  // Dračí buff „do konca boja" pre rasu: príšerky na ploche hneď + zápis do
  // fightRaceBuffs, nech ho dostanú aj tie, čo do boja pribudnú neskôr
  // (vyloženie z ruky, tokeny v boji).
  function buffRaceThisFight(p, race, a, h, events) {
    buffZones(p, ["board"], d => d.race === race, a, h, events);
    addFightRaceBuff(p, race, a, h);
  }

  function addFightRaceBuff(p, race, a, h) {
    const fb = (p.fightRaceBuffs[race] ||= { a: 0, h: 0 });
    fb.a += a; fb.h += h;
  }

  // Permanentná aura rasy: budúce inštancie (balíček, kôpka, tokeny,
  // vstávajúce) ju dostanú pri vzniku (makeInst, evolve, reviveAs).
  function addRaceAura(p, race, a, h) {
    const cur = p.raceBuffs[race] || { a: 0, h: 0 };
    p.raceBuffs[race] = { a: cur.a + a, h: cur.h + h };
  }

  // Permanentná aura + okamžitý buff príšeriek rasy na ploche a v ruke.
  function grantRaceAura(p, race, a, h, events) {
    addRaceAura(p, race, a, h);
    buffZones(p, ["board", "hand"], d => d.race === race, a, h, events);
    events.push({ type: "futureBuff", pid: p.id, race, a, h });
  }

  // Ogr „Backstab": smolný roll, ktorý sa obrátil proti vlastníkovi, dá
  // Pečať +1/+1 VŠETKÝM ogrom – permanentná aura, platí aj na budúce kópie.
  // Toto je kmeňový payoff rasy: rozptyl nie je čistý downside, smola platí.
  // Strop 1× za KOLO (nákupná fáza aj nasledujúci boj majú rovnaké
  // state.round) – bez neho by O006 Ožratý úder hádzal pri každom útoku
  // (s Vichrom dvakrát) a rasa by sa rozbila. Pečať je fixne +1/+1 a
  // NEnásobí sa evolve stupňom (inak by bola útecha lepšia než výhra).
  // `sides` = volanie z boja: aura prežije boj a živé príšerky zosilnia hneď.
  function backstab(state, pid, events, sides) {
    const p = state[pid];
    if (p.backstabRound === state.round) return;
    p.backstabRound = state.round;
    events.push({ type: "backstab", pid });
    if (sides) {
      addRaceAura(p, "ogre", BACKSTAB_BUFF, BACKSTAB_BUFF);
      buffAlive(sides, pid, f => Cards.byId[f.defId].race === "ogre",
        BACKSTAB_BUFF, BACKSTAB_BUFF, events);
      events.push({ type: "futureBuff", pid, race: "ogre", a: BACKSTAB_BUFF, h: BACKSTAB_BUFF });
    } else {
      grantRaceAura(p, "ogre", BACKSTAB_BUFF, BACKSTAB_BUFF, events);
    }
  }

  // Živelná sila (dmgBoost) zosilňuje dočasné buffy Živlov: +boost na útok,
  // na život len ak buff život dáva.
  function elementalBonus(fx, m, boost) {
    return { a: fx.a * m + boost, h: fx.h * m + (fx.h ? boost : 0) };
  }

  // Živelná sila zosilňuje aj buffy KÚZIEL (Jablko, Koreň, Srdce, Vlna,
  // Iskrička): +boost na každé nenulové číslo. Kúzla bez statov (Štít,
  // Svätožiara, Pierko, Vichor) sa nemenia.
  function sparkBonus(fx, m, boost) {
    return { a: fx.a * m + (fx.a ? boost : 0), h: fx.h * m + (fx.h ? boost : 0) };
  }

  // Odložená kliatba (spotrebuje sa na začiatku najbližšieho boja) – počítadlo
  // na hráčovi + event s celkovým počtom.
  function addPendingCurse(p, key, n, eventType, events) {
    p[key] += n;
    events.push({ type: eventType, pid: p.id, total: p[key] });
  }

  // Efekty nákupnej fázy podľa fx.type. Kontext: state, p (hráč), fx, m (stupeň
  // karty = násobič), self (zdroj efektu, ak je to príšerka), events, target.
  const SHOP_FX = {
    // Cielený buff (E008): +a/+h vybranej príšerke do konca boja; dočasný
    // buff Živla škáluje Živelná sila v oboch číslach.
    buffOne({ state, p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (!t) return;
      const boost = Cards.byId[self.defId].race === "elemental" ? state[p.id].dmgBoost : 0;
      const b = elementalBonus(fx, m, boost);
      buffWithEvent(t, p.id, b.a, b.h, events);
    },
    // Drak: +a/+h všetkým príšerkám RASY cieľa (do konca boja).
    buffRaceOf({ p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (t) buffRaceThisFight(p, Cards.byId[t.defId].race, fx.a * m, fx.h * m, events);
    },
    // Drak: permanentná aura pre RASU cieľa (rasa za behu).
    futureRaceOf({ p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (t) grantRaceAura(p, Cards.byId[t.defId].race, fx.a * m, fx.h * m, events);
    },
    // Drak: Discover karta RASY cieľa (1 z 3, tier <= vlastný, z vlastného poolu).
    // Druhé echo (mutácia echoCry) by prepísalo čakajúci discover – preskoč.
    discoverRace({ state, p, self, target, events }) {
      if (state.pendingDiscover) return;
      const t = shopTarget(p, self, target);
      if (!t) return;
      const race = Cards.byId[t.defId].race;
      const options = [];
      for (let i = 0; i < 3; i++) {
        const id = rollCard(state, p.tier, p.id, d => d.race === race);
        if (id) options.push(id);
      }
      if (!options.length) return;
      state.pendingDiscover = { pid: p.id, options, poolKey: p.id };
      events.push({ type: "discoverStart", pid: p.id, options });
    },
    // Drak t6: cieľ evolvne o stupeň (bronz→striebro→zlato); zlatú nezdvihne.
    // Buffy cieľa NAD základ (bez aury) sa prenesú, perma rast tiež.
    evolveTarget({ state, p, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (!t || t.rank >= 3 || Cards.byId[t.defId].token) return;
      const tdef = Cards.byId[t.defId];
      const aura = (tdef.race && p.raceBuffs[tdef.race]) || { a: 0, h: 0 };
      const bonusA = Math.max(0, t.atk - tdef.atk * Cards.STAT_MULT[t.rank] - aura.a);
      const bonusH = Math.max(0, t.maxHp - tdef.hp * Cards.STAT_MULT[t.rank] - aura.h);
      const up = makeInst(state, t.defId, t.rank + 1, p);
      buff(up, bonusA, bonusH);
      if (t.pa || t.ph) { up.pa = t.pa; up.ph = t.ph; }
      if (t.src) up.src = t.src;
      up.slot = t.slot;
      p.board[p.board.indexOf(t)] = up;
      events.push({ type: "evolve", pid: p.id, uid: up.uid, defId: up.defId, rank: up.rank, replaced: t.uid });
    },
    // Drak: náhodná TVOJA rasa na ploche +a/+h (do konca boja).
    buffRandomRace({ state, p, fx, m, events }) {
      const races = [...new Set(p.board.filter(x => !x.spell).map(x => Cards.byId[x.defId].race).filter(Boolean))];
      if (!races.length) return;
      buffRaceThisFight(p, pick(races, state.rng), fx.a * m, fx.h * m, events);
    },
    // D001: odložené oslabenie – na začiatku najbližšieho boja náhodná
    // súperova príšerka −a/−h (útok min 0, život min 1). Stackuje sa.
    shrinkEnemy({ p, fx, m, events }) {
      p.shrinks.push({ a: fx.a * m, h: fx.h * m });
      events.push({ type: "shrinkPending", pid: p.id, total: p.shrinks.length });
    },
    // Náhodná kamarátka +a/+h.
    buffFriend({ state, p, fx, m, self, events }) {
      const friends = p.board.filter(x => x !== self);
      if (friends.length) buffWithEvent(pick(friends, state.rng), p.id, fx.a * m, fx.h * m, events);
    },
    // Kúzlo (self = null, Vlna) škáluje Živelnou silou; battlecry príšerky nie.
    buffAllFriends({ p, fx, m, self, events }) {
      const { a, h } = sparkBonus(fx, m, self ? 0 : p.dmgBoost);
      for (const f of p.board) {
        if (f !== self) buffWithEvent(f, p.id, a, h, events);
      }
    },
    // Rasová synergia: všetky vlastné príšerky danej rasy (okrem seba).
    // Dočasné buffy ŽIVLOV (E007 Po nákupe, E008 Pri vyložení) škáluje Živelná sila.
    buffRace({ p, fx, m, self, events }) {
      const boost = self && Cards.byId[self.defId].race === "elemental" ? p.dmgBoost : 0;
      const { a, h } = elementalBonus(fx, m, boost);
      for (const f of p.board) {
        if (f === self || Cards.byId[f.defId].race !== fx.race) continue;
        buffWithEvent(f, p.id, a, h, events);
      }
    },
    // +a/+h pre seba za KAŽDÉ kúzlo zahrané v tejto hre – prepočíta sa pri
    // každom vyložení, žiadny trvalý buff (nesnowballuje cez kópie). Bonus sa
    // NEnásobí stupňom (evolve už zdvojnásobuje základné staty).
    spellScale({ p, fx, self, events }) {
      const n = p.spellsCast;
      if (n > 0) buffWithEvent(self, p.id, fx.a * n, fx.h * n, events);
    },
    growSelf({ p, fx, m, self, events }) {
      buffWithEvent(self, p.id, fx.a * m, fx.h * m, events);
      if (fx.perm) { // trvalý rast: uloží sa na kópiu karty a prežije cyklus balíčka
        self.pa = (self.pa || 0) + fx.a * m;
        self.ph = (self.ph || 0) + fx.h * m;
      }
    },
    // U004: označená príšerka po smrti vstane ako m/m (1/2/3 podľa stupňa).
    // Aury sa aplikujú až pri vstávaní v boji. Fallback bez cieľa: najsilnejší
    // VLASTNÝ deathrattler (dve smrti = dvojitý deathrattle), až potom
    // najsilnejšia príšerka.
    reviveAs({ p, m, self, target, events }) {
      const deathrattlers = p.board.filter(x =>
        x !== self && Cards.byId[x.defId].power?.kw === "deathrattle");
      const t = (target && p.board.includes(target)) ? target
        : deathrattlers.sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0] || shopTarget(p, self, target);
      if (!t) return;
      t.reviveAs = Math.max(t.reviveAs || 0, m);
      events.push({ type: "reviveAsMark", pid: p.id, uid: t.uid, defId: t.defId, n: m });
    },
    // Ogr O001: hod mincou – 50 % veľký buff, 50 % postih (do konca boja).
    // Postih nejde pod 0 útoku / 1 život.
    coinflip({ state, p, fx, m, self, events }) {
      const heads = state.rng() < 0.5;
      const a = Math.max(heads ? fx.a * m : -(fx.da * m), -self.atk);
      const h = Math.max(heads ? fx.h * m : -(fx.dh * m), 1 - self.hp);
      self.atk += a;
      self.hp += h;
      self.maxHp = Math.max(1, self.maxHp + h);
      events.push({ type: "coinflip", pid: p.id, uid: self.uid, heads });
      events.push({ type: "buff", pid: p.id, uid: self.uid, a, h });
      if (!heads) backstab(state, p.id, events); // chvost = backstab
    },
    draw({ state, p, fx, m, events }) {
      drawCards(state, p, fx.n * m, events);
      checkEvolve(state, p, events);
    },
    gold({ p, fx, m, events }) {
      p.money += fx.n * m;
      events.push({ type: "gold", pid: p.id, n: fx.n * m });
    },
    healHero({ p, fx, m, events }) {
      p.hp = Math.min(HERO_HP, p.hp + fx.n * m);
      events.push({ type: "heal", pid: p.id, n: fx.n * m });
    },
    // Trvalý bonus: všetky výboje a výbuchy hráča dávajú navždy +n damage.
    // Kúzla sa stackujú – elemental ekvivalent permanentných aur.
    dmgBoost({ p, fx, m, events }) {
      p.dmgBoost += fx.n * m;
      events.push({ type: "dmgBoost", pid: p.id, n: fx.n * m, total: p.dmgBoost });
    },
    // U002: tokeny daného id vyvolané v najbližšom boji dostanú +a/+h.
    // Stackuje sa; po boji sa nuluje (ako fightRaceBuffs).
    fightToken({ p, fx, m, events }) {
      const tb = (p.fightTokenBuffs[fx.token] ||= { a: 0, h: 0 });
      tb.a += fx.a * m; tb.h += fx.h * m;
      events.push({ type: "fightTokenBuff", pid: p.id, token: fx.token, a: fx.a * m, h: fx.h * m });
    },
    // Jednorazová charga: ĎALŠIE vyvolanie v boji vyvolá +n tokenov navyše.
    summonCharge({ p, fx, m, events }) {
      p.summonCharge += fx.n * m;
      events.push({ type: "summonCharge", pid: p.id, n: fx.n * m, total: p.summonCharge });
    },
    // Ticho: náhodná súperova príšerka so schopnosťou stratí efekt aj Obrancu.
    silence({ p, fx, m, events }) { addPendingCurse(p, "silences", fx.n * m, "silencePending", events); },
    // Blesk: výboj za BOLT_DMG (+dmgBoost) na náhodnú súperovu príšerku.
    bolt({ p, fx, m, events }) { addPendingCurse(p, "bolts", fx.n * m, "boltPending", events); },
    // Žabia kliatba: náhodnej súperovej príšerke sa zmení život na 1
    // (nie je to damage – obchádza Božský štít).
    hex({ p, fx, m, events }) { addPendingCurse(p, "hexes", fx.n * m, "hexPending", events); },
    // Ovčia premena: náhodná súperova príšerka sa na začiatku boja zmení na
    // Ovečku 0/1 (stratí schopnosť, Obrancu, štít, pierko, Vichor).
    polymorph({ p, fx, m, events }) { addPendingCurse(p, "polymorphs", fx.n * m, "polymorphPending", events); },
    // Poklad škriatka: polovica hneď, polovica na začiatku ďalšieho kola.
    goldLater({ p, fx, m, events }) {
      p.money += fx.n * m;
      p.goldNext += fx.n * m;
      events.push({ type: "gold", pid: p.id, n: fx.n * m });
      events.push({ type: "goldLater", pid: p.id, n: fx.n * m });
    },
    // Jednorazové kúzlo do ruky (battlecry F006): nejde do balíčka, po zoslaní
    // aj po konci ťahu zmizne. Evolve škáluje počet (1/2/3). Plná ruka = zvyšok prepadne.
    addSpell({ state, p, fx, m, events }) {
      for (let i = 0; i < fx.n * m; i++) {
        if (p.hand.length >= HAND_MAX) break;
        const sp = makeInst(state, fx.spell, 1);
        sp.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(sp);
        events.push({ type: "addSpell", pid: p.id, defId: fx.spell });
      }
    },
    // Permanentná aura: VŠETKY príšerky danej rasy – na ploche a v ruke hneď,
    // budúce inštancie cez auru pri vzniku.
    futureRace({ p, fx, m, events }) {
      grantRaceAura(p, fx.race, fx.a * m, fx.h * m, events);
    },
    // F008: permanentná aura pre KAŽDÚ rasu naraz; príšerky na ploche a v ruke
    // dostanú buff hneď (raz).
    futureAll({ p, fx, m, events }) {
      for (const race of Object.keys(Cards.RACES)) addRaceAura(p, race, fx.a * m, fx.h * m);
      buffZones(p, ["board", "hand"], d => !!d.race, fx.a * m, fx.h * m, events);
      events.push({ type: "futureAllBuff", pid: p.id, a: fx.a * m, h: fx.h * m });
    },
    // Hviezdna moc (t6 kúzlo): Pečať +a/+h každej rase (ako F008) a k tomu
    // Živelná sila +n – obe permanentné, Živelná sila sa nenásobí stupňom.
    starPower(ctx) {
      SHOP_FX.futureAll(ctx);
      SHOP_FX.dmgBoost(ctx);
    },
  };

  function buff(inst, a, h) {
    inst.atk += a;
    inst.maxHp += h;
    inst.hp += h;
  }

  // ---------- Koniec nákupnej fázy ----------
  function endShopTurn(state, pid) {
    // Nelegálne ukončenie (nie je nákupná fáza / nie je na ťahu) = null,
    // ako pri každej inej akcii – duplicitná či oneskorená správa v sieti
    // nesmie preskočiť súperovi ťah.
    if (state.phase !== "shop" || state.active !== pid) return null;
    const p = state[pid];
    const events = [];
    // Po nákupe (end of turn) schopnosti príšeriek na ploche.
    for (const inst of [...p.board]) {
      const def = Cards.byId[inst.defId];
      if (def.power && def.power.kw === "endTurn") {
        applyShopFx(state, p, def.power.fx, inst.rank, inst, events);
      }
    }
    // Nezahrané karty z ruky do discard pile (jednorazové kúzla miznú).
    for (const inst of p.hand.splice(0)) {
      if (Cards.byId[inst.defId].token) continue;
      p.discard.push(pileCard(inst));
    }
    // Kúzla zahrané v tomto ťahu sa až teraz vracajú do kôpky.
    p.discard.push(...p.spentSpells.splice(0));
    if (pid === state.first) {
      state.active = other(pid);
      events.push(...beginShopTurn(state, state.active));
      events.push({ type: "shopTurn", pid: state.active });
    } else {
      state.active = null;
      state.phase = "battle";
      events.push({ type: "battlePhase" });
    }
    return events;
  }

  // ---------- Boj ----------
  // Boj sa hrá na KÓPIÁCH kariet z plochy (sides) – originály na state
  // dostanú len trvalé zmeny (pa/ph). Poradie: odložené kliatby z kúziel →
  // Pred bojom → striedavé útoky → vyhodnotenie → upratanie plochy → ďalšie kolo.
  function doBattle(state) {
    const events = [];
    const sides = { p1: copyBoard(state.p1), p2: copyBoard(state.p2) };
    const first = pickFirstSide(state, sides);
    events.push({ type: "battleStart", first });
    applyPendingCurses(state, sides, first, events);
    runStartFightProcs(state, sides, first, events);
    runAttackLoop(state, sides, first, events);
    resolveBattleOutcome(state, sides, events);
    clearBoards(state, sides, events);
    advanceAfterBattle(state, events);
    return events;
  }

  const copyBoard = p => p.board.map(x => ({ ...x }));
  const aliveOn = (sides, pid) => sides[pid].filter(x => x.hp > 0);
  // Poradie strán pri spúšťaní efektov: začínajúca strana prvá.
  const sideOrder = first => [first, other(first)];

  // Začína strana s väčším počtom príšeriek (remíza → náhodne).
  function pickFirstSide(state, sides) {
    if (sides.p1.length > sides.p2.length) return "p1";
    if (sides.p2.length > sides.p1.length) return "p2";
    return state.rng() < 0.5 ? "p1" : "p2";
  }

  function pushHp(events, pid, inst) {
    events.push({ type: "hp", pid, uid: inst.uid, hp: inst.hp });
  }

  // Zásah schopnosťou (výboj, Blesk, lovec tokenov): damage cez štít + eventy.
  // Smrť rieši volajúci (handleDeaths) – niektoré efekty ju odkladajú za sériu zásahov.
  function powerHit(target, targetPid, dmg, from, events) {
    dealDmg(target, dmg, targetPid, events);
    events.push({ type: "powerDmg", pid: targetPid, uid: target.uid, n: dmg, from });
    pushHp(events, targetPid, target);
  }

  // Damage schopnosti škáluje so stupňom (×1/×2/×3) + Živelná sila hráča.
  function scaledPowerDmg(state, pid, fx, m) {
    return fx.n * m + state[pid].dmgBoost;
  }

  // Trvalý rast z boja: bojuje kópia, tak pa/ph zapíš na originál na ploche –
  // ten ide po boji do kôpky (pileCard) a rast cestuje s kartou.
  function growPermanently(state, pid, uid, a, h) {
    const orig = state[pid].board.find(x => x.uid === uid);
    if (!orig) return;
    orig.pa = (orig.pa || 0) + a;
    orig.ph = (orig.ph || 0) + h;
  }

  // Buffne živé príšerky strany, ktoré spĺňajú filter.
  function buffAlive(sides, pid, match, a, h, events) {
    for (const f of sides[pid]) {
      if (f.hp <= 0 || !match(f)) continue;
      buffWithEvent(f, pid, a, h, events);
    }
  }

  // Spustí schopnosť príšerky, ak má daný keyword a nie je umlčaná.
  // Vráti true, ak sa spustila.
  function triggerPower(state, sides, pid, inst, kw, events) {
    const power = Cards.byId[inst.defId].power;
    if (!power || power.kw !== kw || inst.silenced) return false;
    events.push({ type: "proc", pid, uid: inst.uid, kw });
    applyBattleFx(state, sides, pid, inst, power.fx, inst.rank, events, kw);
    return true;
  }

  // ----- Odložené kliatby z kúziel -----
  // Poradie: Ticho → Ovčia premena → Žabia kliatba → Oslabenie → Blesk; každý
  // typ pre obe strany (začínajúca prvá), až potom ďalší typ.
  function applyPendingCurses(state, sides, first, events) {
    for (const step of [applySilences, applyPolymorphs, applyHexes, applyShrinks, applyBolts]) {
      for (const pid of sideOrder(first)) step(state, sides, pid, events);
    }
  }

  // Ovčia premena: náhodná živá súperova príšerka (nie už Ovečka) sa na tento
  // boj zmení na Ovečku 0/1 – prepíše sa inštancia v bojovej kópii plochy,
  // uid ostáva (UI vymení kartu na mieste). Nie je to damage: štít nepomôže,
  // deathrattle sa nespustí; všetky bojové značky (štít, pierko, Vichor,
  // Obranca, umlčanie) zmiznú spolu s pôvodnou kartou.
  function applyPolymorphs(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.polymorphs > 0) {
      p.polymorphs--;
      const targets = aliveOn(sides, foe).filter(x => x.defId !== "ovecka");
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      const sheep = Cards.byId.ovecka;
      const fromDefId = t.defId, fromRank = t.rank;
      Object.assign(t, {
        defId: "ovecka", rank: 1, atk: sheep.atk, hp: sheep.hp, maxHp: sheep.hp,
        taunt: false, shield: false, revive: false, windfury: false, silenced: false,
      });
      events.push({ type: "polymorph", pid: foe, uid: t.uid, fromDefId, fromRank, defId: "ovecka", atk: t.atk, hp: t.hp });
      pushHp(events, foe, t);
    }
  }

  // Ticho: náhodná súperova príšerka SO SCHOPNOSŤOU stratí efekt aj Obrancu.
  function applySilences(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.silences > 0) {
      p.silences--;
      const targets = sides[foe].filter(x =>
        x.hp > 0 && !x.silenced && (Cards.byId[x.defId].power || x.taunt));
      if (!targets.length) {
        events.push({ type: "silenceFizzle", pid });
        continue;
      }
      const t = pick(targets, state.rng);
      t.silenced = true;
      t.taunt = false;
      events.push({ type: "silence", pid: foe, uid: t.uid, defId: t.defId, rank: t.rank });
    }
  }

  // Žabia kliatba: náhodnej súperovej príšerke sa zmení život na 1
  // (nie je to damage, Božský štít nepomôže).
  function applyHexes(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.hexes > 0) {
      p.hexes--;
      const targets = sides[foe].filter(x => x.hp > 1);
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      t.hp = 1;
      events.push({ type: "hex", pid: foe, uid: t.uid, defId: t.defId });
      pushHp(events, foe, t);
    }
  }

  // Oslabenie (D001): náhodná súperova príšerka −a/−h (nie je to damage:
  // Božský štít nepomôže, deathrattle sa nespustí – život min 1).
  function applyShrinks(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.shrinks.length) {
      const sh = p.shrinks.shift();
      const targets = aliveOn(sides, foe);
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      const da = Math.min(sh.a, t.atk);
      const dh = Math.min(sh.h, t.hp - 1);
      t.atk -= da;
      t.hp -= dh; t.maxHp = Math.max(1, t.maxHp - dh);
      events.push({ type: "shrink", pid: foe, uid: t.uid, defId: t.defId, a: 0 - da, h: 0 - dh });
      pushHp(events, foe, t);
    }
  }

  // Blesk: výboj za BOLT_DMG (+dmgBoost, je to výboj) na náhodnú živú
  // súperovu príšerku; každý nabitý Blesk = samostatný zásah.
  function applyBolts(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.bolts > 0) {
      p.bolts--;
      const targets = aliveOn(sides, foe);
      if (!targets.length) continue;
      powerHit(pick(targets, state.rng), foe, BOLT_DMG + p.dmgBoost, undefined, events);
      handleDeaths(state, sides, events);
    }
  }

  // ----- Priebeh boja -----
  // Pred bojom – začínajúca strana prvá, v poradí plochy.
  function runStartFightProcs(state, sides, first, events) {
    for (const pid of sideOrder(first)) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0) triggerPower(state, sides, pid, inst, "startFight", events);
      }
    }
  }

  // Strany sa striedajú v útokoch, kým jedna nemá živé príšerky.
  function runAttackLoop(state, sides, first, events) {
    const ptr = { p1: 0, p2: 0 };
    let attacker = first;
    let guard = BATTLE_CAP; // poistka proti nekonečnému boju (→ remíza)
    while (aliveOn(sides, "p1").length && aliveOn(sides, "p2").length && guard-- > 0) {
      const a = nextAttacker(sides[attacker], ptr, attacker);
      if (!a) break;
      // Vichor (windfury): dva útoky za ťah – druhý len ak prežila prvý.
      const swings = a.windfury ? 2 : 1;
      for (let s = 0; s < swings && a.hp > 0; s++) {
        if (!performAttack(state, sides, attacker, a, events)) break;
      }
      attacker = other(attacker);
    }
  }

  // Ďalší živý útočník v poradí plochy (cyklicky); ukazovateľ sa posunie za neho.
  function nextAttacker(mine, ptr, pid) {
    for (let i = 0; i < mine.length; i++) {
      const cand = mine[(ptr[pid] + i) % mine.length];
      if (cand.hp > 0) {
        ptr[pid] = (mine.indexOf(cand) + 1) % mine.length;
        return cand;
      }
    }
    return null;
  }

  // Jeden útok: „Pri útoku" (dočasný boost; každý útok Vichoru ho spúšťa
  // znova – synergia), výber cieľa (Obrancovia majú prednosť), obojstranný
  // damage. Vráti false, ak útok neprebehol: útočníka zložil vlastný efekt
  // (Ožratý úder) alebo súper nemá živé príšerky.
  function performAttack(state, sides, attacker, a, events) {
    const defender = other(attacker);
    triggerPower(state, sides, attacker, a, "onAttack", events);
    if (a.hp <= 0) return false;
    const enemies = aliveOn(sides, defender);
    if (!enemies.length) return false;
    const taunts = enemies.filter(x => x.taunt);
    const d = pick(taunts.length ? taunts : enemies, state.rng);
    events.push({ type: "attack", aPid: attacker, aUid: a.uid, dPid: defender, dUid: d.uid, aDmg: a.atk, dDmg: d.atk });
    dealDmg(a, d.atk, attacker, events);
    dealDmg(d, a.atk, defender, events);
    pushHp(events, attacker, a);
    pushHp(events, defender, d);
    handleDeaths(state, sides, events);
    return true;
  }

  // ----- Vyhodnotenie a upratanie -----
  function battleWinner(sides) {
    const alive1 = aliveOn(sides, "p1").length, alive2 = aliveOn(sides, "p2").length;
    if (alive1 && !alive2) return "p1";
    if (alive2 && !alive1) return "p2";
    return null;
  }

  // Hrdina porazeného dostane damage = súčet TIEROV preživších príšeriek
  // víťaza (evolve stupeň nehrá rolu). Obe strany prázdne alebo limit ťahov
  // = remíza bez damage.
  function resolveBattleOutcome(state, sides, events) {
    const winner = battleWinner(sides);
    if (!winner) {
      events.push({ type: "battleDraw" });
      return;
    }
    const dmg = aliveOn(sides, winner).reduce((sum, x) => sum + Cards.byId[x.defId].tier, 0);
    const loser = other(winner);
    state[loser].hp -= dmg;
    events.push({ type: "heroDmg", pid: loser, dmg, hp: state[loser].hp });
  }

  // Po boji ide VŠETKO (padlé aj preživšie karty) do discard pile a plocha
  // sa vyprázdni – každé kolo sa bojisko stavia nanovo. Tokeny miznú z hry.
  // Jednorazové bojové chargy a buffy končia; dmgBoost (Živelná sila) je trvalý.
  function clearBoards(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.summonCharge = 0; // nabitá summon charga (U007) platí len tento boj
      p.fightRaceBuffs = {}; // dračie buffy „do konca boja"
      p.fightTokenBuffs = {}; // bojové buffy tokenov (U002)
      if (state.mutator === "bloodMoon") applyBloodMoon(p, sides[pid], events);
      for (const inst of p.board) {
        if (Cards.byId[inst.defId].token) continue;
        p.discard.push(pileCard(inst));
        events.push({ type: "toDiscard", pid, defId: inst.defId });
      }
      p.board = [];
    }
  }

  // Mutácia „bloodMoon": preživšie príšerky +1/+1 NAVŽDY (permanentný rast
  // pa/ph cestuje s kópiou karty cez balíček; tokeny aj tak miznú).
  function applyBloodMoon(p, side, events) {
    for (const f of side) {
      if (f.hp <= 0) continue;
      const inst = p.board.find(x => x.uid === f.uid);
      if (!inst || Cards.byId[inst.defId].token) continue;
      inst.pa = (inst.pa || 0) + 1;
      inst.ph = (inst.ph || 0) + 1;
      events.push({ type: "bloodMoon", pid: p.id, uid: inst.uid, defId: inst.defId });
    }
  }

  // Koniec hry, keď niekto klesol na 0 (obaja = remíza); inak nové kolo.
  function advanceAfterBattle(state, events) {
    const dead1 = state.p1.hp <= 0, dead2 = state.p2.hp <= 0;
    if (dead1 || dead2) {
      state.phase = "over";
      state.winner = dead1 && dead2 ? "draw" : dead1 ? "p2" : "p1";
      events.push({ type: "gameOver", winner: state.winner });
      return;
    }
    state.phase = "shop";
    events.push(...startRound(state));
    events.push({ type: "shopTurn", pid: state.active });
  }

  // ----- Efekty v boji (Pred bojom / Pri smrti / Pri útoku) -----
  // kw: keyword, ktorý efekt spustil – Živelná sila (dmgBoost) zosilňuje
  // okrem výbojov a výbuchov aj útočný bonus „Pri útoku" (E004).
  function applyBattleFx(state, sides, pid, self, fx, rank, events, kw) {
    const handler = BATTLE_FX[fx.type];
    if (handler) handler({ state, sides, pid, self, fx, m: rank, events, kw });
  }

  // Výbuch: jedna vlna zasiahne všetkých živých na strane NARAZ (jeden event
  // pre UI – žiadne projektily po jednom). Štít vlnu zruší.
  function aoeWave(sides, side, dmg, from, events) {
    const hits = [];
    for (const t of aliveOn(sides, side)) {
      if (t.shield) {
        t.shield = false;
        events.push({ type: "shieldPop", pid: side, uid: t.uid });
        continue;
      }
      t.hp -= dmg;
      hits.push({ uid: t.uid, hp: t.hp });
    }
    if (hits.length) events.push({ type: "aoeDmg", pid: side, n: dmg, from, hits });
  }

  // Token vyvolaný v boji: stupeň rodiča (staty ×2/×4), aury z makeInst,
  // dračí buff „do konca boja" (fightRaceBuffs) a bojový buff tokenu (U002).
  function makeFightToken(state, p, tokenId, rank) {
    const tok = makeInst(state, tokenId, rank, p);
    const race = Cards.byId[tokenId].race;
    for (const b of [race && p.fightRaceBuffs[race], p.fightTokenBuffs[tokenId]]) {
      if (b && (b.a || b.h)) buff(tok, b.a, b.h);
    }
    return tok;
  }

  // Efekty boja podľa fx.type. Kontext: state, sides (kópie plôch), pid
  // (strana zdroja), self (zdroj), fx, m (stupeň = násobič), events, kw.
  const BATTLE_FX = {
    // Výboj mieri na NÁHODNÉHO živého nepriateľa. Evolve škáluje POČET
    // zásahov (1/2/3), nie silu.
    dmgWeakEnemy({ state, sides, pid, self, fx, m, events }) {
      const foe = other(pid);
      const hitDmg = fx.n + state[pid].dmgBoost;
      // Počet zásahov = stupeň (1/2/3); fx.hits ho prebije (Bublina: vždy 1 –
      // strieborná E002 vyvoláva tokeny stupňa 2, no každý má strieľať raz).
      for (let i = 0; i < (fx.hits || m); i++) {
        const enemies = aliveOn(sides, foe);
        if (!enemies.length) break;
        powerHit(pick(enemies, state.rng), foe, hitDmg, self.uid, events);
        handleDeaths(state, sides, events);
      }
    },
    // Výbuch na všetkých nepriateľov. Damage škáluje so stupňom (×1/×2/×3) –
    // držať base nízko, nech nevypne swarm úplne.
    dmgAllEnemies({ state, sides, pid, self, fx, m, events }) {
      aoeWave(sides, other(pid), scaledPowerDmg(state, pid, fx, m), self.uid, events);
      handleDeaths(state, sides, events);
    },
    // Ogr O003: chaos výbuch – VŠETKY živé príšerky na OBOCH stranách vrátane
    // seba (friendly fire je súčasť zábavy).
    dmgAllBoth({ state, sides, pid, self, fx, m, events }) {
      const dmg = scaledPowerDmg(state, pid, fx, m);
      for (const side of ["p1", "p2"]) aoeWave(sides, side, dmg, self.uid, events);
      handleDeaths(state, sides, events);
    },
    // O002 (Pred bojom): n× vyber náhodnú živú príšerku z OBOCH strán s bojovou
    // schopnosťou a spusti ju hneď – deathrattle bez smrti, Pred bojom
    // druhýkrát, Pri útoku… Chaos: súperov deathrattle mu dá tokeny zadarmo.
    // Iné chaos spúšťače (a seba) preskočí – žiadna rekurzia.
    triggerRandom({ state, sides, pid, self, fx, m, events }) {
      const BATTLE_KW = ["deathrattle", "startFight", "onAttack", "raceDeath"];
      for (let i = 0; i < fx.n * m; i++) {
        const pool = [];
        for (const sp of ["p1", "p2"]) {
          for (const x of sides[sp]) {
            if (x === self || x.hp <= 0 || x.silenced) continue;
            const pw = Cards.byId[x.defId].power;
            if (!pw || !BATTLE_KW.includes(pw.kw) || pw.fx.type === "triggerRandom") continue;
            pool.push({ x, sp, pw });
          }
        }
        if (!pool.length) break;
        const { x, sp, pw } = pick(pool, state.rng);
        events.push({ type: "chaosTrigger", pid, uid: self.uid, targetPid: sp, targetUid: x.uid, targetDefId: x.defId, kw: pw.kw });
        if (sp !== pid) backstab(state, pid, events, sides); // spustil súperovu = backstab
        triggerPower(state, sides, sp, x, pw.kw, events);
        handleDeaths(state, sides, events); // Ožratý úder / výboje mohli niekoho zložiť
      }
    },
    // Ogr O006 (Pri útoku): 50 % šanca, že sa trafí sám za ½ svojho útoku.
    drunkStrike({ state, sides, pid, self, events }) {
      if (state.rng() >= 0.5) return;
      const dmg = Math.floor(self.atk / 2);
      if (dmg <= 0) return;
      dealDmg(self, dmg, pid, events);
      events.push({ type: "drunkHit", pid, uid: self.uid, n: dmg });
      pushHp(events, pid, self);
      handleDeaths(state, sides, events);
      backstab(state, pid, events, sides); // trafil sám seba = backstab
    },
    // Ogr O007 (Pri smrti): veľký zásah ÚPLNE náhodnej živej príšerke –
    // hocijakej na ploche, aj vlastnej (ruská ruleta).
    dmgRandomAny({ state, sides, pid, self, fx, m, events }) {
      const all = [
        ...aliveOn(sides, "p1").map(t => ({ t, side: "p1" })),
        ...aliveOn(sides, "p2").map(t => ({ t, side: "p2" })),
      ];
      if (!all.length) return;
      const { t, side } = pick(all, state.rng);
      powerHit(t, side, scaledPowerDmg(state, pid, fx, m), self.uid, events);
      handleDeaths(state, sides, events);
      if (side === pid) backstab(state, pid, events, sides); // trafil vlastnú = backstab
    },
    // Ogr O010 (Pri smrti): 50 % šanca, že vstane s 1 HP na NÁHODNEJ strane
    // plochy (aj u súpera!). Raz za boj; pri plnej strane ostáva ležať.
    // Technicky vstáva kópia – originál normálne zomrie.
    confusedRevive({ state, sides, pid, self, events }) {
      if (self.confusedUsed) return;
      self.confusedUsed = true;
      if (state.rng() >= 0.5) return;
      const side = state.rng() < 0.5 ? pid : other(pid);
      const aliveThere = aliveOn(sides, side);
      if (aliveThere.length >= BOARD_MAX) return;
      const copy = {
        ...self, uid: ++state.uidSeq, hp: 1, dead: false, shield: false,
        confusedUsed: true, slot: freeSlot(aliveThere, BOARD_MAX),
      };
      sides[side].push(copy);
      events.push({ type: "confusedRevive", pid: side, fromPid: pid, uid: copy.uid, defId: copy.defId, swapped: side !== pid });
      events.push({ type: "summon", pid: side, uid: copy.uid, defId: copy.defId, slot: copy.slot, rank: copy.rank, atk: copy.atk, hp: 1 });
      if (side !== pid) backstab(state, pid, events, sides); // vstal u súpera = backstab
    },
    // Rast seba; perm (B004) = rast NAVŽDY aj z boja (na originál na ploche).
    growSelf({ state, pid, self, fx, m, events }) {
      buffWithEvent(self, pid, fx.a * m, fx.h * m, events);
      if (fx.perm) growPermanently(state, pid, self.uid, fx.a * m, fx.h * m);
    },
    // Dočasný buff kamarátok. Živel „Pri útoku" (E004) škáluje so Živelnou
    // silou – bonus sa nenásobí stupňom a ide len na stat, ktorý buff dáva.
    buffAllFriends({ state, sides, pid, self, fx, m, events, kw }) {
      const boost = kw === "onAttack" && Cards.byId[self.defId].race === "elemental" ? state[pid].dmgBoost : 0;
      const a = fx.a * m + (fx.a ? boost : 0);
      const h = fx.h * m + (fx.h ? boost : 0);
      buffAlive(sides, pid, f => f !== self, a, h, events);
    },
    // Permanentná aura položená uprostred boja (U010, Pri smrti): živé
    // príšerky rasy na ploche hneď, budúce inštancie cez raceBuffs pri vzniku.
    // Prežije boj – je to aura.
    futureRace({ state, sides, pid, fx, m, events }) {
      const a = fx.a * m, h = fx.h * m;
      addRaceAura(state[pid], fx.race, a, h);
      buffAlive(sides, pid, f => Cards.byId[f.defId].race === fx.race, a, h, events);
      events.push({ type: "futureBuff", pid, race: fx.race, a, h });
    },
    // Drak (Pred bojom): tvoja NAJPOČETNEJŠIA rasa na ploche +a/+h. Ako všetky
    // dračie ne-aura buffy platí na CELÉ kolo: zapíše sa do fightRaceBuffs,
    // takže ho dostanú aj tokeny vyvolané neskôr v boji.
    buffTopRace({ state, sides, pid, fx, m, events }) {
      const counts = {};
      for (const f of aliveOn(sides, pid)) {
        const r = Cards.byId[f.defId].race;
        if (r) counts[r] = (counts[r] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top) return;
      const race = top[0], a = fx.a * m, h = fx.h * m;
      buffAlive(sides, pid, f => Cards.byId[f.defId].race === race, a, h, events);
      addFightRaceBuff(state[pid], race, a, h);
    },
    // Rasová synergia v boji – živé príšerky rovnakej rasy (okrem seba).
    // Dočasné buffy Živlov škáluje Živelná sila (ako v nákupnej fáze).
    buffRace({ state, sides, pid, self, fx, m, events }) {
      const boost = Cards.byId[self.defId].race === "elemental" ? state[pid].dmgBoost : 0;
      const { a, h } = elementalBonus(fx, m, boost);
      buffAlive(sides, pid, f => f !== self && Cards.byId[f.defId].race === fx.race, a, h, events);
    },
    // Vyvolanie tokenov vedľa zdroja. Evolvnutá karta vyvoláva SILNEJŠIE
    // tokeny (stupeň rodiča), počet sa so stupňom neškáluje. summonCharge
    // (U007) jednorazovo pridá +n tokenov, potom sa minie. Pretečenie
    // (undead): token, čo sa nezmestí na plnú plochu, dá celé staty jednej
    // náhodnej živej vlastnej príšerke; iné rasy pri plnej ploche končia.
    summon({ state, sides, pid, self, fx, m, events }) {
      const board = sides[pid];
      const idx = board.indexOf(self);
      const p = state[pid];
      const count = fx.n + p.summonCharge;
      p.summonCharge = 0;
      const overflows = Cards.byId[fx.token].race === "undead";
      for (let i = 0; i < count; i++) {
        const alive = aliveOn(sides, pid);
        const full = alive.length >= BOARD_MAX;
        if (full && !overflows) break;
        const tok = makeFightToken(state, p, fx.token, Math.min(m, 3));
        if (full) {
          overflowStats(state, alive, tok, pid, events);
          continue;
        }
        tok.slot = freeSlot(alive, BOARD_MAX);
        board.splice(idx + 1 + i, 0, tok);
        events.push({ type: "summon", pid, uid: tok.uid, defId: fx.token, slot: tok.slot, rank: tok.rank, atk: tok.atk, hp: tok.hp });
        huntToken(state, sides, pid, tok, events);
      }
    },
  };

  // Lovci tokenov (onEnemySummon, E005): súperove živé príšerky s týmto
  // keywordom zasiahnu čerstvo vyvolaný token výbojom (n×stupeň + Živelná
  // sila); ak token padne, lovec rastie NAVŽDY (pa/ph na origináli, ako
  // B004). Pretečenie sem nejde – token, čo sa nezmestil, nie je na ploche.
  function huntToken(state, sides, tokPid, tok, events) {
    const hunterPid = other(tokPid);
    let hit = false;
    for (const h of sides[hunterPid]) {
      if (tok.hp <= 0) break;
      if (h.hp <= 0 || h.silenced) continue;
      const pw = Cards.byId[h.defId].power;
      if (!pw || pw.kw !== "onEnemySummon") continue;
      const fx = pw.fx, m = h.rank;
      events.push({ type: "proc", pid: hunterPid, uid: h.uid, kw: "onEnemySummon" });
      powerHit(tok, tokPid, scaledPowerDmg(state, hunterPid, fx, m), h.uid, events);
      hit = true;
      if (tok.hp <= 0) {
        buffWithEvent(h, hunterPid, fx.a * m, fx.h * m, events);
        growPermanently(state, hunterPid, h.uid, fx.a * m, fx.h * m);
      }
    }
    if (hit) handleDeaths(state, sides, events);
  }

  // Pretečenie: celé staty nezmestivšieho sa tokenu dostane JEDNA náhodná
  // živá vlastná príšerka (výber z rng, aby bol multiplayer deterministický).
  // Dočasné ako všetky bojové buffy.
  function overflowStats(state, aliveList, tok, pid, events) {
    if (!aliveList.length) return;
    const f = pick(aliveList, state.rng);
    events.push({ type: "overflow", pid, defId: tok.defId, atk: tok.atk, hp: tok.hp });
    if (!tok.atk && !tok.hp) return;
    buffWithEvent(f, pid, tok.atk, tok.hp, events);
  }

  // Božský štít: prvé zranenie sa úplne zruší (štít praskne, staty ostávajú).
  function dealDmg(target, dmg, pid, events) {
    if (dmg <= 0) return;
    if (target.shield) {
      target.shield = false;
      events.push({ type: "shieldPop", pid, uid: target.uid });
      return;
    }
    target.hp -= dmg;
  }

  // ----- Smrť -----
  // Po každom zásahu prejde obe strany. Poradie pre UI: proc badge + efekt,
  // kým je karta ešte vidno, potom smrť.
  function handleDeaths(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0 || inst.dead) continue;
        if (tryPhoenixRevive(inst, pid, events)) continue;
        inst.dead = true;
        runDeathrattle(state, sides, pid, inst, events);
        runScavengers(state, sides, pid, inst, events);
        if (tryReviveAs(state, sides, pid, inst, events)) continue;
        events.push({ type: "die", pid, uid: inst.uid, defId: inst.defId });
      }
    }
  }

  // Fénixovo pierko: raz sa vráti s 1 životom namiesto smrti.
  function tryPhoenixRevive(inst, pid, events) {
    if (!inst.revive) return false;
    inst.revive = false;
    inst.hp = 1;
    events.push({ type: "revive", pid, uid: inst.uid, defId: inst.defId });
    pushHp(events, pid, inst);
    return true;
  }

  // Pri smrti (deathrattle); mutácia „echoDeath" ho spustí dvakrát.
  function runDeathrattle(state, sides, pid, inst, events) {
    const times = state.mutator === "echoDeath" ? 2 : 1;
    for (let r = 0; r < times; r++) triggerPower(state, sides, pid, inst, "deathrattle", events);
  }

  // Pozorovatelia smrti: Scavenger (raceDeath) rastie, keď padne VLASTNÝ
  // kamarát jeho rasy – B009 „Keď zomrie tvoje Zviera: +2/+2" (dočasne),
  // B004 to isté +1/+1 NAVŽDY (perm). Tokeny majú rasu, Mláďa teda kŕmi oboch.
  function runScavengers(state, sides, pid, dead, events) {
    const race = Cards.byId[dead.defId].race;
    runObservers(state, sides, pid, dead, "raceDeath", fx => fx.race === race, events);
  }

  function runObservers(state, sides, pid, dead, kw, matches, events) {
    for (const f of sides[pid]) {
      if (f === dead || f.hp <= 0 || f.silenced) continue;
      const power = Cards.byId[f.defId].power;
      if (!power || power.kw !== kw || !matches(power.fx)) continue;
      triggerPower(state, sides, pid, f, kw, events);
    }
  }

  // U004 reviveAs: karta NAOZAJ zomrela (deathrattle aj scavengery prebehli –
  // v tom je combo: kostíky už zaplnili plochu), ale vstane ako n/n. Aury sa
  // aplikujú ako pri novej nemŕtvej inštancii – permanentná rasová aura aj
  // dračí bojový buff. Pri plnej ploche ostáva ležať.
  function tryReviveAs(state, sides, pid, inst, events) {
    if (!inst.reviveAs) return false;
    const n = inst.reviveAs;
    inst.reviveAs = 0;
    const aliveNow = aliveOn(sides, pid);
    if (aliveNow.length >= BOARD_MAX) return false;
    const race = Cards.byId[inst.defId].race;
    const aura = (race && state[pid].raceBuffs[race]) || { a: 0, h: 0 };
    const fb = (race && state[pid].fightRaceBuffs[race]) || { a: 0, h: 0 };
    inst.atk = n + aura.a + fb.a;
    inst.hp = inst.maxHp = n + aura.h + fb.h;
    inst.dead = false;
    inst.slot = freeSlot(aliveNow, BOARD_MAX);
    events.push({ type: "reviveAs", pid, uid: inst.uid, defId: inst.defId, atk: inst.atk, hp: inst.hp, slot: inst.slot });
    pushHp(events, pid, inst);
    return true;
  }

  return {
    HERO_HP, BOARD_MAX, HAND_DRAW, HAND_MAX, CARD_COST, SELL_GAIN, REFRESH_COST, POOL_PRIVATE, POOL_COMMON,
    TIER_MAX, MUTATORS, privateCount, income, seededRng, cardCost, refreshCost,
    newGame, startRound, beginShopTurn, buyCommon, buyPrivate, buySpell, refreshShop,
    toggleFreeze, toggleFreezeAll, upgradeCost, upgradeTier, playMinion, castSpell, pickDiscover,
    sellCard, buyBack, discardCard, moveOnBoard, endShopTurn, doBattle, checkEvolve, makeInst, commonTierLimit,
    pileCard, drawCards, rollCard, returnToPool, // pre testy a nástroje (cyklus balíčka, pooly, rollBias)
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
