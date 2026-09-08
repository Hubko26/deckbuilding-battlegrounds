import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1, mutator = null) {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(seed), mutator);
  return { ctx, state, E: ctx.Engine, C: ctx.Cards };
}

test("newGame: 10 náhodných kariet tieru 1 v balíčku, 50 HP, tier 1, 2 súkromné", () => {
  const { state, C } = fresh();
  for (const pid of ["p1", "p2"]) {
    assert.equal(state[pid].deck.length, 10);
    assert.equal(state[pid].hp, 50);
    assert.equal(state[pid].tier, 1);
    assert.equal(state[pid].priv.length, 2);
    for (const c of state[pid].deck) {
      assert.equal(C.byId[c.defId].tier, 1);
      assert.ok(!C.byId[c.defId].spell);
    }
  }
  assert.equal(state.commons.length, 3);
});

test("newGame: v štartovacom balíčku nikdy nie je trojica (max 2 kópie karty)", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { state } = fresh(seed);
    for (const pid of ["p1", "p2"]) {
      const counts = {};
      for (const c of state[pid].deck) counts[c.defId] = (counts[c.defId] || 0) + 1;
      for (const [defId, n] of Object.entries(counts)) {
        assert.ok(n <= 2, `seed ${seed}: ${pid} má ${n}× ${defId} v štartovacom balíčku`);
      }
    }
  }
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
  assert.equal(minions, 60); // 6 rás × 10 príšer
});

test("drak buffRaceOf: cielený battlecry buffne rasu cieľa; bez cieľa fallback na najsilnejšiu", () => {
  const { state, E, C } = fresh(80);
  E.startRound(state);
  const p = state.p1;
  const bear = E.makeInst(state, "B001", 1); bear.slot = 0;  // beast 2/2
  const bone = E.makeInst(state, "U001", 1); bone.slot = 1;  // undead 1/1
  p.board = [bear, bone];
  p.hand = [E.makeInst(state, "D002", 1)];
  E.playMinion(state, "p1", 0, bear.uid); // cieľ = beast
  assert.equal(bear.atk, 3); // +1/+1 len beastom
  assert.equal(bone.atk, 1);
  // bez cieľa: fallback = najsilnejšia príšerka – teraz prvý drak (3/4),
  // takže +1/+1 dostanú draci; medveď aj kostík ostávajú.
  const d1 = p.board.find(x => x.defId === "D002");
  p.hand = [E.makeInst(state, "D002", 1)];
  E.playMinion(state, "p1", 0);
  assert.equal(d1.atk, 4);
  assert.equal(bear.atk, 3);
  assert.equal(bone.atk, 1);
});

test("drak futureRaceOf: permanentná aura pre rasu cieľa", () => {
  const { state, E, C } = fresh(81);
  E.startRound(state);
  const p = state.p1;
  const bone = E.makeInst(state, "U001", 1); bone.slot = 0;
  p.board = [bone];
  p.hand = [E.makeInst(state, "D003", 1)];
  E.playMinion(state, "p1", 0, bone.uid);
  assert.equal(p.raceBuffs.undead.a, 1);
  assert.equal(p.raceBuffs.undead.h, 1);
  assert.equal(bone.atk, 2); // aura hneď aj na plochu
  const fresh2 = E.makeInst(state, "U002", 1, p); // nová undead inštancia
  assert.equal(fresh2.atk, C.byId["U002"].atk + 1);
});

test("drak evolveTarget: cieľ evolvne o stupeň, zlatú už nezdvihne", () => {
  const { state, E, C } = fresh(82);
  E.startRound(state);
  const p = state.p1;
  const bear = E.makeInst(state, "B001", 1); bear.slot = 0;
  p.board = [bear];
  p.hand = [E.makeInst(state, "D010", 1)];
  E.playMinion(state, "p1", 0, bear.uid);
  const up = p.board.find(x => x.defId === "B001");
  assert.equal(up.rank, 2);
  assert.equal(up.atk, C.byId["B001"].atk * 2);
  // zlatá ostáva zlatá
  const gold = E.makeInst(state, "B003", 3); gold.slot = 2;
  p.board.push(gold);
  p.hand = [E.makeInst(state, "D010", 1)];
  E.playMinion(state, "p1", 0, gold.uid);
  assert.equal(gold.rank, 3);
  assert.ok(p.board.includes(gold));
});

test("drak discoverRace: ponuka len z rasy cieľa a vlastného tieru", () => {
  const { state, E, C } = fresh(83);
  E.startRound(state);
  const p = state.p1;
  const bone = E.makeInst(state, "U001", 1); bone.slot = 0;
  p.board = [bone];
  p.hand = [E.makeInst(state, "D004", 1)];
  E.playMinion(state, "p1", 0, bone.uid);
  assert.ok(state.pendingDiscover);
  for (const id of state.pendingDiscover.options) {
    assert.equal(C.byId[id].race, "undead");
    assert.ok(C.byId[id].tier <= p.tier);
  }
  E.pickDiscover(state, "p1", 0);
});

test("drak buffTopRace (Pred bojom): najpočetnejšia rasa dostane +1/+1", () => {
  const { state, E } = fresh(84);
  const p = state.p1;
  const b1 = Object.assign(E.makeInst(state, "B001", 1), { slot: 0 });
  const b2 = Object.assign(E.makeInst(state, "B001", 1), { slot: 1 });
  const u1 = Object.assign(E.makeInst(state, "U001", 1), { slot: 2 });
  const drak = Object.assign(E.makeInst(state, "D005", 1), { slot: 3 });
  p.board = [b1, b2, u1, drak];
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  E.endShopTurn(state, "p1");
  const events = E.doBattle(state);
  const buffs = events.filter(e => e.type === "buff" && (e.uid === b1.uid || e.uid === b2.uid));
  assert.equal(buffs.length, 2); // beast je najpočetnejší (2×)
});

test("cardText s dmgBoost: výboj/výbuch ukáže navýšené číslo (Večná iskra)", () => {
  const { C } = fresh();
  // E001: výboj 3 damage – s boostom 2 ukáže 5; HTML verzia zeleným spanom
  const e1 = C.byId["E001"];
  assert.match(C.cardText(e1, 1, "sk", false, 2), /5 damage náhodnému/);
  assert.match(C.cardText(e1, 1, "sk", true, 2), /<span class="boosted">5<\/span> damage/);
  assert.match(C.cardText(e1, 1, "sk", false, 0), /3 damage/); // bez boostu základ
  // E010: výbuch 3×rank – rank 2 = 6, s boostom 1 ukáže 7
  const e10 = C.byId["E010"];
  assert.match(C.cardText(e10, 2, "sk", false, 1), /7 damage/); // 3×2 + 1
  // viacnásobný výboj (rank 3): boost sa pripočíta ku KAŽDÉMU zásahu
  assert.match(C.cardText(e1, 3, "sk", false, 2), /3× 5 damage náhodným/);
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
  p.deck = []; p.discard = []; // žiadne náhodné kópie zo štartu
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
  p.deck = []; p.discard = [];
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "B005", 2));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].rank, 3);
  assert.equal(p.hand[0].atk, C.byId["B005"].atk * 4);
  p.hand = [1, 2, 3].map(() => E.makeInst(state, "B005", 3));
  E.checkEvolve(state, p, []);
  assert.equal(p.hand.length, 3); // zlaté ostávajú
});

test("evolve prenáša buffy DVOCH najsilnejších kópií (perma aj dočasné), aura sa neráta dvakrát", () => {
  const { state, E, C } = fresh(85);
  const p = state.p1;
  p.deck = []; p.discard = [];
  const c1 = E.makeInst(state, "B001", 1); // +2/+2 dočasný buff
  c1.atk += 2; c1.hp += 2; c1.maxHp += 2;
  const c2 = E.makeInst(state, "B001", 1); // +1/+1 permanentný rast
  c2.atk += 1; c2.hp += 1; c2.maxHp += 1; c2.pa = 1; c2.ph = 1;
  const c3 = E.makeInst(state, "B001", 1); // čistá – jej (nulový) bonus prepadne
  p.board = [Object.assign(c1, { slot: 0 }), Object.assign(c2, { slot: 1 })];
  p.hand = [c3];
  E.checkEvolve(state, p, []);
  const s = p.board[0];
  assert.equal(s.rank, 2);
  assert.equal(s.atk, C.byId["B001"].atk * 2 + 2 + 1); // základ 4 + bonusy top 2 kópií
  assert.equal(s.hp, C.byId["B001"].hp * 2 + 2 + 1);
  assert.equal(s.pa, 1); // perma rast cestuje ďalej
  assert.equal(s.ph, 1);

  // Aura sa neduplikuje: kópie buffnuté aurou +1/+1 dajú evolvednutej
  // presne 1× auru (z makeInst), žiadne bonusy navyše.
  const q = state.p2;
  q.deck = []; q.discard = [];
  q.raceBuffs.beast = { a: 1, h: 1 };
  q.board = [];
  q.hand = [1, 2, 3].map(() => E.makeInst(state, "B001", 1, q)); // aura už v statoch
  E.checkEvolve(state, q, []);
  assert.equal(q.hand[0].rank, 2);
  assert.equal(q.hand[0].atk, C.byId["B001"].atk * 2 + 1); // základ 4 + aura 1
});

test("drak evolveTarget prenáša buffy cieľa (nad základ, bez aury)", () => {
  const { state, E, C } = fresh(86);
  E.startRound(state);
  const p = state.p1;
  const bear = E.makeInst(state, "B001", 1); bear.slot = 0;
  bear.atk += 2; bear.hp += 2; bear.maxHp += 2; // dočasný buff +2/+2
  p.board = [bear];
  p.hand = [E.makeInst(state, "D010", 1)];
  E.playMinion(state, "p1", 0, bear.uid);
  const up = p.board.find(x => x.defId === "B001");
  assert.equal(up.rank, 2);
  assert.equal(up.atk, C.byId["B001"].atk * 2 + 2); // základ 4 + prenesený buff
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
  assert.ok(events.some(e => e.type === "evolve"));
  assert.equal(p.deck.length, deckBefore); // kúpená prišla a hneď sa spojila
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 1);
  assert.equal(p.board[0].rank, 2);
});

test("trojica úplne skrytá v balíčku sa spojí sama (výsledok do ruky + hidden)", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = []; p.board = [];
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "B001", rank: 1 }, { defId: "B001", rank: 1 }, { defId: "B002", rank: 1 }];
  p.discard = [];
  const events = [];
  E.checkEvolve(state, p, events);
  const ev = events.find(e => e.type === "evolve");
  assert.ok(ev);
  assert.equal(ev.hidden, true);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].rank, 2);
  assert.equal(p.deck.filter(c => c.defId === "B001").length, 0);
});

test("skrytá trojica vzniknutá kúpou (0 viditeľných + 2 v balíčku)", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = []; p.board = [];
  p.deck = [{ defId: "E002", rank: 1 }, { defId: "E002", rank: 1 }];
  p.discard = [];
  p.money = 5;
  state.commons[0] = "E002";
  const events = E.buyCommon(state, "p1", 0);
  const ev = events.find(e => e.type === "evolve");
  assert.ok(ev && ev.hidden);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].defId, "E002");
  assert.equal(p.hand[0].rank, 2);
  assert.equal(p.deck.filter(c => c.defId === "E002").length, 0);
});

