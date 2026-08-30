import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

// Bot musí odohrať legálny ťah v každej obtiažnosti a hra musí dobehnúť.
for (const diff of ["easy", "normal", "hard"]) {
  test(`bot (${diff}): odohrá ťah bez chýb a neminie viac než má`, () => {
    const ctx = loadEngine();
    const state = ctx.Engine.newGame(seeded(42));
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
  const state = ctx.Engine.newGame(seeded(7));
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
  const state = E.newGame(seeded(21));
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0; // nič nenakupuj
  p.deck = []; p.discard = [];
  const plain = E.makeInst(state, "B001", 1); plain.slot = 0;   // beast 2/2
  const buffer = E.makeInst(state, "B009", 1); buffer.slot = 1; // battlecry: Zvieratám +2/+2
  p.hand = [buffer, plain];
  ctx.Bot.botTurn(state, "p2", "normal");
  const played = p.board.find(x => x.defId === "B001");
  assert.ok(played);
  assert.equal(played.atk, 4); // 2+2 – buffer prišiel na plochu až po ňom
  assert.equal(played.hp, 4);
});

test("bot skóre: aura vlastnej rasy má vysokú prioritu", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(22));
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
  const state = ctx.Engine.newGame(seeded(3));
  const p = state.p2;
  p.board = [ctx.Engine.makeInst(state, "B005", 1), ctx.Engine.makeInst(state, "B005", 1)];
  const pairScore = ctx.Bot.cardScore(state, p, "B005");
  const freshScore = ctx.Bot.cardScore(state, p, "B004");
  assert.ok(pairScore > freshScore);
});
