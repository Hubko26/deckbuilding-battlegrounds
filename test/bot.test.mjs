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

test("bot skóre: preferuje dokončenie trojice", () => {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(3));
  const p = state.p2;
  p.board = [ctx.Engine.makeInst(state, "B005", 1), ctx.Engine.makeInst(state, "B005", 1)];
  const pairScore = ctx.Bot.cardScore(state, p, "B005");
  const freshScore = ctx.Bot.cardScore(state, p, "B004");
  assert.ok(pairScore > freshScore);
});
