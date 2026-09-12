// Trinkety – trvalé bonusy per hráč (Engine.TRINKETS, pickTrinket, useHeroShield).
import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1, opts) {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(seed), null, opts);
  return { ctx, state, E: ctx.Engine, C: ctx.Cards, B: ctx.Bot };
}

// Odohrá kolá bez nákupov, kým hra nedôjde do kola n (nákupná fáza prvého hráča).
function toRound(state, E, n) {
  if (!state.round) E.startRound(state);
  while (state.round < n) {
    E.endShopTurn(state, state.active);
    E.endShopTurn(state, state.active);
    E.doBattle(state);
    if (state.phase === "over") throw new Error("hra skončila skôr");
  }
}

// Prázdne plochy a ruky – boj bez rušivých kariet.
function clear(state) {
  for (const pid of ["p1", "p2"]) { state[pid].board = []; state[pid].hand = []; }
}
const put = (E, state, pid, defId, slot, rank = 1) => {
  const inst = Object.assign(E.makeInst(state, defId, rank, state[pid]), { slot });
  state[pid].board.push(inst);
  return inst;
};
// Boj v aktuálnom kole so zadanými plochami (oba ťahy sa ukončia bez nákupu).
function fight(state, E) {
  E.endShopTurn(state, state.active);
  E.endShopTurn(state, state.active);
  return E.doBattle(state);
}

test("trinkety: bez opts žiadna ponuka, s opts ponuka 3 trinketov v kole 4 pre oboch", () => {
  const off = fresh(5);
  toRound(off.state, off.E, 4);
  assert.equal(off.state.p1.trinketOffer, null);
  assert.equal(off.state.trinketsOn, false);

  const { state, E, C } = fresh(5, { trinkets: true });
  toRound(state, E, 4);
  for (const pid of ["p1", "p2"]) {
    const offer = state[pid].trinketOffer;
    assert.equal(offer.length, 3);
    assert.equal(new Set(offer).size, 3);
    for (const id of offer) {
      const def = E.TRINKETS.find(t => t.id === id);
      assert.ok(def, `neznámy trinket ${id}`);
      assert.ok(!def.late, "silné trinkety až v kole 8");
      assert.ok(!def.needFoeTrinket, "Ogrí kľúč až keď súper trinket má");
      if (def.race) {
        let n = 0;
        for (const zone of ["deck", "discard", "hand", "board"]) for (const c of state[pid][zone]) if (C.byId[c.defId].race === def.race) n++;
        assert.ok(n >= 3, `rasový trinket ${id} bez aspoň 3 kariet rasy`);
      }
    }
  }
});

test("trinkety: výber len vo vlastnej fáze a z ponuky; koniec ťahu bez výberu vezme prvý", () => {
  const { state, E } = fresh(7, { trinkets: true });
  toRound(state, E, 4);
  const me = state.active, foe = me === "p1" ? "p2" : "p1";
  assert.equal(E.pickTrinket(state, foe, state[foe].trinketOffer[0]), null); // nie je na ťahu
  assert.equal(E.pickTrinket(state, me, "nonsense"), null);
  const id = state[me].trinketOffer[1];
  const ev = E.pickTrinket(state, me, id);
  assert.ok(ev.some(e => e.type === "trinketPick" && e.id === id && e.auto === false));
  assert.equal(state[me].trinkets.join(), id);
  assert.equal(state[me].trinketOffer, null);
  assert.equal(E.pickTrinket(state, me, id), null); // ponuka je preč
  E.endShopTurn(state, me);
  const first = state[foe].trinketOffer[0];
  const ev2 = E.endShopTurn(state, foe);
  assert.ok(ev2.some(e => e.type === "trinketPick" && e.id === first && e.auto === true));
  assert.equal(state[foe].trinkets.join(), first);
  assert.ok(E.hasTrinket(state, foe, first));
});

