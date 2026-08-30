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
  p.hand = [E.makeInst(state, "B010", 1)]; // battlecry: budúce Zvieratá +1/+1
  E.playMinion(state, "p1", 0);
  assert.equal(p.raceBuffs.beast.a, 1);
  assert.equal(p.raceBuffs.beast.h, 1);
  assert.equal(existing.atk, 2); // existujúca bez zmeny
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

test("onAttack: dočasný boost pri útoku v boji (len rovnaká rasa)", () => {
  const { state, E } = fresh(12);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const dasher = E.makeInst(state, "B005", 1); dasher.slot = 0; // onAttack: Zvieratá +1/0
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

test("deathrattle buffRace: buffne živých kamarátov rovnakej rasy v boji", () => {
  const { state, E } = fresh(13);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const bloom = E.makeInst(state, "U003", 1); bloom.slot = 0;   // pri smrti: Nemŕtvi +1/+1
  const buddy = E.makeInst(state, "U008", 1); buddy.slot = 1;   // undead 3/8
  state.p1.board = [bloom, buddy];
  state.p2.board = [E.makeInst(state, "E010", 1)]; // 9/8 – bloom zomrie
  state.p1.hand = []; state.p2.hand = [];
  const events = E.doBattle(state);
  assert.ok(events.some(e => e.type === "proc" && e.kw === "deathrattle" && e.uid === bloom.uid));
  assert.ok(events.some(e => e.type === "buff" && e.uid === buddy.uid));
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
    const s = E.newGame(E.seededRng(12345));
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