test("tvoj scenár: 1 v ruke + 2 dokúpené postupne → evolvne (kópia sa vytiahne z balíčka)", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B001", 1)];
  p.board = [];
  p.deck = p.deck.filter(c => c.defId !== "B001"); // čistý štart bez náhodných kópií
  p.discard = [];
  p.money = 10;
  state.commons[0] = "B001";
  E.buyCommon(state, "p1", 0);        // 2. kópia → ide do balíčka
  assert.ok(p.deck.some(c => c.defId === "B001"));
  assert.equal(p.hand.length, 1);
  state.commons[0] = "B001";
  E.buyCommon(state, "p1", 0);        // 3. kópia → trojica sa spojí hneď
  assert.ok(!p.deck.some(c => c.defId === "B001")); // kópia vytiahnutá z balíčka
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].defId, "B001");
  assert.equal(p.hand[0].rank, 2);
});

test("trojica sa spojí aj s kópiou v kôpke (discard)", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B003", 1)];
  p.board = [];
  p.deck = p.deck.filter(c => c.defId !== "B003");
  p.discard = [{ defId: "B003", rank: 1 }];
  p.money = 5;
  state.commons[0] = "B003";
  E.buyCommon(state, "p1", 0);
  assert.equal(p.discard.filter(c => c.defId === "B003").length, 0);
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].rank, 2);
});

test("kúpa druhej kópie ide normálne do balíčka", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B003", 1)];
  p.board = [];
  p.deck = p.deck.filter(c => c.defId !== "B003"); // žiadne ďalšie kópie
  p.discard = [];
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
  p.deck = []; // štartovací balíček môže obsahovať B001 – trojica by sa spojila cez balíček
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
  state.round = 10; // dlhé čakanie – cena nikdy nepadne pod 2
  assert.equal(E.upgradeCost(state, "p1"), 2);
  state.round = 3;
  state.p1.money = 10;
  E.upgradeTier(state, "p1");
  assert.equal(state.p1.tier, 2);
  assert.equal(state.p1.money, 7);
  assert.equal(state.p1.priv.length, 3);
  assert.equal(E.upgradeCost(state, "p1"), 8); // základ pre tier 3
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

test("discardCard: odhodenie z ruky aj plochy do kôpky, bez peňazí, stupeň sa zachová", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "B001", 2)];
  p.board = [E.makeInst(state, "B002", 1)];
  p.discard = [];
  const money = p.money;
  E.discardCard(state, "p1", "hand", 0);
  E.discardCard(state, "p1", "board", 0);
  assert.equal(p.hand.length, 0);
  assert.equal(p.board.length, 0);
  assert.equal(p.money, money);
  assert.equal(JSON.stringify(p.discard),
    JSON.stringify([{ defId: "B001", rank: 2 }, { defId: "B002", rank: 1 }]));
});

test("toggleFreezeAll: zmrazí celú súkromnú ponuku, druhé stlačenie odmrazí", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  E.toggleFreezeAll(state, "p1");
  assert.ok(p.priv.every(s => s.frozen));
  const ids = p.priv.map(s => s.defId);
  state.round = 2; // prežije aj refresh
  p.money = 5;
  E.refreshShop(state, "p1");
  assert.deepEqual(p.priv.map(s => s.defId), ids);
  E.toggleFreezeAll(state, "p1");
  assert.ok(p.priv.every(s => !s.frozen));
});

test("refresh: -1 peniaz, zmrazená súkromná karta ostáva", () => {
  const { state, E } = fresh();
  E.startRound(state);
  state.p1.money = 5;
  E.toggleFreeze(state, "p1", 0);
  const frozen = state.p1.priv[0].defId;
  E.refreshShop(state, "p1");
  assert.equal(state.p1.money, 4);
  assert.equal(state.p1.priv[0].defId, frozen);
  assert.equal(state.p1.priv[0].frozen, true);
});

test("futureRace aura: budúce príšerky rasy dostanú bonus, existujúce nie", () => {
  const { state, E, C } = fresh();
  E.startRound(state);
  const p = state.p1;
  const existing = E.makeInst(state, "B001", 1); // 2/2 beast na ploche
  p.board = [existing];
  p.hand = [E.makeInst(state, "B010", 1)]; // battlecry: VŠETKY Zvieratá +1/+1
  E.playMinion(state, "p1", 0);
  assert.equal(p.raceBuffs.beast.a, 1);
  assert.equal(p.raceBuffs.beast.h, 1);
  assert.equal(existing.atk, 3); // aj existujúca na ploche dostane buff hneď
  assert.equal(existing.hp, 3);
  // nová inštancia zvieraťa dostane bonus
  const fresh1 = E.makeInst(state, "B001", 1, p);
  assert.equal(fresh1.atk, C.byId["B001"].atk + 1);
  assert.equal(fresh1.hp, C.byId["B001"].hp + 1);
  // iná rasa bonus nedostane
  const elem = E.makeInst(state, "E001", 1, p);
  assert.equal(elem.atk, C.byId["E001"].atk);
  // aury sa sčítavajú
  p.hand = [E.makeInst(state, "B010", 2)]; // strieborná: +2/+2
  E.playMinion(state, "p1", 0);
  assert.equal(p.raceBuffs.beast.a, 3);
  assert.equal(p.raceBuffs.beast.h, 3);
});

test("onAttack: dočasný boost pri útoku v boji", () => {
  const { state, E } = fresh(12);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const dasher = E.makeInst(state, "E004", 1); dasher.slot = 0; // onAttack: kamaráti +1/0
  const pal = E.makeInst(state, "B002", 1); pal.slot = 1;       // beast 4/5
  state.p1.board = [dasher, pal];
  state.p2.board = [E.makeInst(state, "U008", 1)]; // 3/8 taunt – prežije
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const proc = events.find(e => e.type === "proc" && e.kw === "onAttack");
  assert.ok(proc);
  assert.equal(proc.uid, dasher.uid);
  assert.ok(events.some(e => e.type === "buff" && e.uid === pal.uid && e.a === 1));
});

test("dračí buff rasy (D002): dostanú ho aj neskôr vyložené karty a tokeny v boji", () => {
  const { state, E } = fresh(14);
  E.startRound(state);
  const p = state.p1;
  const b = E.makeInst(state, "B005", 1); b.slot = 0; // beast 3/2, deathrattle 2× mláďa
  p.board = [b];
  const drak = E.makeInst(state, "D002", 1); // battlecry: rasa cieľa +1/+1
  p.hand = [drak];
  E.playMinion(state, "p1", 0, b.uid);
  assert.equal(b.atk, 4); // 3+1 – okamžitý buff na ploche
  const late = E.makeInst(state, "B001", 1); // beast 2/2 vyložený PO drakovi
  p.hand = [late];
  E.playMinion(state, "p1", 0);
  assert.equal(late.atk, 3); // 2+1 – buff platí aj pre neskôr vyložené
  E.endShopTurn(state, "p1");
  state.p2.board = [E.makeInst(state, "E010", 1)]; // 9/8 – B005 zomrie
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const sum = events.find(e => e.type === "summon" && e.defId === "mlada");
  assert.ok(sum, "mláďa sa má vyvolať");
  assert.equal(sum.atk, 2); // 1+1 – buff dostal aj token vyvolaný v boji
  assert.equal(sum.hp, 2);
  assert.equal(Object.keys(state.p1.fightRaceBuffs).length, 0); // po boji buff končí
});

test("endShopTurn: duplicitné/oneskorené ukončenie ťahu je nelegálne (null)", () => {
  const { state, E } = fresh(5);
  E.startRound(state);
  const first = state.active;
  assert.ok(E.endShopTurn(state, first));            // legálne – je na ťahu
  assert.equal(E.endShopTurn(state, first), null);   // duplicita – už nie je na ťahu
  assert.ok(E.endShopTurn(state, state.active));     // druhý hráč → battle
  assert.equal(state.phase, "battle");
  assert.equal(E.endShopTurn(state, "p1"), null);    // v boji sa ťah ukončiť nedá
});

test("dračí buff D005 (Pred bojom) platí celé kolo: dostane ho aj token vyvolaný neskôr", () => {
  const { state, E } = fresh(21);
  E.startRound(state);
  const p = state.p1;
  const b = E.makeInst(state, "B005", 1); b.slot = 0; // beast 3/2, Pri smrti 2× mláďa
  const b2 = E.makeInst(state, "B001", 1); b2.slot = 1; // beast 2/2
  const drak = E.makeInst(state, "D005", 1); drak.slot = 2; // Pred bojom: top rasa +1/+1
  p.board = [b, b2, drak]; // beast 2× > dragon 1× → top rasa = beast
  p.hand = [];
  state.p2.board = [E.makeInst(state, "B010", 1)]; // 6/10 taunt – B005 zabije
  state.p2.hand = [];
  const events = E.doBattle(state);
  const sum = events.find(e => e.type === "summon" && e.defId === "mlada");
  assert.ok(sum, "mláďa sa má vyvolať");
  assert.equal(sum.atk, 2); // 1+1 – dračí buff dostal aj token vyvolaný po ňom
  assert.equal(sum.hp, 2);
  assert.equal(Object.keys(state.p1.fightRaceBuffs).length, 0); // po boji buff končí
});

// (deathrattle buffRace už nemá žiadna karta – U003 prevzal skorú undead
// auru po U004; battle case buffRace v engine ostáva pre budúce karty.)

test("trvalý rast (perm growSelf): Hopple si nesie +1/+1 cez boj aj cyklus balíčka", () => {
  const { state, E } = fresh(61);
  E.startRound(state);
  const p = state.p1;
  const frog = E.makeInst(state, "B003", 1); frog.slot = 0; // Po nákupe: +1/+1 NAVŽDY
  p.board = [frog];
  p.hand = [];
  E.endShopTurn(state, "p1");
  assert.equal(frog.atk, 2); // buff hneď
  assert.equal(frog.pa, 1);  // a zapísaný ako trvalý
  E.endShopTurn(state, "p2");
  state.p2.board = []; state.p2.hand = [];
  E.doBattle(state); // žaba prežije (súper prázdny), ide do kôpky
  const copy = [...p.discard, ...p.deck].find(c => c.defId === "B003" && c.pa === 1);
  assert.ok(copy, "kópia v kôpke/balíčku si drží trvalý rast");
  // Dotiahnutie: inštancia vznikne aj s trvalým rastom.
  p.deck = [copy]; p.discard = p.discard.filter(c => c !== copy); p.hand = [];
  E.beginShopTurn(state, "p1");
  const drawn = p.hand.find(x => x.defId === "B003");
  assert.equal(drawn.atk, 2);
  assert.equal(drawn.hp, 2);
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

test("spell slot: obchod ponúka kúzlo mimo príšerích slotov, kúpa doplní nové", () => {
  const { state, E, C } = fresh(31);
  E.startRound(state);
  const p = state.p1;
  // Commons a súkromné sloty už kúzla neobsahujú.
  assert.ok(state.commons.every(id => !C.byId[id].spell));
  assert.ok(p.priv.every(s => !C.byId[s.defId].spell));
  assert.ok(C.byId[p.spellShop.defId].spell);
  assert.equal(C.byId[p.spellShop.defId].tier, 1); // vlastný tier
  p.money = 10;
  p.hand = [];
  const defId = p.spellShop.defId;
  const ev = E.buySpell(state, "p1");
  assert.equal(ev[0].type, "buy");
  assert.ok(p.deck.some(c => c.defId === defId));
  assert.ok(C.byId[p.spellShop.defId].spell); // slot hneď doplnený kúzlom
});

test("spell slot: freeze all zmrazí aj kúzlo, prežije refresh aj koniec kola", () => {
  const { state, E } = fresh(32);
  E.startRound(state);
  const p = state.p1;
  E.toggleFreezeAll(state, "p1");
  assert.equal(p.spellShop.frozen, true);
  const kept = p.spellShop.defId;
  p.money = 5;
  E.refreshShop(state, "p1");
  assert.equal(p.spellShop.defId, kept);
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  E.doBattle(state); // prázdne plochy → nové kolo
  assert.equal(p.spellShop.defId, kept); // prežil
  assert.equal(p.spellShop.frozen, false); // a rozmrazil sa
});

test("Večná iskra: trvalý +1 damage k výbojom, stackuje sa a prežije boj", () => {
  const { state, E } = fresh(41);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "iskra", 1), E.makeInst(state, "iskra", 1)];
  E.castSpell(state, "p1", 0);
  E.castSpell(state, "p1", 0);
  assert.equal(p.dmgBoost, 2); // 2 iskry sa stacknú
  E.endShopTurn(state, "p1");
  const zap = E.makeInst(state, "E001", 1); zap.slot = 0; // Pred bojom: výboj 3
  state.p1.board = [zap];
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const hit = events.find(e => e.type === "powerDmg" && e.from === zap.uid);
  assert.ok(hit);
  assert.equal(hit.n, fresh().C.byId["E001"].power.fx.n + 2); // bonus pripočítaný
  assert.equal(state.p1.dmgBoost, 2); // a TRVALÝ – prežil boj
});