test("trinkety: druhá ponuka v kole 8 neobsahuje už vybraný trinket ani mutáciu hry", () => {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(9), "richSell", { trinkets: true });
  const E = ctx.Engine;
  toRound(state, E, 4);
  const picks = {};
  for (const pid of [state.active, state.active === "p1" ? "p2" : "p1"]) {
    picks[pid] = state[pid].trinketOffer[0];
    E.pickTrinket(state, pid, picks[pid]);
    E.endShopTurn(state, pid);
  }
  E.doBattle(state);
  toRound(state, E, 8);
  for (const pid of ["p1", "p2"]) {
    const offer = state[pid].trinketOffer;
    assert.equal(offer.length, 3);
    assert.ok(!offer.includes(picks[pid]));
    assert.ok(!offer.includes("richSell"), "mutácia a trinket s rovnakým id sa nestackujú");
  }
});

test("trinkety: Zľava tavernára −2 (min. 2), Výhodný predaj 2 mince, Veľká ruka 6 kariet", () => {
  const { state, E } = fresh(3);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  const base = E.upgradeCost(state, pid);
  p.trinkets.push("cheapUpgrade");
  assert.equal(E.upgradeCost(state, pid), Math.max(2, base - 2));
  p.trinkets.push("richSell");
  p.hand = [Object.assign(E.makeInst(state, "B001", 1), { slot: 0 })];
  const money = p.money;
  E.sellCard(state, pid, "hand", 0);
  assert.equal(p.money, money + 2);
  p.trinkets.push("bigHand");
  p.hand = [];
  p.discard.push({ defId: "B001", rank: 1 }, { defId: "B003", rank: 1 }); // balíček má po draw len 5 kariet
  const drawn = E.beginShopTurn(state, pid).filter(e => e.type === "draw").length; // evolve môže ruku hneď zmenšiť
  assert.equal(drawn, 6);
});

test("trinkety: Čerstvý tovar – prvý refresh v kole zadarmo, druhý stojí 1, v novom kole opäť zadarmo", () => {
  const { state, E } = fresh(3);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("freeRefresh1");
  assert.equal(E.refreshCost(state, pid), 0);
  assert.equal(E.refreshCost(state), 1); // bez pid = bežná cena (UI cudzieho hráča)
  const money = p.money;
  E.refreshShop(state, pid);
  assert.equal(p.money, money);
  assert.equal(E.refreshCost(state, pid), 1);
  E.refreshShop(state, pid);
  assert.equal(p.money, money - 1);
  fight(state, E);
  assert.equal(E.refreshCost(state, pid), 0);
});

test("trinkety: Lacné čary – prvé kúzlo v kole o 1 lacnejšie", () => {
  const { state, E } = fresh(3);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("fairyDiscount");
  p.spellShop = { defId: "jablko", frozen: false };
  assert.equal(E.spellCost(state, pid, "jablko"), 1);
  const money = p.money;
  E.buySpell(state, pid);
  assert.equal(p.money, money - 1);
  assert.equal(E.spellCost(state, pid, "jablko"), 2);
});

test("trinkety: Dvojičky – karty tieru 1 sa spoja z 2 kópií, tier 2 nie", () => {
  const { state, E } = fresh(3);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("twinEvolve1");
  p.deck = []; p.discard = []; p.hand = []; p.board = [];
  p.deck.push({ defId: "B001", rank: 1 }, { defId: "B001", rank: 1 }, { defId: "B004", rank: 1 }, { defId: "B004", rank: 1 });
  const ev = [];
  E.checkEvolve(state, p, ev);
  assert.ok(ev.some(e => e.type === "evolve" && e.defId === "B001" && e.rank === 2));
  assert.ok(!ev.some(e => e.defId === "B004"));
});

test("trinkety: Ľutovanie – buyback viackrát za ťah", () => {
  const { state, E } = fresh(3);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("buybackAny");
  p.money = 10;
  p.hand = [Object.assign(E.makeInst(state, "B001", 1), { slot: 0 }), Object.assign(E.makeInst(state, "B003", 1), { slot: 1 })];
  E.sellCard(state, pid, "hand", 0);
  assert.ok(E.buyBack(state, pid));
  E.sellCard(state, pid, "hand", 0);
  assert.ok(E.buyBack(state, pid)); // bez trinketu by bol druhý buyback null
  assert.equal(p.hand.length, 2);
});

