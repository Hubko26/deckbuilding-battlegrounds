import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Register prebiehajúcich hier (src/lobby.js) bez PeerJS: čisté funkcie.
const require = createRequire(import.meta.url);
const Lobby = require("../src/lobby.js");
const T = Lobby._test;

const game = (code, round) => ({ code, names: ["Hubko", "Adam"], round, hp: [40, 30], tier: [3, 2], specs: 1, v: "x" });

test("lobby: zápis, obnova a vypršanie hry; zoznam od najdlhšie hranej", () => {
  const reg = new Map();
  assert.equal(T.upsert(reg, game("1234", 3), 0), true);
  assert.equal(T.upsert(reg, game("5678", 7), 0), true);
  assert.equal(T.upsert(reg, game("1234", 4), 10000), true); // obnova
  assert.deepEqual(T.listOf(reg).map(g => g.code), ["5678", "1234"]);
  T.prune(reg, T.TTL + 1);
  assert.deepEqual(T.listOf(reg).map(g => [g.code, g.round]), [["1234", 4]]);
});

test("lobby: neplatné záznamy sa zahodia, mená sa orežú, register má strop", () => {
  const reg = new Map();
  assert.equal(T.upsert(reg, { code: "12" }, 0), false);
  assert.equal(T.upsert(reg, null, 0), false);
  assert.equal(T.upsert(reg, { code: "abcd" }, 0), false);
  T.upsert(reg, { ...game("1111", 1), names: ["x".repeat(99), { evil: 1 }], hp: ["7", null] }, 0);
  const g = T.listOf(reg)[0];
  assert.equal(g.names[0].length, 24);
  assert.equal(g.names[1], "[object Object]".slice(0, 24));
  assert.deepEqual(g.hp, [7, 0]);
  for (let i = 0; i < T.MAX_GAMES + 5; i++) T.upsert(reg, game(String(2000 + i), 1), 0);
  assert.equal(reg.size, T.MAX_GAMES);
});