test("E005 lovec tokenov: súperov token dostane výboj; ak padne, E005 +1/+1 NAVŽDY; buffnutý token prežije", () => {
  const { state, E, C } = fresh(55);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const hunter = E.makeInst(state, "E005", 1); hunter.slot = 0; // 3/4
  state.p1.board = [hunter];
  const crypt = E.makeInst(state, "U005", 1); crypt.slot = 0;   // Pred bojom: 2× kostík
  const pal = E.makeInst(state, "U008", 1); pal.slot = 1;       // p2 má 2 karty → začína, vyvolá pred útokmi
  state.p2.board = [crypt, pal];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const procs = events.filter(e => e.type === "proc" && e.uid === hunter.uid && e.kw === "onEnemySummon");
  assert.equal(procs.length, 2);                       // dva kostíky = dva výboje
  const zaps = events.filter(e => e.type === "powerDmg" && e.from === hunter.uid);
  assert.equal(zaps.length, 2);
  assert.equal(zaps[0].n, 1);
  const grow = events.filter(e => e.type === "buff" && e.uid === hunter.uid);
  assert.equal(grow.length, 2);                        // oba 1/1 kostíky padli
  const copy = state.p1.discard.find(c => c.defId === "E005");
  assert.equal(copy.pa, 2); assert.equal(copy.ph, 2);  // rast NAVŽDY cez kôpku
  assert.match(C.cardText(C.byId["E005"], 1, "sk", false, 0), /Keď súper vyvolá token: zasiahni ho výbojom za 1/);
  assert.match(C.cardText(C.byId["E005"], 1, "sk", false, 1), /výbojom za 2/); // Živelná sila v texte

  // Kostík s U002 (2/2) výboj za 1 prežije → žiadny rast; so Živelnou silou +1 padne.
  for (const boost of [0, 1]) {
    const { state: s2, E: E2 } = fresh(56 + boost);
    E2.startRound(s2);
    s2.p1.dmgBoost = boost;
    E2.endShopTurn(s2, "p1");
    const h2 = E2.makeInst(s2, "E005", 1); h2.slot = 0;
    s2.p1.board = [h2];
    s2.p2.fightTokenBuffs.kostik = { a: 1, h: 1 };
    s2.p2.board = [Object.assign(E2.makeInst(s2, "U005", 1), { slot: 0 }), Object.assign(E2.makeInst(s2, "U008", 1), { slot: 1 })];
    s2.p1.hand = []; s2.p2.hand = [];
    s2.p1.deck = []; s2.p1.discard = []; s2.p2.deck = []; s2.p2.discard = [];
    const ev2 = E2.doBattle(s2);
    const g2 = ev2.filter(e => e.type === "buff" && e.uid === h2.uid).length;
    assert.equal(g2, boost ? 2 : 0);
  }
});

test("D007: battlecry Živelná sila +1 (navždy, ako kúzlo), strieborný +2, cykluje balíčkom", () => {
  const { state, E, C } = fresh(53);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = [];
  p.hand = [E.makeInst(state, "D007", 1), E.makeInst(state, "D007", 2)];
  E.playMinion(state, "p1", 0);
  assert.equal(p.dmgBoost, 1);
  E.playMinion(state, "p1", 0);
  assert.equal(p.dmgBoost, 3); // +2 zo strieborného
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  state.p1.hand = []; state.p2.hand = [];
  E.doBattle(state);
  assert.equal(p.dmgBoost, 3);                                 // trvalé
  assert.ok(p.discard.some(c => c.defId === "D007"));          // vráti sa cyklom balíčka
  assert.match(C.cardText(C.byId["D007"], 1, "sk", false, 0), /Pri vyložení: Živelná sila \+1/);
});

test("D001 shrinkEnemy: v najbližšom boji náhodný súper −1/−1 (min 0 atk / 1 hp), stackuje sa", () => {
  const { state, E, C } = fresh(54);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "D001", 1), E.makeInst(state, "D001", 1)];
  E.playMinion(state, "p1", 0);
  E.playMinion(state, "p1", 0);
  assert.equal(p.shrinks.length, 2);
  E.endShopTurn(state, "p1");
  const frail = E.makeInst(state, "U001", 1); frail.slot = 0; // 1/1 – nesmie zomrieť z oslabenia
  state.p2.board = [frail];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const shr = events.filter(e => e.type === "shrink" && e.uid === frail.uid);
  assert.equal(shr.length, 2);                 // obe nabité oslabenia
  assert.equal(shr[0].a, -1); assert.equal(shr[0].h, 0); // hp min 1 → −0 životov
  assert.equal(shr[1].a, 0);                   // atk už 0 → clamp
  // Oslabenie nie je damage: kostíky (deathrattle U001) prídu až po prvom útoku, nie pred bojom.
  const firstAttack = events.findIndex(e => e.type === "attack");
  const firstSummon = events.findIndex(e => e.type === "summon");
  assert.ok(firstSummon === -1 || firstSummon > firstAttack);
  assert.equal(p.shrinks.length, 0);           // spotrebované
  assert.match(C.cardText(C.byId["D001"], 1, "sk", false, 0), /náhodná súperova príšerka −1\/−1/);
});

test("F009 (t5) Po kúzle +2/+2 všetkým kamarátom aj iných rás; F008 (t6) Po kúzle permanentná aura pre každú rasu", () => {
  const { state, E, C } = fresh(52);
  E.startRound(state);
  const p = state.p1;
  const hive = E.makeInst(state, "F009", 1); hive.slot = 0;   // t5 víla 6/6
  const bear = E.makeInst(state, "B002", 1); bear.slot = 1;   // beast 4/5
  const star = E.makeInst(state, "F008", 2); star.slot = 2;   // t6 striebro: +2/+2 navždy
  p.board = [hive, bear, star];
  p.hand = [E.makeInst(state, "stit", 1)];
  E.castSpell(state, "p1", 0, bear.uid);
  // F009: +2/+2 kamarátom (nie sebe) – aj zvieraťu; F008: +2/+2 všetkým vrátane F009
  assert.equal(bear.atk, 4 + 2 + 2);
  assert.equal(hive.atk, 6 + 2);       // len z F008 (F009 seba nebuffuje)
  assert.equal(star.atk, 14 + 2 + 2);  // z F009 aj z vlastnej aury
  for (const r of Object.keys(C.RACES)) {
    assert.equal(p.raceBuffs[r].a, 2); assert.equal(p.raceBuffs[r].h, 2);
  }
  // Budúce inštancie každej rasy aj tokeny auru nesú
  assert.equal(E.makeInst(state, "O004", 1, p).atk, 3 + 2);
  assert.equal(E.makeInst(state, "kostik", 1, p).hp, 1 + 2);
  assert.match(C.cardText(C.byId["F008"], 1, "sk", false, 0), /Pečať \+1\/\+1 všetkým tvojim príšerkám/);
  assert.match(C.cardText(C.byId["B010"], 1, "sk", false, 0), /Pečať \+1\/\+1 Zvieratám/);
  assert.match(C.cardText(C.byId["D003"], 1, "en", false, 0), /Imprint \+1\/\+1 to its race/);
});

test("U002 fightToken: kostíky vyvolané v najbližšom boji +1/+1, stackuje sa, po boji končí", () => {
  const { state, E, C } = fresh(49);
  E.startRound(state);
  const p = state.p1;
  assert.equal(C.byId["kostik"].atk, 1); // kostík základ 1/1
  p.hand = [E.makeInst(state, "U002", 1), E.makeInst(state, "U002", 2)]; // bronz +1/+1, striebro +2/+2
  E.playMinion(state, "p1", 0);
  E.playMinion(state, "p1", 0);
  assert.deepEqual({ ...p.fightTokenBuffs.kostik }, { a: 3, h: 3 });
  const rattle = E.makeInst(state, "U001", 1); rattle.slot = 2; // Pri smrti 2× kostík
  p.board.push(rattle);
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "U008", 1), { slot: 0 })]; // 3/8 taunt
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const sum = events.find(e => e.type === "summon" && e.defId === "kostik");
  assert.ok(sum);
  assert.equal(sum.atk, 1 + 3); // 1/1 + bojový buff 3/3
  assert.equal(sum.hp, 1 + 3);
  assert.equal(Object.keys(p.fightTokenBuffs).length, 0); // po boji končí
  assert.match(C.cardText(C.byId["U002"], 1, "sk", false, 0), /v najbližšom boji všetky tvoje Kostíky \+1\/\+1/);
});

