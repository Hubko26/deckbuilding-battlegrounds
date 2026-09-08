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
  const buffer = E.makeInst(state, "E008", 1); buffer.slot = 1; // battlecry: aura Živlov +1/+1
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
