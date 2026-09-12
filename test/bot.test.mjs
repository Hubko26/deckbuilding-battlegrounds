import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

// Bot musí odohrať legálny ťah v každej obtiažnosti a hra musí dobehnúť.
for (const diff of ["easy", "normal", "hard"]) {
  test(`bot (${diff}): odohrá ťah bez chýb a neminie viac než má`, () => {
    const ctx = loadEngine();
    const state = ctx.Engine.newGame(seeded(42), null);
    ctx.Engine.startRound(state);
    ctx.Engine.endShopTurn(state, "p1");
    assert.equal(state.active, "p2");
    const events = ctx.Bot.botTurn(state, "p2", diff);
    assert.ok(events.length > 0);
    assert.ok(state.p2.money >= 0);
    assert.equal(state.p2.hand.length, 0); // ruka skončila v discard
    assert.equal(state.phase, "battle");
  });
}

test("celá hra bot vs bot dobehne do konca", () => {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(7), null);
  ctx.Engine.startRound(state);
  let guard = 200;
  while (state.phase !== "over" && guard-- > 0) {
    if (state.phase === "battle") { ctx.Engine.doBattle(state); continue; }
    ctx.Bot.botTurn(state, state.active, state.active === "p1" ? "normal" : "hard");
  }
  assert.equal(state.phase, "over");
  assert.ok(["p1", "p2", "draw"].includes(state.winner));
  assert.ok(state.round >= 2);
});

test("bot hrá battlecry buffer až po obyčajných príšerách (buff zasiahne plochu)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(21), null);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; // nič nenakupuj
  p.deck = []; p.discard = [];
  const plain = E.makeInst(state, "E002", 1); plain.slot = 0;   // elemental 1/3
  const buffer = E.makeInst(state, "E003", 1); buffer.slot = 1; // battlecry: Pečať Živlov +1/+1
  p.hand = [buffer, plain];
  ctx.Bot.botTurn(state, "p2", "normal");
  const played = p.board.find(x => x.defId === "E002");
  assert.ok(played);
  assert.equal(played.atk, 2); // 1+1 – buffer prišiel na plochu až po ňom
  assert.equal(played.hp, 4);  // 3+1
});

test("bot skóre: aura vlastnej rasy má vysokú prioritu", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(22), null);
  const p = state.p2;
  p.deck = [
    { defId: "U001", rank: 1 }, { defId: "U002", rank: 1 },
    { defId: "U003", rank: 1 }, { defId: "U005", rank: 1 },
  ];
  p.discard = []; p.hand = []; p.board = [];
  // aura undead (U008) musí byť hodnotnejšia než vanilla beast tanku rovnakého tieru
  const aura = ctx.Bot.cardScore(state, p, "U008");
  const vanilla = ctx.Bot.cardScore(state, p, "B002");
  assert.ok(aura > vanilla, `aura ${aura} <= vanilla ${vanilla}`);
});

test("bot skóre: preferuje dokončenie trojice", () => {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(3), null);
  const p = state.p2;
  p.board = [ctx.Engine.makeInst(state, "B005", 1), ctx.Engine.makeInst(state, "B005", 1)];
  const pairScore = ctx.Bot.cardScore(state, p, "B005");
  const freshScore = ctx.Bot.cardScore(state, p, "B004");
  assert.ok(pairScore > freshScore);
});

test("hard bot: balast z ruky predá (0 útoku, cudzia rasa po zafixovaní), plnú plochu nevyprázdni", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(31), null);
  E.startRound(state); E.startRound(state); E.startRound(state); // kolo 3 = rasa zafixovaná
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0;
  p.deck = [{ defId: "U001", rank: 1 }, { defId: "U003", rank: 1 }, { defId: "U005", rank: 1 }];
  p.discard = [];
  // plná plocha rôznych undead tiel (rovnaké kópie by sa evolvli a uvoľnili sloty)
  p.board = ["U008", "U006", "U007", "U004", "U003"].map((id, i) => Object.assign(E.makeInst(state, id, 1), { slot: i }));
  const junk = E.makeInst(state, "O001", 1); junk.atk = 0;      // prehratý hod mincou
  const foreign = E.makeInst(state, "B001", 1);                 // cudzia rasa, t1, bez trojice
  const keeper = E.makeInst(state, "U009", 1);                  // vlastná rasa – ostane (na výmenu je príliš slabá? 5/4+2 vs 3/8+2+1)
  p.hand = [junk, foreign, keeper];
  const events = ctx.Bot.botTurn(state, "p2", "hard");
  const sold = events.filter(e => e.type === "sell").map(e => e.defId);
  assert.ok(sold.includes("O001") && sold.includes("B001"), sold.join(","));
  assert.ok(events.some(e => e.type === "tierUp")); // zlato z predaja išlo do upgradu (plná plocha)
  assert.equal(p.board.length, 5);
  assert.ok(!p.discard.some(c => c.defId === "O001"));  // predaný, nie odhodený
  assert.ok(!p.discard.some(c => c.defId === "B001"));
  assert.ok(p.discard.some(c => c.defId === "U009") || p.board.some(x => x.defId === "U009"));
});