test("B004 raceDeath perm: keď padne tvoje Zviera (aj Mláďa), rastie +1/+1 NAVŽDY (cez kôpku), strieborný +2/+2", () => {
  const { state, E } = fresh(47);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const owl = E.makeInst(state, "B004", 1); owl.slot = 0;   // 2/3, Keď zomrie tvoje Mláďa
  const cub = E.makeInst(state, "mlada", 1); cub.slot = 1;  // 1/1 token
  const owl2 = E.makeInst(state, "B004", 2); owl2.slot = 2; // strieborný 4/6
  state.p1.board = [cub, owl, owl2]; // mláďa útočí prvé a padne, sovy ešte žijú
  state.p2.board = [Object.assign(E.makeInst(state, "U008", 1), { slot: 0 })]; // 3/8 taunt – zabije mláďa, prežije
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  assert.ok(events.some(e => e.type === "proc" && e.uid === owl.uid && e.kw === "raceDeath"));
  assert.ok(events.some(e => e.type === "buff" && e.uid === owl.uid && e.a === 1 && e.h === 1));
  assert.ok(events.some(e => e.type === "buff" && e.uid === owl2.uid && e.a === 2 && e.h === 2)); // ×stupeň
  // Rast je NAVŽDY: kópia v kôpke nesie pa/ph a ďalšia inštancia z nej má väčšie staty.
  const pile = state.p1.discard.filter(c => c.defId === "B004");
  assert.equal(pile.length, 2);
  const c1 = pile.find(c => c.rank === 1), c2 = pile.find(c => c.rank === 2);
  // bronz: +1 za Mláďa (a prípadne +1 za padnutú druhú sovu – tá je tiež Zviera)
  assert.ok(c1.pa >= 1 && c1.pa === c1.ph, `c1 ${c1.pa}/${c1.ph}`);
  assert.ok(c2.pa >= 2 && c2.pa % 2 === 0 && c2.pa === c2.ph, `c2 ${c2.pa}/${c2.ph}`);
  const cardTextSk = fresh().C.cardText(fresh().C.byId["B004"], 1, "sk", false, 0);
  assert.match(cardTextSk, /Keď zomrie tvoje Zviera: \+1\/\+1 pre seba \(NAVŽDY/);
  // Cudzia rasa (kostík) B004 nekŕmi.
  const { state: s2, E: E2 } = fresh(48);
  E2.startRound(s2);
  E2.endShopTurn(s2, "p1");
  const owl3 = E2.makeInst(s2, "B004", 1); owl3.slot = 0;
  const bone = E2.makeInst(s2, "kostik", 1); bone.slot = 1;
  s2.p1.board = [bone, owl3];
  s2.p2.board = [Object.assign(E2.makeInst(s2, "U008", 1), { slot: 0 })];
  s2.p1.hand = []; s2.p2.hand = [];
  const ev2 = E2.doBattle(s2);
  assert.ok(!ev2.some(e => e.type === "proc" && e.uid === owl3.uid && e.kw === "raceDeath"));
  // Obyčajné zviera (B001) kŕmi tiež.
  const { state: s3, E: E3 } = fresh(49);
  E3.startRound(s3);
  E3.endShopTurn(s3, "p1");
  const owl4 = E3.makeInst(s3, "B004", 1); owl4.slot = 1;
  const lamb = E3.makeInst(s3, "B001", 1); lamb.slot = 0;
  s3.p1.board = [lamb, owl4];
  s3.p2.board = [Object.assign(E3.makeInst(s3, "U008", 1), { slot: 0 })];
  s3.p1.hand = []; s3.p2.hand = []; s3.p1.deck = []; s3.p1.discard = [];
  const ev3 = E3.doBattle(s3);
  assert.ok(ev3.some(e => e.type === "proc" && e.uid === owl4.uid && e.kw === "raceDeath"));
});

test("E007 Po nákupe: Živelná sila +1 navždy (strieborný +2); vílie buffRace (F007) sa neboostuje", () => {
  const { state, E, C } = fresh(65);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = [];
  const sprout = E.makeInst(state, "E007", 1); sprout.slot = 0;
  const sprout2 = E.makeInst(state, "E007", 2); sprout2.slot = 1;
  p.board = [sprout, sprout2];
  p.hand = [];
  E.endShopTurn(state, "p1");
  assert.equal(p.dmgBoost, 3); // +1 bronz, +2 striebro
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  state.p2.hand = [];
  E.doBattle(state);
  assert.equal(p.dmgBoost, 3); // trvalé
  // F007 (víla, buffRace fairy) sa Živelnou silou neškáluje
  const { state: s2, E: E2 } = fresh(66);
  E2.startRound(s2);
  s2.p1.dmgBoost = 2;
  const f2 = E2.makeInst(s2, "F002", 1); f2.slot = 0;
  const oak = E2.makeInst(s2, "F007", 1); oak.slot = 1; // Po kúzle: +1/+1 Vílam
  s2.p1.board = [f2, oak];
  s2.p1.hand = [E2.makeInst(s2, "stit", 1)];
  E2.castSpell(s2, "p1", 0, oak.uid);
  assert.equal(f2.atk, 1 + 1 + 1); // +1 z F007 (bez boostu) +1 vlastný Po kúzle rast
  // Popisok: F007 bez boostu, E007 text Živelnej sily
  assert.match(C.cardText(C.byId["F007"], 1, "sk", false, 1), /\+1\/\+1 všetkým Vílam/);
  assert.match(C.cardText(C.byId["E007"], 1, "sk", false, 0), /Po nákupe: Živelná sila \+1/);
  assert.match(C.cardText(C.byId["iskra"], 1, "sk", false, 0), /Navždy: tvoje výboje a výbuchy \+1 damage/);
});

test("E002 Bubbleskip: Pri smrti 2× Bublina; každá Bublina pri smrti dá výboj 1 (+Živelná sila)", () => {
  const { state, E, C } = fresh(67);
  E.startRound(state);
  state.p1.dmgBoost = 1;
  E.endShopTurn(state, "p1");
  const bub = E.makeInst(state, "E002", 1); bub.slot = 0; // 1/3 taunt
  state.p1.board = [bub];
  const big = E.makeInst(state, "B010", 1); big.slot = 0;  // 6/10 – zabije E002 aj bubliny
  const small = E.makeInst(state, "B001", 1); small.slot = 1; // 2/2 – najslabší cieľ výbojov
  state.p2.board = [big, small];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const sums = events.filter(e => e.type === "summon" && e.pid === "p1" && e.defId === "bublina");
  assert.equal(sums.length, 2);
  const zaps = events.filter(e => e.type === "powerDmg" && sums.some(s => s.uid === e.from));
  assert.ok(zaps.length >= 1);
  assert.equal(zaps[0].n, 1 + 1); // výboj 1 + Živelná sila
  assert.match(C.cardText(C.byId["E002"], 1, "sk", false, 1), /vyvolaj 2× Bublina \(1\/1\); každá pri smrti: 2 damage náhodnému/);
});

test("pooly: vlastný 6 / spoločný 3 na kartu; obchod a štartovací balíček z nich uberajú, refresh vracia", () => {
  const { state, E, C } = fresh(60);
  const minions = C.DEFS.filter(d => !d.spell);
  for (const d of minions) {
    const inDeck = state.p1.deck.filter(c => c.defId === d.id).length;
    const inShop = state.p1.priv.filter(x => x.defId === d.id).length;
    assert.equal(state.pools.p1[d.id] + inDeck + inShop, E.POOL_PRIVATE);
    const inCommons = state.commons.filter(x => x === d.id).length;
    assert.equal(state.pools.common[d.id] + inCommons, E.POOL_COMMON);
  }
  assert.ok(state.p1.deck.every(c => c.src && c.src.p1 === 1));
  E.startRound(state);
  const p = state.p1;
  p.money = 10;
  const c0 = state.commons[0];
  E.buyCommon(state, "p1", 0);
  // Kúpená karta nesie zdroj common (ak dokončila trojicu zo štartovacieho balíčka, nesie ho evolvnutá).
  const owned = [...p.deck, ...p.hand, ...p.board].filter(c => c.defId === c0);
  assert.ok(owned.some(c => c.src && c.src.common >= 1));
  E.refreshShop(state, "p1");
  // Invariant: pool + v obchode + kúpené = 3 pre každú kartu (staré karty sa vrátili).
  for (const d of minions) {
    const inCommons = state.commons.filter(x => x === d.id).length;
    const bought = d.id === c0 ? 1 : 0;
    assert.equal(state.pools.common[d.id] + inCommons + bought, E.POOL_COMMON, d.id);
  }
});

test("predaj vracia kópie do poolov, z ktorých boli – strieborná z 2× spoločnej + 1× vlastnej vráti 2+1", () => {
  const { state, E } = fresh(61);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = []; p.hand = []; p.board = [];
  const id = "B001";
  p.money = 20;
  state.commons[0] = id; state.pools.common[id] = 2;
  E.buyCommon(state, "p1", 0);
  state.commons[0] = id; state.pools.common[id] = 1;
  E.buyCommon(state, "p1", 0);
  p.priv[0] = { defId: id, frozen: false }; state.pools.p1[id] = 5;
  E.buyPrivate(state, "p1", 0);
  const silver = p.hand.find(x => x.defId === id && x.rank === 2); // trojica sa spojila do ruky
  assert.ok(silver);
  assert.deepEqual({ ...silver.src }, { common: 2, p1: 1 });
  const cBefore = state.pools.common[id], oBefore = state.pools.p1[id];
  E.sellCard(state, "p1", "hand", p.hand.indexOf(silver));
  assert.equal(state.pools.common[id], Math.min(E.POOL_COMMON, cBefore + 2));
  assert.equal(state.pools.p1[id], oBefore + 1);
});

test("Kniha prianí: možnosti z vlastného poolu, nevybrané sa vrátia; prázdny pool losuje záložne a nespadne", () => {
  const { state, E } = fresh(63);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = [];
  p.hand = [E.makeInst(state, "kniha", 1)];
  const total = () => Object.values(state.pools.p1).reduce((a, b) => a + b, 0);
  const t0 = total();
  E.castSpell(state, "p1", 0);
  assert.equal(total(), t0 - 3);
  E.pickDiscover(state, "p1", 1);
  assert.equal(total(), t0 - 1);
  const picked = p.hand.find(x => !x.spell);
  assert.deepEqual({ ...picked.src }, { p1: 1 });

  const { state: s2, E: E2 } = fresh(64);
  for (const k of Object.keys(s2.pools.p1)) s2.pools.p1[k] = 0;
  for (const k of Object.keys(s2.pools.common)) s2.pools.common[k] = 0;
  E2.startRound(s2);
  assert.ok(s2.commons.every(x => typeof x === "string"));
  assert.ok(s2.p1.priv.every(x => typeof x.defId === "string"));
  s2.p1.money = 5;
  assert.ok(E2.refreshShop(s2, "p1"));
  assert.ok(Object.values(s2.pools.common).every(n => n <= E2.POOL_COMMON)); // strop drží
});

test("Živelná sila zosilňuje aj Pri útoku bonus (E004): +1 útok +boost, tokeny tiež", () => {
  const { state, E } = fresh(43);
  E.startRound(state);
  state.p1.dmgBoost = 2;
  E.endShopTurn(state, "p1");
  const wf = E.makeInst(state, "E004", 1); wf.slot = 0;      // Pri útoku: +1/0 všetkým
  const pal = E.makeInst(state, "B002", 1); pal.slot = 1;    // 4/5
  const tok = E.makeInst(state, "kostik", 1); tok.slot = 2;  // token na ploche
  state.p1.board = [wf, pal, tok];
  state.p2.board = [Object.assign(E.makeInst(state, "U008", 1), { slot: 0 })]; // 3/8 taunt
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const buffs = events.filter(e => e.type === "buff" && e.pid === "p1");
  assert.ok(buffs.some(e => e.uid === pal.uid && e.a === 3 && e.h === 3)); // 1 + boost 2, obe čísla
  assert.ok(buffs.some(e => e.uid === tok.uid && e.a === 3 && e.h === 3)); // token tiež
  // Popisok karty ukáže navýšené číslo len pri „Pri útoku"; Vlna (buffAllFriends kúzlo) nie.
  const C = fresh().C;
  assert.match(C.cardText(C.byId["E004"], 1, "sk", false, 2), /\+3\/\+3/);
  assert.match(C.cardText(C.byId["vlna"], 1, "sk", false, 2), /\+1\/\+1/);
  assert.match(C.cardText(C.byId["F009"], 1, "sk", false, 2), /\+2\/\+2/); // Po kúzle bez boostu
});

test("U010: undead aura sa položí PRI SMRTI – živí nemŕtvi hneď, budúce inštancie cez raceBuffs", () => {
  const { state, E } = fresh(44);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "U010", 1); tank.slot = 0;   // 8/10 taunt, Pri smrti aura
  const bone = E.makeInst(state, "kostik", 1); bone.slot = 1;  // 1/1 undead
  state.p1.board = [tank, bone];
  state.p2.board = [Object.assign(E.makeInst(state, "O010", 1), { slot: 0 })]; // 10/10 – zabije tank
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  assert.equal(Object.keys(state.p1.raceBuffs).length, 0); // pred bojom žiadna aura (nie je battlecry)
  const events = E.doBattle(state);
  const proc = events.find(e => e.type === "proc" && e.uid === tank.uid && e.kw === "deathrattle");
  assert.ok(proc);
  assert.ok(events.some(e => e.type === "futureBuff" && e.pid === "p1" && e.race === "undead" && e.a === 1 && e.h === 1));
  assert.ok(events.some(e => e.type === "buff" && e.uid === bone.uid && e.a === 1 && e.h === 1)); // živý kostík hneď
  assert.equal(state.p1.raceBuffs.undead.a, 1); assert.equal(state.p1.raceBuffs.undead.h, 1); // aura prežila boj
  const later = E.makeInst(state, "U001", 1, state.p1);
  assert.equal(later.atk, 2); // 1 + aura – budúce inštancie
});

