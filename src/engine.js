// Herná logika bez DOM. Všetka náhoda ide cez state.rng (injektovaná funkcia),
// takže testy sú deterministické. Funkcie vracajú zoznam eventov pre UI animácie.

const Engine = (() => {
  const HERO_HP = 35;
  const BOARD_MAX = 5;
  const HAND_DRAW = 5;
  const HAND_MAX = 8;
  const CARD_COST = 3;
  const SELL_GAIN = 1;
  const REFRESH_COST = 1;
  const COMMON_COUNT = 3;
  const TIER_MAX = 6;
  const TIER_BASE_COST = { 2: 5, 3: 7, 4: 8, 5: 9, 6: 10 };
  const BATTLE_CAP = 200; // poistka proti nekonečnému boju

  const privateCount = tier => Math.min(tier + 1, 6);
  const income = round => Math.min(round + 2, 10);
  // Cena karty: príšery fixne 3, kúzla majú vlastnú cenu (def.cost).
  const cardCost = defId => Cards.byId[defId].cost ?? CARD_COST;

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
    // Tokeny aury nedostávajú – kostíky ostávajú malé (AoE ich zmetie),
    // škálujú len stupňom rodiča (a Mláďa vlastným rastom).
    const aura = p && def.race && !def.token && p.raceBuffs && p.raceBuffs[def.race];
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
  function rollCard(state, tierLimit) {
    const pool = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell);
    return pick(pool, state.rng).id;
  }

  function rollSpell(state, tierLimit) {
    const pool = Cards.DEFS.filter(d => d.spell && d.tier <= tierLimit);
    // Tier 1 má vždy aspoň jedno kúzlo (Minca), pool nie je nikdy prázdny.
    return pick(pool, state.rng).id;
  }

  function other(pid) { return pid === "p1" ? "p2" : "p1"; }

  // ---------- Založenie hry ----------
  // Štartovací balíček: 10 náhodných príšer tieru 1 (duplicity vítané – evolve).
  function newGame(rng) {
    const state = {
      rng, uidSeq: 0, round: 0, phase: "shop", active: null, first: "p1",
      commons: [], winner: null, pendingDiscover: null,
      p1: makePlayer("p1"),
      p2: makePlayer("p2"),
    };
    const basics = Cards.DEFS.filter(d => d.tier === 1 && !d.spell);
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      for (let i = 0; i < 10; i++) p.deck.push({ defId: pick(basics, rng).id, rank: 1 });
    }
    for (let i = 0; i < COMMON_COUNT; i++) state.commons.push(rollCard(state, 1));
    for (const pid of ["p1", "p2"]) {
      fillPrivate(state, pid);
      state[pid].spellShop = { defId: rollSpell(state, 1), frozen: false };
    }
    return state;
  }

  function makePlayer(id) {
    return {
      id, hp: HERO_HP, tier: 1, reachedRound: 1, money: 0,
      deck: [], hand: [], board: [], discard: [], priv: [],
      bought: [], // čo nakúpil v tomto kole
      raceBuffs: {}, // permanentné aury: { beast: {a, h}, ... }
      tokenGrowth: {}, // trvalý rast tokenov: { mlada: {a, h} } – každé vyvolanie pridáva
      dmgBoost: 0, // trvalý bonus k damage výbojov a výbuchov (kúzlo Večná iskra)
      spellShop: null, // súkromný slot na kúzlo { defId, frozen } – neberie miesto príšerám
    };
  }

  function fillPrivate(state, pid) {
    const p = state[pid];
    while (p.priv.length < privateCount(p.tier)) {
      p.priv.push({ defId: rollCard(state, p.tier), frozen: false });
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
      state.commons[i] = rollCard(state, commonTierLimit(state));
    }
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.money = income(state.round);
      p.bought = [];
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
    checkEvolve(state, p, events);
    return events;
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
    for (;;) {
      const groups = {};
      const g = (defId, rank) =>
        (groups[defId + "|" + rank] ||= { board: [], hand: [], deck: [], discard: [], total: 0 });
      const countable = (defId, rank) =>
        rank < 3 && !Cards.byId[defId].spell && !Cards.byId[defId].token;
      for (const inst of p.board) {
        if (!inst.spell && countable(inst.defId, inst.rank)) { const e = g(inst.defId, inst.rank); e.board.push(inst); e.total++; }
      }
      for (const inst of p.hand) {
        if (!inst.spell && countable(inst.defId, inst.rank)) { const e = g(inst.defId, inst.rank); e.hand.push(inst); e.total++; }
      }
      p.deck.forEach((c, i) => { if (countable(c.defId, c.rank)) { const e = g(c.defId, c.rank); e.deck.push(i); e.total++; } });
      p.discard.forEach((c, i) => { if (countable(c.defId, c.rank)) { const e = g(c.defId, c.rank); e.discard.push(i); e.total++; } });

      const entry = Object.entries(groups).find(([, v]) => v.total >= 3);
      if (!entry) return;
      const [key, v] = entry;
      const defId = key.slice(0, key.lastIndexOf("|"));
      const rank = Number(key.slice(key.lastIndexOf("|") + 1));

      let need = 3, boardSlot = null, hidden = false;
      while (need > 0 && v.board.length) {
        const inst = v.board.shift();
        if (boardSlot === null) boardSlot = inst.slot;
        p.board.splice(p.board.indexOf(inst), 1);
        need--;
      }
      while (need > 0 && v.hand.length) {
        const inst = v.hand.shift();
        p.hand.splice(p.hand.indexOf(inst), 1);
        need--;
      }
      for (const idx of v.deck.reverse()) { // od najvyššieho indexu
        if (need <= 0) break;
        p.deck.splice(idx, 1);
        hidden = true;
        need--;
      }
      for (const idx of v.discard.reverse()) {
        if (need <= 0) break;
        p.discard.splice(idx, 1);
        hidden = true;
        need--;
      }

      let uid = null;
      if (boardSlot !== null) {
        const evolved = makeInst(state, defId, rank + 1, p);
        evolved.slot = boardSlot;
        p.board.push(evolved);
        sortBoard(p);
        uid = evolved.uid;
      } else if (p.hand.length < HAND_MAX) {
        const evolved = makeInst(state, defId, rank + 1, p);
        evolved.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(evolved);
        uid = evolved.uid;
      } else {
        addToDeckRef(state, p, defId, rank + 1);
      }
      events.push({ type: "evolve", pid: p.id, defId, rank: rank + 1, uid, hidden });
    }
  }

  // ---------- Obchod ----------
  function buyCommon(state, pid, idx) {
    const p = state[pid];
    if (idx >= state.commons.length) return null;
    const defId = state.commons[idx];
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events);
    p.bought.push(defId);
    state.commons[idx] = rollCard(state, commonTierLimit(state));
    return events;
  }

  function buyPrivate(state, pid, idx) {
    const p = state[pid];
    if (idx >= p.priv.length) return null;
    const defId = p.priv[idx].defId;
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events);
    p.bought.push(defId);
    p.priv[idx] = { defId: rollCard(state, p.tier), frozen: false };
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
  function acquireCard(state, p, defId, events) {
    addToDeck(state, p, defId);
    checkEvolve(state, p, events);
  }

  // Kúpená karta sa zamieša do balíčka (na náhodné miesto).
  function addToDeck(state, p, defId) {
    addToDeckRef(state, p, defId, 1);
  }

  function addToDeckRef(state, p, defId, rank) {
    const i = Math.floor(state.rng() * (p.deck.length + 1));
    p.deck.splice(i, 0, { defId, rank });
  }

  function refreshShop(state, pid) {
    const p = state[pid];
    if (p.money < REFRESH_COST) return null;
    p.money -= REFRESH_COST;
    for (let i = 0; i < state.commons.length; i++) {
      state.commons[i] = rollCard(state, commonTierLimit(state));
    }
    for (let i = 0; i < p.priv.length; i++) {
      if (!p.priv[i].frozen) p.priv[i] = { defId: rollCard(state, p.tier), frozen: false };
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
    return Math.max(0, base - (state.round - p.reachedRound));
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
  function playMinion(state, pid, handIdx) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || inst.spell || p.board.length >= BOARD_MAX) return null;
    p.hand.splice(handIdx, 1);
    inst.slot = freeSlot(p.board, BOARD_MAX);
    p.board.push(inst);
    sortBoard(p);
    const events = [{ type: "play", pid, uid: inst.uid, defId: inst.defId }];
    const def = Cards.byId[inst.defId];
    if (def.power && def.power.kw === "battlecry") {
      applyShopFx(state, p, def.power.fx, inst.rank, inst, events);
    }
    checkEvolve(state, p, events);
    return events;
  }

  // target: uid príšerky na vlastnej ploche (len pre buffTarget).
  function castSpell(state, pid, handIdx, targetUid) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || !inst.spell) return null;
    const def = Cards.byId[inst.defId];
    const fx = def.fx;
    if (fx.type === "buffTarget") {
      const target = p.board.find(x => x.uid === targetUid);
      if (!target) return null;
      p.hand.splice(handIdx, 1);
      buff(target, fx.a, fx.h);
      if (fx.taunt) target.taunt = true;
      p.discard.push({ defId: inst.defId, rank: 1 });
      return [{ type: "spell", pid, defId: inst.defId, targetUid }];
    }
    if (fx.type === "discover") {
      p.hand.splice(handIdx, 1);
      p.discard.push({ defId: inst.defId, rank: 1 });
      const options = [];
      for (let i = 0; i < 3; i++) options.push(rollCard(state, p.tier));
      state.pendingDiscover = { pid, options };
      return [{ type: "discoverStart", pid, options }];
    }
    // gold, buffAllFriends – bez cieľa
    p.hand.splice(handIdx, 1);
    p.discard.push({ defId: inst.defId, rank: 1 });
    const events = [{ type: "spell", pid, defId: inst.defId }];
    applyShopFx(state, p, fx, 1, null, events);
    return events;
  }

  function pickDiscover(state, pid, choiceIdx) {
    const pd = state.pendingDiscover;
    if (!pd || pd.pid !== pid || choiceIdx >= pd.options.length) return null;
    const defId = pd.options[choiceIdx];
    state.pendingDiscover = null;
    const p = state[pid];
    const inst = makeInst(state, defId, 1, p);
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
    p.discard.push({ defId: inst.defId, rank: inst.rank || 1 });
    return [{ type: "discard", pid, defId: inst.defId }];
  }

  function sellCard(state, pid, zone, idx) {
    const p = state[pid];
    if (zone !== "hand" && zone !== "board") return null;
    const inst = p[zone][idx];
    if (!inst) return null;
    p[zone].splice(idx, 1);
    p.money += SELL_GAIN;
    return [{ type: "sell", pid, defId: inst.defId }];
  }

  // Efekty použiteľné počas nákupnej fázy.
  function applyShopFx(state, p, fx, rank, self, events) {
    const m = rank;
    switch (fx.type) {
      case "buffFriend": {
        const friends = p.board.filter(x => x !== self);
        if (friends.length) {
          const f = pick(friends, state.rng);
          buff(f, fx.a * m, fx.h * m);
          events.push({ type: "buff", pid: p.id, uid: f.uid, a: fx.a * m, h: fx.h * m });
        }
        break;
      }
      case "buffAllFriends":
        for (const f of p.board) {
          if (f === self) continue;
          buff(f, fx.a * m, fx.h * m);
          events.push({ type: "buff", pid: p.id, uid: f.uid, a: fx.a * m, h: fx.h * m });
        }
        break;
      case "buffRace":
        // Rasová synergia: buffne všetky vlastné príšerky danej rasy (okrem seba).
        for (const f of p.board) {
          if (f === self || Cards.byId[f.defId].race !== fx.race) continue;
          buff(f, fx.a * m, fx.h * m);
          events.push({ type: "buff", pid: p.id, uid: f.uid, a: fx.a * m, h: fx.h * m });
        }
        break;
      case "growSelf":
        buff(self, fx.a * m, fx.h * m);
        events.push({ type: "buff", pid: p.id, uid: self.uid, a: fx.a * m, h: fx.h * m });
        break;
      case "draw":
        drawCards(state, p, fx.n * m, events);
        checkEvolve(state, p, events);
        break;
      case "gold":
        p.money += fx.n * m;
        events.push({ type: "gold", pid: p.id, n: fx.n * m });
        break;
      case "healHero":
        p.hp = Math.min(HERO_HP, p.hp + fx.n * m);
        events.push({ type: "heal", pid: p.id, n: fx.n * m });
        break;
      case "dmgBoost":
        // Trvalý bonus: všetky výboje (dmgWeakEnemy) a výbuchy (dmgAllEnemies)
        // hráča dávajú navždy +n damage. Kúzla sa stackujú.
        p.dmgBoost += fx.n * m;
        events.push({ type: "dmgBoost", pid: p.id, n: fx.n * m, total: p.dmgBoost });
        break;
      case "futureRace": {
        // Permanentná aura: VŠETKY príšerky danej rasy – aktuálne na ploche
        // a v ruke hneď, budúce inštancie (balíček, kôpka, tokeny) cez auru
        // pri vzniku.
        const cur = p.raceBuffs[fx.race] || { a: 0, h: 0 };
        p.raceBuffs[fx.race] = { a: cur.a + fx.a * m, h: cur.h + fx.h * m };
        for (const zone of ["board", "hand"]) {
          for (const f of p[zone]) {
            if (f.spell || Cards.byId[f.defId].race !== fx.race) continue;
            buff(f, fx.a * m, fx.h * m);
            events.push({ type: "buff", pid: p.id, uid: f.uid, a: fx.a * m, h: fx.h * m });
          }
        }
        events.push({ type: "futureBuff", pid: p.id, race: fx.race, a: fx.a * m, h: fx.h * m });
        break;
      }
    }
  }

  function buff(inst, a, h) {
    inst.atk += a;
    inst.maxHp += h;
    inst.hp += h;
  }

  // ---------- Koniec nákupnej fázy ----------
  function endShopTurn(state, pid) {
    const p = state[pid];
    const events = [];
    // Po nákupe (end of turn) schopnosti príšeriek na ploche.
    for (const inst of [...p.board]) {
      const def = Cards.byId[inst.defId];
      if (def.power && def.power.kw === "endTurn") {
        applyShopFx(state, p, def.power.fx, inst.rank, inst, events);
      }
    }
    // Nezahrané karty z ruky do discard pile.
    for (const inst of p.hand.splice(0)) {
      p.discard.push({ defId: inst.defId, rank: inst.rank || 1 });
    }
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
  function doBattle(state) {
    const events = [];
    const sides = {
      p1: state.p1.board.map(x => ({ ...x })),
      p2: state.p2.board.map(x => ({ ...x })),
    };
    let attacker =
      sides.p1.length > sides.p2.length ? "p1" :
      sides.p2.length > sides.p1.length ? "p2" :
      state.rng() < 0.5 ? "p1" : "p2";
    events.push({ type: "battleStart", first: attacker });

    const alive = pid => sides[pid].filter(x => x.hp > 0);

    // Pred bojom – začínajúca strana prvá.
    for (const pid of [attacker, other(attacker)]) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp <= 0) continue;
        const def = Cards.byId[inst.defId];
        if (def.power && def.power.kw === "startFight") {
          events.push({ type: "proc", pid, uid: inst.uid, kw: "startFight" });
          applyBattleFx(state, sides, pid, inst, def.power.fx, inst.rank, events);
        }
      }
    }

    const ptr = { p1: 0, p2: 0 };
    let guard = BATTLE_CAP;
    while (alive("p1").length && alive("p2").length && guard-- > 0) {
      const mine = sides[attacker];
      // Ďalší živý útočník v poradí (cyklicky).
      let a = null;
      for (let i = 0; i < mine.length; i++) {
        const cand = mine[(ptr[attacker] + i) % mine.length];
        if (cand.hp > 0) { a = cand; ptr[attacker] = (mine.indexOf(cand) + 1) % mine.length; break; }
      }
      if (!a) break;
      // Pri útoku – dočasný boost (platí len počas tohto boja).
      const aDef = Cards.byId[a.defId];
      if (aDef.power && aDef.power.kw === "onAttack") {
        events.push({ type: "proc", pid: attacker, uid: a.uid, kw: "onAttack" });
        applyBattleFx(state, sides, attacker, a, aDef.power.fx, a.rank, events);
      }
      const enemies = alive(other(attacker));
      const taunts = enemies.filter(x => x.taunt);
      const d = pick(taunts.length ? taunts : enemies, state.rng);
      events.push({ type: "attack", aPid: attacker, aUid: a.uid, dPid: other(attacker), dUid: d.uid, aDmg: a.atk, dDmg: d.atk });
      a.hp -= d.atk;
      d.hp -= a.atk;
      events.push({ type: "hp", pid: attacker, uid: a.uid, hp: a.hp });
      events.push({ type: "hp", pid: other(attacker), uid: d.uid, hp: d.hp });
      handleDeaths(state, sides, events);
      attacker = other(attacker);
    }

    // Vyhodnotenie.
    const s1 = alive("p1"), s2 = alive("p2");
    let winner = null, dmg = 0;
    if (s1.length && !s2.length) winner = "p1";
    if (s2.length && !s1.length) winner = "p2";
    if (winner) {
      dmg = alive(winner).reduce((sum, x) => sum + x.rank, 0);
      const loser = other(winner);
      state[loser].hp -= dmg;
      events.push({ type: "heroDmg", pid: loser, dmg, hp: state[loser].hp });
    } else {
      events.push({ type: "battleDraw" });
    }

    // Po boji ide VŠETKO (padlé aj preživšie karty) do discard pile a plocha
    // sa vyprázdni – každé kolo sa bojisko stavia nanovo. Tokeny miznú z hry.
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      for (const inst of p.board) {
        if (Cards.byId[inst.defId].token) continue;
        p.discard.push({ defId: inst.defId, rank: inst.rank });
        events.push({ type: "toDiscard", pid, defId: inst.defId });
      }
      p.board = [];
    }

    if (state.p1.hp <= 0 || state.p2.hp <= 0) {
      state.phase = "over";
      state.winner = state.p1.hp <= 0 && state.p2.hp <= 0 ? "draw"
        : state.p1.hp <= 0 ? "p2" : "p1";
      events.push({ type: "gameOver", winner: state.winner });
    } else {
      state.phase = "shop";
      events.push(...startRound(state));
      events.push({ type: "shopTurn", pid: state.active });
    }
    return events;
  }

  // Efekty v boji (Pred bojom / Pri smrti).
  function applyBattleFx(state, sides, pid, self, fx, rank, events) {
    const m = rank;
    switch (fx.type) {
      case "dmgWeakEnemy": {
        // Výboj mieri na NAJSLABŠIEHO (najmenej HP) nepriateľa – kosí tokeny
        // a nekŕmi zbytočne deathrattle telá. Evolve škáluje POČET zásahov
        // (1/2/3), nie silu; proti veľkým telám ostáva slabý (zámer).
        const hitDmg = fx.n + state[pid].dmgBoost;
        for (let i = 0; i < m; i++) {
          const enemies = sides[other(pid)].filter(x => x.hp > 0);
          if (!enemies.length) break;
          const minHp = Math.min(...enemies.map(x => x.hp));
          const t = pick(enemies.filter(x => x.hp === minHp), state.rng);
          t.hp -= hitDmg;
          events.push({ type: "powerDmg", pid: other(pid), uid: t.uid, n: hitDmg, from: self.uid });
          events.push({ type: "hp", pid: other(pid), uid: t.uid, hp: t.hp });
          handleDeaths(state, sides, events);
        }
        break;
      }
      case "dmgAllEnemies": {
        // Výbuch: jedna veľká vlna zasiahne všetkých živých nepriateľov NARAZ
        // (jeden event pre UI – žiadne projektily po jednom). Damage škáluje
        // so stupňom (×1/×2/×3) – držať base nízko, nech nevypne swarm úplne.
        const dmg = fx.n * m + state[pid].dmgBoost;
        const hits = [];
        for (const t of sides[other(pid)].filter(x => x.hp > 0)) {
          t.hp -= dmg;
          hits.push({ uid: t.uid, hp: t.hp });
        }
        if (hits.length) events.push({ type: "aoeDmg", pid: other(pid), n: dmg, from: self.uid, hits });
        handleDeaths(state, sides, events);
        break;
      }
      case "growSelf":
        self.atk += fx.a * m;
        self.maxHp += fx.h * m;
        self.hp += fx.h * m;
        events.push({ type: "buff", pid, uid: self.uid, a: fx.a * m, h: fx.h * m });
        break;
      case "buffAllFriends":
        for (const f of sides[pid]) {
          if (f === self || f.hp <= 0) continue;
          f.atk += fx.a * m;
          f.maxHp += fx.h * m;
          f.hp += fx.h * m;
          events.push({ type: "buff", pid, uid: f.uid, a: fx.a * m, h: fx.h * m });
        }
        break;
      case "buffRace":
        // Rasová synergia v boji – buffne živé príšerky rovnakej rasy.
        for (const f of sides[pid]) {
          if (f === self || f.hp <= 0 || Cards.byId[f.defId].race !== fx.race) continue;
          f.atk += fx.a * m;
          f.maxHp += fx.h * m;
          f.hp += fx.h * m;
          events.push({ type: "buff", pid, uid: f.uid, a: fx.a * m, h: fx.h * m });
        }
        break;
      case "summon": {
        // Evolvnutá karta vyvoláva SILNEJŠIE tokeny (stupeň rodiča: staty
        // ×2/×4), počet sa so stupňom neškáluje.
        // fx.grow: token navždy rastie – každé vyvolanie pridá hráčovi do
        // počítadla (tokenGrowth) +a/+h × stupeň; ďalší token je väčší.
        // Pretečenie (undead): token, čo sa nezmestí na plnú plochu, rozdelí
        // svoje staty medzi živé vlastné príšerky (rovným dielom, zvyšok náhodne).
        const board = sides[pid];
        const idx = board.indexOf(self);
        const p = state[pid];
        for (let i = 0; i < fx.n; i++) {
          const alive = board.filter(x => x.hp > 0);
          const full = alive.length >= BOARD_MAX;
          if (full && Cards.byId[fx.token].race !== "undead") break;
          const tok = makeInst(state, fx.token, Math.min(m, 3), p);
          // Nazbieraný rast dostane KAŽDÉ vyvolanie tokenu; počítadlo kŕmia
          // len karty s fx.grow (B007 deathrattle – rast má cenu smrti).
          const g = p.tokenGrowth[fx.token];
          if (g) {
            tok.atk += g.a;
            tok.hp += g.h;
            tok.maxHp += g.h;
          }
          if (fx.grow) {
            const cur = g || { a: 0, h: 0 };
            p.tokenGrowth[fx.token] = { a: cur.a + fx.grow.a * m, h: cur.h + fx.grow.h * m };
          }
          if (full) {
            overflowStats(state, alive, tok, pid, events);
            continue;
          }
          tok.slot = freeSlot(alive, BOARD_MAX);
          board.splice(idx + 1 + i, 0, tok);
          events.push({ type: "summon", pid, uid: tok.uid, defId: fx.token, slot: tok.slot, rank: tok.rank, atk: tok.atk, hp: tok.hp });
        }
        break;
      }
    }
  }

  // Pretečenie: staty nezmestivšieho sa tokenu sa rozdelia medzi živé vlastné
  // príšerky – rovným dielom, zvyšok dostanú náhodné (poradie z rng, aby bol
  // multiplayer deterministický). Dočasné ako všetky bojové buffy.
  function overflowStats(state, aliveList, tok, pid, events) {
    if (!aliveList.length) return;
    const order = shuffle(aliveList.slice(), state.rng);
    const n = order.length;
    const baseA = Math.floor(tok.atk / n), remA = tok.atk % n;
    const baseH = Math.floor(tok.hp / n), remH = tok.hp % n;
    events.push({ type: "overflow", pid, defId: tok.defId, atk: tok.atk, hp: tok.hp });
    order.forEach((f, i) => {
      const a = baseA + (i < remA ? 1 : 0);
      const h = baseH + (i < remH ? 1 : 0);
      if (!a && !h) return;
      f.atk += a;
      f.maxHp += h;
      f.hp += h;
      events.push({ type: "buff", pid, uid: f.uid, a, h });
    });
  }

  function handleDeaths(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0 || inst.dead) continue;
        inst.dead = true;
        // Poradie pre UI: proc badge + efekt kým je karta ešte vidno, potom smrť.
        const def = Cards.byId[inst.defId];
        if (def.power && def.power.kw === "deathrattle") {
          events.push({ type: "proc", pid, uid: inst.uid, kw: "deathrattle" });
          applyBattleFx(state, sides, pid, inst, def.power.fx, inst.rank, events);
        }
        events.push({ type: "die", pid, uid: inst.uid, defId: inst.defId });
      }
    }
  }

  return {
    HERO_HP, BOARD_MAX, HAND_DRAW, HAND_MAX, CARD_COST, SELL_GAIN, REFRESH_COST,
    TIER_MAX, privateCount, income, seededRng, cardCost,
    newGame, startRound, beginShopTurn, buyCommon, buyPrivate, buySpell, refreshShop,
    toggleFreeze, toggleFreezeAll, upgradeCost, upgradeTier, playMinion, castSpell, pickDiscover,
    sellCard, discardCard, moveOnBoard, endShopTurn, doBattle, checkEvolve, makeInst, commonTierLimit,
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