test("hard bot: silnejšie telo z ruky vymení za najslabšie na plnej ploche", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(32), null);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; p.deck = []; p.discard = [];
  p.board = ["B002", "B008", "B006", "B009"].map((id, i) => Object.assign(E.makeInst(state, id, 1), { slot: i }));
  const weak = E.makeInst(state, "B001", 1); weak.slot = 4; // 2/2
  p.board.push(weak);
  p.hand = [E.makeInst(state, "B010", 1)]; // 6/10 taunt
  ctx.Bot.botTurn(state, "p2", "hard");
  assert.ok(p.board.some(x => x.defId === "B010"));
  assert.ok(!p.board.some(x => x.defId === "B001"));
  assert.equal(p.board.length, 5);
});

test("hard bot: poradie útoku – Pri útoku vľavo, škálovač vpravo", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(33), null);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; p.deck = []; p.discard = [];
  const scaler = E.makeInst(state, "B009", 1);  // raceDeath – má prežiť
  const wind = E.makeInst(state, "E004", 1);    // onAttack – prvý
  const body = E.makeInst(state, "O005", 1);    // 4/5 vanilla
  p.hand = [scaler, wind, body];
  ctx.Bot.botTurn(state, "p2", "hard");
  const order = [...p.board].sort((a, b) => a.slot - b.slot).map(x => x.defId);
  assert.deepEqual(order, ["E004", "O005", "B009"]);
});

test("bot: ogre a dragon nie sú dominantná rasa; s dominantnou rasou je ogr len mierne horší, cudzia hlavná rasa výrazne", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(35), null);
  state.round = 4;
  const p = state.p2;
  p.deck = ["O004", "O004", "O001", "D001", "D007", "U001", "U002", "U003"].map(id => ({ defId: id, rank: 1 }));
  p.discard = []; p.hand = []; p.board = [];
  assert.equal(ctx.Bot.dominantRace(state, p), "undead"); // 5 ogrov+drakov nerozhoduje, 3 undead áno
  const own = ctx.Bot.cardScore(state, p, "U006");   // t3 undead
  const ogre = ctx.Bot.cardScore(state, p, "O008");  // t3 ogr (podporná)
  const beast = ctx.Bot.cardScore(state, p, "B008"); // t3 beast (cudzia hlavná)
  assert.ok(own > ogre && ogre > beast, `${own} / ${ogre} / ${beast}`);
  p.deck = ["O004", "O004", "O001", "D001", "D007"].map(id => ({ defId: id, rank: 1 }));
  assert.equal(ctx.Bot.dominantRace(state, p), null);
  const o1 = E.makeInst(state, "O001", 1);
  p.deck = ["U001", "U002", "U003"].map(id => ({ defId: id, rank: 1 }));
  assert.equal(ctx.Bot.isJunk(state, p, o1), true); // ogr t1 bez páru = balast v undead builde
});

test("bot skóre: po zafixovaní rasy je cudzia karta rovnakého tieru horšia, kúzla nad strop trestané", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(34), null);
  state.round = 3;
  const p = state.p2;
  p.deck = ["U001", "U002", "U003", "U005"].map(id => ({ defId: id, rank: 1 }));
  p.discard = []; p.hand = []; p.board = [];
  assert.equal(ctx.Bot.dominantRace(state, p), "undead");
  const own = ctx.Bot.cardScore(state, p, "U006");   // t3 undead
  const other = ctx.Bot.cardScore(state, p, "B008"); // t3 beast
  assert.ok(own > other + 4, `${own} vs ${other}`);
  const noSpells = ctx.Bot.cardScore(state, p, "jablko");
  p.deck.push({ defId: "jablko", rank: 1 }, { defId: "koren", rank: 1 }, { defId: "stit", rank: 1 });
  const manySpells = ctx.Bot.cardScore(state, p, "jablko");
  assert.ok(manySpells < noSpells - 2, `${manySpells} vs ${noSpells}`);
});