test("trinkety: Štít hrdinu – raz za hru, v tom boji porazený nedostane damage", () => {
  const { state, E } = fresh(11);
  E.startRound(state);
  const me = state.active, foe = me === "p1" ? "p2" : "p1";
  assert.equal(E.useHeroShield(state, me), null); // bez trinketu
  state[me].trinkets.push("heroShield");
  assert.equal(E.useHeroShield(state, foe), null); // súper nie je na ťahu
  const ev = E.useHeroShield(state, me);
  assert.ok(ev.some(e => e.type === "heroShieldArm"));
  assert.equal(E.useHeroShield(state, me), null); // druhýkrát nie
  clear(state);
  put(E, state, foe, "B002", 0); // 4/5 obranca vyhrá proti prázdnej ploche
  const hp = state[me].hp;
  const events = fight(state, E);
  const dmg = events.find(e => e.type === "heroDmg");
  assert.equal(dmg.pid, me);
  assert.equal(dmg.dmg, 0);
  assert.equal(dmg.shielded, true);
  assert.equal(state[me].hp, hp);
  // Ďalší boj už bez štítu.
  clear(state);
  put(E, state, foe, "B002", 0);
  const events2 = fight(state, E);
  assert.ok(events2.find(e => e.type === "heroDmg").dmg > 0);
});

test("trinkety: Rýchly štart – začína moja strana aj s menším počtom príšeriek", () => {
  const { state, E } = fresh(12);
  E.startRound(state);
  state.p2.trinkets.push("initiative");
  clear(state);
  put(E, state, "p1", "B001", 0); put(E, state, "p1", "B001", 1);
  put(E, state, "p2", "B002", 0);
  const events = fight(state, E);
  assert.equal(events.find(e => e.type === "battleStart").first, "p2");
});

test("trinkety: Silné tokeny +1/+1, Vypasené mláďatá +1/+1, Ostré kosti +1/+0", () => {
  const run = (trinkets, summoner) => {
    const { state, E } = fresh(13);
    E.startRound(state);
    state.p1.trinkets.push(...trinkets);
    clear(state);
    put(E, state, "p1", summoner, 0);
    put(E, state, "p2", "B002", 0);
    const events = fight(state, E);
    return events.filter(e => e.type === "summon" && e.pid === "p1");
  };
  const mladaPlain = run([], "B007");
  assert.equal(`${mladaPlain[0].atk}/${mladaPlain[0].hp}`, "1/1");
  const mlada = run(["beastPups"], "B007");
  assert.equal(`${mlada[0].atk}/${mlada[0].hp}`, "2/2");
  const kostik = run(["undeadBones"], "U001");
  assert.equal(`${kostik[0].atk}/${kostik[0].hp}`, "2/1");
  const strong = run(["strongTokens", "undeadBones"], "U001");
  assert.equal(`${strong[0].atk}/${strong[0].hp}`, "3/2");
});

test("trinkety: Hrobárova lopata – prvé vyvolanie v boji +1, ďalšie nie, ďalší boj znova", () => {
  const { state, E } = fresh(14);
  E.startRound(state);
  state.p1.trinkets.push("undeadGrave");
  clear(state);
  put(E, state, "p1", "U005", 0); // Pred bojom 2 kostíky
  put(E, state, "p1", "U005", 1);
  put(E, state, "p2", "B002", 0);
  const events = fight(state, E);
  const summons = events.filter(e => e.type === "summon" && e.pid === "p1");
  // Prvý U005: 2 + 1 = 3 kostíky (plocha 2 + 3 = 5, plná); druhý U005 už len pretečie.
  assert.equal(summons.length, 3);
  assert.equal(events.filter(e => e.type === "trinketProc" && e.id === "undeadGrave").length, 1);
  assert.equal(state.p1.graveUsed, false); // po boji reset
});

