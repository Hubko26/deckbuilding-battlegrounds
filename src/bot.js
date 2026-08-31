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

  // Počet vlastnených príšer podľa rasy – vo VŠETKÝCH zónach (plocha je po
  // boji vždy prázdna, takže rátať len ju nedáva zmysel).
  function ownedRaceCounts(p) {
    const counts = {};
    const add = defId => {
      const r = Cards.byId[defId].race;
      if (r) counts[r] = (counts[r] || 0) + 1;
    };
    for (const c of p.deck) add(c.defId);
    for (const c of p.discard) add(c.defId);
    for (const x of p.hand) if (!x.spell) add(x.defId);
    for (const x of p.board) add(x.defId);
    return counts;
  }

  // Počet kúziel vo všetkých zónach – kvôli hodnote víl („Po kúzle“).
  function ownedSpellCount(p) {
    let n = 0;
    for (const c of p.deck) if (Cards.byId[c.defId].spell) n++;
    for (const c of p.discard) if (Cards.byId[c.defId].spell) n++;
    for (const x of p.hand) if (x.spell) n++;
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
    const races = ownedRaceCounts(p);
    if (def.race) {
      // drž sa dominantnej rasy
      score += (races[def.race] || 0) * 0.5;
    }
    if (def.power) {
      const fx = def.power.fx;
      // aury permanentne zväčšujú celý balíček – kupuj skoro a rád
      if (fx.type === "futureRace") score += 2 + (races[fx.race] || 0) * 0.7;
      if (fx.type === "buffRace") score += (races[fx.race] || 0) * 0.4;
      // víly („Po kúzle“) rastú s počtom kúziel v balíčku
      if (def.power.kw === "afterSpell") score += ownedSpellCount(p) * 0.4;
    }
    if (def.spell) {
      // lacné kúzla = dobrá hodnota; Minca (1g → +2g) je takmer vždy dobrá
      score += (3 - Engine.cardCost(defId)) * 0.8;
      if (def.fx.type === "gold") score += 1.5;
      // víly na kúzla reagujú („Po kúzle“) – kúzla sú s nimi hodnotnejšie
      score += (races.fairy || 0) * 0.5;
      // Večná iskra škáluje s počtom vlastných elementálov (výboje/výbuchy)
      if (def.fx.type === "dmgBoost") score += (races.elemental || 0) * 0.6;
    }
    return score;
  }

  // Battlecry buffery hraj až po ostatných – zasiahnu plnú plochu.
  function isBattlecryBuffer(defId) {
    const pw = Cards.byId[defId].power;
    return !!pw && pw.kw === "battlecry" &&
      ["buffRace", "buffAllFriends", "buffFriend", "futureRace"].includes(pw.fx.type);
  }

  function botTurn(state, pid, difficulty) {
    const cfg = DIFF[difficulty] || DIFF.normal;
    const p = state[pid];
    const events = [];
    const push = ev => { if (ev) events.push(...ev); };

    // 0. Príšerky na plochu HNEĎ – víly („Po kúzle“) tak zachytia triggery
    //    zo všetkých kúziel zahraných v tomto ťahu.
    deployMinions(state, p, cfg, push);

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
    while (guard-- > 0) {
      const options = [];
      state.commons.forEach((defId, i) => options.push({ kind: "common", i, defId }));
      p.priv.forEach((s, i) => options.push({ kind: "priv", i, defId: s.defId }));
      if (p.spellShop) options.push({ kind: "spell", i: 0, defId: p.spellShop.defId });
      const affordable = options.filter(o => Engine.cardCost(o.defId) <= p.money);
      if (!affordable.length) break;
      options.length = 0;
      options.push(...affordable);
      let choice;
      if (cfg.randomBuy) {
        choice = options[Math.floor(state.rng() * options.length)];
      } else {
        options.sort((a, b) => cardScore(state, p, b.defId) - cardScore(state, p, a.defId));
        choice = options[0];
      }
      push(choice.kind === "common" ? Engine.buyCommon(state, pid, choice.i)
        : choice.kind === "priv" ? Engine.buyPrivate(state, pid, choice.i)
        : Engine.buySpell(state, pid));
    }

    // 4a. Kúzla, ktoré dávajú zdroje/karty (pred vykladaním).
    playGoldSpells(state, p, push); // mohla prísť ďalšia minca z draw
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || !inst.spell) continue;
      if (Cards.byId[inst.defId].fx.type === "discover") {
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

    // 4b. Príšerky dokúpené/dotiahnuté počas ťahu (zvyšok ruky).
    deployMinions(state, p, cfg, push);

    // 4c. Buff kúzla až po vyložení – cieľ = najsilnejšia príšera.
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || !inst.spell) continue;
      const fx = Cards.byId[inst.defId].fx;
      if (fx.type === "buffTarget" && p.board.length) {
        const target = cfg.smartSpells
          ? [...p.board].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0]
          : p.board[Math.floor(state.rng() * p.board.length)];
        push(Engine.castSpell(state, pid, i, target.uid));
      } else if (fx.type === "buffAllFriends" && p.board.length >= (cfg.smartSpells ? 2 : 1)) {
        push(Engine.castSpell(state, pid, i));
      } else if (fx.type === "silence" || fx.type === "dmgBoost" || fx.type === "hex") {
        push(Engine.castSpell(state, pid, i)); // bez cieľa, vždy hodnota
      }
    }

    push(Engine.endShopTurn(state, pid));
    return events;
  }

  // Vyloženie príšer: obyčajné prvé (najsilnejšie), battlecry buffery na
  // koniec, aby zasiahli plnú plochu. Easy hrá náhodne.
  function deployMinions(state, p, cfg, push) {
    let guard = 20;
    while (p.board.length < Engine.BOARD_MAX && guard-- > 0) {
      const minions = p.hand
        .map((inst, i) => ({ inst, i }))
        .filter(x => x.inst && !x.inst.spell);
      if (!minions.length) break;
      let choice;
      if (cfg.randomBuy) {
        choice = minions[Math.floor(state.rng() * minions.length)];
      } else {
        minions.sort((a, b) => {
          const ba = isBattlecryBuffer(a.inst.defId) ? 1 : 0;
          const bb = isBattlecryBuffer(b.inst.defId) ? 1 : 0;
          if (ba !== bb) return ba - bb; // buffery neskôr
          return (b.inst.atk + b.inst.hp) - (a.inst.atk + a.inst.hp);
        });
        choice = minions[0];
      }
      push(Engine.playMinion(state, p.id, choice.i));
    }
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