test("bot: víly v štartovacom balíčku pred zafixovaním rasy NErušia strop na kúzla", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(51), null);
  state.round = 2; // pred RACE_LOCK_ROUND – dominantná rasa je ešte null
  const p = state.p2;
  // 3 víly v náhodnom štartovacom balíčku sú bežné; bot sa kvôli nim
  // považoval za vílí build, strop na kúzla vypadol a míňal zvyšné zlato
  // na Štíty za 1 (záznam z 8. 9. 2026: 5 Štítov v druhom kole).
  p.deck = ["F002", "F003", "F003", "B001", "B003"].map(id => ({ defId: id, rank: 1 }));
  p.discard = []; p.hand = []; p.board = [];
  assert.equal(ctx.Bot.dominantRace(state, p), null);
  const noSpells = ctx.Bot.cardScore(state, p, "stit");
  p.deck.push({ defId: "stit", rank: 1 }, { defId: "stit", rank: 1 }, { defId: "stit", rank: 1 });
  const manySpells = ctx.Bot.cardScore(state, p, "stit");
  assert.ok(manySpells < noSpells - 2, `kúzla nad strop musia byť trestané: ${manySpells} vs ${noSpells}`);
});

test("bot: kúzlo nad strop je balast a predá sa; Minca a discover nie", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(52), null);
  state.round = 4;
  const p = state.p2;
  p.deck = ["U001", "U002", "U003", "jablko", "koren", "vlna"].map(id => ({ defId: id, rank: 1 }));
  p.discard = []; p.hand = []; p.board = [];
  assert.equal(ctx.Bot.dominantRace(state, p), "undead");
  const jablko = E.makeInst(state, "jablko", 1);
  assert.equal(ctx.Bot.isJunk(state, p, jablko), true);  // 3 kúzla > SPELL_CAP
  const minca = E.makeInst(state, "minca", 1);
  assert.equal(ctx.Bot.isJunk(state, p, minca), false);  // zlato má hodnotu vždy
  const kniha = E.makeInst(state, "kniha", 1);
  assert.equal(ctx.Bot.isJunk(state, p, kniha), false);  // discover dá kartu
  // Vo vílom builde sú kúzla motor – strop je vyšší, tie isté 3 nie sú balast.
  p.deck = ["F002", "F003", "F004", "jablko", "koren", "vlna"].map(id => ({ defId: id, rank: 1 }));
  assert.equal(ctx.Bot.dominantRace(state, p), "fairy");
  assert.equal(ctx.Bot.isJunk(state, p, jablko), false);
});

test("bot: Štít je výplňové kúzlo – nekupuje ho nikto, ani vílí build, a vždy sa predá", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(54), null);
  state.round = 4;
  const p = state.p2;
  const stit = E.makeInst(state, "stit", 1);
  for (const [dom, deck] of [["undead", ["U001", "U002", "U003"]], ["fairy", ["F002", "F003", "F004"]]]) {
    p.deck = deck.map(id => ({ defId: id, rank: 1 }));
    p.discard = []; p.hand = []; p.board = [];
    assert.equal(ctx.Bot.dominantRace(state, p), dom);
    // Balíček je pod stropom kúziel – Štít je balast aj tak, sám o sebe nemá hodnotu.
    assert.equal(ctx.Bot.isJunk(state, p, stit), true, dom);
    assert.ok(ctx.Bot.cardScore(state, p, "stit") < 0, `${dom}: ${ctx.Bot.cardScore(state, p, "stit")}`);
    assert.ok(ctx.Bot.cardScore(state, p, "stit") < ctx.Bot.cardScore(state, p, "jablko"), dom);
  }
});

test("hard bot: upgrade tieru nečaká na plnú plochu – stačí, že po ňom ostane na kartu", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(53), null);
  for (let i = 0; i < 3; i++) E.startRound(state); // kolo 3 – onSchedule pre t2
  E.endShopTurn(state, "p1");
  const p = state.p2;
  // Plocha ostane deravá (2 telá v ruke) – stará podmienka „aspoň 4 telá"
  // bránu nikdy neotvorila a bot ostal 2 tiery za hráčom.
  p.deck = []; p.discard = []; p.hand = []; p.board = [];
  p.hand = [E.makeInst(state, "U001", 1, p), E.makeInst(state, "U002", 1, p)];
  p.hand.forEach((x, i) => { x.slot = i; });
  p.money = 20;
  const events = ctx.Bot.botTurn(state, "p2", "hard");
  assert.ok(events.some(e => e.type === "tierUp"), "bot musí upgradnúť aj s deravou plochou");
  assert.ok(p.tier >= 2, `tier ${p.tier}`);
});

