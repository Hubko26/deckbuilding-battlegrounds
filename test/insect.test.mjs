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
  // Roháč: už len +1/+1 za každú inú svoju kópiu (rast z celého hmyzu zrušený)
  p.deck.push({ defId: "I006", rank: 1 }, { defId: "I006", rank: 1 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I006) }, { a: 1, h: 1 });
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

test("hmyz: Kukla zo šance pri smrti sa vyvolá najviac raz za boj", () => {
  const { state, E, put } = bare(17);
  const p = state.p1;
  for (let i = 0; i < 3; i++) { const b = put("p1", "I004"); Object.assign(b, { atk: 0, hp: 1, maxHp: 1 }); }
  const big = put("p2", "B003");
  Object.assign(big, { atk: 1, hp: 99, maxHp: 99 });
  state.rng = () => 0; // šanca vždy padne
  const ev = E.doBattle(state);
  assert.equal(ev.filter(e => e.type === "summon" && e.defId === "kukla").length, 1);
  assert.equal(p.kuklaSummons, 0); // po boji sa limit nuluje – ďalší boj môže znova
});

test("hmyz: trinket Dvojitý zámotok – Kukla zo šance až 2× za boj", () => {
  const { state, E, put } = bare(17);
  state.p1.trinkets.push("insectCocoon");
  assert.ok(E.TRINKETS.some(t => t.id === "insectCocoon" && t.race === "insect" && t.lvl === 2));
  for (let i = 0; i < 4; i++) { const b = put("p1", "I004"); Object.assign(b, { atk: 0, hp: 1, maxHp: 1 }); }
  const big = put("p2", "B003");
  Object.assign(big, { atk: 1, hp: 99, maxHp: 99 });
  state.rng = () => 0; // šanca vždy padne
  const ev = E.doBattle(state);
  assert.equal(ev.filter(e => e.type === "summon" && e.defId === "kukla").length, 2);
});

test("hmyz: mená a texty sú preložené (SK/CS/EN)", () => {
  const { C } = fresh(18);
  assert.equal(C.nameOf(C.byId.I001, 1, "en"), "Caterpillar");
  assert.equal(C.nameOf(C.byId.I009, 1, "cs"), "Kudlanka");
  assert.equal(C.nameOf(C.byId.kukla, 1, "en"), "Cocoon");
  assert.equal(C.nameOf(C.byId.spora, 1, "en"), "Poison Spore");
  assert.equal(C.nameOf(C.byId.B001, 1, "en"), C.byId.B001.stageNames[0]); // ostatné rasy bez zmeny
  assert.match(C.cardText(C.byId.I002, 1, "en", false, 0), /Bee from your deck/);
  assert.match(C.cardText(C.byId.I002, 1, "cs", false, 0), /Včelku z balíčku/);
});

test("hmyz: Kráľovná má roj z celého hmyzu (+1/+1 za každý iný Hmyz v balíčku)", () => {
  const { state, E, C } = bare(19);
  const p = state.p1;
  p.deck.push({ defId: "I010", rank: 1 }, { defId: "I010", rank: 1 }, { defId: "I002", rank: 1 }, { defId: "I002", rank: 1 }, { defId: "I002", rank: 1 });
  p.deck.push({ defId: "I007", rank: 1 }, { defId: "B003", rank: 1 });
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I010) }, { a: 5, h: 5 }); // 1 iná Kráľovná + 3 Včielky + Mravec, Zviera nie
  assert.deepEqual({ ...E.swarmBonus(p, C.byId.I002) }, { a: 2, h: 2 }); // Včielky z Kráľovnej nič
  assert.match(C.cardText(C.byId.I010, 1, "en", false, 0), /Swarm: \+1\/\+1 per other Insect you own/);
});

test("hmyz: bot Kuklu nikdy nepovažuje za balast (ani v cudzej rase)", () => {
  const { ctx, state, put } = bare(20);
  const p = state.p1;
  state.round = 10; p.tier = 5;
  for (let i = 0; i < 5; i++) p.deck.push({ defId: "B003", rank: 1 }); // zafixovaný na Zvieratá
  assert.equal(ctx.Bot.dominantRace(state, p), "beast");
  const k = put("p1", "kukla", "hand");
  assert.equal(ctx.Bot.isJunk(state, p, k), false);
  assert.equal(ctx.Bot.isJunk(state, p, put("p1", "I002", "hand")), true); // obyčajný cudzí t1 balast je
});

test("hmyz: Roháč – Tŕne vrátia útočníkovi navyše 50 % spôsobeného zranenia (hore)", () => {
  const { state, E, C, put } = bare(21);
  assert.equal(C.byId.I006.swarm.length, 1); // už len roj za kópie
  const r = put("p1", "I006"); // 2/6 Obranca
  Object.assign(r, { atk: 2, hp: 50, maxHp: 50 });
  const ogre = put("p2", "B003");
  Object.assign(ogre, { atk: 5, hp: 40, maxHp: 40 });
  state.first = "p2";
  const ev = E.doBattle(state);
  const th = ev.find(e => e.type === "thorns");
  assert.ok(th);
  assert.equal(th.n, 3); // 5 zranenia → 2,5 → 3
  const firstHp = ev.find(e => e.type === "hp" && e.uid === ogre.uid);
  assert.equal(firstHp.hp, 40 - 2 - 3); // vlastný úder Roháča 2 + Tŕne 3
});

