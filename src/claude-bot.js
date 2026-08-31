// Claude súper: ťah hrá Claude cez Anthropic Messages API priamo z prehliadača
// (hlavička anthropic-dangerous-direct-browser-access). Kľúč zadáva HRÁČ a žije
// LEN v jeho localStorage – nikdy nie v repozitári (variant "BYO key").
//
// Jeden request na ťah: pošle sa kompaktný stav + pravidlá, Claude vráti JSON
// { actions: [...], taunt: "..." }. Akcie sa vykonajú cez Engine API (nelegálne
// sa ticho preskočia – engine vráti null) a KAŽDÁ úspešná sa loguje cez
// onAction, takže replay (tools/replay.mjs) hru prehrá presne bez API.
// Trash-talk bublina = reálna Claudova hláška šitá na profil hráča.

const ClaudeBot = (() => {
  const API_URL = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-5";

  // Profily hráčov na trash-talk šitý na mieru (meme pre kamošov).
  // Kľúč = meno malými písmenami (tak, ako ho hráč napíše na úvodnej
  // obrazovke). Hodnota = voľný text pre Clauda: kto to je, ako hráva,
  // na čom si ho doberať. Neznáme meno = generický (ale vtipný) roast.
  const PLAYER_PROFILES = {
    // "adam": "…",
    // "david": "…",
  };

  // Claude mód je len pre týchto hráčov (meno z úvodnej obrazovky,
  // bez ohľadu na veľkosť písmen). Ostatní dostanú hlášku a nezačnú.
  const ALLOWED_PLAYERS = ["adam", "david"];
  const isAllowed = name => ALLOWED_PLAYERS.includes((name || "").trim().toLowerCase());

  // Pravidlá + formát odpovede. Po anglicky (menej tokenov, model presnejší),
  // taunt sa žiada v jazyku UI.
  const SYSTEM = `You are playing "Animal Arena", a kids' autobattler (Hearthstone Battlegrounds-like with a personal deck). You are the OPPONENT bot playing your shop turn.

RULES:
- Each round: both players shop, then boards auto-battle. Loser's hero takes damage = sum of survivors' ranks. Hero starts at 35 HP.
- Bought cards go into your DECK (not hand). Hand refills to 5 each round from your deck cycle (deck -> hand -> discard -> reshuffle).
- Minions are played from hand to board for FREE (max 5 on board). Money is only for shopping. Unspent money is LOST at end of turn.
- 3 copies of the same card+rank ANYWHERE (board/hand/deck/discard) auto-merge into a stronger rank (stats x2 / x4). Completing triples is the strongest play.
- Shop: common cards (shared), private cards, and one spell slot. Refresh costs 1. Tier upgrade unlocks stronger cards and +1 private slot.
- Spells are cast for free from hand; they return to your deck cycle (one-shot token spells vanish).
- Races: beast (big bodies/auras), elemental (zaps/AoE), undead (skeleton swarm), fairy (abilities trigger on each spell cast). Stick to a dominant race for synergy.
- Battle: sides alternate attacks, random targets, Taunt minions must be hit first. "startFight"/"deathrattle"/"onAttack" abilities as written on cards.

YOUR TASK: return ONLY a JSON object, no markdown fences, shaped:
{"actions":[...], "taunt":"..."}

Action objects (executed in order; illegal ones are skipped):
- {"a":"upgrade"}                          buy tier upgrade
- {"a":"buy","id":"<cardId>"}              buy card with that id from any shop row
- {"a":"refresh"}                          reroll shop (1 gold)
- {"a":"play","id":"<cardId>"}             play minion from hand to board
- {"a":"cast","id":"<spellId>","target":"<own board cardId, optional>"}  cast spell
- {"a":"sell","zone":"hand"|"board","id":"<cardId>"}  sell for 1 gold

STRATEGY: complete triples > buy synergy with your dominant race > spend ALL money (refresh with leftovers to hunt triples) > upgrade tier when affordable mid-game. Play all minions you can. Cast buff spells on your strongest minion.

TAUNT: one short playful trash-talk line (max 100 chars) addressed to the human player, in the requested language. Tease their decisions and "strategy" in a funny, kid-friendly way (the player may be a child) – cheeky roast, never truly mean, no profanity, never mock protected traits; nickname allowed. If a player profile is provided, tailor the joke to it.`;

  // Kompaktný pohľad na stav – len to, čo súper legálne vidí.
  function snapshot(state, pid, Cards, Engine) {
    const p = state[pid];
    const foe = state[pid === "p1" ? "p2" : "p1"];
    const card = (defId, rank) => {
      const d = Cards.byId[defId];
      return {
        id: defId, name: Cards.nameOf ? Cards.nameOf(d, rank || 1, "en") : d.id,
        tier: d.tier, race: d.race || (d.spell ? "spell" : ""),
        atk: d.spell ? undefined : d.atk * Cards.STAT_MULT[rank || 1],
        hp: d.spell ? undefined : d.hp * Cards.STAT_MULT[rank || 1],
        text: Cards.cardText(d, rank || 1, "en") || undefined,
        cost: Engine.cardCost(defId),
      };
    };
    const inst = x => ({ id: x.defId, rank: x.rank, atk: x.atk, hp: x.hp, spell: !!x.spell });
    const ownedCounts = {};
    for (const zone of [p.deck, p.discard]) for (const c of zone) if (c.rank === 1) ownedCounts[c.defId] = (ownedCounts[c.defId] || 0) + 1;
    for (const zone of [p.hand, p.board]) for (const c of zone) if (!c.spell && c.rank === 1) ownedCounts[c.defId] = (ownedCounts[c.defId] || 0) + 1;
    return {
      round: state.round,
      you: { hp: p.hp, tier: p.tier, money: p.money, upgradeCost: Engine.upgradeCost(state, pid), dmgBoost: p.dmgBoost, raceAuras: p.raceBuffs, spellsCastTotal: p.spellsCast },
      humanOpponent: { hp: foe.hp, tier: foe.tier, boughtThisRound: foe.bought },
      hand: p.hand.map(inst),
      board: p.board.map(inst),
      deckAndDiscard: [...p.deck, ...p.discard].map(c => c.defId),
      copiesOwnedTowardTriple: ownedCounts,
      shop: {
        commons: state.commons.map(id => card(id, 1)),
        private: p.priv.map(s => ({ ...card(s.defId, 1), frozen: s.frozen })),
        spell: p.spellShop ? card(p.spellShop.defId, 1) : null,
        refreshCost: Engine.REFRESH_COST,
      },
    };
  }

  // Nájde index karty podľa defId (spell = true/false filter, voliteľný).
  const findIdx = (list, id, wantSpell) =>
    list.findIndex(x => x && x.defId === id && (wantSpell === undefined || !!x.spell === wantSpell));

  // Vykoná jeden Claudov ťah. onAction(name, args) loguje pre replay.
  // Vracia { events, taunt } alebo hodí chybu (volajúci má fallback na Bot).
  async function turn(state, pid, opts) {
    const { apiKey, lang, playerName, lastBattle, onAction } = opts;
    const langName = { sk: "Slovak", cs: "Czech", en: "English" }[lang] || "Slovak";
    const name = (playerName || "").trim();

    const userMsg = JSON.stringify({
      state: snapshot(state, pid, Cards, Engine),
      lastBattleFromYourView: lastBattle || "first round",
      tauntLanguage: langName,
      playerName: name || null,
      playerProfile: PLAYER_PROFILES[name.toLowerCase()] || null,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    let resp;
    try {
      resp = await fetch(API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          output_config: { effort: "low" }, // rýchly ťah, kvalita stačí
          system: SYSTEM,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
    } finally { clearTimeout(timer); }
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      throw new Error(`API ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    // Model má vrátiť čisté JSON; pre istotu vylúpni prvý {...} blok.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Odpoveď bez JSON: " + text.slice(0, 120));
    const plan = JSON.parse(m[0]);

    const events = [];
    const run = (name, args) => {
      const ev = Engine[name](state, pid, ...args);
      if (ev) { events.push(...ev); onAction(name, args); }
      return ev;
    };
    const p = state[pid];
    let guard = 40;
    for (const act of Array.isArray(plan.actions) ? plan.actions : []) {
      if (guard-- <= 0 || state.phase !== "shop" || state.active !== pid) break;
      if (!act || typeof act !== "object") continue;
      switch (act.a) {
        case "upgrade": run("upgradeTier", []); break;
        case "refresh": run("refreshShop", []); break;
        case "buy": {
          const ci = state.commons.indexOf(act.id);
          if (ci >= 0 && run("buyCommon", [ci])) break;
          const vi = p.priv.findIndex(s => s.defId === act.id);
          if (vi >= 0 && run("buyPrivate", [vi])) break;
          if (p.spellShop && p.spellShop.defId === act.id) run("buySpell", []);
          break;
        }
        case "play": {
          const i = findIdx(p.hand, act.id, false);
          if (i >= 0) run("playMinion", [i]);
          break;
        }
        case "cast": {
          const i = findIdx(p.hand, act.id, true);
          if (i < 0) break;
          const tgt = act.target ? p.board.find(x => x.defId === act.target) : null;
          run("castSpell", tgt ? [i, tgt.uid] : [i]);
          // Discover (Kniha prianí): dovyber heuristikou, nech ťah nezasekne.
          if (state.pendingDiscover && state.pendingDiscover.pid === pid) {
            const optsD = state.pendingDiscover.options;
            let best = 0;
            optsD.forEach((d, j) => { if (Bot.cardScore(state, p, d) > Bot.cardScore(state, p, optsD[best])) best = j; });
            run("pickDiscover", [best]);
          }
          break;
        }
        case "sell": {
          const zone = act.zone === "board" ? "board" : "hand";
          const i = p[zone].findIndex(x => x && x.defId === act.id);
          if (i >= 0) run("sellCard", [zone, i]);
          break;
        }
      }
    }
    // Dohraj zvyšné príšerky z ruky (nech plán s dierami nenechá prázdny board).
    let dg = 10;
    while (p.board.length < Engine.BOARD_MAX && dg-- > 0) {
      const i = p.hand.findIndex(x => x && !x.spell);
      if (i < 0) break;
      run("playMinion", [i]);
    }
    run("endShopTurn", []);
    return { events, taunt: typeof plan.taunt === "string" ? plan.taunt.slice(0, 140) : null };
  }

  return { turn, isAllowed, MODEL };
})();

if (typeof module !== "undefined") module.exports = ClaudeBot;