test("hard bot: lov rasy – bez relevantnej karty vlastnej rasy v ponuke refreshne namiesto kúpy t1 balastu", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(36), null);
  E.startRound(state); E.startRound(state); E.startRound(state); E.startRound(state); // kolo 4
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.tier = 4; p.money = 7;
  p.deck = ["U003", "U005", "U006", "U007"].map(id => ({ defId: id, rank: 1 }));
  p.discard = []; p.hand = []; p.board = [];
  assert.equal(ctx.Bot.dominantRace(state, p), "undead");
  // ponuka: len cudzie telá + t1 undead vanilla-ish (U001 má schopnosť → relevantný nie je? U001 má power → je) – použi U002? má power tiež.
  // Použijeme čisto cudzie karty: bot musí refreshnúť aspoň raz.
  state.commons = ["B001", "O004", "D001"];
  p.priv = [{ defId: "F002", frozen: false }, { defId: "E002", frozen: false }, { defId: "B003", frozen: false }, { defId: "O005", frozen: false }, { defId: "F003", frozen: false }];
  const events = ctx.Bot.botTurn(state, "p2", "hard");
  assert.ok(events.some(e => e.type === "refresh"), "očakávaný refresh");
  const bought = events.filter(e => e.type === "buy").map(e => e.defId);
  assert.ok(!bought.some(id => ["B001", "O004", "D001", "F002", "E002", "B003", "O005", "F003"].includes(id)), bought.join(","));
});

test("bot: dračí cielený battlecry mieri na kartu dominantnej rasy, nie na najsilnejší cudzí splash", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(37), null);
  E.startRound(state); E.startRound(state); E.startRound(state); // kolo 3 – rasa zafixovaná
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; p.deck = ["U001", "U003", "U005"].map(id => ({ defId: id, rank: 1 })); p.discard = [];
  const bone = E.makeInst(state, "U002", 1);   // undead 2/1
  const ogre = E.makeInst(state, "O008", 1);   // ogr 5/7 – najsilnejší, ale splash
  const drake = E.makeInst(state, "D002", 1);  // battlecry: rasa cieľa +1/+1 do boja
  p.hand = [drake, bone, ogre]; p.board = [];
  ctx.Bot.botTurn(state, "p2", "hard");
  const b = p.board.find(x => x.defId === "U002"), o = p.board.find(x => x.defId === "O008");
  assert.equal(b.atk, 3, "undead dostal dračí buff");   // 2+1
  assert.equal(o.atk, 5, "ogr nedostal");
  assert.ok(p.fightRaceBuffs.undead && p.fightRaceBuffs.undead.a === 1);
});

test("hard bot: po zafixovaní rasy si nastaví rollBias na dominantnú rasu (normal nie)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  for (const [diff, expect] of [["hard", "undead"], ["normal", null]]) {
    const state = E.newGame(seeded(38), null);
    E.startRound(state); E.startRound(state); E.startRound(state);
    E.endShopTurn(state, "p1");
    const p = state.p2;
    p.deck = ["U001", "U003", "U005"].map(id => ({ defId: id, rank: 1 })); p.discard = [];
    ctx.Bot.botTurn(state, "p2", diff);
    assert.equal(p.rollBias ? p.rollBias.race : null, expect, diff);
  }
});