test("trinkety: Liečivé víťazstvo +2 HP (po strop), Krvavý mesiac ako trinket", () => {
  const { state, E } = fresh(15);
  E.startRound(state);
  state.p1.trinkets.push("healWin", "bloodMoon");
  state.p1.hp = 30;
  clear(state);
  const bear = put(E, state, "p1", "B002", 0);
  put(E, state, "p2", "B001", 0);
  const events = fight(state, E);
  assert.ok(events.some(e => e.type === "heal" && e.pid === "p1" && e.n === 2));
  assert.equal(state.p1.hp, 32);
  assert.ok(events.some(e => e.type === "bloodMoon" && e.uid === bear.uid));
  assert.ok(state.p1.discard.some(c => c.defId === "B002" && c.pa === 1 && c.ph === 1));
  // Strop: plné HP sa neliečia.
  state.p1.hp = 50;
  clear(state);
  put(E, state, "p1", "B002", 0);
  put(E, state, "p2", "B001", 0);
  const ev2 = fight(state, E);
  assert.ok(!ev2.some(e => e.type === "heal"));
});

test("trinkety: Búrkový mrak – Blesk za 3 pred bojom každé kolo", () => {
  const { state, E } = fresh(16);
  E.startRound(state);
  state.p1.trinkets.push("elemStorm");
  clear(state);
  put(E, state, "p1", "B002", 0);
  const target = put(E, state, "p2", "B001", 0); // 2/2 – Blesk ho zloží
  const events = fight(state, E);
  assert.ok(events.some(e => e.type === "trinketProc" && e.id === "elemStorm"));
  const hit = events.find(e => e.type === "powerDmg" && e.uid === target.uid);
  assert.equal(hit.n, 3);
  assert.equal(state.p1.bolts, 0);
});

test("trinkety: Zákon svorky – smrť Zvieraťa dá náhodnému živému Zvieraťu +1/+1 navždy", () => {
  const { state, E } = fresh(17);
  E.startRound(state);
  state.p1.trinkets.push("beastPack");
  clear(state);
  put(E, state, "p1", "B001", 0); // 2/2 padne
  const bear = put(E, state, "p1", "B002", 1); // 4/5 obranca... obranca berie údery prvý – dáme mu preč taunt
  bear.taunt = false;
  put(E, state, "p2", "B002", 0);
  const events = fight(state, E);
  const proc = events.find(e => e.type === "trinketProc" && e.id === "beastPack");
  assert.ok(proc);
  assert.equal(proc.uid, bear.uid);
  const orig = state.p1.discard.find(c => c.defId === "B002");
  assert.ok(orig && orig.pa >= 1 && orig.ph >= 1);
});

test("trinkety: Dvojité pretečenie – nezmestený kostík buffne dve príšerky", () => {
  const run = trinkets => {
    const { state, E } = fresh(18);
    E.startRound(state);
    state.p1.trinkets.push(...trinkets);
    clear(state);
    put(E, state, "p1", "U001", 0); // 1/1, padne prvý (súper 4/5 obranca útočí... obe strany útočia)
    for (let s = 1; s < 5; s++) put(E, state, "p1", "B002", s);
    put(E, state, "p2", "B002", 0);
    const events = fight(state, E);
    const i = events.findIndex(e => e.type === "overflow" && e.pid === "p1");
    assert.ok(i > 0);
    let n = 0;
    for (let j = i + 1; j < events.length && events[j].type === "buff"; j++) n++;
    return n;
  };
  assert.equal(run([]), 1);
  assert.equal(run(["undeadOverflow"]), 2);
});

test("trinkety: Dračia krv – drak berie Pečať každej rasy; Žoldnierska zmluva +1/+1 k dračiemu buffu", () => {
  const { state, E } = fresh(19);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("dragonBlood", "dragonPact");
  p.raceBuffs = { beast: { a: 2, h: 1 }, undead: { a: 1, h: 1 } };
  const drak = E.makeInst(state, "D002", 1, p); // 3/4 + 3/2
  assert.equal(`${drak.atk}/${drak.hp}`, "6/6");
  const plain = E.makeInst(state, "D002", 1, state[pid === "p1" ? "p2" : "p1"]);
  assert.equal(`${plain.atk}/${plain.hp}`, "3/4");
  // Battlecry D002 na zviera: rasa cieľa +1/+1 (+1/+1 zmluva) a drak (každá rasa) buff berie tiež.
  p.board = [];
  const bear = put(E, state, pid, "B002", 0);
  p.hand = [Object.assign(drak, { slot: 0 })];
  const ev = E.playMinion(state, pid, 0, bear.uid);
  const bBuff = ev.find(e => e.type === "buff" && e.uid === bear.uid);
  assert.equal(`${bBuff.a}/${bBuff.h}`, "2/2");
  assert.ok(ev.some(e => e.type === "buff" && e.uid === drak.uid && e.a === 2));
});

