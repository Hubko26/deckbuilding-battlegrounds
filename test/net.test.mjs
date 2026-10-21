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
  T.reset();
  T.dispatch({ type: "start", seed: 1, you: "p1" });
  calls.length = 0;
  return h;
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

test("rejoin: odchod súpera pri bežiacej hre = čakanie, po limite odpojenie", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const h = fresh(["onPeerLeft"], calls);
  h.canRejoin = () => true;
  T.dispatch({ type: "peerLeft" });
  T.dispatch({ type: "peerLeft" }); // duplicita nič nerobí
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].rejoin, true);
  t.mock.timers.tick(T.REJOIN_LIMIT - 1);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(calls[1][1].expired, true);
});

test("rejoin: keď hra skončila (canRejoin false), odchod súpera je obyčajné odpojenie", () => {
  const calls = [];
  const h = fresh(["onPeerLeft"], calls);
  h.canRejoin = () => false;
  T.dispatch({ type: "leave" });
  assert.deepEqual(calls, [["onPeerLeft", {}]]);
});

test("rejoin: vracajúci sa hráč dostane log (rejoinReq -> getRejoin -> onRejoined), čakanie končí", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const h = fresh(["onPeerLeft", "onRejoined"], calls);
  h.canRejoin = () => true;
  h.getRejoin = () => ({ seed: 7, mut: false, actions: [["p1", "endShopTurn"]] });
  T.dispatch({ type: "peerLeft" });
  T.dispatch({ type: "rejoinReq", v: "abc" });
  assert.deepEqual(calls[1], ["onRejoined", { v: "abc" }]);
  t.mock.timers.tick(T.REJOIN_LIMIT + 1000);
  assert.equal(calls.length, 2); // limit už nevyprší
});

test("rejoin: správa 'rejoin' s logom ide do onRejoin; kick spustí onKicked", () => {
  const calls = [];
  fresh(["onRejoin", "onKicked", "onPeerLeft"], calls);
  T.dispatch({ type: "rejoin", seed: 5, mut: true, you: "p2", actions: [] });
  assert.equal(calls[0][0], "onRejoin");
  assert.equal(calls[0][1].you, "p2");
  T.dispatch({ type: "leave", kick: true });
  assert.equal(calls[1][0], "onKicked");
  assert.equal(calls.length, 2);
});

// ---------- Diváci ----------
// Falošné PeerJS spojenie: eventy sa spúšťajú ručne, odoslané správy sa zbierajú.
function fakeConn(metadata) {
  const ev = {};
  return {
    metadata, open: false, sent: [],
    on(k, fn) { (ev[k] = ev[k] || []).push(fn); },
    emit(k, ...a) { if (k === "open") this.open = true; if (k === "close") this.open = false; for (const fn of ev[k] || []) fn(...a); },
    send(m) { this.sent.push(m); },
    close() { this.emit("close"); },
  };
}

test("divák: dostane log hry + mená, potom akcie; počet divákov sa hlási", () => {
  const calls = [];
  const h = fresh(["onSpectators"], calls);
  T.dispatch({ type: "start", seed: 1, you: "p1", names: { p1: "Hubko", p2: "Adam" } });
  h.getSpectate = () => ({ seed: 9, actions: [["p1", "endShopTurn"]], chat: [] });
  const c = fakeConn({ spectate: true, name: "Teta" });
  T.specJoin(c, c.metadata);
  c.emit("open");
  assert.equal(c.sent[0].type, "specInit");
  assert.equal(c.sent[0].seed, 9);
  assert.deepEqual(c.sent[0].names, { p1: "Hubko", p2: "Adam" });
  assert.deepEqual(calls[0], ["onSpectators", { n: 1, name: "Teta", joined: true }]);
  Net.feedSpectators(["p2", "buyCommon", 0]);
  assert.deepEqual(c.sent[1], { type: "specAct", a: ["p2", "buyCommon", 0] });
  c.emit("close");
  assert.deepEqual(calls[1], ["onSpectators", { n: 0, name: "Teta", joined: false }]);
  Net.feedSpectators(["p1", "refreshShop"]);
  assert.equal(c.sent.length, 2); // odpojenému sa už nič neposiela
});

test("divák: bez rozohranej hry alebo s inou verziou dostane noGame", () => {
  const calls = [];
  const h = fresh(["onSpectators"], calls);
  h.getSpectate = () => null;
  const a = fakeConn({ spectate: true, name: "X" });
  T.specJoin(a, a.metadata);
  a.emit("open");
  assert.equal(a.sent[0].type, "noGame");
  h.getSpectate = () => ({ seed: 1, actions: [] });
  T.setVersion("v1");
  const b = fakeConn({ spectate: true, name: "Y", v: "v2" });
  T.specJoin(b, b.metadata);
  b.emit("open");
  assert.deepEqual(b.sent[0], { type: "noGame", full: false, ver: true });
  T.setVersion(null);
  assert.equal(calls.length, 0);
});

test("divák: jeho chat dostane hostiteľ (onChat from spec) aj ostatní diváci; chat hráčov ide divákom", () => {
  const calls = [];
  const h = fresh(["onChat", "onSpectators"], calls);
  T.dispatch({ type: "start", seed: 1, you: "p1", names: { p1: "Hubko", p2: "Adam" } });
  h.getSpectate = () => ({ seed: 1, actions: [] });
  const a = fakeConn({ spectate: true, name: "Teta" });
  const b = fakeConn({ spectate: true, name: "Ujo" });
  for (const c of [a, b]) { T.specJoin(c, c.metadata); c.emit("open"); }
  calls.length = 0;
  a.emit("data", { type: "chat", text: "  hurá  " });
  assert.deepEqual(calls[0], ["onChat", "hurá", { from: "spec", name: "Teta" }]);
  assert.deepEqual(b.sent.at(-1), { type: "chat", text: "hurá", from: "spec", name: "Teta" });
  assert.equal(a.sent.some(m => m.type === "chat"), false); // sebe nie
  a.emit("data", { type: "chat", text: "spam" }); // hneď ďalšia = anti-spam
  assert.equal(calls.length, 1);
  // súperova správa (p2) ide aj divákom s menom
  T.dispatch({ type: "chat", text: "ahoj" });
  assert.deepEqual(calls[1], ["onChat", "ahoj", { from: "opp", name: "Adam" }]);
  assert.deepEqual(a.sent.at(-1), { type: "chat", text: "ahoj", from: "p2", name: "Adam" });
});

test("divák (klient): specInit/specAct/chat idú do handlerov, noGame hlási chybu", () => {
  const calls = [];
  fresh(["onSpecInit", "onSpecAction", "onChat", "onPeerError"], calls);
  T.specDispatch({ type: "specInit", seed: 3, actions: [], names: { p1: "A", p2: "B" } });
  T.specDispatch({ type: "specAct", a: ["p1", "refreshShop"] });
  T.specDispatch({ type: "specAct", a: "zlé" });
  T.specDispatch({ type: "chat", text: "čau", from: "p2", name: "B" });
  T.specDispatch({ type: "chat", text: "joj", from: "hacker", name: "Z" });
  T.specDispatch({ type: "noGame", full: true });
  assert.deepEqual(calls.map(c => c[0]), ["onSpecInit", "onSpecAction", "onChat", "onChat", "onPeerError"]);
  assert.deepEqual(Net.info().names, { p1: "A", p2: "B" });
  assert.deepEqual(calls[2], ["onChat", "čau", { from: "p2", name: "B" }]);
  assert.equal(calls[3][2].from, "spec"); // neznámy odosielateľ = divák
  assert.equal(calls[4][1], "specFull");
});
