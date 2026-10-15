// Dotahovanie kariet: začiatok ťahu (ruka na 5), Pohladkanie (kartu ťahá
// len prvé v kole), spájanie pohladkaní a battlecry, ktoré pridávajú
// pohladkania – nič z toho nesmie dať kartu navyše (hlásenie 14. 10. 2026:
// ťah so 6 kartami bez trinketu, D010 na psíka „dotiahol" dve karty).
import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1, opts) {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(seed), null, opts);
  return { state, E: ctx.Engine, C: ctx.Cards, B: ctx.Bot };
}

const cards = ids => ids.map(defId => ({ defId, rank: 1 }));
// Desať rôznych príšer bez spájania (žiadne dve rovnaké).
const TEN = ["B001", "B003", "B007", "E001", "E002", "U001", "F001", "O001", "O004", "D001"];

// Hráč na ťahu s prázdnymi zónami a zadaným balíčkom / kôpkou.
function setup(seed, deck, discard = []) {
  const { state, E, C } = fresh(seed);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.hand = []; p.board = []; p.spentSpells = [];
  p.deck = cards(deck); p.discard = cards(discard);
  return { state, E, C, pid, p };
}
const inHand = (E, state, p, defId, rank = 1) => {
  const inst = E.makeInst(state, defId, rank, p);
  inst.slot = p.hand.length;
  p.hand.push(inst);
  return inst;
};
const onBoard = (E, state, p, defId, rank = 1) => {
  const inst = E.makeInst(state, defId, rank, p);
  inst.slot = p.board.length;
  p.board.push(inst);
  return inst;
};
const draws = ev => ev.filter(e => e.type === "draw").length;

// ---------- Začiatok ťahu ----------

test("ťah: ruka sa dotiahne presne na 5", () => {
  const { state, E, pid, p } = setup(1, TEN);
  const ev = E.beginShopTurn(state, pid);
  assert.equal(p.hand.length, 5);
  assert.equal(draws(ev), 5);
  assert.equal(p.deck.length, 5);
});

test("ťah: zvyšok ruky sa len doplní, nie ťahá 5 nových", () => {
  const { state, E, pid, p } = setup(2, TEN);
  inHand(E, state, p, "P001"); inHand(E, state, p, "P002");
  E.beginShopTurn(state, pid);
  assert.equal(p.hand.length, 5);
  assert.equal(p.deck.length, 7);
});

test("ťah: prázdny balíček zamieša kôpku a ťahá ďalej; málo kariet = menšia ruka", () => {
  const a = setup(3, ["B001", "B003"], ["E001", "E002", "U001", "F001"]);
  const ev = a.E.beginShopTurn(a.state, a.pid);
  assert.equal(a.p.hand.length, 5);
  assert.ok(ev.some(e => e.type === "reshuffle"));
  assert.equal(a.p.deck.length + a.p.discard.length, 1);
  const b = setup(4, ["B001", "B003", "E001"]);
  b.E.beginShopTurn(b.state, b.pid);
  assert.equal(b.p.hand.length, 3);
});

test("ťah: 3 Pohladkania v balíčku sa spoja do balíčka – ruka ostane 5", () => {
  const { state, E, pid, p } = setup(5, ["pet", "pet", "pet", ...TEN]);
  const ev = E.beginShopTurn(state, pid);
  assert.equal(p.hand.length, 5);
  assert.ok(ev.some(e => e.type === "petMerge"));
  const allPets = [...p.hand, ...p.deck].filter(c => c.defId === "pet");
  assert.equal(allPets.length, 1);
  assert.equal(allPets[0].rank, 2);
});

test("ťah: spojenie pohladkaní z ruky dá Super do ruky a ruka sa dotiahne na 5", () => {
  // Balíček sa ťahá od konca – prvé 3 ťahy sú pohladkania.
  const { state, E, pid, p } = setup(6, [...TEN, "pet", "pet", "pet"]);
  E.beginShopTurn(state, pid);
  assert.equal(p.hand.length, 5);
  assert.equal(p.hand.filter(c => c.defId === "pet" && c.rank === 2).length, 1);
});

test("ťah: 6 kariet len s Veľkou rukou; pohladkania z rukavice/Vodítka idú do balíčka", () => {
  const a = setup(7, TEN);
  a.p.trinkets.push("bigHand");
  a.E.beginShopTurn(a.state, a.pid);
  assert.equal(a.p.hand.length, 6);
  const b = setup(8, TEN);
  b.p.trinkets.push("doggyGlove");
  b.E.beginShopTurn(b.state, b.pid);
  assert.equal(b.p.hand.length, 5);
  assert.equal(b.p.deck.filter(c => c.defId === "pet").length, 1);
  // hlásenie 15. 10. 2026: rukavica + Vodítko dávali ťah so 7 kartami
  const c = setup(9, TEN);
  c.p.trinkets.push("doggyGlove", "doggyLeash");
  c.E.beginShopTurn(c.state, c.pid);
  assert.equal(c.p.hand.length, 5);
  assert.equal(c.p.deck.filter(c => c.defId === "pet").length, 2);
});

test("ťah: celé kolá hry – na začiatku ťahu bez trinketov a odmien nikdy viac ako 5 kariet", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { state, E, B } = fresh(seed);
    E.startRound(state);
    for (let guard = 0; guard < 120 && state.phase !== "over"; guard++) {
      if (state.phase === "battle") { E.doBattle(state); continue; }
      const pid = state.active, p = state[pid];
      // Discover za DMG Meter je karta navyše zámerne – také ťahy preskoč.
      if (!state.pendingDiscover) assert.ok(p.hand.length <= 5, `seed ${seed} kolo ${state.round}: ${p.hand.length} kariet`);
      B.botTurn(state, pid, "hard");
    }
  }
});

