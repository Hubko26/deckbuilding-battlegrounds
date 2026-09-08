// Heuristický bot. Hrá cez Engine API (nikdy neobchádza pravidlá) a vracia
// zoznam eventov, ktoré UI prehrá s pauzami, aby dieťa videlo, čo súper robí.
//
// Bot je vymeniteľný modul: UI volá len botTurn(state, pid, difficulty).
// "Claude bot" (src/claude-bot.js) je iný driver nad rovnakým Engine API.

const Bot = (() => {
  // Nastavenie obtiažnosti heuristiky.
  // refreshHunt: koľkokrát za ťah smie bot refreshnúť obchod, keď mu po
  // nákupoch ostávajú peniaze. raceFocus: váha držania sa dominantnej rasy.
  // buyBar: hard nekupuje kartu so skóre pod (tier + buyBar), kým môže
  // refreshovať – relatívne k tieru, nech nerefreshuje donekonečna.
  // sellJunk / swapBoard / orderBoard / freeze: „ľudské" návyky z logov
  // vyhraných hier (predaj balastu, výmena slabého tela, poradie útoku).
  const DIFF = {
    easy: { randomBuy: true, upgradeAggro: 0, smartSpells: false, refreshHunt: 0, raceFocus: 0.5, buyBar: 0 },
    normal: { randomBuy: false, upgradeAggro: 1, smartSpells: true, refreshHunt: 0, raceFocus: 0.5, buyBar: 0 },
    hard: {
      randomBuy: false, upgradeAggro: 2, smartSpells: true, refreshHunt: 3, raceFocus: 1.0, buyBar: 3,
      sellJunk: true, swapBoard: true, orderBoard: true, freeze: true, raceHunt: true,
    },
  };

  // Od tohto kola sa bot zafixuje na dominantnú rasu (predtým skladá, čo príde).
  const RACE_LOCK_ROUND = 3;
  // Podporné rasy: nikdy nie sú hlavný build. Draci = žoldnieri s battlecry
  // pre rasu cieľa, ogri = veľké telá na doplnenie plochy. Log Claude bota:
  // O004×3 + O001×2 spravili z ogrov „dominantnú rasu" a build sa rozpadol.
  const SUPPORT_RACES = new Set(["dragon", "ogre"]);
  // Koľko kúziel v balíčku toleruje ne-vílový build – kúzla nedávajú telá.
  const SPELL_CAP = 2;

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
  // boji vždy prázdna, takže rátať len ju nedáva zmysel). Draci sa nerátajú –
  // sú žoldnieri pre každý build, nemajú tvoriť „dominantnú rasu".
  function ownedRaceCounts(p) {
    const counts = {};
    const add = defId => {
      const d = Cards.byId[defId];
      if (d.race && !d.token) counts[d.race] = (counts[d.race] || 0) + 1;
    };
    for (const c of p.deck) add(c.defId);
    for (const c of p.discard) add(c.defId);
    for (const x of p.hand) if (!x.spell) add(x.defId);
    for (const x of p.board) add(x.defId);
    return counts;
  }

  // Dominantná rasa: od RACE_LOCK_ROUND najpočetnejšia HLAVNÁ rasa (beast,
  // elemental, undead, fairy; aspoň 3 kusy), inak null – bot ešte len skladá.
  function dominantRace(state, p) {
    if (state.round < RACE_LOCK_ROUND) return null;
    const counts = ownedRaceCounts(p);
    for (const r of SUPPORT_RACES) delete counts[r];
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 3 ? top[0] : null;
  }

  // Počet kúziel vo všetkých zónach – kvôli hodnote víl („Po kúzle“).
  function ownedSpellCount(p) {
    let n = 0;
    for (const c of p.deck) if (Cards.byId[c.defId].spell) n++;
    for (const c of p.discard) if (Cards.byId[c.defId].spell) n++;
    for (const x of p.hand) if (x.spell) n++;
    return n;
  }

  function cardScore(state, p, defId, cfg) {
    const def = Cards.byId[defId];
    let score = def.tier;
    const owned = ownedCount(p, defId);
    if (!def.spell) {
      if (owned === 2) score += 6;      // dokončí trojicu
      else if (owned === 1) score += 2; // rozbieha trojicu
    }
    const races = ownedRaceCounts(p);
    const dom = dominantRace(state, p);
    if (def.race) {
      // drž sa dominantnej rasy (hard drží silnejšie)
      score += (races[def.race] || 0) * ((cfg && cfg.raceFocus) || 0.5);
      // Po zafixovaní rasy: vlastná +3, cudzia −3; podporné rasy miernejšie
      // (drak neutrálny – jeho battlecry živí moju rasu; ogr −1 – telo nad
      // krivkou je ok ako doplnok, nie ako plán). Trojica (+6) to preváži.
      if (dom) {
        if (def.race === dom) score += 3;
        else if (def.race === "ogre") score -= 1;
        else if (def.race !== "dragon") score -= 3;
      }
    }
    if (def.power) {
      const fx = def.power.fx;
      // aury permanentne zväčšujú celý balíček – kupuj skoro a rád
      if (fx.type === "futureRace") score += 2 + (races[fx.race] || 0) * 0.7;
      // F008: permanentná aura pre všetky rasy – vždy dobrá, s kúzlami lepšia
      if (fx.type === "futureAll") score += 3 + ownedSpellCount(p) * 0.4;
      if (fx.type === "buffRace") score += (races[fx.race] || 0) * 0.4;
      // draci, ktorí zosilňujú RASU cieľa – s dominantnou rasou majú do čoho
      if (dom && (fx.type === "futureRaceOf" || fx.type === "buffRaceOf")) score += 2;
      // víly („Po kúzle“) rastú s počtom kúziel v balíčku
      if (def.power.kw === "afterSpell") score += ownedSpellCount(p) * 0.4;
      // Iskrička z battlecry kŕmi Po kúzle víly – hodnotnejšia s vílami
      if (def.power.fx.type === "addSpell") score += 1 + (races.fairy || 0) * 0.5;
      // D007 / E007 (Živelná sila na tele) – cennejší s elementálmi
      if (fx.type === "dmgBoost") score += (races.elemental || 0) * 0.6;
      // U002 (kostíky +1/+1 v boji) – cenný s vyvolávačmi kostíkov
      if (fx.type === "fightToken") score += ["U001", "U005", "U006", "U009"].reduce((n, id) => n + ownedCount(p, id), 0) * 0.6;
      // Token scavenger (B004 „Keď zomrie tvoje Mláďa") – cenný len s vyvolávačmi Mláďaťa
      if (def.power.kw === "tokenDeath") score += (ownedCount(p, "B007") + ownedCount(p, "B005")) * 0.8;
    }
    if (def.spell) {
      const spells = ownedSpellCount(p);
      // lacné kúzla = dobrá hodnota; Minca (1g → +2g) je takmer vždy dobrá
      score += (3 - Engine.cardCost(defId)) * 0.8;
      if (def.fx.type === "gold" || def.fx.type === "goldLater") score += 1.5;
      // draw cykluje k príšerám – cennejší, čím viac kúziel balíček riedi
      if (def.fx.type === "draw") score += 1 + spells * 0.2;
      // Živelná sila škáluje s počtom vlastných elementálov
      if (def.fx.type === "dmgBoost") score += (races.elemental || 0) * 0.6;
      // Kúzla nedávajú telá: víly ich premieňajú na rast (bonus), ostatní
      // majú strop – každé kúzlo nad SPELL_CAP vytláča z ruky príšerku.
      if (dom === "fairy" || (!dom && races.fairy >= 2)) score += (races.fairy || 0) * 0.5;
      else score -= Math.max(0, spells + 1 - SPELL_CAP) * 3;
    }
    return score;
  }

  // „Relevantná" karta pre lov rasy: tretia kópia, alebo príšera dominantnej
  // rasy s tierom aspoň (môj tier − 1) alebo s Pečaťou/motorom (schopnosťou).
  // t1 vanilla vlastnej rasy na tieri 4 relevantná nie je – človek refreshne.
  function isWanted(state, p, defId, dom) {
    const def = Cards.byId[defId];
    if (def.spell) return false;
    if (ownedCount(p, defId) === 2) return true;
    if (!dom || def.race !== dom) return false;
    return def.tier >= Math.max(1, p.tier - 1) || !!def.power;
  }

  // Battlecry buffery hraj až po ostatných – zasiahnu plnú plochu.
  function isBattlecryBuffer(defId) {
    const pw = Cards.byId[defId].power;
    return !!pw && pw.kw === "battlecry" &&
      ["buffRace", "buffAllFriends", "buffFriend", "futureRace"].includes(pw.fx.type);
  }

  // Hodnota tela na ploche/v ruke pre výmeny: staty + niečo za schopnosť.
  function bodyValue(inst) {
    const def = Cards.byId[inst.defId];
    return inst.atk + inst.hp + (def.power ? 2 : 0) + (inst.taunt ? 1 : 0);
  }

  // „Balast": telo, ktoré sa neoplatí držať v cykle balíčka – 0 útoku
  // (prehratý hod mincou), alebo po zafixovaní rasy cudzia nízka karta bez
  // šance na trojicu. Trojice a draci nie sú balast.
  function isJunk(state, p, inst) {
    const def = Cards.byId[inst.defId];
    if (def.token) return false;
    if (inst.atk === 0) return true;
    const dom = dominantRace(state, p);
    // Pár cudzej rasy sa oplatí držať len kým je t1 telo relevantné – od
    // tieru 3 je aj strieborná t1 karta balast (log: O004×2 v undead builde).
    return !!dom && def.race !== dom && def.race !== "dragon" && def.tier <= 2 &&
      inst.rank === 1 && (ownedCount(p, inst.defId) < 2 || p.tier >= 3);
  }

  function botTurn(state, pid, difficulty) {
    const cfg = DIFF[difficulty] || DIFF.normal;
    const p = state[pid];
    const events = [];
    const push = ev => { if (ev) events.push(...ev); };

    // 0. Hard: balast z ruky predaj EŠTE PRED vyložením (+1 zlato, tenší
    //    balíček = lepšie ruky do konca hry). Štartovací balíček je 10
    //    náhodných t1 kariet – človek ich postupne vypredá, bot musí tiež.
    //    Obetuje najviac 1 slot plochy za ťah (ostane aspoň 4 tiel).
    if (cfg.sellJunk) sellJunk(state, p, push, true);
    //    Príšerky na plochu HNEĎ – víly („Po kúzle“) tak zachytia triggery
    //    zo všetkých kúziel zahraných v tomto ťahu.
    deployMinions(state, p, cfg, push);

    // 0b. Hard: čo ostalo v ruke po zaplnení plochy – silnejšie telo vymeň za
    //     najslabšie na ploche (predaj + vylož), balast predaj (+1 zlato,
    //     tenší balíček). Pred nákupmi, nech peniaze z predaja idú do obchodu.
    if (cfg.swapBoard) swapWeakBodies(state, p, push);
    if (cfg.sellJunk) sellJunk(state, p, push);

    // 1. Kúzla na peniaze zahraj hneď (viac na nákupy).
    playGoldSpells(state, p, push);

    // 2. Upgrade tieru podľa agresivity. Hard: aj celé zlato do upgradu, keď
    //    je plocha už plná (tento boj nákup neovplyvní) – ako ľudský hráč;
    //    naopak s deravou plochou (< 4 tiel) upgrade počká, telá majú prednosť.
    for (;;) {
      const cost = Engine.upgradeCost(state, pid);
      if (cost === null) break;
      const onSchedule = state.round >= p.tier * 2 - 1;
      const worth =
        cfg.upgradeAggro === 0 ? cost === 0 :
        cfg.upgradeAggro === 1 ? (cost <= 1 || (p.money - cost >= Engine.CARD_COST && state.round >= p.tier * 2)) :
        (cost <= 2 || (onSchedule && (p.board.length >= Engine.BOARD_MAX ||
          (p.money - cost >= Engine.CARD_COST && p.board.length >= Engine.BOARD_MAX - 1))));
      if (!worth || p.money < cost) break;
      push(Engine.upgradeTier(state, pid));
    }

    // 3. Nakupuj, kým sú peniaze. Easy kupuje náhodne, inak podľa skóre.
    //    Hard: keď je aj najlepšia ponuka pod latkou (tier + buyBar) a ostáva
    //    na refresh + kartu, refreshne a hľadá lepšie – ale len refreshHunt-krát,
    //    každý refresh je tretina príšerky.
    const bar = cfg.buyBar ? p.tier + cfg.buyBar : 0;
    let rerolls = cfg.refreshHunt || 0;
    let bestUnaffordable = null; // kandidát na freeze
    const dom = dominantRace(state, p);
    for (;;) {
      let guard = 20;
      while (guard-- > 0) {
        const options = [];
        state.commons.forEach((defId, i) => options.push({ kind: "common", i, defId }));
        p.priv.forEach((s, i) => options.push({ kind: "priv", i, defId: s.defId }));
        if (p.spellShop) options.push({ kind: "spell", i: 0, defId: p.spellShop.defId });
        if (!cfg.randomBuy) options.sort((a, b) => cardScore(state, p, b.defId, cfg) - cardScore(state, p, a.defId, cfg));
        // Lov rasy (hard): keď v ponuke nie je relevantná karta mojej rasy
        // ani trojica, radšej refreshni než kupovať t1 telá „lebo sú moje".
        if (cfg.raceHunt && dom && rerolls > 0 && p.money >= Engine.refreshCost(state) + Engine.CARD_COST &&
            !options.some(o => isWanted(state, p, o.defId, dom))) break;
        const affordable = options.filter(o => Engine.cardCost(o.defId) <= p.money);
        if (!affordable.length) {
          bestUnaffordable = options.find(o => o.kind !== "common") || null;
          break;
        }
        let choice;
        if (cfg.randomBuy) {
          choice = affordable[Math.floor(state.rng() * affordable.length)];
        } else {
          choice = affordable[0];
          const best = cardScore(state, p, choice.defId, cfg);
          if (rerolls > 0 && p.money >= Engine.refreshCost(state) + Engine.CARD_COST && best < bar) break;
          // Zvyšné zlato nemíňaj na kartu so záporným skóre (kúzlo nad strop,
          // cudzia rasa) – balast v balíčku je horší než prepadnuté zlato.
          if (best < 0) break;
        }
        push(choice.kind === "common" ? Engine.buyCommon(state, pid, choice.i)
          : choice.kind === "priv" ? Engine.buyPrivate(state, pid, choice.i)
          : Engine.buySpell(state, pid));
      }
      if (rerolls-- <= 0) break;
      if (p.money < Engine.refreshCost(state) + Engine.CARD_COST) break;
      push(Engine.refreshShop(state, pid));
    }

    // 3b. Hard: na dobrú súkromnú kartu (trojica, aura mojej rasy), na ktorú
    //     nie je, zmraz ponuku – v novom kole ju dokúpi.
    if (cfg.freeze && bestUnaffordable && p.priv.length && !p.priv.some(s => s.frozen) &&
        cardScore(state, p, bestUnaffordable.defId, cfg) >= p.tier + 6) {
      push(Engine.toggleFreezeAll(state, pid));
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
            opts.forEach((d, j) => { if (cardScore(state, p, d, cfg) > cardScore(state, p, opts[bestIdx], cfg)) bestIdx = j; });
          }
          push(Engine.pickDiscover(state, pid, bestIdx));
        }
      }
    }

    // 4b. Príšerky dokúpené/dotiahnuté počas ťahu (zvyšok ruky).
    deployMinions(state, p, cfg, push);
    if (cfg.swapBoard) swapWeakBodies(state, p, push);

    // 4c. Buff kúzla až po vyložení – cieľ = najsilnejšia príšera.
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || !inst.spell) continue;
      const fx = Cards.byId[inst.defId].fx;
      if (fx.type === "buffTarget" && p.board.length) {
        // Vichor (2 útoky): najlepšie na „Pri útoku" kartu, inak najväčší útok.
        const score = fx.windfury
          ? x => x.atk + (Cards.byId[x.defId].power?.kw === "onAttack" ? 10 : 0)
          : x => x.atk + x.hp;
        const target = cfg.smartSpells
          ? [...p.board].sort((a, b) => score(b) - score(a))[0]
          : p.board[Math.floor(state.rng() * p.board.length)];
        push(Engine.castSpell(state, pid, i, target.uid));
      } else if (fx.type === "buffAllFriends" && p.board.length >= (cfg.smartSpells ? 2 : 1)) {
        push(Engine.castSpell(state, pid, i));
      } else if (fx.type === "silence" || fx.type === "dmgBoost" || fx.type === "hex" || fx.type === "bolt") {
        push(Engine.castSpell(state, pid, i)); // bez cieľa, vždy hodnota
      } else if (fx.type === "copyToDeck" && p.board.length) {
        // Zrkadlo: kopíruj kartu najbližšie k trojici (tiebreak najsilnejšia).
        const target = [...p.board]
          .filter(x => !Cards.byId[x.defId].token)
          .sort((a, b) => (ownedCount(p, b.defId) - ownedCount(p, a.defId)) || ((b.atk + b.hp) - (a.atk + a.hp)))[0];
        if (target) push(Engine.castSpell(state, pid, i, target.uid));
      } else if (fx.type === "transform" && p.board.length) {
        // Klobúk: premeň najslabšiu príšerku – upgrade tela o tier.
        const target = [...p.board].sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp))[0];
        push(Engine.castSpell(state, pid, i, target.uid));
      }
    }

    // 5. Hard: poradie útoku – „Pri útoku" buffery úplne vľavo, potom tvrdé
    //    telá, pomalé škálovače (mrchožrúti, lovci, rast Po nákupe) vpravo,
    //    nech útočia posledné a prežijú.
    if (cfg.orderBoard) orderBoard(state, p, push);

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
      // Dračí battlecry (discoverRace) môže otvoriť discover – dovyber,
      // inak by sa ťah zasekol na pendingDiscover.
      if (state.pendingDiscover && state.pendingDiscover.pid === p.id) {
        const opts = state.pendingDiscover.options;
        let best = 0;
        opts.forEach((d, j) => { if (cardScore(state, p, d, cfg) > cardScore(state, p, opts[best], cfg)) best = j; });
        push(Engine.pickDiscover(state, p.id, best));
      }
    }
  }

  // Plná plocha + silnejšie telo v ruke: predaj najslabšie na ploche a vylož
  // to z ruky (rozdiel aspoň 3, nech sa nepredáva za každú cenu).
  function swapWeakBodies(state, p, push) {
    let guard = 5;
    while (p.board.length >= Engine.BOARD_MAX && guard-- > 0) {
      const handBest = p.hand
        .map((inst, i) => ({ inst, i }))
        .filter(x => x.inst && !x.inst.spell)
        .sort((a, b) => bodyValue(b.inst) - bodyValue(a.inst))[0];
      if (!handBest) break;
      const weakIdx = p.board
        .map((inst, i) => ({ inst, i }))
        .sort((a, b) => bodyValue(a.inst) - bodyValue(b.inst))[0];
      if (bodyValue(handBest.inst) < bodyValue(weakIdx.inst) + 3) break;
      push(Engine.sellCard(state, p.id, "board", weakIdx.i));
      const handIdx = p.hand.indexOf(handBest.inst);
      push(Engine.playMinion(state, p.id, handIdx));
    }
  }

  // Balast z ruky predaj (nehrá sa, len by sa točil v balíčku).
  // keepBodies: pred vyložením predaj len toľko, aby z ruky + plochy ostali
  // aspoň 4 telá (max 1 obetovaný slot za ťah).
  function sellJunk(state, p, push, keepBodies) {
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || inst.spell || !isJunk(state, p, inst)) continue;
      if (keepBodies) {
        const bodies = p.hand.filter(x => x && !x.spell).length - 1;
        if (p.board.length + bodies < Engine.BOARD_MAX - 1) continue;
      }
      push(Engine.sellCard(state, p.id, "hand", i));
    }
  }

  // Poradie útoku (zľava doprava): 0 = Pri útoku buffery, 1 = tvrdé telá
  // podľa útoku, 2 = škálovače, čo majú prežiť (mrchožrúti, lovec tokenov,
  // rast Po nákupe / Po kúzle).
  function attackPriority(inst) {
    const pw = Cards.byId[inst.defId].power;
    if (!pw) return 1;
    if (pw.kw === "onAttack") return 0;
    if (["raceDeath", "tokenDeath", "onEnemySummon", "endTurn", "afterSpell"].includes(pw.kw)) return 2;
    return 1;
  }

  function orderBoard(state, p, push) {
    const desired = [...p.board].sort((a, b) =>
      (attackPriority(a) - attackPriority(b)) || (b.atk - a.atk) || (a.uid - b.uid));
    for (let slot = 0; slot < desired.length; slot++) {
      const inst = desired[slot];
      if (inst.slot === slot) continue;
      push(Engine.moveOnBoard(state, p.id, p.board.indexOf(inst), slot));
    }
  }

  // Zdrojové kúzla (peniaze + draw) hraj hneď – dotiahnuté karty a zlato
  // sa dajú v tom istom ťahu použiť.
  function playGoldSpells(state, p, push) {
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const inst = p.hand[i];
      if (!inst || !inst.spell) continue;
      const fxType = Cards.byId[inst.defId].fx.type;
      if (fxType === "gold" || fxType === "goldLater" || fxType === "draw") {
        push(Engine.castSpell(state, p.id, i));
      }
    }
  }

  return { botTurn, ownedCount, cardScore, dominantRace, isJunk, orderBoard, SUPPORT_RACES };
})();

if (typeof module !== "undefined") module.exports = Bot;