test("trinkety: Opatrný ogr – hod mincou vždy hlava s polovičným bonusom", () => {
  const { state, E } = fresh(20);
  E.startRound(state);
  const pid = state.active, p = state[pid];
  p.trinkets.push("ogreCareful");
  p.board = [];
  for (let i = 0; i < 6; i++) {
    p.hand = [Object.assign(E.makeInst(state, "O001", 1, p), { slot: 0 })];
    const ev = E.playMinion(state, pid, 0);
    const flip = ev.find(e => e.type === "coinflip");
    assert.equal(flip.heads, true);
    const b = ev.find(e => e.type === "buff" && e.uid === flip.uid);
    assert.equal(`${b.a}/${b.h}`, "2/2");
    assert.ok(!ev.some(e => e.type === "backstab"));
    p.board = [];
  }
});

test("trinkety: Ogrí kľúč – Pečať +1/+0 Ogrom, chvost vypne súperove trinkety na kolo", () => {
  const { state, E } = fresh(21, { trinkets: true });
  toRound(state, E, 4);
  const me = state.active, foe = me === "p1" ? "p2" : "p1";
  state[me].trinketOffer = ["ogreSabotage"];
  const ev = E.pickTrinket(state, me, "ogreSabotage");
  assert.ok(ev.some(e => e.type === "futureBuff" && e.race === "ogre" && e.a === 1 && e.h === 0));
  state[foe].trinkets.push("cheapUpgrade");
  E.endShopTurn(state, me);
  E.endShopTurn(state, foe);
  // Hľadaj kolo s chvostom.
  let tails = null;
  for (let i = 0; i < 12 && !tails; i++) {
    const events = E.doBattle(state);
    if (state.phase === "over") break;
    const sab = events.find(e => e.type === "sabotage");
    assert.ok(sab && sab.pid === me && sab.target === foe);
    if (!sab.heads) tails = state.round;
    else {
      assert.ok(E.hasTrinket(state, foe, "cheapUpgrade"));
      E.endShopTurn(state, state.active); E.endShopTurn(state, state.active);
    }
  }
  assert.ok(tails, "za 12 kôl mal padnúť aspoň jeden chvost");
  assert.equal(state[foe].trinketOff, tails);
  assert.ok(!E.hasTrinket(state, foe, "cheapUpgrade"));
  const base = E.upgradeCost(state, foe);
  state[foe].trinketOff = 0;
  assert.equal(E.upgradeCost(state, foe), Math.max(2, base - 2));
});

test("trinkety: replay – rovnaký seed a rovnaké akcie dajú rovnaký stav (rng ide cez state.rng)", () => {
  const play = () => {
    const { state, E } = fresh(22, { trinkets: true });
    toRound(state, E, 4);
    for (const pid of [state.active, state.active === "p1" ? "p2" : "p1"]) {
      E.pickTrinket(state, pid, state[pid].trinketOffer[2]);
      E.endShopTurn(state, pid);
    }
    E.doBattle(state);
    toRound(state, E, 9);
    return JSON.stringify({ t1: state.p1.trinkets, t2: state.p2.trinkets, hp: [state.p1.hp, state.p2.hp], d: state.p1.deck });
  };
  assert.equal(play(), play());
});

test("trinkety: bot vyberie trinket a Claude hygiena ho vyberie tiež (completeTurn)", () => {
  const { state, E, B } = fresh(23, { trinkets: true });
  toRound(state, E, 4);
  const pid = state.active;
  const id = B.pickTrinket(state, pid);
  assert.ok(state[pid].trinketOffer.includes(id));
  const events = B.botTurn(state, pid, "hard");
  assert.ok(events.some(e => e.type === "trinketPick" && e.auto === false));
  assert.equal(state[pid].trinkets.length, 1);
});
