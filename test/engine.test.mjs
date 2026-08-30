import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1, p1 = "les", p2 = "ohen") {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(p1, p2, seeded(seed));
  return { ctx, state, E: ctx.Engine, C: ctx.Cards };
}

test("newGame: 10 kariet v balíčku, 25 HP, tier 1, 2 súkromné karty", () => {
  const { state } = fresh();
  for (const pid of ["p1", "p2"]) {
    assert.equal(state[pid].deck.length, 10);
    assert.equal(state[pid].hp, 25);
    assert.equal(state[pid].tier, 1);
    assert.equal(state[pid].priv.length, 2);
  }
  assert.equal(state.commons.length, 3);
});

test("dáta kariet: každá príšerka má rasu, tokeny existujú, texty sa generujú", () => {
  const { C } = fresh();
  for (const d of [...C.DEFS, ...C.TOKENS]) {
    if (!d.spell) assert.ok(C.RACES[d.race], `karta ${d.id} nemá platnú rasu`);
    for (const lang of ["sk", "cs", "en"]) {
      assert.equal(typeof d.name[lang], "string");
      C.cardText(d, 1, lang); // nesmie spadnúť
    }
    if (d.power) assert.ok(["battlecry", "deathrattle", "startFight", "endTurn"].includes(d.power.kw));
  }
  for (const cls of Object.keys(C.CLASSES)) {
    assert.equal(C.STARTERS[cls].length, 10);
    for (const id of C.STARTERS[cls]) assert.ok(C.byId[id], `starter ${id} neexistuje`);
  }
});

test("príjem: 3 v 1. kole, +1 každé kolo, strop 10", () => {
  const { E } = fresh();
  assert.equal(E.income(1), 3);
  assert.equal(E.income(2), 4);
  assert.equal(E.income(8), 10);
  assert.equal(E.income(20), 10);
});

test("startRound: peniaze podľa kola, ruka 5 kariet aktívneho hráča", () => {
  const { state, E } = fresh();
  E.startRound(state);
  assert.equal(state.round, 1);
  assert.equal(state.active, "p1");
  assert.equal(state.p1.money, 3);
  assert.equal(state.p1.hand.length, 5);
  assert.equal(state.p2.hand.length, 0);
});

test("buyCommon: -3 peniaze, karta v balíčku, obchod hneď doplnený", () => {
  const { state, E } = fresh();
  E.startRound(state);
  state.p1.money = 5;
  const defId = state.commons[0];
  const ev = E.buyCommon(state, "p1", 0);
  assert.equal(ev[0].type, "buy");
  assert.equal(state.p1.money, 2);
  assert.equal(state.p1.deck.length, 6); // 10 - 5 dotiahnutých + 1 kúpená
  assert.ok(state.p1.deck.some(c => c.defId === defId));
  assert.equal(state.commons.length, 3);
  assert.equal(state.p1.bought[0], defId);
});

test("buyCommon: bez peňazí nejde", () => {
  const { state, E } = fresh();
  E.startRound(state);
  state.p1.money = 2;
  assert.equal(E.buyCommon(state, "p1", 0), null);
});

test("spoločné karty sú len neutrálne, súkromné len vlastná classa alebo neutrál", () => {
  const { state, E, C } = fresh(7);
  E.startRound(state);
  state.p1.money = 100;
  for (let i = 0; i < 30; i++) E.buyCommon(state, "p1", 0);
  for (const id of state.p1.bought) assert.equal(C.byId[id].cls, null);
  state.p1.bought = [];
  for (let i = 0; i < 30; i++) E.buyPrivate(state, "p1", 0);
  for (const id of state.p1.bought) assert.ok([null, "les"].includes(C.byId[id].cls));
});

test("obchod rešpektuje tier limit", () => {
  const { state, E, C } = fresh(3);
  E.startRound(state);
  state.p1.money = 100;
  for (let i = 0; i < 40; i++) E.buyPrivate(state, "p1", 0);
  for (const id of state.p1.bought) assert.ok(C.byId[id].tier <= 1);
});

