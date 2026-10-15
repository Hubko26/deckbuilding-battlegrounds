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

test("hmyz: bez voľby v hre nie je (obchod, štart, ban, raceCap); s ňou 10 kariet + Kukla mimo obchodu", () => {
  const plain = loadEngine();
  for (let seed = 1; seed <= 20; seed++) {
    const s = plain.Engine.newGame(seeded(seed), null, { ban: true, raceCap: plain.Engine.RACE_CAP });
    assert.ok(![...s.ban.offers.p1, ...s.ban.offers.p2, ...s.races].includes("insect"));
    const s2 = plain.Engine.newGame(seeded(seed), null);
    s2.p1.tier = 6;
    for (let i = 0; i < 50; i++) assert.notEqual(plain.Cards.byId[plain.Engine.rollCard(s2, 6, "p1")].race, "insect");
    assert.ok(!s2.p1.deck.some(c => plain.Cards.byId[c.defId].race === "insect"));
  }
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
  // nezahraná Kukla na konci ťahu +grow navždy, vyložená +growPlayed
  state.first = "p2"; // p1 je druhý – koniec ťahu ide do boja
  E.endShopTurn(state, "p1");
  const back = p.discard.find(c => c.defId === "kukla");
  assert.deepEqual([back.pa, back.ph], [1 + C.byId.kukla.grow.a, 1 + C.byId.kukla.grow.h]);
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

test("hmyz: Včielka po útoku padne a vyvolá ďalšiu Včielku z balíčka – zaútočí celý roj", () => {
  const { state, E, put } = bare(7);
  const p = state.p1;
  put("p1", "I002");
  p.deck.push({ defId: "I002", rank: 1 }, { defId: "I002", rank: 1, pa: 2, ph: 2 }, { defId: "I001", rank: 1 });
  const wall = put("p2", "B003");
  Object.assign(wall, { atk: 0, hp: 99, maxHp: 99 });
  state.rng = (() => { const r = state.rng; return () => Math.max(0.3, r()); })(); // bez Kukly zo šance
  const ev = E.doBattle(state);
  const bees = ev.filter(e => e.type === "summon" && e.pid === "p1" && e.defId === "I002");
  assert.equal(bees.length, 2); // obe Včielky z balíčka, každá raz
  assert.equal(ev.filter(e => e.type === "sting").length, 3);
  // roj 3 Včielok: +2/+2 každej; Včielka s rastom 2+2+2 = 6 útoku
  assert.ok(bees.some(e => e.atk === 6));
  assert.equal(p.deck.length + p.discard.length, 4); // balíček sa nemení
});

test("hmyz: Kráľovná Pri smrti – Pečať +1/+1 všetkým Včielkam, aj budúcim", () => {
  const { state, E, put } = bare(15);
  const p = state.p1;
  const q = put("p1", "I010");
  Object.assign(q, { atk: 0, hp: 1, maxHp: 1 });
  const big = put("p2", "B003");
  Object.assign(big, { atk: 5, hp: 99, maxHp: 99 });
  E.doBattle(state);
  assert.deepEqual({ ...p.cardBuffs.I002 }, { a: 1, h: 1 });
  const bee = E.makeInst(state, "I002", 1, p);
  assert.deepEqual([bee.atk, bee.hp], [3, 2]);
  const other = E.makeInst(state, "I001", 1, p);
  assert.deepEqual([other.atk, other.hp], [1, 1]);
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

test("hmyz: Pri smrti 1/4 šanca vyvolať bojovú kópiu Kukly (s jej rastom)", () => {
  const { state, E, C, put } = bare(12);
  const p = state.p1;
  assert.equal(C.byId.I004.power2 ? C.byId.I004.power2.fx.type : C.byId.I004.power.fx.type, "summonKukla");
  assert.equal(C.byId.kukla.power, undefined);
  p.deck.push({ defId: "kukla", rank: 1, pa: 5, ph: 5 });
  const bug = put("p1", "I004");
  Object.assign(bug, { atk: 0, hp: 1, maxHp: 1 });
  const big = put("p2", "B003");
  Object.assign(big, { atk: 1, hp: 99, maxHp: 99 });
  state.rng = () => 0; // šanca vždy padne
  const ev = E.doBattle(state);
  const s = ev.find(e => e.type === "summon" && e.defId === "kukla");
  assert.ok(s, "Kukla vyvolaná");
  assert.deepEqual([s.atk, s.hp], [6, 8]);
  assert.equal(p.deck.length + p.discard.length, 2); // Kukla v balíčku ostala jedna
});

test("hmyz: vyložená Kukla na konci ťahu rastie o growPlayed (navždy, pred bojom)", () => {
  const { state, E, C, put } = bare(13);
  state.active = "p1"; state.first = "p2";
  const k = put("p1", "kukla");
  const g = C.byId.kukla.growPlayed;
  E.endShopTurn(state, "p1");
  assert.deepEqual([k.atk, k.hp, k.pa, k.ph], [1 + g.a, 3 + g.h, g.a, g.h]);
});

test("hmyz: Jed umlčí – Pri smrti otráveného sa nespustí, Znovuzrodenie prepadne", () => {
  const { state, E, put } = bare(14);
  put("p1", "spora");
  const b7 = put("p2", "B007"); // Pri smrti: Mláďa
  Object.assign(b7, { atk: 0, hp: 30, maxHp: 30, revive: true });
  const ev = E.doBattle(state);
  assert.ok(ev.some(e => e.type === "poison" && e.uid === b7.uid));
  assert.ok(ev.some(e => e.type === "die" && e.uid === b7.uid));
  assert.ok(!ev.some(e => e.type === "summon" && e.pid === "p2"), "Mláďa sa nevyvolá");
  assert.ok(!ev.some(e => e.type === "revive"), "Znovuzrodenie prepadne");
});

test("hmyz: vyvolaná Včielka zaútočí hneď – súper medzi útokmi roja neútočí", () => {
  const { state, E, put } = bare(16);
  const p = state.p1;
  put("p1", "I002");
  p.deck.push({ defId: "I002", rank: 1 }, { defId: "I002", rank: 1 });
  const wall = put("p2", "B003");
  Object.assign(wall, { atk: 0, hp: 99, maxHp: 99 });
  const r = state.rng; state.rng = () => Math.max(0.3, r()); // bez Kukly zo šance
  state.first = "p1";
  const ev = E.doBattle(state);
  const attacks = ev.filter(e => e.type === "attack");
  // 3 Včielky útočia za sebou, prvý útok súpera až po nich (roj vymrel)
  assert.equal(attacks.slice(0, 3).map(e => e.aPid).join(","), "p1,p1,p1");
});