test("hmyz: Svätojánska muška – Pri vyložení vybraný Hmyz +X/+X navždy (X = Húsenice, min. 1)", () => {
  const { state, E, put } = bare(22);
  const p = state.p1;
  state.active = "p1";
  const bee = put("p1", "I002");
  const dog = put("p1", "P001");
  p.deck.push({ defId: "I001", rank: 1 }, { defId: "I001", rank: 1 }, { defId: "I001", rank: 1 });
  put("p1", "I005", "hand");
  E.playMinion(state, "p1", 0, dog.uid); // cieľ mimo Hmyzu → najsilnejší Hmyz
  assert.deepEqual([bee.atk, bee.hp, bee.pa, bee.ph], [5, 4, 3, 3]);
  assert.equal(dog.atk, 2);
  p.deck.length = 0;
  put("p1", "I005", "hand");
  E.playMinion(state, "p1", 0, bee.uid);
  assert.equal(bee.pa, 4); // bez Húseníc aspoň +1
});

test("hmyz: Kobylka sa množí – Pri vyložení kópia do balíčka raz za kolo; vyliahnutá sa predáva za 0", () => {
  const { state, E, put } = bare(23);
  const p = state.p1;
  state.active = "p1";
  put("p1", "I004", "hand");
  put("p1", "I004", "hand");
  E.playMinion(state, "p1", 0);
  E.playMinion(state, "p1", 0);
  const bred = p.deck.filter(c => c.defId === "I004");
  assert.equal(bred.length, 1); // druhá Kobylka v tom istom kole už nie
  assert.ok(bred[0].bred);
  // cyklus balíčka: vyliahnutá ostane vyliahnutá, predaj za 0
  const inst = (E.drawCards(state, p, 1, []), p.hand.find(x => x.defId === "I004"));
  assert.ok(inst.bred);
  const money = p.money;
  E.sellCard(state, "p1", "hand", p.hand.indexOf(inst));
  assert.equal(p.money, money);
  // kúpená Kobylka na ploche sa predáva normálne
  const m2 = p.money;
  E.sellCard(state, "p1", "board", 0);
  assert.equal(p.money, m2 + 1);
  // ďalšie kolo sa množí znova
  state.round++;
  put("p1", "I004", "hand");
  E.playMinion(state, "p1", p.hand.length - 1);
  assert.equal(p.deck.filter(c => c.defId === "I004").length, 1);
  const back = E.pileCard(p.board.find(x => x.defId === "I004"));
  assert.equal(back.bred, undefined);
});

test("hmyz: Húsenice/Včielky v obehu podľa krčmy – T1 2 + 1, T2 4 + 2, od T3 celý pool", () => {
  const { state, E, C } = fresh(24);
  const p = state.p1;
  // koľko kópií sa dá z poolu vytiahnuť (záložné losovanie bez poolu sa neráta)
  const count = (tier, key, id) => {
    const before = state.pools[key][id];
    for (let i = 0; i < 400; i++) E.rollCard(state, tier, key, d => d.id === id);
    return before - state.pools[key][id];
  };
  state.pools.p1.I002 = E.POOL_PRIVATE; state.pools.common.I002 = E.POOL_COMMON;
  state.startTaken = null; // pool je plný – štartovací balíček sa tu nemeria
  assert.equal(count(1, "p1", "I002"), 2);
  assert.equal(count(2, "p1", "I002"), 2); // na T2 pribudnú 2 (spolu 4)
  assert.equal(count(3, "p1", "I002"), E.POOL_PRIVATE - 4); // od T3 zvyšok
  assert.equal(count(1, "common", "I002"), 1);
  assert.equal(count(2, "common", "I002"), 1);
  assert.equal(count(3, "common", "I002"), E.POOL_COMMON - 2);
  assert.equal(C.byId.kukla.grow.a, 1);
});

test("hmyz: text karty ukáže aktuálne X majiteľa (Húsenice v balíčku: n)", () => {
  const { state, C } = bare(25);
  const p = state.p1;
  p.deck.push({ defId: "I001", rank: 1 }, { defId: "I001", rank: 1 }, { defId: "I001", rank: 1 });
  assert.match(C.cardText(C.byId.I005, 1, "en", false, 0, { owner: p }), /Caterpillars in deck: 3, at least 1/);
  assert.match(C.cardText(C.byId.I005, 1, "sk", false, 0), /Húsenice v balíčku, aspoň 1/); // bez majiteľa bez čísla
});

test("hmyz: po poslednej Včielke príde Kráľovná z balíčka (raz za boj) a hneď zaútočí", () => {
  const { state, E, put } = bare(26);
  const p = state.p1;
  put("p1", "I002");
  p.deck.push({ defId: "I002", rank: 1 }, { defId: "I010", rank: 1 }, { defId: "I010", rank: 1, pa: 5, ph: 5 });
  const wall = put("p2", "B003");
  Object.assign(wall, { atk: 0, hp: 999, maxHp: 999 });
  const r = state.rng; state.rng = () => Math.max(0.3, r()); // bez Kukly zo šance
  state.first = "p1";
  const ev = E.doBattle(state);
  const sums = ev.filter(e => e.type === "summon" && e.pid === "p1");
  assert.equal(sums.map(e => e.defId).join(","), "I002,I010"); // Včielka, potom jediná Kráľovná
  const q = sums[1];
  assert.equal(q.atk, 7 + 5 + 3); // najsilnejšia kópia (+5) + roj 3 iných hmyzov
  const attacks = ev.filter(e => e.type === "attack");
  assert.equal(attacks.slice(0, 3).map(e => e.aPid).join(","), "p1,p1,p1"); // Včielka, Včielka, Kráľovná hneď
  assert.equal(attacks[2].aUid, q.uid);
  assert.equal(p.deck.length, 3); // balíček sa nemení
});