test("evolve: 3 rovnaké bronzové sa spoja na striebornú so statmi ×2", () => {
  const { state, E, C } = fresh();
  const p = state.p1;
  p.hand = [E.makeInst(state, "jezko-vojak", 1), E.makeInst(state, "jezko-vojak", 1)];
  p.board = [E.makeInst(state, "jezko-vojak", 1)];
  const events = [];
  E.checkEvolve(state, p, events);
  assert.equal(events.filter(e => e.type === "evolve").length, 1);
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 1);
  const s = p.board[0];
  assert.equal(s.rank, 2);
  assert.equal(s.atk, C.byId["jezko-vojak"].atk * 2);
  assert.equal(s.hp, C.byId["jezko-vojak"].hp * 2);
});

test("evolve: 3 strieborné dajú zlatú so statmi ×4; zlatá sa už nespája", () => {
  const { state, E, C } = fresh();
  const p = state.p1;
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "myska", 2));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].rank, 3);
  assert.equal(p.hand[0].atk, C.byId["myska"].atk * 4);
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "myska", 3));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 3); // zlaté ostávajú
});

test("kúpa tretej kópie (2 v ruke/na ploche) ide do ruky a hneď evolvne", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "zajac", 1)];
  p.board = [E.makeInst(state, "zajac", 1)];
  p.money = 5;
  state.commons[0] = "zajac";
  const deckBefore = p.deck.length;
  const events = E.buyCommon(state, "p1", 0);
  assert.ok(events.some(e => e.type === "toHand"));
  assert.ok(events.some(e => e.type === "evolve"));
  assert.equal(p.deck.length, deckBefore); // nešla do balíčka
  // trojica sa spojila: jedna strieborná, na ploche (bola tam kópia)
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 1);
  assert.equal(p.board[0].rank, 2);
});

test("kúpa druhej kópie ide normálne do balíčka", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "zajac", 1)];
  p.board = [];
  p.money = 5;
  state.commons[0] = "zajac";
  const deckBefore = p.deck.length;
  E.buyCommon(state, "p1", 0);
  assert.equal(p.deck.length, deckBefore + 1);
  assert.equal(p.hand.length, 1);
});

test("evolve: rôzne stupne sa nemiešajú", () => {
  const { state, E } = fresh();
  const p = state.p1;
  p.hand = [E.makeInst(state, "myska", 1), E.makeInst(state, "myska", 1), E.makeInst(state, "myska", 2)];
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 3);
});

test("tier upgrade: cena klesá každým kolom, upgrade pridá súkromnú kartu", () => {
  const { state, E } = fresh();
  E.startRound(state);
  assert.equal(E.upgradeCost(state, "p1"), 5);
  state.round = 3; // 2 kolá na tieri 1
  assert.equal(E.upgradeCost(state, "p1"), 3);
  state.p1.money = 10;
  E.upgradeTier(state, "p1");
  assert.equal(state.p1.tier, 2);
  assert.equal(state.p1.money, 7);
  assert.equal(state.p1.priv.length, 3);
  assert.equal(E.upgradeCost(state, "p1"), 7); // základ pre tier 3
});

test("sell: +1 peniaz, karta zmizne", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const before = state.p1.hand.length;
  const money = state.p1.money;
  E.sellCard(state, "p1", "hand", 0);
  assert.equal(state.p1.hand.length, before - 1);
  assert.equal(state.p1.money, money + 1);
});

test("refresh: -2 peniaze, zmrazená súkromná karta ostáva", () => {
  const { state, E } = fresh();
  E.startRound(state);
  state.p1.money = 5;
  E.toggleFreeze(state, "p1", 0);
  const frozen = state.p1.priv[0].defId;
  E.refreshShop(state, "p1");
  assert.equal(state.p1.money, 3);
  assert.equal(state.p1.priv[0].defId, frozen);
  assert.equal(state.p1.priv[0].frozen, true);
});

test("endShopTurn: Po nákupe efekty, ruka do discard, druhý hráč na ťahu", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.board = [E.makeInst(state, "zajac", 1)]; // Po nákupe: +1/+1
  const handSize = p.hand.length;
  E.endShopTurn(state, "p1");
  assert.equal(p.board[0].atk, 2);
  assert.equal(p.board[0].hp, 2);
  assert.equal(p.hand.length, 0);
  assert.equal(p.discard.length, handSize);
  assert.equal(state.active, "p2");
  assert.equal(state.p2.hand.length, 5);
});

test("prázdny balíček: discard sa zamieša a doťahuje sa ďalej", () => {
  const { state, E } = fresh();
  const p = state.p1;
  p.deck = [];
  p.discard = [{ defId: "myska", rank: 1 }, { defId: "macka", rank: 1 }];
  const events = E.beginShopTurn(state, "p1");
  assert.ok(events.some(e => e.type === "reshuffle"));
  assert.equal(p.hand.length, 2);
  assert.equal(p.discard.length, 0);
});

