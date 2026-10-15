// Hmyz (EXPERIMENT, src/cards-insect.js – hra ho nenačíta): bez evolve,
// roj (staty za kópie v balíčku), Kukla (6. karta, rast v ruke) a hmyzie
// schopnosti. Bez experimentálneho súboru hmyz v hre nie je.
import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1) {
  const ctx = loadEngine({ exp: ["insect"] });
  const state = ctx.Engine.newGame(seeded(seed), null);
  return { ctx, state, E: ctx.Engine, C: ctx.Cards };
}

// Prázdne zóny oboch hráčov po startRound.
function bare(seed) {
  const f = fresh(seed);
  f.E.startRound(f.state);
  for (const pid of ["p1", "p2"]) Object.assign(f.state[pid], { hand: [], deck: [], discard: [], board: [] });
  const put = (pid, defId, zone = "board") => {
    const inst = f.E.makeInst(f.state, defId, 1, f.state[pid]);
    inst.slot = f.state[pid][zone].length;
    f.state[pid][zone].push(inst);
    return inst;
  };
  return { ...f, put };
}

test("hmyz: bez experimentálneho súboru v hre nie je; s ním 10 kariet + Kukla mimo obchodu", () => {
  const plain = loadEngine();
  assert.equal(plain.Cards.DEFS.filter(d => d.race === "insect").length, 0);
  assert.equal(plain.Cards.RACES.insect, undefined);
  const { state, E, C } = fresh(2);
  assert.equal(C.DEFS.filter(d => d.race === "insect" && !d.gen).length, 10);
  assert.ok(C.byId.kukla.gen);
  assert.equal(state.pools.p1.kukla, undefined);
  state.p1.tier = 6;
  for (let i = 0; i < 200; i++) assert.notEqual(E.rollCard(state, 6, "p1"), "kukla");
});

test("hmyz: 3 kópie sa NEspoja (noEvolve)", () => {
  const { state, E, put } = bare(3);
  const p = state.p1;
  put("p1", "I002", "hand");
  p.deck.push({ defId: "I002", rank: 1 }, { defId: "I002", rank: 1 });
  const ev = [];
  E.checkEvolve(state, p, ev);
  assert.equal(ev.filter(e => e.type === "evolve").length, 0);
  assert.equal(E.copiesOwned(p, "I002"), 3);
});

test("hmyz: roj – Húsenica +1/+1 za každú inú Húsenicu, platí na bojovú kópiu", () => {
  const { state, E, C, put } = bare(4);
  const p = state.p1;
  const h = put("p1", "I001");
  p.deck.push({ defId: "I001", rank: 1 }, { defId: "I001", rank: 1 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I001) }, { a: 2, h: 2 });
  put("p2", "I002"); // súper 2/1
  const ev = E.doBattle(state);
  // Húsenica 3/3 v boji prežije úder 2 a zabije Včielku – originál ostáva 1/1
  assert.ok(ev.some(e => e.type === "die" && e.pid === "p2"));
  assert.ok(!ev.some(e => e.type === "die" && e.pid === "p1" && e.uid === h.uid));
  assert.equal(h.atk, 1);
});

test("hmyz: Húsenica vytvorí Kuklu, ďalšia ju zväčší; Kukla je 6. karta a nezahraná rastie", () => {
  const { state, E, C, put } = bare(5);
  const p = state.p1;
  state.active = "p1";
  for (let i = 0; i < 8; i++) p.deck.push({ defId: "I002", rank: 1 });
  put("p1", "I001", "hand");
  put("p1", "I001", "hand");
  E.playMinion(state, "p1", 0);
  const k = p.deck.find(c => c.defId === "kukla");
  assert.ok(k, "Kukla v balíčku");
  E.playMinion(state, "p1", 0);
  assert.deepEqual([k.pa, k.ph], [1, 1]);
  assert.equal(p.deck.filter(c => c.defId === "kukla").length, 1); // jediná
  // nový ťah: 5 kariet + Kukla navyše
  p.board = [];
  E.beginShopTurn(state, "p1");
  assert.equal(p.hand.length, 6);
  const inst = p.hand.find(x => x.defId === "kukla");
  assert.deepEqual([inst.atk, inst.hp], [2, 4]);
  // nezahraná Kukla na konci ťahu +2/+2 navždy
  state.first = "p2"; // p1 je druhý – koniec ťahu ide do boja
  E.endShopTurn(state, "p1");
  const back = p.discard.find(c => c.defId === "kukla");
  assert.deepEqual([back.pa, back.ph], [1 + E.KUKLA_GROW.a, 1 + E.KUKLA_GROW.h]);
});