test("hard bot: +1 zlato každé kolo (raz za kolo), normal nie", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  for (const [diff, expect] of [["hard", 1], ["normal", 0]]) {
    const state = E.newGame(seeded(39), null);
    E.startRound(state);
    E.endShopTurn(state, "p1");
    const p = state.p2;
    p.money = 0; p.deck = []; p.discard = []; p.hand = [];
    state.commons = ["B002", "B002", "B002"]; p.priv = [{ defId: "B002", frozen: false }, { defId: "B002", frozen: false }];
    p.spellShop = { defId: "srdce", frozen: false }; // všetko za 3 – s 1 zlatom nič nekúpi
    ctx.Bot.botTurn(state, "p2", diff);
    assert.equal(p.money, expect, diff);
  }
  // druhé volanie v tom istom kole už nepridá (stráž bonusRound)
  const state = E.newGame(seeded(40), null);
  E.startRound(state); E.endShopTurn(state, "p1");
  const p = state.p2; p.money = 0; p.deck = []; p.discard = []; p.hand = [];
  state.commons = ["B002", "B002", "B002"]; p.priv = [{ defId: "B002", frozen: false }, { defId: "B002", frozen: false }];
  p.spellShop = { defId: "srdce", frozen: false };
  ctx.Bot.botTurn(state, "p2", "hard");
  assert.equal(p.bonusRound, state.round);
});

test("bot: pickBan vyberie hlavnú rasu zo svojej trojice (nie draka/ogra, ak má na výber)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(61), null, { ban: true });
  const race = B.pickBan(state, "p2");
  assert.ok(state.ban.offers.p2.includes(race));
  const main = state.ban.offers.p2.filter(r => !B.SUPPORT_RACES.has(r));
  if (main.length) assert.ok(!B.SUPPORT_RACES.has(race));
  assert.ok(E.pickBan(state, "p2", race));
});

test("bot: withExecutor – každá akcia jadra ťahu ide cez executor a zalogovaná sekvencia dá po replayi rovnaký stav", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const play = (log) => {
    const state = E.newGame(seeded(77), null);
    E.startRound(state);
    E.endShopTurn(state, "p1");
    if (log) {
      B.withExecutor((name, s, pid, ...args) => { const ev = E[name](s, pid, ...args); if (ev) log.push([name, args]); return ev; },
        () => B.completeTurn(state, "p2", B.HYGIENE, () => {}));
      E.endShopTurn(state, "p2");
    }
    return state;
  };
  const log = [];
  const a = play(log);
  assert.ok(log.length > 0);
  assert.ok(log.some(([n]) => n === "playMinion"));
  // replay zo záznamu (bez bota) musí skončiť v rovnakom stave
  const b = play(null);
  for (const [name, args] of log) assert.ok(E[name](b, "p2", ...args) !== null, name);
  E.endShopTurn(b, "p2");
  const view = s => JSON.stringify([s.p2.board.map(x => [x.defId, x.rank, x.atk, x.hp, x.slot]), s.p2.deck.map(c => c.defId), s.p2.money, s.p2.tier]);
  assert.equal(view(a), view(b));
});

test("hard bot: strop balíčka – nad DECK_CAP predá najslabšie telo z ruky bez páru, pod stropom nepredáva", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const setup = deckLen => {
    const state = E.newGame(seeded(78), null);
    E.startRound(state); E.startRound(state); E.startRound(state);
    E.endShopTurn(state, "p1");
    const p = state.p2;
    p.money = 0;
    p.discard = [];
    p.deck = Array.from({ length: deckLen }, (_, i) => ({ defId: ["B002", "B004", "B005", "B008", "B009", "B010"][i % 6], rank: 1 }));
    p.board = ["B008", "B004", "B005", "B002", "B009"].map((id, i) => Object.assign(E.makeInst(state, id, 1), { slot: i }));
    const weak = E.makeInst(state, "B007", 1);  // 1/1 zviera bez páru – kandidát na predaj
    const strong = E.makeInst(state, "B010", 1); // 6/10 taunt – hodnotné telo
    p.hand = [strong, weak];
    return { state, p };
  };
  const over = setup(12); // 12 + 5 + 2 = 19 > 14
  assert.ok(B.deckSize(over.p) > B.DECK_CAP);
  const evOver = B.botTurn(over.state, "p2", "hard");
  assert.ok(evOver.some(e => e.type === "sell" && e.defId === "B007"), "B007 sa mal predať");
  assert.ok(!evOver.some(e => e.type === "sell" && e.defId === "B010"), "B010 sa nemal predať");

  const under = setup(3); // 3 + 5 + 2 = 10 <= 14
  assert.ok(B.deckSize(under.p) <= B.DECK_CAP);
  const evUnder = B.botTurn(under.state, "p2", "hard");
  // pod stropom B007 ostáva (predaj B005 z plochy je bežná výmena za silnejšie B010)
  assert.ok(!evUnder.some(e => e.type === "sell" && e.defId === "B007"), "pod stropom sa B007 nepredáva");
});