test("kúzlo gold: +2 peniaze a ide do discard", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "minca", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.money, 5);
  assert.ok(p.discard.some(c => c.defId === "minca"));
});

test("kúzlo buffTarget: +2/+2 vybranej príšerke", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  const m = E.makeInst(state, "myska", 1);
  p.board = [m];
  p.hand = [E.makeInst(state, "jablko", 1)];
  E.castSpell(state, "p1", 0, m.uid);
  assert.equal(m.atk, 3);
  assert.equal(m.hp, 4);
});

test("discover: ponúkne 3 karty, výber ide do ruky", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "kniha", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(state.pendingDiscover.options.length, 3);
  const chosen = state.pendingDiscover.options[1];
  E.pickDiscover(state, "p1", 1);
  assert.equal(state.pendingDiscover, null);
  assert.ok(p.hand.some(c => c.defId === chosen));
});

test("battlecry buffRace: buffne len príšerky rovnakej rasy", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  const beast = E.makeInst(state, "myska", 1);       // beast
  const elem = E.makeInst(state, "plamienok", 1);    // elemental
  p.board = [beast, elem];
  p.hand = [E.makeInst(state, "lev", 1)];            // battlecry: +2/+2 Zvieratám
  E.playMinion(state, "p1", 0);
  assert.equal(beast.atk, 3);
  assert.equal(elem.atk, 1);
});

test("boj: prázdna plocha prehráva, damage = súčet stupňov preživších", () => {
  const { state, E } = fresh(11);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "medved", 1), E.makeInst(state, "myska", 2)];
  state.p2.board = [];
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const dmg = events.find(e => e.type === "heroDmg");
  assert.equal(dmg.pid, "p2");
  assert.equal(dmg.dmg, 3); // bronz 1 + strieborná 2
  assert.equal(state.p2.hp, 22);
});

test("boj: obranca (taunt) je napadnutý prvý", () => {
  const { state, E } = fresh(5);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "kohut", 1)]; // 2/1 útočník
  const squishy = E.makeInst(state, "myska", 1);
  const taunt = E.makeInst(state, "medved", 1); // 4/5 obranca
  state.p2.board = [squishy, taunt];
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const firstAttack = events.find(e => e.type === "attack");
  // Nech útočí ktokoľvek, cieľom prvého útoku na stranu p2 musí byť obranca.
  const attacksOnP2 = events.filter(e => e.type === "attack" && e.dPid === "p2");
  if (attacksOnP2.length) assert.equal(attacksOnP2[0].dUid, taunt.uid);
  assert.ok(firstAttack);
});

test("boj: deathrattle vyvolá token, padlé karty idú do discard", () => {
  const { state, E } = fresh(2);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "ovca", 1)];   // 1/4, pri smrti jahniatko
  state.p2.board = [E.makeInst(state, "dinko", 1)];  // 10/8 – ovcu zabije
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  assert.ok(events.some(e => e.type === "summon" && e.defId === "jahniatko"));
  assert.ok(state.p1.discard.some(c => c.defId === "ovca"));
});

test("boj: preživší sa vyliečia a ostávajú na ploche", () => {
  const { state, E } = fresh(4);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "mamut", 1); // 8/12
  state.p1.board = [tank];
  state.p2.board = [E.makeInst(state, "myska", 1)]; // 1/2
  state.p1.hand = []; state.p2.hand = [];
  E.doBattle(state);
  assert.equal(state.p1.board.length, 1);
  assert.equal(state.p1.board[0].uid, tank.uid);
  assert.equal(state.p1.board[0].hp, state.p1.board[0].maxHp);
});

test("hra končí, keď hrdina klesne na 0 HP", () => {
  const { state, E } = fresh(6);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p2.hp = 1;
  state.p1.board = [E.makeInst(state, "dinko", 1)];
  state.p2.board = [];
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "p1");
  assert.ok(events.some(e => e.type === "gameOver"));
});

test("striedanie: v párnom kole začína p2", () => {
  const { state, E } = fresh(9);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  assert.equal(state.phase, "battle");
  E.doBattle(state);
  assert.equal(state.round, 2);
  assert.equal(state.active, "p2");
});
