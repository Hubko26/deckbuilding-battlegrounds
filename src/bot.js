// Heuristický bot. Hrá cez Engine API (nikdy neobchádza pravidlá) a vracia
// zoznam eventov, ktoré UI prehrá s pauzami, aby dieťa videlo, čo súper robí.
//
// Bot je vymeniteľný modul: UI volá len botTurn(state, pid, difficulty).
// Neskôr pribudne "Claude bot" – driver, ktorý pošle stav hry na lokálny
// server a vykoná akcie, ktoré vráti LLM (rovnaké Engine API).

const Bot = (() => {
  // Nastavenie obtiažnosti heuristiky.
  const DIFF = {
    easy: { randomBuy: true, upgradeAggro: 0, smartSpells: false },
    normal: { randomBuy: false, upgradeAggro: 1, smartSpells: true },
    hard: { randomBuy: false, upgradeAggro: 2, smartSpells: true },
  };

  // Koľko kópií karty bot vlastní (všade) – kvôli skladaniu trojíc.
  function ownedCount(p, defId) {
    let n = 0;
    for (const c of p.deck) if (c.defId === defId && c.rank === 1) n++;
    for (const c of p.discard) if (c.defId === defId && c.rank === 1) n++;
    for (const c of p.hand) if (c.defId === defId && c.rank === 1) n++;
    for (const c of p.board) if (c.defId === defId && c.rank === 1) n++;
    return n;
  }

  function cardScore(state, p, defId) {
    const def = Cards.byId[defId];
    let score = def.tier;
    const owned = ownedCount(p, defId);
    if (!def.spell) {
      if (owned === 2) score += 6;      // dokončí trojicu
      else if (owned === 1) score += 2; // rozbieha trojicu
    }
    if (def.spell) score += 0.5;
    // Rasová synergia: preferuj rasu, ktorej má bot na ploche najviac.
    if (def.race) {
      const same = p.board.filter(x => Cards.byId[x.defId].race === def.race).length;
      score += same * 0.4;
    }
    return score;
  }

  function botTurn(state, pid, difficulty) {
    const cfg = DIFF[difficulty] || DIFF.normal;
    const p = state[pid];
    const events = [];
    const push = ev => { if (ev) events.push(...ev); };

    // 1. Kúzla na peniaze zahraj hneď (viac na nákupy).
    playGoldSpells(state, p, push);

    // 2. Upgrade tieru podľa agresivity.
    for (;;) {
      const cost = Engine.upgradeCost(state, pid);
      if (cost === null) break;
      const worth =
        cfg.upgradeAggro === 0 ? cost === 0 :
        cfg.upgradeAggro === 1 ? (cost <= 1 || (p.money - cost >= Engine.CARD_COST && state.round >= p.tier * 2)) :
        (cost <= 2 || (p.money - cost >= Engine.CARD_COST && state.round >= p.tier * 2 - 1));
      if (!worth || p.money < cost) break;
      push(Engine.upgradeTier(state, pid));
    }

    // 3. Nakupuj, kým sú peniaze. Easy kupuje náhodne, inak podľa skóre.
    let guard = 20;
    while (p.money >= Engine.CARD_COST && guard-- > 0) {
      const options = [];
      state.commons.forEach((defId, i) => options.push({ kind: "common", i, defId }));
      p.priv.forEach((s, i) => options.push({ kind: "priv", i, defId: s.defId }));
      if (!options.length) break;
      let choice;
      if (cfg.randomBuy) {
        choice = options[Math.floor(state.rng() * options.length)];
      } else {
        options.sort((a, b) => cardScore(state, p, b.defId) - cardScore(state, p, a.defId));
        choice = options[0];
      }
      push(choice.kind === "common"
        ? Engine.buyCommon(state, pid, choice.i)
        : Engine.buyPrivate(state, pid, choice.i));
    }

    // 4. Zahraj kúzla a príšerky z ruky.
    playGoldSpells(state, p, push); // mohla prísť ďalšia minca z draw
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || !inst.spell) continue;
      const fx = Cards.byId[inst.defId].fx;
      if (fx.type === "buffTarget" && p.board.length) {
        const target = cfg.smartSpells
          ? [...p.board].sort((a, b) => b.atk - a.atk)[0]
          : p.board[Math.floor(state.rng() * p.board.length)];
        push(Engine.castSpell(state, pid, i, target.uid));
      } else if (fx.type === "buffAllFriends" && p.board.length >= (cfg.smartSpells ? 2 : 1)) {
        push(Engine.castSpell(state, pid, i));
      } else if (fx.type === "discover") {
        push(Engine.castSpell(state, pid, i));
        if (state.pendingDiscover) {
          const opts = state.pendingDiscover.options;
          let bestIdx = Math.floor(state.rng() * opts.length);
          if (cfg.smartSpells) {
            bestIdx = 0;
            opts.forEach((d, j) => { if (cardScore(state, p, d) > cardScore(state, p, opts[bestIdx])) bestIdx = j; });
          }
          push(Engine.pickDiscover(state, pid, bestIdx));
        }
      }
    }
    // Príšerky: najsilnejšie prvé (easy náhodne), kým je miesto.
    guard = 20;
    while (p.board.length < Engine.BOARD_MAX && guard-- > 0) {
      const minions = p.hand
        .map((inst, i) => ({ inst, i }))
        .filter(x => x.inst && !x.inst.spell);
      if (!minions.length) break;
      let choice;
      if (cfg.randomBuy) choice = minions[Math.floor(state.rng() * minions.length)];
      else choice = minions.sort((a, b) => (b.inst.atk + b.inst.hp) - (a.inst.atk + a.inst.hp))[0];
      push(Engine.playMinion(state, pid, choice.i));
    }

    push(Engine.endShopTurn(state, pid));
    return events;
  }

  function playGoldSpells(state, p, push) {
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (inst && inst.spell && Cards.byId[inst.defId].fx.type === "gold") {
        push(Engine.castSpell(state, p.id, i));
      }
    }
  }

  return { botTurn, ownedCount, cardScore };
})();

if (typeof module !== "undefined") module.exports = Bot;
