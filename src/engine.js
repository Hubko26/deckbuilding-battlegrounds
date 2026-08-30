// Herná logika bez DOM. Všetka náhoda ide cez state.rng (injektovaná funkcia),
// takže testy sú deterministické. Funkcie vracajú zoznam eventov pre UI animácie.

const Engine = (() => {
  const HERO_HP = 25;
  const BOARD_MAX = 5;
  const HAND_DRAW = 5;
  const HAND_MAX = 8;
  const CARD_COST = 3;
  const SELL_GAIN = 1;
  const REFRESH_COST = 2;
  const COMMON_COUNT = 3;
  const TIER_MAX = 6;
  const TIER_BASE_COST = { 2: 5, 3: 7, 4: 8, 5: 9, 6: 10 };
  const BATTLE_CAP = 200; // poistka proti nekonečnému boju

  const privateCount = tier => Math.min(tier + 1, 6);
  const income = round => Math.min(round + 2, 10);

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

  function makeInst(state, defId, rank) {
    const def = Cards.byId[defId];
    if (def.spell) return { uid: ++state.uidSeq, defId, rank: 1, spell: true };
    const m = Cards.STAT_MULT[rank];
    return {
      uid: ++state.uidSeq, defId, rank,
      atk: def.atk * m, hp: def.hp * m, maxHp: def.hp * m,
      taunt: !!def.taunt,
    };
  }

  // Náhodná karta z obchodného poolu (bez tokenov), tier <= limit.
  // classes: zoznam povolených class (null = neutrál je povolený vždy).
  function rollCard(state, tierLimit, classes) {
    const pool = Cards.DEFS.filter(d =>
      d.tier <= tierLimit && (d.cls === null || classes.includes(d.cls)));
    return pick(pool, state.rng).id;
  }

  function other(pid) { return pid === "p1" ? "p2" : "p1"; }

  // ---------- Založenie hry ----------
  function newGame(p1Class, p2Class, rng) {
    const state = {
      rng, uidSeq: 0, round: 0, phase: "shop", active: null, first: "p1",
      commons: [], winner: null, pendingDiscover: null,
      p1: makePlayer("p1", p1Class),
      p2: makePlayer("p2", p2Class),
    };
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.deck = Cards.STARTERS[p.cls].map(id => ({ defId: id, rank: 1 }));
      shuffle(p.deck, rng);
    }
    for (let i = 0; i < COMMON_COUNT; i++) state.commons.push(rollCard(state, 1, []));
    fillPrivate(state, "p1");
    fillPrivate(state, "p2");
    return state;
  }

  function makePlayer(id, cls) {
    return {
      id, cls, hp: HERO_HP, tier: 1, reachedRound: 1, money: 0,
      deck: [], hand: [], board: [], discard: [], priv: [],
      bought: [], // čo nakúpil v tomto kole – súper to vidí
    };
  }

  function fillPrivate(state, pid) {
    const p = state[pid];
    while (p.priv.length < privateCount(p.tier)) {
      p.priv.push({ defId: rollCard(state, p.tier, [p.cls]), frozen: false });
    }
  }

  function commonTierLimit(state) {
    return Math.max(state.p1.tier, state.p2.tier);
  }

  // ---------- Kolo a nákupná fáza ----------
  function startRound(state) {
    state.round++;
    state.first = state.round % 2 === 1 ? "p1" : "p2";
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.money = income(state.round);
      p.bought = [];
      fillPrivate(state, pid);
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
      const inst = makeInst(state, c.defId, c.rank);
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: c.defId });
    }
  }

  // ---------- Evolve ----------
  // 3 rovnaké (karta + stupeň) na ploche + v ruke → automaticky vyšší stupeň.
  function checkEvolve(state, p, events) {
    for (;;) {
      const groups = {};
      for (const zone of ["board", "hand"]) {
        for (const inst of p[zone]) {
          if (inst.spell || Cards.byId[inst.defId].token || inst.rank >= 3) continue;
          (groups[inst.defId + "|" + inst.rank] ||= []).push({ zone, inst });
        }
      }
      const trio = Object.values(groups).find(g => g.length >= 3);
      if (!trio) return;
      const [a, b, c] = trio;
      const { defId, rank } = a.inst;
      const evolved = makeInst(state, defId, rank + 1);
      // Výsledok ide na plochu, ak tam bola aspoň jedna kópia; inak do ruky.
      const boardCopy = trio.slice(0, 3).find(x => x.zone === "board");
      for (const x of trio.slice(0, 3)) {
        p[x.zone].splice(p[x.zone].indexOf(x.inst), 1);
      }
      if (boardCopy) {
        evolved.slot = boardCopy.inst.slot;
        p.board.push(evolved);
      } else {
        evolved.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(evolved);
      }
      events.push({ type: "evolve", pid: p.id, defId, rank: rank + 1, uid: evolved.uid });
    }
  }

  // ---------- Obchod ----------
  function buyCommon(state, pid, idx) {
    const p = state[pid];
    if (p.money < CARD_COST || idx >= state.commons.length) return null;
    const defId = state.commons[idx];
    p.money -= CARD_COST;
    addToDeck(state, p, defId);
    p.bought.push(defId);
    state.commons[idx] = rollCard(state, commonTierLimit(state), []);
    return [{ type: "buy", pid, defId }];
  }

  function buyPrivate(state, pid, idx) {
    const p = state[pid];
    if (p.money < CARD_COST || idx >= p.priv.length) return null;
    const defId = p.priv[idx].defId;
    p.money -= CARD_COST;
    addToDeck(state, p, defId);
    p.bought.push(defId);
    p.priv[idx] = { defId: rollCard(state, p.tier, [p.cls]), frozen: false };
    return [{ type: "buy", pid, defId }];
  }

  // Kúpená karta sa zamieša do balíčka (na náhodné miesto).
  function addToDeck(state, p, defId) {
    const i = Math.floor(state.rng() * (p.deck.length + 1));
    p.deck.splice(i, 0, { defId, rank: 1 });
  }

  function refreshShop(state, pid) {
    const p = state[pid];
    if (p.money < REFRESH_COST) return null;
    p.money -= REFRESH_COST;
    for (let i = 0; i < state.commons.length; i++) {
      state.commons[i] = rollCard(state, commonTierLimit(state), []);
    }
    for (let i = 0; i < p.priv.length; i++) {
      if (!p.priv[i].frozen) p.priv[i] = { defId: rollCard(state, p.tier, [p.cls]), frozen: false };
    }
    return [{ type: "refresh", pid }];
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
      for (let i = 0; i < 3; i++) options.push(rollCard(state, p.tier, [p.cls]));
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
    const inst = makeInst(state, defId, 1);
    inst.slot = freeSlot(p.hand, HAND_MAX);
    p.hand.push(inst);
    const events = [{ type: "discoverPick", pid, defId }];
    checkEvolve(state, p, events);
    return events;
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

    // Zápis do reálnych plôch: preživší ostávajú (vyliečení), padlí do discard,
    // padlé tokeny miznú, preživšie tokeny ostávajú na ploche.
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      const survivors = new Set(alive(pid).map(x => x.uid));
      const newBoard = [];
      for (const battleInst of sides[pid]) {
        const real = p.board.find(x => x.uid === battleInst.uid);
        if (survivors.has(battleInst.uid)) {
          if (real) { real.hp = real.maxHp; newBoard.push(real); }
          else if (newBoard.length < BOARD_MAX) {
            battleInst.hp = battleInst.maxHp;
            newBoard.push(battleInst); // token, ktorý prežil
          }
        } else if (real && !Cards.byId[real.defId].token) {
          p.discard.push({ defId: real.defId, rank: real.rank });
          events.push({ type: "toDiscard", pid, defId: real.defId });
        }
      }
      p.board = newBoard;
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
      case "dmgRandomEnemy": {
        const enemies = sides[other(pid)].filter(x => x.hp > 0);
        if (!enemies.length) break;
        const t = pick(enemies, state.rng);
        t.hp -= fx.n * m;
        events.push({ type: "powerDmg", pid: other(pid), uid: t.uid, n: fx.n * m, from: self.uid });
        events.push({ type: "hp", pid: other(pid), uid: t.uid, hp: t.hp });
        handleDeaths(state, sides, events);
        break;
      }
      case "growSelf":
        self.atk += fx.a * m;
        self.maxHp += fx.h * m;
        self.hp += fx.h * m;
        events.push({ type: "buff", pid, uid: self.uid, a: fx.a * m, h: fx.h * m });
        break;
      case "summon": {
        const board = sides[pid];
        const idx = board.indexOf(self);
        for (let i = 0; i < fx.n * m; i++) {
          const alive = board.filter(x => x.hp > 0);
          if (alive.length >= BOARD_MAX) break;
          const tok = makeInst(state, fx.token, 1);
          tok.slot = freeSlot(alive, BOARD_MAX);
          board.splice(idx + 1 + i, 0, tok);
          events.push({ type: "summon", pid, uid: tok.uid, defId: fx.token, slot: tok.slot });
        }
        break;
      }
    }
  }

  function handleDeaths(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0 || inst.dead) continue;
        inst.dead = true;
        events.push({ type: "die", pid, uid: inst.uid, defId: inst.defId });
        const def = Cards.byId[inst.defId];
        if (def.power && def.power.kw === "deathrattle") {
          applyBattleFx(state, sides, pid, inst, def.power.fx, inst.rank, events);
        }
      }
    }
  }

  return {
    HERO_HP, BOARD_MAX, HAND_DRAW, HAND_MAX, CARD_COST, SELL_GAIN, REFRESH_COST,
    TIER_MAX, privateCount, income,
    newGame, startRound, beginShopTurn, buyCommon, buyPrivate, refreshShop,
    toggleFreeze, upgradeCost, upgradeTier, playMinion, castSpell, pickDiscover,
    sellCard, endShopTurn, doBattle, checkEvolve, makeInst, commonTierLimit,
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