test("Vichor: príšerka útočí dvakrát a Pri útoku sa spustí pri každom útoku", () => {
  const { state, E } = fresh(45);
  E.startRound(state);
  const p = state.p1;
  const wf = E.makeInst(state, "E004", 1); wf.slot = 0; // 4/3, Pri útoku
  const pal = E.makeInst(state, "B002", 1); pal.slot = 1; // 2 karty > 1 – p1 začína, wf útočí prvý
  p.board = [wf, pal];
  p.hand = [E.makeInst(state, "vichor", 1)];
  E.castSpell(state, "p1", 0, wf.uid);
  assert.equal(wf.windfury, true);
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "F004", 1), { slot: 0 })]; // 2/5 taunt – prežije 1. úder, wf 2.
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  // Dva útoky wf tesne za sebou (bez súperovho útoku medzi nimi).
  const seq = events.filter(e => e.type === "attack").map(e => e.aUid);
  let doubled = false;
  for (let i = 1; i < seq.length; i++) if (seq[i] === wf.uid && seq[i - 1] === wf.uid) doubled = true;
  assert.ok(doubled, "Vichor útočí 2× za sebou");
  const procs = events.filter(e => e.type === "proc" && e.uid === wf.uid && e.kw === "onAttack");
  assert.ok(procs.length >= 2); // Pri útoku pri každom z dvoch útokov
});

test("Vichor: druhý útok odpadá, ak útočník padol pri prvom", () => {
  const { state, E } = fresh(46);
  E.startRound(state);
  const p = state.p1;
  const weak = E.makeInst(state, "B001", 1); weak.slot = 0; // 2/2
  const tnt = E.makeInst(state, "E002", 1); tnt.slot = 1;   // 2 karty > 1 – p1 začína, weak útočí prvý
  p.board = [weak, tnt];
  p.hand = [E.makeInst(state, "vichor", 1)];
  E.castSpell(state, "p1", 0, weak.uid);
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "U010", 1), { slot: 0 })]; // 8/10 – zabije 2/2 hneď
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  assert.equal(events.filter(e => e.type === "attack" && e.aUid === weak.uid).length, 1);
});

test("Umlčanie: v najbližšom boji zruší schopnosť aj taunt náhodnej súperovej príšerky", () => {
  const { state, E } = fresh(51);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "ticho", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.silences, 1);
  E.endShopTurn(state, "p1");
  // Súperov board: jediný cieľ so schopnosťou je U001 (deathrattle) s tauntom.
  const rattler = E.makeInst(state, "U001", 1); rattler.slot = 0; rattler.taunt = true;
  state.p2.board = [rattler];
  state.p1.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })]; // 4/5
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const sil = events.find(e => e.type === "silence");
  assert.ok(sil);
  assert.equal(sil.uid, rattler.uid);
  // Umlčaný deathrattle nevyvolá kostíkov.
  assert.ok(!events.some(e => e.type === "summon"));
  assert.equal(state.p1.silences, 0); // nabité kúzlo sa spotrebovalo
});

test("víly Po kúzle: každé kúzlo spustí schopnosti víl na ploche", () => {
  const { state, E } = fresh(71);
  E.startRound(state);
  const p = state.p1;
  const prank = E.makeInst(state, "F003", 1); prank.slot = 0; // Po kúzle: +1/+1 kamarátke
  const cap = E.makeInst(state, "F002", 1); cap.slot = 1;     // Po kúzle: +1/+1 pre seba
  p.board = [prank, cap];
  p.hand = [E.makeInst(state, "minca", 1)];
  p.deck = []; p.discard = [];
  const before = p.money;
  E.castSpell(state, "p1", 0);
  assert.equal(p.money, before + 2);              // minca zafungovala
  assert.equal(cap.atk, 3);                       // +1/+1 od seba aj od F003
  assert.equal(cap.hp, 4);
});

test("F001 battlecry: potiahne kartu pri vyložení, strieborný 2", () => {
  const { state, E } = fresh(72);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "F001", 1)];
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "B002", rank: 1 }, { defId: "B006", rank: 1 }];
  p.discard = [];
  assert.ok(E.playMinion(state, "p1", 0));
  assert.equal(p.hand.length, 1);                 // battlecry dotiahol 1
  p.hand = [E.makeInst(state, "F001", 2)];
  assert.ok(E.playMinion(state, "p1", 0));
  assert.equal(p.hand.length, 2);                 // strieborný dotiahol 2
});

test("víly F002/F004: rast Po kúzle je trvalý – prežije boj aj cyklus balíčka", () => {
  const { state, E, C } = fresh(74);
  E.startRound(state);
  const p = state.p1;
  const cap = E.makeInst(state, "F002", 1); cap.slot = 0; // Po kúzle: +1/+1 NAVŽDY
  p.board = [cap];
  p.hand = [E.makeInst(state, "minca", 1)];
  p.deck = []; p.discard = [];
  E.castSpell(state, "p1", 0);
  assert.equal(cap.pa, 1); // trvalý rast na kópii
  assert.equal(cap.ph, 1);
  // cyklus balíčka: plocha → kôpka → balíček → ruka; rast musí ostať
  p.discard.push(E.pileCard(cap));
  p.board = [];
  const events = [];
  E.drawCards(state, p, 2, events);
  const back = p.hand.find(x => x.defId === "F002");
  assert.ok(back);
  assert.equal(back.atk, C.byId["F002"].atk + 1);
  assert.equal(back.hp, C.byId["F002"].hp + 1);
});

test("zahrané kúzlo sa v tom istom ťahu nedá znova dotiahnuť (žiadny nekonečný cyklus)", () => {
  const { state, E } = fresh(77);
  E.startRound(state);
  const p = state.p1;
  p.board = [];
  p.hand = [E.makeInst(state, "minca", 1)];
  p.deck = []; p.discard = [];
  E.castSpell(state, "p1", 0);
  // kúzlo je v karanténe – nie je v kôpke, reshuffle by ho nevrátil
  assert.equal(p.hand.length, 0);
  assert.equal(p.discard.length, 0);
  assert.equal(p.spentSpells.length, 1);
  E.endShopTurn(state, "p1");
  // až koniec ťahu vráti kúzlo do kôpky
  assert.equal(p.spentSpells.length, 0);
  assert.ok(p.discard.some(c => c.defId === "minca"));
});

test("spellScale F010: +1/+1 za každé kúzlo zahrané v tejto hre (pri vyložení)", () => {
  const { state, E, C } = fresh(76);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "minca", 1), E.makeInst(state, "minca", 1)];
  E.castSpell(state, "p1", 0);
  E.castSpell(state, "p1", 0);
  assert.equal(p.spellsCast, 2);
  p.hand = [E.makeInst(state, "F010", 1)];
  p.board = [];
  E.playMinion(state, "p1", 0);
  const m = p.board[0];
  assert.equal(m.atk, C.byId["F010"].atk + 2); // +1/+1 za každé z 2 kúziel
  assert.equal(m.hp, C.byId["F010"].hp + 2);
});

test("F006 battlecry: pridá Iskričku do ruky; jednorazová – po zoslaní aj po ťahu zmizne", () => {
  const { state, E, C } = fresh(72);
  E.startRound(state);
  const p = state.p1;
  p.board = [];
  p.hand = [E.makeInst(state, "F006", 1)];
  p.deck = []; p.discard = [];
  E.playMinion(state, "p1", 0);
  const spark = p.hand.find(x => x.defId === "iskricka");
  assert.ok(spark && spark.spell);
  // zoslanie: +1/+0 vybranej príšerke, kúzlo zmizne (nie kôpka, nie karanténa)
  const idx = p.hand.indexOf(spark);
  E.castSpell(state, "p1", idx, p.board[0].uid);
  assert.equal(p.board[0].atk, C.byId["F006"].atk + 1);
  assert.equal(p.spentSpells.length, 0);
  assert.equal(p.discard.filter(c => c.defId === "iskricka").length, 0);
  // nezahraná Iskrička na konci ťahu prepadne
  p.hand = [E.makeInst(state, "iskricka", 1)];
  E.endShopTurn(state, "p1");
  assert.equal(p.discard.filter(c => c.defId === "iskricka").length, 0);
});

test("Iskrička spúšťa Po kúzle víly (kŕmi vlastný motor)", () => {
  const { state, E } = fresh(79);
  E.startRound(state);
  const p = state.p1;
  const cap = E.makeInst(state, "F002", 1); cap.slot = 0;
  p.board = [cap];
  p.hand = [E.makeInst(state, "iskricka", 1)];
  E.castSpell(state, "p1", 0, cap.uid);
  assert.equal(cap.atk, 1 + 1 + 1); // základ 1 + Iskrička +1 + vlastný rast +1
});

test("Svätožiara: Božský štít zablokuje prvé zranenie, potom praskne", () => {
  const { state, E } = fresh(73);
  E.startRound(state);
  const p = state.p1;
  const bear = E.makeInst(state, "B002", 1); bear.slot = 0; // 4/5 taunt
  p.board = [bear];
  p.hand = [E.makeInst(state, "svatoziara", 1)];
  E.castSpell(state, "p1", 0, bear.uid);
  assert.equal(bear.shield, true);
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "B001", 1), { slot: 0 })]; // 2/2
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const pop = events.find(e => e.type === "shieldPop");
  assert.ok(pop);
  // Prvý útok medveďa nezranil: hp event po prvom útoku ostal na plnej hodnote.
  const idx = events.indexOf(pop);
  const hpAfter = events.slice(idx).find(e => e.type === "hp" && e.uid === bear.uid);
  assert.equal(hpAfter.hp, 5);
});

test("Fénixovo pierko: príšerka sa po smrti raz vráti s 1 HP", () => {
  const { state, E } = fresh(74);
  E.startRound(state);
  const p = state.p1;
  const bird = E.makeInst(state, "B001", 1); bird.slot = 0; // 2/2
  p.board = [bird];
  p.hand = [E.makeInst(state, "pierko", 1)];
  E.castSpell(state, "p1", 0, bird.uid);
  assert.equal(bird.revive, true);
  E.endShopTurn(state, "p1");
  state.p2.board = [Object.assign(E.makeInst(state, "U010", 1), { slot: 0 })]; // 8/10 – zabije 2/2
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const rev = events.find(e => e.type === "revive" && e.uid === bird.uid);
  assert.ok(rev);
  // Druhá smrť už je definitívna.
  const die = events.find(e => e.type === "die" && e.uid === bird.uid);
  assert.ok(die);
});

test("Žabia kliatba: v najbližšom boji zmení náhodnej súperovej príšerke HP na 1", () => {
  const { state, E } = fresh(75);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "kliatba", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.hexes, 1);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "U010", 1); tank.slot = 0; // 8/10
  state.p2.board = [tank];
  state.p1.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const hex = events.find(e => e.type === "hex" && e.uid === tank.uid);
  assert.ok(hex);
  assert.equal(state.p1.hexes, 0); // spotrebovaná
});

