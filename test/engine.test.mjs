import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1) {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(seed));
  return { ctx, state, E: ctx.Engine, C: ctx.Cards };
}

test("newGame: 10 náhodných kariet tieru 1 v balíčku, 25 HP, tier 1, 2 súkromné", () => {
  const { state, C } = fresh();
  for (const pid of ["p1", "p2"]) {
    assert.equal(state[pid].deck.length, 10);
    assert.equal(state[pid].hp, 25);
    assert.equal(state[pid].tier, 1);
    assert.equal(state[pid].priv.length, 2);
    for (const c of state[pid].deck) {
      assert.equal(C.byId[c.defId].tier, 1);
      assert.ok(!C.byId[c.defId].spell);
    }
  }
  assert.equal(state.commons.length, 3);
});

test("dáta kariet: príšery majú rasu, 3 mená a art; texty sa generujú", () => {
  const { C } = fresh();
  let minions = 0;
  for (const d of C.DEFS) {
    if (!d.spell) {
      minions++;
      assert.ok(C.RACES[d.race], `karta ${d.id} nemá platnú rasu`);
      assert.equal(d.stageNames.length, 3, `karta ${d.id} nemá 3 mená`);
      for (const r of [1, 2, 3]) {
        assert.equal(typeof C.nameOf(d, r, "sk"), "string");
        assert.match(C.artOf(d, r), /assets\/cards\/.+_\d\.webp/);
      }
    } else {
      for (const lang of ["sk", "cs", "en"]) assert.equal(typeof d.name[lang], "string");
    }
    for (const lang of ["sk", "cs", "en"]) C.cardText(d, 2, lang); // nesmie spadnúť
  }
  assert.equal(minions, 30);
});

test("art súbory existujú pre všetky príšery a stupne", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { ROOT } = await import("./harness.mjs");
  const { C } = fresh();
  for (const d of C.DEFS) {
    if (d.spell) continue;
    for (const r of [1, 2, 3]) {
      const p = path.join(ROOT, C.artOf(d, r));
      assert.ok(fs.existsSync(p), `chýba ${C.artOf(d, r)}`);
    }
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
  state.p1.hand = []; // nech kúpa nedokompletuje trojicu
  const defId = state.commons[0];
  const deckBefore = state.p1.deck.length;
  const ev = E.buyCommon(state, "p1", 0);
  assert.equal(ev[0].type, "buy");
  assert.equal(state.p1.money, 2);
  assert.equal(state.p1.deck.length, deckBefore + 1);
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

test("obchod rešpektuje tier limit", () => {
  const { state, E, C } = fresh(3);
  E.startRound(state);
  state.p1.money = 1000;
  state.p1.hand = [];
  for (let i = 0; i < 40; i++) E.buyPrivate(state, "p1", 0);
  for (const id of state.p1.bought) assert.ok(C.byId[id].tier <= 1);
});

test("evolve: 3 rovnaké bronzové sa spoja na striebornú so statmi ×2", () => {
  const { state, E, C } = fresh();
  const p = state.p1;
  p.hand = [E.makeInst(state, "B001", 1), E.makeInst(state, "B001", 1)];
  p.board = [E.makeInst(state, "B001", 1)];
  const events = [];
  E.checkEvolve(state, p, events);
  assert.equal(events.filter(e => e.type === "evolve").length, 1);
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 1);
  const s = p.board[0];
  assert.equal(s.rank, 2);
  assert.equal(s.atk, C.byId["B001"].atk * 2);
  assert.equal(s.hp, C.byId["B001"].hp * 2);
});

test("evolve: 3 strieborné dajú zlatú so statmi ×4; zlatá sa už nespája", () => {
  const { state, E, C } = fresh();
  const p = state.p1;
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "B005", 2));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].rank, 3);
  assert.equal(p.hand[0].atk, C.byId["B005"].atk * 4);
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "B005", 3));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 3); // zlaté ostávajú
});

