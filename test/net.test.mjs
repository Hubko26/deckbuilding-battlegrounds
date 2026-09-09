import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Sieťová vrstva bez transportu: správy idú priamo do dispatch. Testuje chat
// a prítomnosť hráča (away/back/leave), nie WebSocket ani PeerJS.
const require = createRequire(import.meta.url);
const Net = require("../src/net.js");
const T = Net._test;

function fresh(handlers, calls) {
  const h = {};
  for (const k of handlers) h[k] = (...a) => calls.push([k, ...a]);
  T.setHandlers(h);
  T.dispatch({ type: "start", seed: 1, you: "p1" });
  calls.length = 0;
}

test("chat: text sa oreže na limit a prázdny sa ignoruje", () => {
  const calls = [];
  fresh(["onChat"], calls);
  T.dispatch({ type: "chat", text: "  ahoj  " });
  T.dispatch({ type: "chat", text: "   " });
  T.dispatch({ type: "chat", text: 42 });
  T.dispatch({ type: "chat", text: "x".repeat(T.CHAT_MAX + 50) });
  assert.deepEqual(calls.map(c => c[0]), ["onChat", "onChat"]);
  assert.equal(calls[0][1], "ahoj");
  assert.equal(calls[1][1].length, T.CHAT_MAX);
});

test("away/back: ohlási odchod a návrat, po návrate limit nevyprší", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  fresh(["onPeerAway", "onPeerBack", "onPeerLeft"], calls);
  T.dispatch({ type: "away" });
  T.dispatch({ type: "away" }); // duplicita nič nerobí
  T.dispatch({ type: "back" });
  T.dispatch({ type: "back" });
  t.mock.timers.tick(T.AWAY_LIMIT + 1000);
  assert.deepEqual(calls, [["onPeerAway", T.AWAY_LIMIT], ["onPeerBack"]]);
});

test("away bez návratu: po limite sa hra ukončí ako odpojenie", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  fresh(["onPeerAway", "onPeerBack", "onPeerLeft"], calls);
  T.dispatch({ type: "away" });
  t.mock.timers.tick(T.AWAY_LIMIT - 1);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(calls[1], ["onPeerLeft", { away: true }]);
  T.dispatch({ type: "back" }); // neskorý návrat už nič neohlási
  assert.equal(calls.length, 2);
});

test("leave: okamžité odpojenie a zrušenie away limitu", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  fresh(["onPeerAway", "onPeerLeft"], calls);
  T.dispatch({ type: "away" });
  T.dispatch({ type: "leave" });
  t.mock.timers.tick(T.AWAY_LIMIT + 1000);
  assert.deepEqual(calls.map(c => c[0]), ["onPeerAway", "onPeerLeft"]);
});