test("Blesk: na začiatku najbližšieho boja výboj za 3 (+dmgBoost) na náhodnú súperovu príšerku", () => {
  const { state, E } = fresh(75);
  E.startRound(state);
  const p = state.p1;
  p.dmgBoost = 1; // Večná iskra – Blesk je výboj, bonus platí
  p.hand = [E.makeInst(state, "blesk", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.bolts, 1);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "U010", 1); tank.slot = 0; // 8/10
  state.p2.board = [tank];
  state.p1.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const hit = events.find(e => e.type === "powerDmg" && e.uid === tank.uid && e.n === 4);
  assert.ok(hit, "blesk mal zasiahnuť tank za 3+1");
  assert.equal(state.p1.bolts, 0); // spotrebovaný
});

test("Zrkadlo: vloží kópiu 1. stupňa cieľa do balíčka a vie dokončiť trojicu", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  const m = E.makeInst(state, "B001", 1); m.slot = 0;
  p.board = [m];
  p.deck = []; p.discard = []; p.hand = [E.makeInst(state, "zrkadlo", 1)];
  E.castSpell(state, "p1", 0, m.uid);
  assert.ok(p.deck.some(c => c.defId === "B001" && c.rank === 1));
  // tretia kópia cez druhé Zrkadlo = evolve (board + deck + deck)
  p.hand = [E.makeInst(state, "zrkadlo", 1)];
  const events = E.castSpell(state, "p1", 0, m.uid);
  assert.ok(events.some(e => e.type === "evolve"), "trojica sa mala spojiť");
});

test("Zrkadlo: token (kostík) sa nedá kopírovať", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  const tok = E.makeInst(state, "kostik", 1); tok.slot = 0;
  p.board = [tok];
  p.hand = [E.makeInst(state, "zrkadlo", 1)];
  assert.equal(E.castSpell(state, "p1", 0, tok.uid), null);
});

test("Kúzelný klobúk: premení cieľ na náhodnú príšeru o tier vyššiu (stupeň 1, aury platia)", () => {
  const { state, E, C } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.raceBuffs = { beast: { a: 1, h: 1 } }; // aura sa má aplikovať, ak vyjde beast
  const m = E.makeInst(state, "B001", 1); m.slot = 2; // tier 1
  p.board = [m];
  p.hand = [E.makeInst(state, "klobuk", 1)];
  const events = E.castSpell(state, "p1", 0, m.uid);
  const tr = events.find(e => e.type === "transform");
  assert.ok(tr);
  assert.equal(p.board.length, 1);
  const fresh2 = p.board[0];
  assert.notEqual(fresh2.uid, m.uid);
  assert.equal(C.byId[fresh2.defId].tier, 2); // presne o tier vyššie
  assert.equal(fresh2.rank, 1);
  assert.equal(fresh2.slot, 2); // slot ostáva
  assert.ok(!p.discard.some(c => c.defId === "B001"), "originál zmizol z hry");
});

test("Poklad škriatka: +2 hneď a +2 na začiatku ďalšieho kola", () => {
  const { state, E } = fresh();
  E.startRound(state); // kolo 1, income 3
  const p = state.p1;
  p.hand = [E.makeInst(state, "poklad", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.money, 5);
  assert.equal(p.goldNext, 2);
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  E.doBattle(state); // boj sám spustí nové kolo: income 4 + 2 z pokladu
  assert.equal(state.round, 2);
  assert.equal(p.money, 6);
  assert.equal(p.goldNext, 0);
});

test("kúzlo Štít: dá vybranej príšerke Obrancu bez statov", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  const m = E.makeInst(state, "B001", 1); // 2/2 bez tauntu
  p.board = [m];
  p.hand = [E.makeInst(state, "stit", 1)];
  E.castSpell(state, "p1", 0, m.uid);
  assert.equal(m.taunt, true);
  assert.equal(m.atk, 2); // staty nezmenené
  assert.equal(m.hp, 2);
});

test("kúzla majú vlastnú cenu (minca 1), príšery fixne 3", () => {
  const { state, E } = fresh();
  E.startRound(state);
  assert.equal(E.cardCost("minca"), 1);
  assert.equal(E.cardCost("srdce"), 3);
  assert.equal(E.cardCost("B001"), 3);
  const p = state.p1;
  p.money = 1;
  p.hand = []; p.board = [];
  state.commons[0] = "minca";
  E.buyCommon(state, "p1", 0);
  assert.equal(p.money, 0); // stála len 1
  assert.ok(p.deck.some(c => c.defId === "minca"));
  state.commons[0] = "B001";
  assert.equal(E.buyCommon(state, "p1", 0), null); // na príšeru nemá
});

test("kúzlo gold: +2 peniaze, do kôpky až na konci ťahu (karanténa)", () => {
  const { state, E } = fresh();
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "minca", 1)];
  E.castSpell(state, "p1", 0);
  assert.equal(p.money, 5);
  assert.ok(p.spentSpells.some(c => c.defId === "minca"));
  E.endShopTurn(state, "p1");
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
  const { C } = fresh();
  const fx = C.byId["E008"].power.fx;
  assert.equal(elem.atk, C.byId["E001"].atk + fx.a); // živel buffnutý
  assert.equal(beast.atk, C.byId["B001"].atk);       // zviera nie
});

test("boj: prázdna plocha prehráva, damage = súčet tierov preživších (evolve nehrá rolu)", () => {
  const { state, E } = fresh(11);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [E.makeInst(state, "B002", 1), E.makeInst(state, "B001", 2)];
  state.p2.board = [];
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const dmg = events.find(e => e.type === "heroDmg");
  assert.equal(dmg.pid, "p2");
  assert.equal(dmg.dmg, 4); // B002 tier 3 + B001 tier 1 (strieborná – rank nehrá rolu)
  assert.equal(state.p2.hp, 46);
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

test("Mláďa má Obrancu (B007 aj B005) – súper ho musí biť, kŕmi sovu B004", () => {
  const { state, E, C } = fresh(68);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const fin = E.makeInst(state, "B007", 1); fin.slot = 0;   // Pri smrti: Mláďa s Obrancom
  const tuft = E.makeInst(state, "B005", 1); tuft.slot = 1; // Pri smrti: 2× Mláďa bez Obrancu
  const owl = E.makeInst(state, "B004", 1); owl.slot = 2;   // Keď zomrie tvoje Mláďa: +1/+1
  state.p1.board = [fin, tuft, owl];
  state.p2.board = [Object.assign(E.makeInst(state, "O003", 1), { slot: 0 })]; // 7/8 – zabíja všetko po jednom
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const sums = events.filter(e => e.type === "summon" && e.defId === "mlada");
  assert.ok(sums.length >= 1);
  const cub = E.makeInst(state, "mlada", 1);
  assert.equal(cub.taunt, true);
  assert.match(C.cardText(C.byId["B007"], 1, "sk", false, 0), /vyvolaj 1× Mláďa \(1\/1\) s Obrancom/);
  assert.match(C.cardText(C.byId["B005"], 1, "sk", false, 0), /vyvolaj 2× Mláďa \(1\/1\) s Obrancom/);
});

test("evolvnutý deathrattle vyvoláva silnejšie tokeny (stupeň rodiča), nie viac", () => {
  const { state, E } = fresh(15);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const hound = E.makeInst(state, "U009", 2); hound.slot = 0; // strieborný: vyvolaj 3× Kostík
  state.p1.board = [hound];
  state.p2.board = [Object.assign(E.makeInst(state, "E010", 3), { slot: 0 })]; // 32/32 – zabije ho
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const summons = events.filter(e => e.type === "summon" && e.defId === "kostik");
  assert.equal(summons.length, 3);        // počet = základ (3), nie 3×2
  for (const s of summons) {
    assert.equal(s.rank, 2);              // stupeň rodiča
    assert.equal(s.atk, 2);               // 1/1 → 2/2
    assert.equal(s.hp, 2);
  }
});

test("Pretečenie: undead token, čo sa nezmestí, dá celé staty jednému kamarátovi", () => {
  const { state, E } = fresh(21);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  // U001 (taunt ručne, aby zomrel prvý) + 4 tuční kamaráti bez tauntu = plná plocha.
  const rattler = E.makeInst(state, "U001", 1); rattler.slot = 0; rattler.taunt = true;
  const pals = [1, 2, 3, 4].map(i => {
    const x = E.makeInst(state, "U008", 1); x.slot = i; x.taunt = false; return x;
  });
  state.p1.board = [rattler, ...pals];
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 1), { slot: 0 })]; // 4/5 útočník
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  // U001 zomrie → 2 kostíky: prvý sa zmestí (4 živí), druhý pretečie.
  const summons = events.filter(e => e.type === "summon" && e.defId === "kostik");
  assert.equal(summons.length, 1);
  const over = events.filter(e => e.type === "overflow");
  assert.equal(over.length, 1);
  assert.equal(over[0].atk, 1);
  assert.equal(over[0].hp, 1);
  // Celé staty tokenu (1/1) dostane presne jeden náhodný kamarát.
  const idx = events.indexOf(over[0]);
  const buffs = events.slice(idx + 1).filter(e => e.type === "buff");
  assert.equal(buffs.length, 1);
  assert.equal(buffs[0].a, 1); // celý atk jednému
  assert.equal(buffs[0].h, 1); // celé hp jednému
});

test("U004 reviveAs: deathrattle prebehne, karta vstane ako 1/1 s aurami a zomrie znova", () => {
  const { state, E } = fresh(93);
  E.startRound(state);
  const p = state.p1;
  const rat = E.makeInst(state, "U001", 1); rat.slot = 0; // Pri smrti: 2× kostík
  p.board = [rat];
  p.hand = [E.makeInst(state, "U004", 1)];
  p.deck = []; p.discard = [];
  p.raceBuffs.undead = { a: 1, h: 2 }; // aura – vstane ako 2/3
  assert.ok(E.playMinion(state, "p1", 0, rat.uid));
  assert.equal(rat.reviveAs, 1);
  state.p2.board = [Object.assign(E.makeInst(state, "E010", 2), { slot: 0 })]; // 18/18, Pred bojom AoE 4
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const rev = events.find(e => e.type === "reviveAs");
  assert.ok(rev);
  assert.equal(rev.atk, 2); // 1 + aura 1
  assert.equal(rev.hp, 3);  // 1 + aura 2
  // Deathrattle prebehol PRED vstávaním – kostíky už boli vonku.
  const revIdx = events.indexOf(rev);
  const before = events.slice(0, revIdx).filter(e => e.type === "summon" && e.defId === "kostik");
  assert.equal(before.length, 2);
  // Druhá smrť: deathrattle znova, ale už nevstane (reviveAs spotrebované).
  const dies = events.filter(e => e.type === "die" && e.uid === rev.uid);
  assert.equal(dies.length, 1);
  const all = events.filter(e => e.type === "summon" && e.defId === "kostik").length
    + events.filter(e => e.type === "overflow").length;
  assert.ok(all >= 4, `len ${all} kostíkov/pretečení`);
});

test("ogr O002 chaos: Pred bojom spustí schopnosť náhodnej príšerky – aj súperovej, deathrattle bez smrti", () => {
  const { state, E, C } = fresh(91);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const chaos = E.makeInst(state, "O002", 1); chaos.slot = 0;   // 5/6, Pred bojom: triggerRandom
  state.p1.board = [chaos];
  const rattle = E.makeInst(state, "U001", 1); rattle.slot = 0;  // súperov deathrattle: 2× kostík
  state.p2.board = [rattle];
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const ct = events.find(e => e.type === "chaosTrigger");
  assert.ok(ct);
  assert.equal(ct.uid, chaos.uid);
  assert.equal(ct.targetUid, rattle.uid); // jediný kandidát – súperova karta
  assert.equal(ct.kw, "deathrattle");
  // Kostíky súpera sa objavili PRED prvým útokom (deathrattle bez smrti).
  const firstAttack = events.findIndex(e => e.type === "attack");
  const firstSummon = events.findIndex(e => e.type === "summon" && e.pid === "p2" && e.defId === "kostik");
  assert.ok(firstSummon !== -1 && firstSummon < firstAttack);
  assert.equal(C.byId["O002"].atk, 5); assert.equal(C.byId["O002"].hp, 6);
  assert.match(C.cardText(C.byId["O002"], 2, "sk", false, 0), /2 náhodných príšeriek/); // evolve = počet
  // Bez kandidátov (vanilky) sa nič nestane a nespadne.
  const { state: s2, E: E2 } = fresh(92);
  E2.startRound(s2);
  E2.endShopTurn(s2, "p1");
  s2.p1.board = [Object.assign(E2.makeInst(s2, "O002", 1), { slot: 0 })];
  s2.p2.board = [Object.assign(E2.makeInst(s2, "O004", 1), { slot: 0 })];
  s2.p1.hand = []; s2.p2.hand = [];
  assert.ok(!E2.doBattle(s2).some(e => e.type === "chaosTrigger"));
});