test("kúpa tretej kópie (2 v ruke/na ploche) ide do ruky a hneď evolvne", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B003", 1)];
  p.board = [E.makeInst(state, "B003", 1)];
  p.money = 5;
  state.commons[0] = "B003";
  const deckBefore = p.deck.length;
  const events = E.buyCommon(state, "p1", 0);
  assert.ok(events.some(e => e.type === "toHand"));
  assert.ok(events.some(e => e.type === "evolve"));
  assert.equal(p.deck.length, deckBefore); // nešla do balíčka
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 1);
  assert.equal(p.board[0].rank, 2);
});

test("kúpa druhej kópie ide normálne do balíčka", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B003", 1)];
  p.board = [];
  p.money = 5;
  state.commons[0] = "B003";
  const deckBefore = p.deck.length;
  E.buyCommon(state, "p1", 0);
  assert.equal(p.deck.length, deckBefore + 1);
  assert.equal(p.hand.length, 1);
});

test("evolve: rôzne stupne sa nemiešajú", () => {
  const { state, E } = fresh();
  const p = state.p1;
  p.hand = [E.makeInst(state, "B001", 1), E.makeInst(state, "B001", 1), E.makeInst(state, "B001", 2)];
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
  p.board = [E.makeInst(state, "B003", 1)]; // Po nákupe: +1/+1
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
  p.discard = [{ defId: "B001", rank: 1 }, { defId: "B005", rank: 1 }];
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
  const m = E.makeInst(state, "B001", 1);
  p.board = [m];
  p.hand = [E.makeInst(state, "jablko", 1)];
  E.castSpell(state, "p1", 0, m.uid);
  assert.equal(m.atk, 4);
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
  const beast = E.makeInst(state, "B001", 1);     // beast
  const elem = E.makeInst(state, "E001", 1);      // elemental
  p.board = [beast, elem];
  p.hand = [E.makeInst(state, "E008", 1)];        // battlecry: +1/+1 Živlom
  E.playMinion(state, "p1", 0);
  assert.equal(elem.atk, 3);
  assert.equal(beast.atk, 2);
});

test("boj: prázdna plocha prehráva, damage = súčet stupňov preživších", () => {
  const { state, E } = fresh(11);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "B002", 1), E.makeInst(state, "B001", 2)];
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
  state.p1.board = [E.makeInst(state, "B002", 2)]; // 8/10 útočník – prežije prvý úder
  const squishy = E.makeInst(state, "B001", 1);
  const taunt = E.makeInst(state, "B002", 1); // 4/5 obranca
  state.p2.board = [squishy, taunt];
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const attacksOnP2 = events.filter(e => e.type === "attack" && e.dPid === "p2");
  assert.ok(attacksOnP2.length > 0);
  assert.equal(attacksOnP2[0].dUid, taunt.uid);
});

test("boj: deathrattle vyvolá token, padlé karty idú do discard", () => {
  const { state, E } = fresh(2);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "U001", 1)]; // pri smrti Kostík
  state.p2.board = [E.makeInst(state, "E010", 1)]; // 9/8 – zabije ho
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  assert.ok(events.some(e => e.type === "summon" && e.defId === "kostik"));
  assert.ok(state.p1.discard.some(c => c.defId === "U001"));
});

test("po boji ide všetko do discard – plochy sú prázdne, tokeny miznú", () => {
  const { state, E } = fresh(4);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "U008", 1); // 3/8 – prežije
  state.p1.board = [tank];
  state.p2.board = [E.makeInst(state, "B001", 1)];
  state.p1.hand = []; state.p2.hand = [];
  E.doBattle(state);
  assert.equal(state.p1.board.length, 0);
  assert.equal(state.p2.board.length, 0);
  assert.ok(state.p1.discard.some(c => c.defId === "U008")); // aj preživší
  assert.ok(state.p2.discard.some(c => c.defId === "B001"));
  assert.ok(!state.p1.discard.some(c => c.defId === "kostik")); // token nejde do discard
});

test("hra končí, keď hrdina klesne na 0 HP", () => {
  const { state, E } = fresh(6);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p2.hp = 1;
  state.p1.board = [E.makeInst(state, "E010", 1)];
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