// ---------- Pohladkanie ----------

test("pohladkanie: prvé v kole potiahne 1 kartu, ďalšie nič; nové kolo znova", () => {
  const { state, E, pid, p } = setup(9, TEN);
  const dog = onBoard(E, state, p, "P001");
  inHand(E, state, p, "pet"); inHand(E, state, p, "pet");
  assert.equal(draws(E.castSpell(state, pid, 0, dog.uid)), 1);
  assert.equal(p.hand.length, 2, "1 zoslané, 1 dotiahnuté");
  const second = p.hand.findIndex(c => c.defId === "pet");
  assert.equal(draws(E.castSpell(state, pid, second, dog.uid)), 0);
  assert.equal(p.hand.length, 1);
  E.endShopTurn(state, pid);
  E.endShopTurn(state, state.active);
  E.doBattle(state);
  assert.equal(p.petDrawUsed, false);
});

test("pohladkanie: zoslanie nespojí kartu do ruky z balíčka (2 v balíčku + nové z P001)", () => {
  const { state, E, pid, p } = setup(10, ["pet", "pet", ...TEN]);
  const dog = inHand(E, state, p, "P001");
  const before = p.hand.length;
  const ev = E.playMinion(state, pid, 0);
  assert.ok(ev.some(e => e.type === "petMerge"), "3 pohladkania v balíčku sa spoja");
  assert.equal(p.hand.length, before - 1, "vyložená karta odišla, nič nepribudlo");
  assert.ok(p.deck.some(c => c.defId === "pet" && c.rank === 2));
  assert.ok(dog);
});

test("pohladkanie: Vodca svorky nemení počet dotiahnutých kariet", () => {
  const { state, E, pid, p } = setup(11, TEN);
  onBoard(E, state, p, "P009");
  const dog = onBoard(E, state, p, "P001");
  onBoard(E, state, p, "P002");
  for (let i = 0; i < 3; i++) inHand(E, state, p, "pet");
  let total = 0;
  while (p.hand.some(c => c.defId === "pet")) total += draws(E.castSpell(state, pid, p.hand.findIndex(c => c.defId === "pet"), dog.uid));
  assert.equal(total, 1);
});

test("pohladkanie: Dvojité pohladkanie zaúčinkuje 2×, ale ťahá stále 1 kartu", () => {
  const { state, E, pid, p } = setup(12, TEN);
  p.trinkets.push("doggyDouble");
  const dog = onBoard(E, state, p, "P001");
  inHand(E, state, p, "pet");
  assert.equal(draws(E.castSpell(state, pid, 0, dog.uid)), 1);
});

// ---------- D010 (Pri vyložení znova) ----------

test("D010: zopakované P001 pridá pohladkanie do balíčka, nie kartu do ruky", () => {
  const { state, E, pid, p } = setup(13, ["pet", ...TEN]);
  const pup = onBoard(E, state, p, "P001");
  inHand(E, state, p, "D010");
  const before = p.hand.length;
  const ev = E.playMinion(state, pid, 0, pup.uid);
  assert.ok(ev.some(e => e.type === "replayBattlecry" && e.targetUid === pup.uid));
  assert.equal(draws(ev), 0);
  assert.equal(p.hand.length, before - 1);
  assert.equal(p.deck.filter(c => c.defId === "pet").length, 2);
});

test("D010: spojenie 3 pohladkaní z balíčka po zopakovaní nedá kartu do ruky", () => {
  const { state, E, pid, p } = setup(14, ["pet", "pet", ...TEN]);
  const pup = onBoard(E, state, p, "P001");
  inHand(E, state, p, "D010");
  const before = p.hand.length;
  E.playMinion(state, pid, 0, pup.uid);
  assert.equal(p.hand.length, before - 1);
});

test("D010: zopakované Vyňuchaj (P005) vytiahne presne 1 pohladkanie", () => {
  const { state, E, pid, p } = setup(15, ["pet", "pet", ...TEN]);
  const sniff = onBoard(E, state, p, "P005");
  inHand(E, state, p, "D010");
  const ev = E.playMinion(state, pid, 0, sniff.uid);
  assert.equal(draws(ev), 1);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].defId, "pet");
});

test("D010: cieľ bez Pri vyložení (Vodca svorky) – zopakuje náhodnú príšerku s Pri vyložení; bez nej nič", () => {
  const { state, E, pid, p } = setup(16, ["pet", "pet", ...TEN]);
  const sniff = onBoard(E, state, p, "P005");
  const miso = onBoard(E, state, p, "P009");
  inHand(E, state, p, "D010");
  const ev = E.playMinion(state, pid, 0, miso.uid);
  assert.ok(ev.some(e => e.type === "replayBattlecry" && e.targetUid === sniff.uid && e.random));
  assert.equal(draws(ev), 1, "Vyňuchaj vytiahne 1 pohladkanie");
  const b = setup(17, TEN);
  const miso2 = onBoard(b.E, b.state, b.p, "P009");
  inHand(b.E, b.state, b.p, "D010");
  const ev2 = b.E.playMinion(b.state, b.pid, 0, miso2.uid);
  assert.ok(ev2.some(e => e.type === "replayNone"));
  assert.equal(draws(ev2), 0);
});