test("hmyz: Lienka – Hmyz v ruke +X/+X navždy (X = Lienky); Mravec Po nákupe rastie Hmyz v balíčku", () => {
  const { state, E, put } = bare(6);
  const p = state.p1;
  state.active = "p1";
  p.deck.push({ defId: "I003", rank: 1 }, { defId: "I007", rank: 1 });
  const target = put("p1", "I002", "hand");
  const other = put("p1", "D001", "hand");
  put("p1", "I003", "hand");
  E.playMinion(state, "p1", 2);
  assert.deepEqual([target.atk, target.hp, target.pa], [4, 3, 2]); // 2 Lienky
  assert.equal(other.atk, 3); // drak nie
  put("p1", "I007");
  state.first = "p2";
  E.endShopTurn(state, "p1");
  const grown = [...p.deck, ...p.discard].filter(c => c.defId !== "D001" && (c.pa || 0) > 0 && c.defId !== "I002");
  assert.ok(grown.some(c => c.pa >= 1), "Mravec zväčšil Hmyz v balíčku");
});

test("hmyz: Kráľovná Pri smrti vyloží bojové kópie z balíčka, balíček ostane", () => {
  const { state, E, put } = bare(7);
  const p = state.p1;
  put("p1", "I010");
  p.deck.push({ defId: "I002", rank: 1, pa: 3, ph: 3 }, { defId: "I001", rank: 1 });
  const big = put("p2", "B003");
  Object.assign(big, { atk: 50, hp: 50, maxHp: 50 });
  const ev = E.doBattle(state);
  const summons = ev.filter(e => e.type === "summon" && e.pid === "p1");
  assert.equal(summons.length, 2);
  assert.ok(summons.some(e => e.defId === "I002" && e.atk === 5));
  assert.equal(p.deck.length + p.discard.length, 3); // 2 v balíčku + Kráľovná po boji
});

test("hmyz: roj je pravidlo rasy – každý Hmyz +1/+1 za každú inú svoju kópiu", () => {
  const { state, E, C, put } = bare(8);
  const p = state.p1;
  put("p1", "I007");
  p.deck.push({ defId: "I007", rank: 1 }, { defId: "I007", rank: 1 }, { defId: "I002", rank: 1 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I007) }, { a: 2, h: 2 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I002) }, { a: 0, h: 0 });
  // Roháč: +0/+1 za každý iný Hmyz + +1/+1 za každú inú svoju kópiu
  p.deck.push({ defId: "I006", rank: 1 }, { defId: "I006", rank: 1 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I006) }, { a: 1, h: 6 });
});

test("hmyz: Modlivka Pri smrti vyvolá Jedovatú spóru; Jed zabije veľké telo, štít ho zastaví", () => {
  const { state, E, put } = bare(9);
  const m = put("p1", "I009");
  Object.assign(m, { atk: 0, hp: 1, maxHp: 1 });
  const big = put("p2", "B003");
  Object.assign(big, { atk: 40, hp: 40, maxHp: 40 });
  const ev = E.doBattle(state);
  assert.ok(ev.some(e => e.type === "summon" && e.pid === "p1" && e.defId === "spora"));
  assert.ok(ev.some(e => e.type === "poison" && e.pid === "p2" && e.uid === big.uid));
  assert.ok(ev.some(e => e.type === "die" && e.pid === "p2" && e.uid === big.uid));

  const s2 = bare(10);
  const sp = s2.put("p1", "spora");
  const shielded = s2.put("p2", "B003");
  Object.assign(shielded, { atk: 1, hp: 40, maxHp: 40, shield: true }); // spóra padne na prvý výmenný úder
  const ev2 = s2.E.doBattle(s2.state);
  assert.ok(!ev2.some(e => e.type === "poison"), "štít zastaví jed");
  assert.ok(sp.poison);
});