test("ogr O001 hod mincou: +4/+4 alebo −2/−2 (clamp na 0 atk / 1 hp)", () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { state, E } = fresh(seed);
    E.startRound(state);
    const p = state.p1;
    p.board = [];
    p.hand = [E.makeInst(state, "O001", 1)]; // 2/3
    p.deck = []; p.discard = [];
    assert.ok(E.playMinion(state, "p1", 0));
    const o = p.board[0];
    assert.ok((o.atk === 6 && o.hp === 7) || (o.atk === 0 && o.hp === 1),
      `nečakané staty ${o.atk}/${o.hp}`);
    outcomes.add(o.atk === 6 ? "heads" : "tails");
  }
  assert.equal(outcomes.size, 2); // obe strany mince padli
});

test("ogr O003 chaos výbuch: 2 dmg VŠETKÝM – aj vlastným", () => {
  const { state, E } = fresh(91);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const ogre = E.makeInst(state, "O003", 1); ogre.slot = 0;  // 7/8, Pred bojom
  const pal = E.makeInst(state, "B001", 1); pal.slot = 1;    // 2/2 – výbuch ho zabije
  state.p1.board = [ogre, pal];
  state.p2.board = [Object.assign(E.makeInst(state, "U001", 1), { slot: 0 })]; // 1/1
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const aoe = events.filter(e => e.type === "aoeDmg");
  assert.equal(aoe.length, 2);                       // obe strany
  assert.ok(aoe.some(e => e.pid === "p1") && aoe.some(e => e.pid === "p2"));
  const dead = events.filter(e => e.type === "die");
  assert.ok(dead.some(e => e.defId === "B001"));     // friendly fire
  assert.ok(dead.some(e => e.defId === "U001"));
});

test("ogr O006 ožratý úder: 50 % sa trafí sám za polovicu útoku", () => {
  let drunkSeen = false, soberSeen = false;
  for (let seed = 1; seed <= 40 && !(drunkSeen && soberSeen); seed++) {
    const { state, E } = fresh(seed);
    E.startRound(state);
    E.endShopTurn(state, "p1");
    state.p1.board = [Object.assign(E.makeInst(state, "O006", 1), { slot: 0 })]; // 5/5
    state.p2.board = [Object.assign(E.makeInst(state, "U008", 2), { slot: 0 })]; // 6/16 taunt
    state.p1.hand = []; state.p2.hand = [];
    state.p1.deck = []; state.p1.discard = [];
    state.p2.deck = []; state.p2.discard = [];
    const events = E.doBattle(state);
    const hits = events.filter(e => e.type === "drunkHit");
    if (hits.length) { drunkSeen = true; assert.equal(hits[0].n, 2); } // floor(5/2)
    else soberSeen = true;
  }
  assert.ok(drunkSeen && soberSeen);
});

test("ogr O007 divoká rana: pri smrti 5 dmg náhodnej príšerke", () => {
  const { state, E } = fresh(92);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  state.p1.board = [Object.assign(E.makeInst(state, "O007", 1), { slot: 0 })]; // 9/7 deathrattle
  state.p2.board = [Object.assign(E.makeInst(state, "B002", 2), { slot: 0 })]; // 8/10
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  // Prvý útok (hocikto začne): O007 padne (8 >= 7), B002 ostane s 1 HP,
  // divoká rana má jediný živý cieľ – dorazí ho 5 damage.
  const idx = events.findIndex(e => e.type === "die" && e.defId === "O007");
  assert.ok(idx >= 0);
  const shot = events.find(e => e.type === "powerDmg" && e.n === 5);
  assert.ok(shot);
  assert.ok(events.some(e => e.type === "die" && e.defId === "B002"));
  assert.ok(events.some(e => e.type === "battleDraw")); // obe plochy prázdne
});

test("ogr O010 zmätený obranca: 50 % vstane s 1 HP na náhodnej strane, raz za boj", () => {
  const sides = new Set();
  let none = false;
  for (let seed = 1; seed <= 60; seed++) {
    const { state, E } = fresh(seed);
    E.startRound(state);
    E.endShopTurn(state, "p1");
    state.p1.board = [Object.assign(E.makeInst(state, "O010", 1), { slot: 0 })]; // 10/10
    state.p2.board = [Object.assign(E.makeInst(state, "E010", 2), { slot: 0 })]; // 18/18
    state.p1.hand = []; state.p2.hand = [];
    state.p1.deck = []; state.p1.discard = [];
    state.p2.deck = []; state.p2.discard = [];
    const events = E.doBattle(state);
    const rev = events.filter(e => e.type === "confusedRevive");
    assert.ok(rev.length <= 1, "vstal viac než raz");
    if (!rev.length) { none = true; continue; }
    sides.add(rev[0].swapped ? "enemy" : "own");
    // Hneď za tým summon kópie s 1 HP na ohlásenej strane.
    const s = events.find(e => e.type === "summon" && e.uid === rev[0].uid);
    assert.ok(s && s.hp === 1 && s.pid === rev[0].pid);
  }
  assert.ok(none);                 // niekedy nevstane
  assert.equal(sides.size, 2);     // vstal aj doma, aj u súpera
});

test("Mláďa je fixný token: každé vyvolanie 1/1 (žiadny trvalý rast)", () => {
  const { state, E } = fresh(22);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const a = E.makeInst(state, "B007", 1); a.slot = 0;
  const b = E.makeInst(state, "B007", 1); b.slot = 1;
  state.p1.board = [a, b];
  state.p2.board = [Object.assign(E.makeInst(state, "E010", 1), { slot: 0 })]; // AoE 2 zabije obe 1/1
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const cubs = events.filter(e => e.type === "summon" && e.defId === "mlada");
  assert.equal(cubs.length, 2);
  for (const c of cubs) {
    assert.equal(c.atk, 1);
    assert.equal(c.hp, 1);
  }
});

test("scavenger B009: keď zomrie vlastné Zviera, dostane +2/+2 (v boji)", () => {
  const { state, E } = fresh(25);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  // Návnada útočí prvá (slot 0) a zomrie pri vlastnom útoku; B009 žije a rastie.
  const bait = E.makeInst(state, "B001", 1); bait.slot = 0; bait.taunt = true; // 2/2 návnada
  const prowl = E.makeInst(state, "B009", 1); prowl.slot = 1; // Keď zomrie tvoje Zviera: +2/+2
  state.p1.board = [bait, prowl];
  state.p2.board = [Object.assign(E.makeInst(state, "U010", 1), { slot: 0 })]; // 8/10 zabije návnadu
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const proc = events.find(e => e.type === "proc" && e.kw === "raceDeath" && e.uid === prowl.uid);
  assert.ok(proc);
  const idx = events.indexOf(proc);
  const buff = events.slice(idx + 1).find(e => e.type === "buff" && e.uid === prowl.uid);
  assert.ok(buff);
  assert.equal(buff.a, 2);
  assert.equal(buff.h, 2);
});

test("summonCharge U007: ďalšie vyvolanie v boji vyvolá +1 token navyše", () => {
  const { state, E } = fresh(26);
  E.startRound(state);
  const p = state.p1;
  p.board = []; p.hand = [E.makeInst(state, "U007", 1)];
  E.playMinion(state, "p1", 0); // battlecry: summonCharge +1
  assert.equal(p.summonCharge, 1);
  E.endShopTurn(state, "p1");
  const rattler = E.makeInst(state, "U001", 1); rattler.slot = 1; rattler.taunt = true;
  state.p1.board.push(rattler);
  state.p2.board = [Object.assign(E.makeInst(state, "E010", 3), { slot: 0 })]; // zabije všetko
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const summons = events.filter(e => e.type === "summon" && e.defId === "kostik");
  assert.equal(summons.length, 3); // 2 základ + 1 charga
  assert.equal(state.p1.summonCharge, 0); // minutá
});

test("multi-hit: strieborný dmgWeakEnemy zasiahne 2× po základnej sile", () => {
  const { state, E } = fresh(23);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const zap = E.makeInst(state, "E001", 2); zap.slot = 0; // Pred bojom: 2× výboj
  state.p1.board = [zap];
  state.p2.board = [0, 1, 2].map(i => Object.assign(E.makeInst(state, "B002", 1), { slot: i }));
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const hits = events.filter(e => e.type === "powerDmg" && e.from === zap.uid);
  assert.equal(hits.length, 2);
  const base = fresh().C.byId["E001"].power.fx.n;
  for (const h of hits) assert.equal(h.n, base); // sila sa neškáluje, počet áno
});

test("výbuch dmgAllEnemies zasiahne všetkých živých nepriateľov jednou vlnou", () => {
  const { state, E } = fresh(24);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const bomb = E.makeInst(state, "E010", 1); bomb.slot = 0; // Pred bojom: výbuch všetkým
  state.p1.board = [bomb];
  state.p2.board = [0, 1, 2].map(i => Object.assign(E.makeInst(state, "B002", 1), { slot: i }));
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const wave = events.find(e => e.type === "aoeDmg" && e.from === bomb.uid);
  assert.ok(wave); // jedna vlna, nie projektily po jednom
  assert.equal(wave.n, fresh().C.byId["E010"].power.fx.n);
  assert.equal(wave.hits.length, 3); // všetci traja nepriatelia naraz
});

test("po boji ide všetko do discard – plochy sú prázdne, tokeny miznú", () => {
  const { state, E } = fresh(4);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const tank = E.makeInst(state, "U008", 1); // 3/8 – prežije
  state.p1.board = [tank];
  state.p2.board = [E.makeInst(state, "B001", 1)];
  state.p1.hand = []; state.p2.hand = [];
  // čisté balíčky, aby globálny evolve po boji nespojil náhodné kópie
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  E.doBattle(state);
  assert.equal(state.p1.board.length, 0);
  assert.equal(state.p2.board.length, 0);
  assert.ok(state.p1.discard.some(c => c.defId === "U008")); // aj preživší
  // B001 sa vrátil do cyklu balíčka (po boji discard, ďalšie kolo ho mohol
  // aktívny hráč hneď dotiahnuť do ruky)
  assert.ok(
    state.p2.discard.some(c => c.defId === "B001") ||
    state.p2.deck.some(c => c.defId === "B001") ||
    state.p2.hand.some(x => x.defId === "B001")
  );
  assert.ok(!state.p1.discard.some(c => c.defId === "kostik")); // token nejde do discard
});