test("bot: drak tieru 1–2 je od tieru 3 balast (predtým žoldnier)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(79), null);
  E.startRound(state); E.startRound(state); E.startRound(state);
  const p = state.p2;
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "B003", rank: 1 }, { defId: "B004", rank: 1 }];
  p.discard = []; p.hand = []; p.board = [];
  const drake = E.makeInst(state, "D001", 1);
  p.tier = 2;
  assert.equal(B.isJunk(state, p, drake), false);
  p.tier = 3;
  assert.equal(B.isJunk(state, p, drake), true);
});

test("cardPower: každá karta má konečnú silu; Pečať a rast NAVŽDY prebijú vanilla telo rovnakého tieru", () => {
  const ctx = loadEngine();
  const B = ctx.Bot, C = ctx.Cards;
  for (const d of C.DEFS) {
    const pw = B.cardPower(d);
    assert.ok(Number.isFinite(pw.total) && pw.total > 0, d.id + " " + JSON.stringify(pw));
    if (!d.spell) assert.equal(pw.body, d.atk + d.hp + (d.taunt ? 1 : 0) + (d.cleave ? 5 : 0), d.id);
  }
  const power = id => B.cardPower(C.byId[id]).total;
  assert.ok(power("B002") > power("O008"), "Pečať t3 > vanilla t3");
  assert.ok(power("B008") > power("O008"), "rast navždy t3 > vanilla t3");
  assert.ok(power("E003") > power("O005"), "Pečať t2 > vanilla t2");
  assert.ok(power("B006") > power("B010"), "B006 (2× SuperMláďa s Pečaťou) > B010");
  assert.ok(power("hviezda") > power("srdce"), "Pečať všetkým > jednorazový buff");
});

test("Claude bot: katalóg kariet obsahuje všetky karty s tierom a silou, zabanovanú rasu vynechá", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const vm = await import("node:vm");
  const { ROOT } = await import("./harness.mjs");
  const ctx = loadEngine();
  ctx.fetch = () => { throw new Error("no net"); };
  ctx.AbortController = class { constructor() { this.signal = null; } abort() {} };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  const src = fs.readFileSync(path.join(ROOT, "src/claude-bot.js"), "utf8").replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
  vm.runInContext(src, ctx, { filename: "src/claude-bot.js" });
  const state = ctx.Engine.newGame(seeded(5), null);
  const all = ctx.ClaudeBot.catalogue(state);
  for (const d of ctx.Cards.DEFS) assert.ok(all.includes(`${d.id} t${d.tier}`), d.id);
  assert.ok(/B002 t3 4\/5 power \d+/.test(all));
  state.banned = "ogre";
  const noOgre = ctx.ClaudeBot.catalogue(state);
  assert.ok(!noOgre.includes("O001 t1"));
  assert.ok(noOgre.includes("B001 t1"));
});

test("bot skóre: sila karty je základ – B004 (rast navždy) > B005 a Pečať B002 > vanilla O008 aj bez rasy", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(91), null);
  const p = state.p2;
  p.deck = []; p.discard = []; p.hand = []; p.board = [];
  assert.ok(B.cardScore(state, p, "B004") > B.cardScore(state, p, "B005"));
  assert.ok(B.cardScore(state, p, "B002") > B.cardScore(state, p, "O008"));
});

test("hard bot: lákadlo tieru – Pečať B002 na t3 upgraduje pred plánom (normal nie)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const setup = () => {
    const state = E.newGame(seeded(92), null);
    E.startRound(state); E.startRound(state); // kolo 2
    E.endShopTurn(state, "p1");
    const p = state.p2;
    p.tier = 2; p.reachedRound = 1; // upgrade na t3 stojí 8 − 1 = 7, plán káže až kolo 5
    p.money = 10;
    p.deck = [{ defId: "B001", rank: 1 }, { defId: "B003", rank: 1 }, { defId: "B007", rank: 1 }];
    p.discard = [];
    p.board = ["B001", "B003", "B004", "B005"].map((id, i) => Object.assign(E.makeInst(state, id, 1), { slot: i }));
    p.hand = [];
    return { state, p };
  };
  // dominantná rasa sa fixuje od 3. kola – kolo 2 ju ešte nemá, nastav 3
  const hard = setup(); hard.state.round = 3; hard.p.reachedRound = 2;
  assert.ok(E.upgradeCost(hard.state, "p2") > 2);
  B.botTurn(hard.state, "p2", "hard");
  assert.equal(hard.p.tier, 3, "hard: lákadlo B002 na t3");
  const normal = setup(); normal.state.round = 3; normal.p.reachedRound = 2;
  B.botTurn(normal.state, "p2", "normal");
  assert.equal(normal.p.tier, 2, "normal: bez lákadla, tier ostáva");
});

