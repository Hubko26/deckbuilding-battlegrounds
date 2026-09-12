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
  const MODEL = "claude-opus-5";          // ťahy – kvalita hrania
  const CHAT_MODEL = "claude-sonnet-5";   // chat – stredná cesta (cena vs vtip)

  // Profily hráčov na trash-talk šitý na mieru (meme pre kamošov).
  // Kľúč = meno malými písmenami (tak, ako ho hráč napíše na úvodnej
  // obrazovke). Hodnota = voľný text pre Clauda: kto to je, ako hráva,
  // na čom si ho doberať. Neznáme meno = generický (ale vtipný) roast.
  const PLAYER_PROFILES = {
    adam: "Dospelý kamoš – plne povolený ABSURDNÝ friendly banter pre dospelého, žiadne detské rukavičky. Lenivý a VŽDY mešká – roastuj meškanie a lenivosť neúnavne a kreatívne. Dota nick: Paprika_Smrdi (zlatá baňa, používaj). Support dev vo firme Universal Allocations, aktuálne robí PM alokácií; neadekvátne ohodnotený, večne čaká na povýšenie a vyšší plat – doberaj si ho, že aj to povýšenie mešká, lebo ho má doniesť on sám. Kamoši: Dano, Stefy, Marek, Ado, Kubo; najlepší kamarát David mu tohto bota nastražil – Davida spomeň LEN výnimočne (raz za hru, nie v každej hláške), inak sa sústreď na Adama. Manželku Lioru a ročnú dcérku Emily spomínaj LEN láskavo alebo absurdne v JEHO neprospech (napr. Emily má lepšie APM a lepší dochádzkový rekord) – nikdy si neuťahuj z nich samotných. Štýl: absurdné hyperboly, kancelársky a Dota humor. Aj tak platí: žiadna etnicita, náboženstvo, vzhľad, nič skutočne zraňujúce.",
    // "david": "…",
  };

  // Claude mód je len pre týchto hráčov (meno z úvodnej obrazovky,
  // bez ohľadu na veľkosť písmen). Ostatní dostanú hlášku a nezačnú.
  const ALLOWED_PLAYERS = ["adam", "david"];
  const isAllowed = name => ALLOWED_PLAYERS.includes((name || "").trim().toLowerCase());

  // Jazyk hlášok per hráč – prebije jazyk UI (Adam dostáva vždy slovenčinu).
  const PLAYER_LANG = { adam: "sk" };
  const langFor = (name, fallback) => PLAYER_LANG[(name || "").trim().toLowerCase()] || fallback;

  // Pravidlá + formát odpovede. Po anglicky (menej tokenov, model presnejší),
  // taunt sa žiada v jazyku UI.
  const SYSTEM = `You are playing "Animal Arena", a kids' autobattler (Hearthstone Battlegrounds-like with a personal deck). You are the OPPONENT bot playing your shop turn.

RULES:
- Each round: both players shop, then boards auto-battle. Loser's hero takes damage = sum of survivors' card tiers (evolve rank does not matter). Hero starts at 50 HP.
- Bought cards go into your DECK (not hand). Hand refills to 5 each round from your deck cycle (deck -> hand -> discard -> reshuffle).
- Minions are played from hand to board for FREE (max 5 on board). Money is only for shopping. Unspent money is LOST at end of turn.
- 3 copies of the same card+rank ANYWHERE (board/hand/deck/discard) auto-merge into a stronger rank (stats x2 / x4). The merged card ALWAYS returns to your hand (even if a copy was on the board) – play it again, its battlecry triggers at the higher rank. Completing triples is the strongest play.
- Shop: common cards (shared), private cards, and one spell slot. Refresh costs 1. Tier upgrade unlocks stronger cards and +1 private slot.
- Spells are cast for free from hand; they return to your deck cycle (one-shot token spells vanish).
- Races: beast (big bodies/auras), elemental (zaps/AoE), undead (skeleton swarm), fairy (abilities trigger on each spell cast), dragon (mercenaries – above-curve bodies whose battlecries boost the RACE of a targeted friendly minion; they fit into any build), ogre (huge stats with chaotic downsides – coin flips, friendly fire, self-hits; the randomness can backfire). Stick to a dominant race for synergy.
- Battle: sides alternate attacks, random targets, Taunt minions must be hit first. "startFight"/"deathrattle"/"onAttack" abilities as written on cards.
- "Imprint +X/+Y to <Race>" = permanent race aura: ALL your minions of that race (board, hand, deck, tokens, future buys) get +X/+Y forever. Buy Imprint cards of your race early.
- MAIN races are beast, elemental, undead, fairy. OGRE and DRAGON are SUPPORT races – never a main build: dragons are mercenaries whose battlecries feed the race you target, ogres are above-curve bodies to fill a slot. Owning many ogres/dragons does NOT make them your race; dominantRace in the state already ignores them. If dominantRace is null, pick the main race you own most of (or the best Imprint/engine in the shop) and commit to it.

YOUR TASK: return ONLY a JSON object, no markdown fences, shaped:
{"actions":[...], "taunt":"..."}

Action objects (executed in order; illegal ones are skipped):
- {"a":"upgrade"}                          buy tier upgrade
- {"a":"buy","id":"<cardId>"}              buy card with that id from any shop row
- {"a":"refresh"}                          reroll shop (1 gold)
- {"a":"play","id":"<cardId>","target":"<own board cardId, optional>"}  play minion from hand to board; target only matters for dragons with targeted battlecries (the effect applies to the TARGET's race – target a minion of your dominant race!)
- {"a":"cast","id":"<spellId>","target":"<own board cardId, optional>"}  cast spell
- {"a":"sell","zone":"hand"|"board","id":"<cardId>"}  sell for 1 gold (card leaves the game)
- {"a":"discard","zone":"hand"|"board","id":"<cardId>"}  put card into your discard pile – NO gold, card STAYS in your deck cycle and comes back in a later hand
- {"a":"move","id":"<own board cardId>","slot":0-4}  reposition minion on board (0 = leftmost = attacks first; swaps with occupant)
- {"a":"freeze","id":"<cardId in your private shop>"}  freeze that private-shop card so it survives into next round

STRATEGY – do ALL of these every turn, in this order (derived from logs of winning games; bots lost on mixed races, bloated decks, 3-4 minion boards and upgrading with an empty board):
1. SELL JUNK FROM HAND FIRST (before playing): the state lists junkInHand – emit {"a":"sell","zone":"hand","id":...} for EVERY card in it as your first actions (rule: 0 attack; from round 3 on EVERY off-race tier 1-2 minion – pairs too, silver ones from tier 4, tier 1-2 dragons from tier 3; ogre/dragon tier 1-2 count as off-race). Your starting deck is 10 random tier-1 cards – winners sell them all by round 6. Sell off-race cards the moment you commit to a race, even if the board ends up thin: hero damage is capped early (rounds 1-3 max 5, rounds 4-10 max 10) while junk in the deck hurts every round for the rest of the game. HARD CAP deckSize 14 (the driver sells your weakest hand bodies above it): your board returns to the discard pile after every battle and the next hand is 5 RANDOM cards from your deck cycle, so a bloated deck means your best cards sit in the pile while random junk fights. Winners keep deckSize 11-13: every card in the deck is one they want to draw. A game with zero sells is a lost game.
2. PLAY MINIONS: plain bodies first (strongest first), battlecry buffers and Imprint cards LAST so they hit a full board. Dragons: "target" = your best minion of dominantRace. U004: target U001/U006/U009. Always fight with 5 minions.
3. SWAP ON A FULL BOARD: if a hand minion is >= 3 points better (atk+hp, +2 if it has an ability) than your weakest board minion, sell the weakest and play the better one.
4. UPGRADE TIER on schedule: tier 2 by round 2-3, tier 3 by 4-5, tier 4 by 7, tier 5 by 9-10, tier 6 by 12 (rule: round >= tier*2-1 is the LATEST). Being a tier behind the human means weaker private offers AND the shared common row is rolled at the LOWER tier of the two players. Check the CARD CATALOGUE: if the next tier holds your race's Imprint or engine (e.g. beast B002 at t3, B010 at t5; elemental E003 at t2, E007 at t4; undead U008 at t4; fairy F007 at t4), upgrade EARLY to reach it. Upgrade when your board is full (5), or you keep >= 3 gold after upgrading AND have >= 4 bodies. With 1-3 bodies on board do NOT upgrade – bodies first.
5. BUY in this priority, spending ALL gold (permanent growers of your race – beast B003/B008 "end of turn +X/+X", B004 scavenger – are the scaling engine: bought early and drawn every round they reach 20-30 stats by round 12; the winner's B003 went 6/6 (round 3) -> 26/22 (round 12)): (a) the 3rd copy of anything (triple – check copiesOwnedTowardTriple, deck copies count); (b) an Imprint/aura of your race (E003, B002/B006/B010, U003/U008/U010, F008, dragons D003/D009 targeted at your race); (c) your race's engine (undead U002/U005/U006; elemental E007, E004, E009 (+1/+1 per Elemental you have played this game, itself included), Elemental Power spell "iskra" and D007; beast B004/B007/B005/B003/B008; fairy F002/F004 + spells); (d) the 2nd copy toward a triple; (e) the best same-race body of the highest tier offered; (f) a dragon whose battlecry feeds your race (D002/D008/D004). NEVER buy: an off-race tier 1-2 minion after round 3 (except a triple), a 3rd+ spell in a non-fairy deck, Shield/Wave/Silence "because gold was left". Better to lose 1-2 gold than to put junk into your deck.
6. REFRESH when the shop has nothing for your race: if no offer satisfies (a)-(e) and you keep >= 4 gold, {"a":"refresh"} – the driver then buys the best card of your race from the new roll for you (you cannot see it, so plan no buys after a refresh). Leftover gold is lost, and 1-2 gold left in 11 rounds is 14 gold thrown away; never refresh as the very last action with < 4 gold.
7. FREEZE a private-shop card you want but cannot afford (triple piece, Imprint of your race).
8. SPELLS after minions are down: stat buffs on your strongest minion; Windfury ("vichor") on an onAttack minion (E004, O006) or your highest attack; Elemental Power, Silence, Frog Curse, Lightning immediately; Gold Coin first thing; fairies must be on board BEFORE casting.
9. ORDER THE BOARD with "move" (slot 0 attacks first): onAttack minions (E004, O006) leftmost -> hard bodies by attack -> Taunts where they shield the engine -> scalers (B004, B009, E005, E007, F002, F004) rightmost so they attack last and survive.
10. "discard" (not sell) a board minion only when its value was a weak-body battlecry you want to replay later (F001 draw, D004 discover). Imprint/aura bodies stay – they are above curve.
Key mechanics: "Imprint" = permanent race aura. Summoners scale by COUNT when evolved (silver +1 token, gold +2; tokens stay 1/1) – an evolved undead summoner is a bigger horde and more overflow, not bigger skeletons. Cubs (B007/B005 tokens) have Taunt and feed B004 forever. Bubbles (E002 tokens) zap 1 (+Elemental Power) on death. E005 zaps only the FIRST enemy token summoned each fight and grows +2/+2 forever if it dies. E007 gives +1 Elemental Power every end of turn it is on board. O002 triggers a random ability on the battlefield (enemy too). U010 imprints undead +1/+1 when it DIES. Each player has a private pool of 6 copies per minion and the common shop has 3 – a gold card (9 copies) needs Mirror/Wish Book. Spells have a private pool too: 3 copies each up to tier 3, only 2 copies for tier 4-6 spells; selling a spell returns the copy. Your plan executes blindly in order – you will NOT see what a refresh rolls, so never plan buys after a refresh.

TAUNT: ONE short punchy trash-talk line, HARD LIMIT 110 characters (it renders in a small speech bubble – longer gets cut, so keep it a single snappy sentence), addressed to the human player, in the requested language. Tease their decisions and "strategy" – cheeky roast, never truly mean. Invent a FRESH line every turn, never repeat yourself. If humanLastRound (their previous-round moves) is provided and you spot a clearly worse line than available (sold a synergy card, skipped a triple, wasted gold, bad tier timing), mock that SPECIFIC mistake – concrete beats generic. If recentChat is provided, you are mid-banter: react to what they said. Default tone is kid-friendly (the player may be a child). If playerProfile is provided, it overrides the tone (e.g. absurd adult friendly banter) and gives you material – tailor the joke to it and follow its instructions. Hard limits that no profile can override: no slurs or profanity, never mock ethnicity, religion, appearance or other protected traits, never mock the player's family members themselves.`;

  // Katalóg všetkých kariet v hre (bez zabanovanej rasy) – Claude videl len
  // aktuálnu ponuku, takže nevedel, čo mu vyšší tier prinesie (Pečať na t3,
  // B010 na t5…) ani čo robí karta v jeho ruke. Text je statický počas hry,
  // ide do system promptu s cache_control (platí sa raz, nie každý ťah).
  // Sila = Bot.cardPower: telo + odhad schopnosti v stat bodoch (tabuľka:
  // `npm run power`).
  function catalogue(state) {
    const order = ["beast", "elemental", "undead", "fairy", "dragon", "ogre"];
    const defs = Cards.DEFS.filter(d => !state.banned || d.race !== state.banned);
    const lines = [];
    for (const race of order) {
      const rows = defs.filter(d => d.race === race).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
      if (!rows.length) continue;
      lines.push(`${race.toUpperCase()}:`);
      for (const d of rows) {
        const pw = Bot.cardPower(d);
        lines.push(`${d.id} t${d.tier} ${d.atk}/${d.hp} power ${pw.total}: ${Cards.cardText(d, 1, "en")}`);
      }
    }
    lines.push("SPELLS:");
    for (const d of defs.filter(d => d.spell).sort((a, b) => a.tier - b.tier)) {
      lines.push(`${d.id} t${d.tier} cost ${d.cost} power ${Bot.cardPower(d).total}: ${Cards.cardText(d, 1, "en")}`);
    }
    return `CARD CATALOGUE (every card in this game; tN = shop tier where it appears; "power" = theoretical strength in stat points: body atk+hp plus the ability's expected stat value – permanent Imprints and FOREVER growth count for the rest of the game, so a t3 Imprint (~34) outweighs any t3 body; use it to judge what a tier upgrade unlocks and which offer to take):\n` + lines.join("\n");
  }

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
    const inst = x => ({ id: x.defId, rank: x.rank, atk: x.atk, hp: x.hp, spell: !!x.spell,
      text: Cards.cardText(Cards.byId[x.defId], x.rank || 1, "en") || undefined });
    const ownedCounts = {};
    for (const zone of [p.deck, p.discard]) for (const c of zone) if (c.rank === 1) ownedCounts[c.defId] = (ownedCounts[c.defId] || 0) + 1;
    for (const zone of [p.hand, p.board]) for (const c of zone) if (!c.spell && c.rank === 1) ownedCounts[c.defId] = (ownedCounts[c.defId] || 0) + 1;
    // Dominantná rasa spočítaná v kóde – Claude dostane jasný signál,
    // ktorú líniu držať (one-shot plán si ju sám spoľahlivo neodvodí).
    const raceCounts = {};
    const addRace = defId => { const d = Cards.byId[defId]; if (d.race && !d.token) raceCounts[d.race] = (raceCounts[d.race] || 0) + 1; };
    for (const zone of [p.deck, p.discard]) for (const c of zone) addRace(c.defId);
    for (const zone of [p.hand, p.board]) for (const c of zone) if (!c.spell) addRace(c.defId);
    // Dominantná = najpočetnejšia HLAVNÁ rasa; ogre a dragon sú podporné
    // (v logu Claude urobil z ogrov hlavný build a prehral).
    const mainRaces = Object.entries(raceCounts).filter(([r]) => !Bot.SUPPORT_RACES.has(r)).sort((a, b) => b[1] - a[1]);
    const dominantRace = mainRaces[0]?.[0] || null;
    // Balast v ruke podľa rovnakých pravidiel ako hard bot (0 útoku; od 3. kola
    // cudzia rasa t1–2 bez páru, od tieru 3 aj s párom) – Claude ho má predať.
    const junkInHand = p.hand.filter(x => !x.spell && Bot.isJunk(state, p, x)).map(x => x.defId);
    return {
      round: state.round,
      you: { hp: p.hp, tier: p.tier, money: p.money, upgradeCost: Engine.upgradeCost(state, pid), dmgBoost: p.dmgBoost, raceAuras: p.raceBuffs, spellsCastTotal: p.spellsCast },
      humanOpponent: { hp: foe.hp, tier: foe.tier, boughtThisRound: foe.bought },
      hand: p.hand.map(inst),
      board: p.board.map(x => ({ ...inst(x), slot: x.slot })),
      deckAndDiscard: [...p.deck, ...p.discard].map(c => c.defId),
      copiesOwnedTowardTriple: ownedCounts,
      raceCounts, dominantRace,
      supportRaces: [...Bot.SUPPORT_RACES], // nikdy hlavný build
      junkInHand, // predaj ich ako prvé (sell zone hand)
      deckSize: p.deck.length + p.discard.length + p.hand.length + p.board.length,
      shop: {
        commons: state.commons.map(id => card(id, 1)),
        private: p.priv.map(s => ({ ...card(s.defId, 1), frozen: s.frozen })),
        spell: p.spellShop ? card(p.spellShop.defId, 1) : null,
        refreshCost: Engine.refreshCost(state),
      },
      mutator: state.mutator || null, // „Pravidlo dnešnej arény" – nech ho Claude zohľadní
      bannedRace: state.banned || null, // rasa zabanovaná na začiatku hry – jej karty v hre nie sú
    };
  }

  // Nájde index karty podľa defId (spell = true/false filter, voliteľný).
  const findIdx = (list, id, wantSpell) =>
    list.findIndex(x => x && x.defId === id && (wantSpell === undefined || !!x.spell === wantSpell));

  // Vykoná jeden Claudov ťah. onAction(name, args) loguje pre replay.
  // Vracia { events, taunt } alebo hodí chybu (volajúci má fallback na Bot).
  async function turn(state, pid, opts) {
    const { apiKey, lang, playerName, lastBattle, humanLastRound, recentChat, onAction } = opts;
    const name = (playerName || "").trim();
    const langName = { sk: "Slovak", cs: "Czech", en: "English" }[langFor(name, lang)] || "Slovak";

    const userMsg = JSON.stringify({
      state: snapshot(state, pid, Cards, Engine),
      lastBattleFromYourView: lastBattle || "first round",
      humanLastRound: humanLastRound && humanLastRound.length ? humanLastRound : null,
      recentChat: recentChat && recentChat.length ? recentChat : null,
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
          max_tokens: 3000,
          output_config: { effort: "medium" }, // viac rozmyslu na ťah (low hral slabo)
          system: [
            { type: "text", text: SYSTEM },
            { type: "text", text: catalogue(state), cache_control: { type: "ephemeral" } },
          ],
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
    // Nákup, ktorý by hard bot nikdy neurobil: po zafixovaní rasy cudzia
    // karta tieru 1–2 (aj drak/ogre) bez rozbehnutej trojice. Claude v logoch
    // takto miešal rasy (D001, D006×2, D007×2, O009, F003, F005 v beast builde).
    const junkBuy = defId => {
      const def = Cards.byId[defId];
      const dom = Bot.dominantRace(state, p);
      return !!dom && !!def.race && def.race !== dom && def.tier <= 2 && Bot.ownedCount(p, defId) < 2;
    };
    let guard = 40;
    for (const act of Array.isArray(plan.actions) ? plan.actions : []) {
      if (guard-- <= 0 || state.phase !== "shop" || state.active !== pid) break;
      if (!act || typeof act !== "object") continue;
      switch (act.a) {
        case "upgrade": run("upgradeTier", []); break;
        case "refresh": run("refreshShop", []); break;
        case "buy": {
          if (junkBuy(act.id)) break; // cudzia t1–2 karta po 3. kole bez páru – balast do balíčka
          const ci = state.commons.indexOf(act.id);
          if (ci >= 0 && run("buyCommon", [ci])) break;
          const vi = p.priv.findIndex(s => s.defId === act.id);
          if (vi >= 0 && run("buyPrivate", [vi])) break;
          if (p.spellShop && p.spellShop.defId === act.id) run("buySpell", []);
          break;
        }
        case "play": {
          const i = findIdx(p.hand, act.id, false);
          if (i < 0) break;
          // Draci (cielený battlecry): voliteľný target = vlastná príšerka,
          // efekt sa aplikuje na JEJ rasu.
          const tgt = act.target ? p.board.find(x => x.defId === act.target) : null;
          run("playMinion", tgt ? [i, tgt.uid] : [i]);
          break;
        }
        case "cast": {
          const i = findIdx(p.hand, act.id, true);
          if (i < 0) break;
          const tgt = act.target ? p.board.find(x => x.defId === act.target) : null;
          run("castSpell", tgt ? [i, tgt.uid] : [i]);
          break;
        }
        case "sell": {
          const zone = act.zone === "board" ? "board" : "hand";
          const i = p[zone].findIndex(x => x && x.defId === act.id);
          if (i >= 0) run("sellCard", [zone, i]);
          break;
        }
        case "discard": {
          const zone = act.zone === "board" ? "board" : "hand";
          const i = p[zone].findIndex(x => x && x.defId === act.id);
          if (i >= 0) run("discardCard", [zone, i]);
          break;
        }
        case "move": {
          const i = p.board.findIndex(x => x && x.defId === act.id);
          const slot = Number(act.slot);
          if (i >= 0 && Number.isInteger(slot)) run("moveOnBoard", [i, slot]);
          break;
        }
        case "freeze": {
          const vi = p.priv.findIndex(s => s.defId === act.id && !s.frozen);
          if (vi >= 0) run("toggleFreeze", [vi]);
          break;
        }
      }
      // Discover (Kniha prianí / dračí discoverRace): dovyber heuristikou,
      // nech sa ťah nezasekne na pendingDiscover.
      if (state.pendingDiscover && state.pendingDiscover.pid === pid) {
        const optsD = state.pendingDiscover.options;
        let best = 0;
        optsD.forEach((d, j) => { if (Bot.cardScore(state, p, d) > Bot.cardScore(state, p, optsD[best])) best = j; });
        run("pickDiscover", [best]);
      }
    }
    // Hygiena po pláne: jadro hard bota bez handicapov dohrá, čo Claude
    // vynechal – predá balast, drží strop balíčka, vyloží zvyšné telá,
    // upgraduje podľa kola, minie zlato (aj s refreshom), zahrá kúzla
    // a usporiada plochu (ak ju Claude neusporiadal sám). Záznam z 11. 9. 2026:
    // Claude 15 kôl bez refreshu, 1 predaj, balíček 19 kariet, tier vždy
    // o jeden pozadu, 1–2 zlato nevyužité v 11 kolách. Každá akcia ide cez
    // executor → run(), takže sa loguje a replay sedí.
    const movedByPlan = (Array.isArray(plan.actions) ? plan.actions : []).some(a => a && a.a === "move");
    if (state.phase === "shop" && state.active === pid) {
      const cfg = { ...Bot.HYGIENE, orderBoard: !movedByPlan };
      Bot.withExecutor((name, _state, _pid, ...args) => run(name, args),
        () => Bot.completeTurn(state, pid, cfg, () => {}));
    }
    run("endShopTurn", []);
    return { events, taunt: typeof plan.taunt === "string" ? plan.taunt.slice(0, 250) : null };
  }

  // Odpoveď na hráčovu chatovú správu – samostatný lacný request (bez ťahu).
  // gameSummary = krátky kontext hry, history = posledné výmeny.
  async function chat(opts) {
    const { apiKey, lang, playerName, text, history, gameSummary } = opts;
    const name = (playerName || "").trim();
    const langName = { sk: "Slovak", cs: "Czech", en: "English" }[langFor(name, lang)] || "Slovak";
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 300,
        output_config: { effort: "low" },
        system: `You are the trash-talking robot opponent in the kids' autobattler "Animal Arena", mid-game. The human player just sent you a chat message. Reply with ONE short punchy line (HARD LIMIT 130 characters – it renders in a small speech bubble) in ${langName} – witty friendly banter, react directly to what they said. Default kid-friendly; if a player profile is provided it sets the tone (e.g. absurd adult banter) and gives material. Hard limits regardless of profile: no slurs or profanity, never mock ethnicity, religion, appearance or other protected traits, never mock the player's family members themselves. Reply with the line only, no quotes, no JSON.`,
        messages: [{
          role: "user",
          content: JSON.stringify({
            playerName: name || null,
            playerProfile: PLAYER_PROFILES[name.toLowerCase()] || null,
            gameSummary: gameSummary || null,
            recentChat: history || [],
            playerSays: text,
          }),
        }],
      }),
    });
    if (!resp.ok) throw new Error("API " + resp.status);
    const data = await resp.json();
    const out = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    return out.slice(0, 250);
  }

  return { turn, chat, isAllowed, langFor, MODEL, catalogue };
})();

if (typeof module !== "undefined") module.exports = ClaudeBot;