test("moveOnBoard: presun mení sloty (obsadený = výmena) a poradie útoku", () => {
  const { state, E } = fresh(8);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const a = E.makeInst(state, "B005", 1); a.slot = 0; // 3/2
  const b = E.makeInst(state, "B002", 1); b.slot = 1; // 4/5
  state.p1.board = [a, b];
  state.p2.board = [E.makeInst(state, "B001", 1)];
  state.p1.hand = []; state.p2.hand = [];
  // výmena miest: a -> slot 1
  E.moveOnBoard(state, "p1", 0, 1);
  assert.equal(a.slot, 1);
  assert.equal(b.slot, 0);
  assert.equal(state.p1.board[0], b); // pole je zoradené podľa slotov
  // p1 má viac príšer, útočí prvý – a prvý útočník je ten naľavo (b)
  const events = E.doBattle(state);
  const first = events.find(e => e.type === "attack");
  assert.equal(first.aPid, "p1");
  assert.equal(first.aUid, b.uid);
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

test("determinizmus: rovnaký seed + rovnaké akcie = identický stav (multiplayer)", () => {
  const play = () => {
    const ctx = loadEngine();
    const E = ctx.Engine;
    const s = E.newGame(E.seededRng(12345), null);
    E.startRound(s);
    E.buyCommon(s, "p1", 0);
    if (s.p1.hand.some(c => !c.spell)) E.playMinion(s, "p1", s.p1.hand.findIndex(c => !c.spell));
    E.endShopTurn(s, "p1");
    E.refreshShop(s, "p2");
    E.buyPrivate(s, "p2", 0);
    if (s.p2.hand.some(c => !c.spell)) E.playMinion(s, "p2", s.p2.hand.findIndex(c => !c.spell));
    E.endShopTurn(s, "p2");
    E.doBattle(s);
    return JSON.stringify(s);
  };
  assert.equal(play(), play());
});

test("po boji sa obchod refreshne: commons aj nezmrazené súkromné nanovo, zmrazená prežije a rozmrazí sa", () => {
  const { state, E } = fresh();
  E.startRound(state);
  state.commons = ["SENT", "SENT", "SENT"];
  state.p1.priv = [{ defId: "SENT", frozen: true }, { defId: "SENT", frozen: false }];
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  E.doBattle(state); // prázdne plochy → remíza → startRound
  assert.equal(state.round, 2);
  assert.ok(state.commons.every(id => id !== "SENT"));
  assert.equal(state.p1.priv[0].defId, "SENT");
  assert.equal(state.p1.priv[0].frozen, false);
  assert.ok(state.p1.priv.slice(1).every(s => s.defId !== "SENT"));
});

test("common ponuka je stropovaná nižším tierom hráčov, súkromná vlastným", () => {
  const { state, E, C } = fresh();
  E.startRound(state);
  state.p1.tier = 4;
  state.p2.tier = 2;
  assert.equal(E.commonTierLimit(state), 2);
  state.p1.money = 20;
  E.refreshShop(state, "p1");
  assert.ok(state.commons.every(id => C.byId[id].tier <= 2));
  E.buyCommon(state, "p1", 0); // náhrada kúpenej karty drží rovnaký strop
  assert.ok(state.commons.every(id => C.byId[id].tier <= 2));
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

// ---------- Mutácie („Pravidlo dnešnej arény") ----------

test("mutácie: newGame bez parametra žrebuje, null = žiadna, string = vynútená", () => {
  const { state, E } = fresh(5); // fresh posiela null
  assert.equal(state.mutator, null);
  const rolled = E.newGame(E.seededRng(5));
  assert.ok(E.MUTATORS.includes(rolled.mutator));
  // rovnaký seed → rovnaká mutácia (multiplayer/replay determinizmus)
  assert.equal(E.newGame(E.seededRng(5)).mutator, rolled.mutator);
  const forced = E.newGame(E.seededRng(5), "gift");
  assert.equal(forced.mutator, "gift");
});

test("mutácia smallArena/marathon: životy hrdinov 25/45", () => {
  const { E } = fresh();
  assert.equal(E.newGame(E.seededRng(1), "smallArena").p1.hp, 35);
  assert.equal(E.newGame(E.seededRng(1), "marathon").p2.hp, 65);
});

test("mutácia plenty: obchod má 4 spoločné karty", () => {
  const { state } = fresh(3, "plenty");
  assert.equal(state.commons.length, 4);
});

test("mutácia freeRefresh: refresh nič nestojí", () => {
  const { state, E } = fresh(4, "freeRefresh");
  E.startRound(state);
  const p = state[state.active];
  const before = p.money;
  assert.equal(E.refreshCost(state), 0);
  assert.ok(E.refreshShop(state, state.active));
  assert.equal(p.money, before);
});

test("mutácia richSell: predaj dáva 2 mince", () => {
  const { state, E } = fresh(4, "richSell");
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.hand = [E.makeInst(state, "B001", 1)];
  p.hand[0].slot = 0;
  const before = p.money;
  E.sellCard(state, pid, "hand", 0);
  assert.equal(p.money, before + 2);
});

test("mutácia twinEvolve: 2 kópie sa spoja", () => {
  const { state, E } = fresh(6, "twinEvolve");
  E.startRound(state);
  const p = state.p1;
  p.hand = [1, 2].map(() => E.makeInst(state, "B001", 1));
  p.hand.forEach((x, i) => x.slot = i);
  const events = [];
  E.checkEvolve(state, p, events);
  assert.ok(events.some(e => e.type === "evolve"));
  assert.equal(p.hand.length + p.board.length, 1);
});

test("mutácia echoDeath: deathrattle sa spustí 2× (U001 vyvolá 4 kostíkov)", () => {
  const { state, E } = fresh(7, "echoDeath");
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const u = E.makeInst(state, "U001", 1); u.slot = 0; // deathrattle: 2× kostík
  state.p1.board = [u];
  state.p2.board = [E.makeInst(state, "E010", 1)]; // 9/8 zabije U001
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  const summons = events.filter(e => e.type === "summon" && e.defId === "kostik" && e.pid === "p1");
  assert.equal(summons.length, 4);
});

test("mutácia echoCry: battlecry 2× (E008 aura živlov +2/+2 spolu)", () => {
  const { state, E } = fresh(8, "echoCry");
  E.startRound(state);
  const p = state.p1;
  const pal = E.makeInst(state, "E002", 1); pal.slot = 0; // elemental 1/3
  p.board = [pal];
  p.hand = [E.makeInst(state, "E008", 1)]; // battlecry: aura živlov +1/+1
  E.playMinion(state, "p1", 0);
  assert.equal(pal.atk, 1 + 2);
  assert.equal(pal.maxHp, 3 + 2);
  assert.equal(p.raceBuffs.elemental.a, 2);
});

test("mutácia bloodMoon: preživší dostane +1/+1 navždy (pa/ph na kópii)", () => {
  const { state, E } = fresh(9, "bloodMoon");
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const big = E.makeInst(state, "U010", 1); big.slot = 0; // 8/10 prežije
  state.p1.board = [big];
  state.p2.board = [E.makeInst(state, "B001", 1)]; // 2/2 zomrie
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  assert.ok(events.some(e => e.type === "bloodMoon" && e.pid === "p1"));
  const copy = state.p1.discard.find(c => c.defId === "U010");
  assert.equal(copy.pa, 1);
  assert.equal(copy.ph, 1);
});

test("mutácia gift: obaja hráči dostanú raz za kolo kúzlo do ruky navyše", () => {
  const { state, E } = fresh(10, "gift");
  E.startRound(state);
  const active = state.active;
  const p = state[active];
  assert.equal(p.hand.filter(x => x.spell).length >= 1, true);
  const spells = p.hand.filter(x => x.spell).length;
  // druhé beginShopTurn v TOM ISTOM kole nepridá ďalšie kúzlo
  E.beginShopTurn(state, active);
  assert.equal(p.hand.filter(x => x.spell).length, spells);
});

test("rollBias: súkromná ponuka hráča s biasom praje jeho rase, spoločná nie", () => {
  const { state, E, C } = fresh(70);
  const isUndead = id => C.byId[id].race === "undead";
  const undeadDefs = C.DEFS.filter(d => !d.spell && d.tier <= 3 && d.race === "undead").length;
  const allDefs = C.DEFS.filter(d => !d.spell && d.tier <= 3).length;
  const base = undeadDefs / allDefs; // ~ podiel undead kariet v poole
  state.p1.rollBias = { race: "undead", weight: 3 };
  let hit = 0, N = 400;
  for (let i = 0; i < N; i++) { const id = E.rollCard(state, 3, "p1"); if (isUndead(id)) hit++; E.returnToPool(state, "p1", id); }
  assert.ok(hit / N > base * 1.8, `bias ${hit / N} vs základ ${base.toFixed(2)}`);
  let hitC = 0;
  for (let i = 0; i < N; i++) { const id = E.rollCard(state, 3, "common"); if (isUndead(id)) hitC++; E.returnToPool(state, "common", id); }
  assert.ok(hitC / N < base * 1.5, `spoločná ${hitC / N} vs základ ${base.toFixed(2)}`);
});

test("Bublina strieborného E002 strieľa pri smrti len raz (hits: 1), aj keď má stupeň 2", () => {
  const { state, E, C } = fresh(71);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const bub = E.makeInst(state, "E002", 2); bub.slot = 0; // strieborná 2/6 – bubliny stupňa 2
  state.p1.board = [bub];
  state.p2.board = [0, 1, 2].map(i => Object.assign(E.makeInst(state, "O009", 1), { slot: i })); // 7/7 ×3 – zabijú všetko
  state.p1.hand = []; state.p2.hand = [];
  state.p1.deck = []; state.p1.discard = [];
  state.p2.deck = []; state.p2.discard = [];
  const events = E.doBattle(state);
  const bubbles = events.filter(e => e.type === "summon" && e.defId === "bublina");
  assert.equal(bubbles.length, 2);
  assert.equal(bubbles[0].rank, 2);
  for (const b of bubbles) {
    const zaps = events.filter(e => e.type === "powerDmg" && e.from === b.uid);
    assert.equal(zaps.length, 1, "každá Bublina presne 1 výboj");
  }
  assert.match(C.cardText(C.byId["E002"], 2, "sk", false, 0), /každá pri smrti: 1 damage náhodnému nepriateľovi/);
});

test("Buyback: posledný predaj v ťahu sa dá raz vrátiť (tá istá karta, peniaze späť, pool späť)", () => {
  const { state, E } = fresh(72);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = []; p.board = [];
  const a = E.makeInst(state, "B002", 1); a.slot = 0; a.atk += 2; a.src = { p1: 1 };
  const b = E.makeInst(state, "U001", 1); b.slot = 1; b.src = { common: 1 };
  p.hand = [a, b];
  const money = p.money;
  state.pools.p1.B002 = 4; // pod stropom, nech je návrat do poolu merateľný
  const poolBefore = state.pools.p1.B002;
  E.sellCard(state, "p1", "hand", 0); // predaj B002
  assert.equal(p.money, money + 1);
  assert.equal(state.pools.p1.B002, poolBefore + 1);
  E.sellCard(state, "p1", "hand", 0); // predaj U001 – posledný predaj je U001
  const ev = E.buyBack(state, "p1");
  assert.ok(ev && ev.some(e => e.type === "buyBack" && e.defId === "U001"));
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].uid, b.uid);        // tá istá inštancia
  assert.equal(p.money, money + 2 - 1);      // dva predaje +2, buyback −1
  assert.equal(E.buyBack(state, "p1"), null); // raz za ťah
  assert.equal(p.buyBackUsed, true);
  // ďalšie kolo: opäť k dispozícii, ale bez predaja nie je čo vrátiť
  E.endShopTurn(state, "p1");
  state.p2.board = []; state.p2.hand = [];
  E.doBattle(state);
  assert.equal(p.buyBackUsed, false);
  assert.equal(E.buyBack(state, state.active), null);
});