test("hard bot: lov rasy podľa sily – t1 zvieratá bez rastu na t4 nie sú relevantné, refreshne", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(93), null);
  E.startRound(state); E.startRound(state); E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.tier = 4; p.money = 10;
  p.discard = []; p.hand = []; p.board = [];
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "B005", rank: 1 }, { defId: "B008", rank: 1 }, { defId: "B009", rank: 1 }];
  p.priv = [{ defId: "B007", frozen: false }, { defId: "B001", frozen: false }, { defId: "B005", frozen: false }];
  state.commons = ["O004", "O005", "F003"];
  const events = B.botTurn(state, "p2", "hard");
  assert.ok(events.some(e => e.type === "refresh"), "t1 zvieratá bez rastu na t4 nie sú relevantné – refresh");
});

test("cardPower: vyvolávač škáluje počtom (+1 token za stupeň) a tokeny nesú Pečať majiteľa", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot, C = ctx.Cards;
  const u9 = C.byId["U009"];
  assert.equal(B.cardPower(u9).ability, 6);                   // 3 Kostíky × 2
  assert.equal(B.cardPower(u9, { rank: 2 }).ability, 8);      // 4 Kostíky × 2, nie 12
  const state = E.newGame(seeded(94), null);
  const p = state.p2;
  p.raceBuffs.undead = { a: 1, h: 1 };                        // U003 + U008
  assert.equal(B.cardPower(u9, { rank: 2, p }).ability, 16);  // 4 Kostíky × (2 + 2 aura)
  assert.ok(B.cardScore(state, p, "U009") > B.cardScore(state, state.p1, "U009"), "s Pečaťou nemŕtvych je vyvolávač cennejší");
});

test("hard bot: po zafixovaní rasy predá cudzí balast hneď, aj keď plocha ostane tenká (do 8. kola)", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(95), null);
  E.startRound(state); E.startRound(state); E.startRound(state); E.startRound(state); // kolo 4
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; p.tier = 3;
  p.deck = [{ defId: "E001", rank: 1 }, { defId: "E003", rank: 1 }, { defId: "E002", rank: 1 }];
  p.discard = []; p.board = [];
  const own = E.makeInst(state, "E004", 1);
  const pair1 = E.makeInst(state, "B003", 1);   // pár cudzej t1 – tiež balast
  const pair2 = E.makeInst(state, "B003", 1);
  const silver = E.makeInst(state, "B001", 2);  // strieborná cudzia t1 – balast až od tieru 4
  p.hand = [own, pair1, pair2, silver];
  assert.equal(B.isJunk(state, p, pair1), true);
  assert.equal(B.isJunk(state, p, silver), false);
  p.tier = 4;
  assert.equal(B.isJunk(state, p, silver), true);
  const events = B.botTurn(state, "p2", "hard");
  const sold = events.filter(e => e.type === "sell").map(e => e.defId);
  assert.deepEqual([...sold].sort(), ["B001", "B003", "B003"]); // spread: pole z vm kontextu má iný prototyp
  assert.deepEqual([...p.board.map(x => x.defId)], ["E004"], "plocha ostala tenká, balast nešiel na plochu");
});

test("hard bot: od 9. kola nechá pri predaji balastu aspoň 2 telá", () => {
  const ctx = loadEngine();
  const E = ctx.Engine, B = ctx.Bot;
  const state = E.newGame(seeded(96), null);
  for (let i = 0; i < 9; i++) E.startRound(state); // kolo 9
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; p.tier = 4;
  p.deck = [{ defId: "E001", rank: 1 }, { defId: "E003", rank: 1 }, { defId: "E002", rank: 1 }];
  p.discard = []; p.board = [];
  p.hand = [E.makeInst(state, "E004", 1), E.makeInst(state, "B003", 1), E.makeInst(state, "B007", 1)];
  const events = B.botTurn(state, "p2", "hard");
  const sold = events.filter(e => e.type === "sell").map(e => e.defId);
  assert.equal(sold.length, 1, "jedno cudzie telo ostalo, aby boli 2 telá na ploche");
  assert.equal(p.board.length, 2);
});
