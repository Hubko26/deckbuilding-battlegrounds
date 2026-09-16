// Psíci (rasa doggy): Pohladkanie so stupňom bez stropu, generátory,
// psie schopnosti (Ocikaj, Aport, Vyňuchaj, Zavýjanie), P008
// škálovač a t6 Verný až do konca. Bot: hladká psov, pohladkania nie sú balast.
import test from "node:test";
import assert from "node:assert/strict";
import { loadEngine, seeded } from "./harness.mjs";

function fresh(seed = 1, mutator = null) {
  const ctx = loadEngine();
  const state = ctx.Engine.newGame(seeded(seed), mutator);
  return { ctx, state, E: ctx.Engine, C: ctx.Cards, B: ctx.Bot };
}

// Prázdny boj: obe plochy nastavíme ručne, balíčky a ruky prázdne.
function bareFight(seed) {
  const { state, E, C } = fresh(seed);
  E.startRound(state);
  for (const pid of ["p1", "p2"]) {
    const p = state[pid];
    p.hand = []; p.deck = []; p.discard = []; p.board = [];
  }
  const put = (pid, defId, rank = 1, slot) => {
    const inst = E.makeInst(state, defId, rank, state[pid]);
    inst.slot = slot ?? state[pid].board.length;
    state[pid].board.push(inst);
    return inst;
  };
  return { state, E, C, put };
}

test("psíci: dáta – 9 kariet rasy doggy s artom (P001–P009), Pohladkanie je generované kúzlo mimo obchodu a poolu", () => {
  const { state, C, E } = fresh(3);
  const dogs = C.DEFS.filter(d => d.race === "doggy");
  assert.equal(dogs.length, 9);
  assert.equal(dogs.map(d => d.id).join(","), "P001,P002,P003,P004,P005,P006,P007,P008,P009");
  for (const d of dogs) { assert.ok(!d.noArt, d.id); assert.match(C.artOf(d, 2), /P00\d_2\.webp/); }
  assert.equal(C.RACE_ICON.doggy, "🐶");
  const pet = C.byId.pet;
  assert.ok(pet.spell && pet.gen && pet.pet);
  assert.equal(E.cardCost("pet"), 0);
  assert.equal(state.pools.p1.pet, undefined); // pool nemá
  // spell slot nikdy nevyrolluje Pohladkanie
  for (let seed = 1; seed <= 30; seed++) {
    const s = fresh(seed).state;
    s.p1.tier = 6;
    for (let i = 0; i < 5; i++) { s.p1.money = 10; E.refreshShop(s, "p1"); assert.notEqual(s.p1.spellShop.defId, "pet"); }
  }
  // mená podľa stupňa, sila ×2
  assert.equal(C.nameOf(pet, 1, "sk"), "Pohladkanie");
  assert.equal(C.nameOf(pet, 2, "sk"), "Super-pohladkanie");
  assert.equal(C.nameOf(pet, 3, "en"), "Mega-Pet");
  assert.equal(C.nameOf(pet, 7, "sk"), "Pohladkanie 7. stupňa");
  assert.equal(C.petValue(1), 1); assert.equal(C.petValue(2), 2); assert.equal(C.petValue(4), 8);
  assert.match(C.cardText(pet, 3, "sk", false, 0), /\+4\/\+4/);
  assert.match(C.cardText(pet, 1, "sk", false, 0), /spoja/);
});

test("psíci: Pohladkanie – na Psíka NAVŽDY (pa/ph), na inú rasu len dočasne; počítadlá petsCast aj spellsCast; Živelná sila nezosilňuje", () => {
  const { state, E } = fresh(11);
  E.startRound(state);
  const p = state.p1;
  p.dmgBoost = 5; // Živelná sila nesmie pohladkanie zosilniť
  const dog = E.makeInst(state, "P001", 1); dog.slot = 0;
  const bear = E.makeInst(state, "B001", 1); bear.slot = 1;
  p.board = [dog, bear];
  p.hand = [E.makeInst(state, "pet", 1), E.makeInst(state, "pet", 2)];
  assert.equal(E.castSpell(state, "p1", 0), null); // bez cieľa nelegálne
  const ev1 = E.castSpell(state, "p1", 0, dog.uid);
  assert.ok(ev1);
  assert.equal(dog.atk, 2); assert.equal(dog.hp, 3);
  assert.equal(dog.pa, 1); assert.equal(dog.ph, 1);
  assert.ok(ev1[0].perm);
  const ev2 = E.castSpell(state, "p1", 0, bear.uid); // Super +2/+2 na medveďa
  assert.equal(bear.atk, 4); assert.equal(bear.hp, 4);
  assert.equal(bear.pa, undefined);
  assert.equal(ev2[0].a, 2); assert.equal(ev2[0].rank, 2);
  assert.equal(p.petsCast, 2);
  assert.equal(p.spellsCast, 2); // je to kúzlo – víly „Po kúzle" ho vidia
  assert.equal(p.spentSpells.length, 2);
  assert.equal(p.spentSpells[1].rank, 2); // stupeň cestuje do kôpky
  // rast prežije cyklus: karta ide do kôpky a späť do ruky s +1/+1
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  E.doBattle(state);
  p.deck = p.discard.splice(0).filter(c => c.defId === "P001"); p.hand = [];
  E.drawCards(state, p, 1, []);
  assert.equal(p.hand[0].defId, "P001");
  assert.equal(p.hand[0].atk, 2); assert.equal(p.hand[0].hp, 3);
});

test("psíci: 3 rovnaké Pohladkania (ruka, balíček, kôpka) sa spoja na vyšší stupeň do ruky; mimo ťahu do balíčka; zoslané sa nerátajú", () => {
  const { state, E } = fresh(12);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "pet", 1)];
  p.deck = [{ defId: "pet", rank: 1 }, { defId: "B001", rank: 1 }];
  p.discard = [{ defId: "pet", rank: 1 }];
  const events = [];
  E.checkPetMerge(state, p, events);
  const merge = events.find(e => e.type === "petMerge");
  assert.ok(merge);
  assert.equal(merge.rank, 2); assert.equal(merge.hidden, true);
  assert.equal(p.hand.length, 1); assert.equal(p.hand[0].rank, 2);
  assert.equal(p.deck.length, 1); assert.equal(p.discard.length, 0);
  // 3× Super → Mega; zoslané pohladkanie (spentSpells) do trojice nepatrí
  p.spentSpells = [{ defId: "pet", rank: 2 }];
  p.deck.push({ defId: "pet", rank: 2 });
  E.checkPetMerge(state, p, events);
  assert.equal(p.hand.filter(x => x.rank === 2).length, 1); // stále len Super – zoslané sa neráta
  p.deck.push({ defId: "pet", rank: 2 });
  E.checkPetMerge(state, p, events);
  assert.equal(p.hand.length, 1); assert.equal(p.hand[0].rank, 3);
  // Mimo vlastného ťahu (boj) ide výsledok do balíčka.
  state.phase = "battle"; state.active = null;
  p.hand = [];
  p.deck.push({ defId: "pet", rank: 1 }, { defId: "pet", rank: 1 }, { defId: "pet", rank: 1 });
  E.checkPetMerge(state, p, events);
  assert.equal(p.hand.length, 0);
  assert.equal(p.deck.filter(c => c.defId === "pet" && c.rank === 2).length, 1);
  assert.equal(p.deck.filter(c => c.defId === "pet" && c.rank === 1).length, 0);
});

test("psíci: generátory – P001 Pri vyložení (×stupeň), P002 Pri smrti v boji; trojica z generátorov sa spojí", () => {
  const { state, E } = fresh(13);
  E.startRound(state);
  const p = state.p1;
  p.deck = []; p.discard = [];
  p.hand = [E.makeInst(state, "P001", 2), E.makeInst(state, "P001", 1)];
  const ev = E.playMinion(state, "p1", 0);
  assert.equal(ev.find(e => e.type === "addPet").n, 2);
  assert.equal(p.deck.filter(c => c.defId === "pet").length, 2);
  const ev2 = E.playMinion(state, "p1", 0); // tretie → spojenie hneď (hráč je na ťahu → do ruky)
  assert.ok(ev2.some(e => e.type === "petMerge" && e.rank === 2));
  const merged = [...p.deck, ...p.discard, ...p.hand].filter(c => c.defId === "pet");
  assert.equal(merged.length, 1); assert.equal(merged[0].rank, 2);
  // P002 Pri smrti v boji: pohladkanie do balíčka.
  const { state: s2, E: E2, put } = bareFight(14);
  put("p1", "P002");
  put("p2", "O004"); // 3/4 zabije 1/3 Obrancu
  const bev = E2.doBattle(s2);
  assert.ok(bev.some(e => e.type === "addPet" && e.pid === "p1"));
  assert.equal([...s2.p1.deck, ...s2.p1.hand].filter(c => c.defId === "pet").length, 1);
});

test("psíci: P005 Vyňuchaj – vytiahne Pohladkanie najvyššieho stupňa z balíčka, bez pohladkania náhodnú kartu", () => {
  const { state, E } = fresh(15);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "P005", 1)];
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "pet", rank: 1 }, { defId: "pet", rank: 2 }, { defId: "U001", rank: 1 }];
  p.discard = [];
  const ev = E.playMinion(state, "p1", 0);
  assert.ok(ev.some(e => e.type === "draw" && e.defId === "pet" && e.fetched));
  assert.equal(p.hand.length, 1);
  assert.equal(p.hand[0].defId, "pet"); assert.equal(p.hand[0].rank, 2);
  assert.equal(p.deck.length, 3);
  // bez pohladkania: náhodná karta (strieborný = 2 karty)
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "U001", rank: 1 }];
  p.hand = [E.makeInst(state, "P005", 2)];
  p.board = [];
  E.playMinion(state, "p1", 0);
  assert.equal(p.hand.length, 2);
  assert.equal(p.deck.length, 0);
});

test("psíci: P003 Ocikaj – náhodný súper má útok aj životy na polovicu (hore, 1 ostane 1), nie je to damage; striebro 2 rôznych", () => {
  const { state, E, put } = bareFight(16);
  put("p1", "P003", 2);            // 2 ciele
  const big = put("p2", "O008");   // 5/7 → 3/4
  const frail = put("p2", "U001"); // 1/1 → 1/1, žiadna smrť
  const ev = E.doBattle(state);
  const pees = ev.filter(e => e.type === "pee");
  assert.equal(pees.length, 2);
  const onBig = pees.find(e => e.uid === big.uid), onFrail = pees.find(e => e.uid === frail.uid);
  assert.ok(onBig && onFrail);
  assert.equal(onBig.a, -2); assert.equal(onBig.h, -3);
  assert.equal(onFrail.a, 0); assert.equal(onFrail.h, 0);
  // kostík z U001 (Pri smrti) príde až po útoku, nie z ocikania
  const firstAttack = ev.findIndex(e => e.type === "attack");
  const firstSummon = ev.findIndex(e => e.type === "summon");
  assert.ok(firstSummon === -1 || firstSummon > firstAttack);
});

test("psíci: P004 Aport (Po údere) – ak obranca prežije, polovica jeho zvyšných statov ide kamarátovi; padnutý nič", () => {
  const { state, E, put } = bareFight(19);
  const dog = put("p1", "P004");    // 3/2
  const friend = put("p1", "O004"); // 3/4
  const wall = put("p2", "B006");   // 7/9 – prežije; psa chráni Božský štít
  dog.shield = true;
  state.p1.trinkets = ["initiative"]; // p1 začína, pes útočí prvý
  const ev = E.doBattle(state);
  const fetch = ev.find(e => e.type === "fetch");
  assert.ok(fetch);
  assert.equal(fetch.targetUid, wall.uid);
  // po údere 3: 7/6 → ukradne floor(7/2)=3, floor(6/2)=3
  assert.equal(fetch.a, 3); assert.equal(fetch.h, 3);
  assert.equal(fetch.toUid, friend.uid);
  const shr = ev.find(e => e.type === "shrink" && e.uid === wall.uid);
  assert.equal(shr.a, -3); assert.equal(shr.icon, "🦴");
  assert.ok(ev.some(e => e.type === "buff" && e.uid === friend.uid && e.a === 3 && e.h === 3));
  // obranca padne z úderu → žiadny Aport
  const { state: s2, E: E2, put: put2 } = bareFight(20);
  put2("p1", "P004");
  put2("p2", "U001"); // 1/1 padne
  s2.p1.trinkets = ["initiative"];
  const ev2 = E2.doBattle(s2);
  assert.ok(!ev2.some(e => e.type === "fetch"));
});

test("psíci: P006 Zavýjanie – všetci Psíci +1/+1 za každého Psíka na ploche (aj sám); P007 Pečať Psíkom", () => {
  const { state, E, put } = bareFight(21);
  const howler = put("p1", "P006");
  const d1 = put("p1", "P001"), d2 = put("p1", "P005");
  put("p1", "O004"); // nie je pes
  put("p2", "O005");
  const ev = E.doBattle(state);
  const buffs = ev.filter(e => e.type === "buff" && e.pid === "p1" && e.a === 3 && e.h === 3);
  assert.equal(buffs.length, 3);
  for (const u of [howler.uid, d1.uid, d2.uid]) assert.ok(buffs.some(b => b.uid === u));
  const { state: s, E: E2 } = fresh(22);
  E2.startRound(s);
  s.p1.hand = [E2.makeInst(s, "P007", 1)];
  E2.playMinion(s, "p1", 0);
  assert.equal(s.p1.raceBuffs.doggy.a, 1); assert.equal(s.p1.raceBuffs.doggy.h, 1);
});

test("psíci: P008 – +1/+1 za každé zahrané Pohladkanie (počet zoslaní, Super = 1)", () => {
  const { state, E, C } = fresh(23);
  E.startRound(state);
  const p = state.p1;
  const dog = E.makeInst(state, "P001", 1); dog.slot = 0;
  p.board = [dog];
  p.hand = [E.makeInst(state, "pet", 1), E.makeInst(state, "pet", 3), E.makeInst(state, "P008", 1)];
  E.castSpell(state, "p1", 0, dog.uid);
  E.castSpell(state, "p1", 0, dog.uid);
  E.playMinion(state, "p1", 0);
  const b = p.board.find(x => x.defId === "P008");
  assert.equal(b.atk, C.byId.P008.atk + 2);
  assert.equal(b.hp, C.byId.P008.hp + 2);
});

test("psíci: P009 Verný až do konca – sám proti jedinému súperovi vyhráva boj hneď (bez Pri smrti súpera); umlčaný nie", () => {
  const { state, E, put } = bareFight(24);
  put("p1", "P009");             // 8/8
  const foe = put("p2", "B006"); // 7/9, Pri smrti 2× SuperMláďa – nesmú prísť
  const ev = E.doBattle(state);
  const ls = ev.find(e => e.type === "lastStand");
  assert.ok(ls);
  assert.equal(ls.targetUid, foe.uid);
  assert.ok(!ev.some(e => e.type === "attack"));
  assert.ok(!ev.some(e => e.type === "summon"));
  const dmg = ev.find(e => e.type === "heroDmg");
  assert.equal(dmg.pid, "p2");
  // umlčaný P009 schopnosť stráca – bojuje sa normálne
  const { state: s2, E: E2, put: put2 } = bareFight(25);
  put2("p1", "P009");
  put2("p2", "U001");
  s2.p2.silences = 1; // súper umlčí P009
  const ev2 = E2.doBattle(s2);
  assert.ok(ev2.some(e => e.type === "silence"));
  assert.ok(!ev2.some(e => e.type === "lastStand"));
  assert.ok(ev2.some(e => e.type === "attack"));
});

test("psíci: predaj Pohladkania dá 0 zlata (nie zlatý motor), odhodenie ho nechá v kôpke aj so stupňom", () => {
  const { state, E } = fresh(26);
  E.startRound(state);
  const p = state.p1;
  p.hand = [E.makeInst(state, "pet", 1), E.makeInst(state, "pet", 2)];
  const money = p.money;
  E.sellCard(state, "p1", "hand", 0);
  assert.equal(p.money, money);
  E.discardCard(state, "p1", "hand", 0);
  assert.equal(p.discard.at(-1).defId, "pet");
  assert.equal(p.discard.at(-1).rank, 2);
});

test("bot (psíci): Pohladkanie hodí na najsilnejšieho Psíka; pohladkania nie sú balast ani kúzlo nad strop", () => {
  const { state, E, B } = fresh(31);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  const p = state.p2;
  p.money = 0;
  p.deck = [{ defId: "pet", rank: 1 }, { defId: "pet", rank: 1 }, { defId: "minca", rank: 1 }, { defId: "jablko", rank: 1 }, { defId: "koren", rank: 1 }];
  p.discard = [];
  const bear = E.makeInst(state, "B002", 1); bear.slot = 0; // 4/5 – silnejšie telo, ale nie pes
  const dog = E.makeInst(state, "P001", 1); dog.slot = 1;   // 1/2 pes
  p.board = [bear, dog];
  p.hand = [E.makeInst(state, "pet", 2), E.makeInst(state, "pet", 1)];
  for (const x of p.hand) assert.equal(B.isJunk(state, p, x), false);
  B.botTurn(state, "p2", "hard");
  assert.equal(p.petsCast, 2);
  assert.equal(dog.pa, 3); // +2 (Super) +1 – obe na psa, navždy
  assert.equal(bear.pa, undefined);
  // pohladkania sa do stropu kúziel nerátajú: Minca má rovnaké skóre
  // s pohladkaniami v balíčku aj bez nich
  const withPets = B.cardScore(state, p, "minca", { raceFocus: 1 });
  p.deck = p.deck.filter(c => c.defId !== "pet"); p.discard = p.discard.filter(c => c.defId !== "pet");
  assert.equal(B.cardScore(state, p, "minca", { raceFocus: 1 }), withPets);
});

test("cardPower (psíci): každá psia karta a Pohladkanie majú silu; P009 t6 a P008 t5 nad t1 telom", () => {
  const { B, C } = fresh(1);
  const power = id => B.cardPower(C.byId[id]).total;
  for (const d of C.DEFS.filter(x => x.race === "doggy")) assert.ok(power(d.id) > 0, d.id);
  assert.ok(power("P009") > power("P001"));
  assert.ok(power("P008") > power("P003"));
  assert.ok(B.cardPower(C.byId.pet, { rank: 2 }).total > B.cardPower(C.byId.pet).total);
});

test("psíci: celá hra bot vs bot s psíkmi dobehne (rasa v poole, ban ju môže vylúčiť)", () => {
  for (const seed of [101, 102, 103]) {
    const { state, E, B } = fresh(seed);
    E.startRound(state);
    let guard = 200;
    while (state.phase !== "over" && guard-- > 0) {
      if (state.phase === "battle") { E.doBattle(state); continue; }
      B.botTurn(state, state.active, "hard");
    }
    assert.equal(state.phase, "over", `seed ${seed}`);
  }
});

test("psíci: spojenie Pohladkaní pri dotiahnutí ruky nezje ruku – ruka sa doplní späť na 5", () => {
  const { state, E } = fresh(41);
  E.startRound(state);
  E.endShopTurn(state, "p1");
  E.endShopTurn(state, "p2");
  E.doBattle(state); // kolo 2, p2 začína; p1 ťahá až po ňom
  const p = state.p1;
  p.hand = []; p.discard = [];
  // vrch balíčka (pop z konca): 3 pohladkania + 2 príšery, pod nimi rezerva
  p.deck = [{ defId: "B001", rank: 1 }, { defId: "U001", rank: 1 }, { defId: "E001", rank: 1 },
    { defId: "B003", rank: 1 }, { defId: "B007", rank: 1 }, { defId: "pet", rank: 1 }, { defId: "pet", rank: 1 }, { defId: "pet", rank: 1 }];
  const ev = E.endShopTurn(state, "p2"); // p1 na ťahu: draw 5 (3 pet + 2) → Super → dotiahne 2
  assert.ok(ev.some(e => e.type === "petMerge" && e.rank === 2));
  assert.equal(p.hand.length, 5);
  assert.equal(p.hand.filter(x => x.defId === "pet").length, 1);
  assert.equal(p.hand.find(x => x.defId === "pet").rank, 2);
  assert.equal(p.deck.length, 1);
});

test("psíci: P009 Vodca svorky na ploche – každé Pohladkanie pohladká cieľ aj všetkých ostatných Psíkov navždy; bez P009 len cieľ", () => {
  const { state, E } = fresh(51);
  E.startRound(state);
  const p = state.p1;
  const d1 = E.makeInst(state, "P001", 1); d1.slot = 0;
  const d2 = E.makeInst(state, "P003", 1); d2.slot = 1;
  const bear = E.makeInst(state, "B001", 1); bear.slot = 2;
  p.board = [d1, d2, bear];
  p.hand = [E.makeInst(state, "pet", 3), E.makeInst(state, "pet", 2)];
  E.castSpell(state, "p1", 0, d1.uid); // Mega bez P009: len d1
  assert.equal(d1.pa, 4); assert.equal(d2.pa, undefined);
  const leader = E.makeInst(state, "P009", 1); leader.slot = 3;
  p.board.push(leader);
  const ev = E.castSpell(state, "p1", 0, bear.uid); // Super na medveďa s P009: medveď dočasne, všetci psi navždy
  assert.equal(bear.atk, 4); assert.equal(bear.pa, undefined);
  assert.equal(d1.pa, 6); assert.equal(d2.pa, 2); assert.equal(leader.pa, 2);
  assert.equal(ev.filter(e => e.type === "buff").length, 3);
  assert.equal(p.petsCast, 2);
});

test("psíci: P009 Vodca svorky – Pred bojom všetci Psíci dostanú útok a život najsilnejšieho Psíka; Verný až do konca ostáva", () => {
  const { state, E, C, put } = bareFight(52);
  const lead = put("p1", "P009");          // 8/8
  const small = put("p1", "P001");         // 1/2 → 8/8
  const bear = put("p1", "B001");          // nie pes, ostáva 2/2
  put("p2", "O008"); put("p2", "O004");
  const ev = E.doBattle(state);
  const b = ev.find(e => e.type === "buff" && e.uid === small.uid);
  assert.ok(b); assert.equal(b.a, 7); assert.equal(b.h, 6);
  assert.ok(!ev.some(e => e.type === "buff" && e.uid === bear.uid));
  assert.ok(!ev.some(e => e.type === "buff" && e.uid === lead.uid));
  assert.equal(C.powersOf(C.byId.P009).length, 2);
  assert.match(C.cardText(C.byId.P009, 1, "sk", false, 0), /Vodca svorky/);
  assert.match(C.cardText(C.byId.P009, 1, "sk", false, 0), /Verný až do konca/);
});

test("psíci: trinket Vodítko – každé generovanie Pohladkania dá o 1 viac; ponúka sa len v kole 8 hráčovi s 3+ psíkmi", () => {
  const ctx = loadEngine();
  const E = ctx.Engine;
  const state = E.newGame(seeded(61), null, { trinkets: true });
  E.startRound(state);
  const p = state.p1;
  p.deck = [{ defId: "P001", rank: 1 }, { defId: "P002", rank: 1 }, { defId: "P003", rank: 1 }]; p.discard = [];
  // kolo 1: late trinket sa neponúka; kolo 8 s 3 psíkmi áno
  assert.ok(!E.trinketPool(state, "p1").some(t => t.id === "doggyLeash"));
  state.round = 8;
  assert.ok(E.trinketPool(state, "p1").some(t => t.id === "doggyLeash"));
  p.deck = [{ defId: "B001", rank: 1 }];
  assert.ok(!E.trinketPool(state, "p1").some(t => t.id === "doggyLeash")); // bez psíkov nie
  p.trinkets = ["doggyLeash"];
  p.deck = []; p.hand = [E.makeInst(state, "P001", 1)];
  const ev = E.playMinion(state, "p1", 0);
  assert.equal(ev.find(e => e.type === "addPet").n, 2);
  assert.ok(ev.some(e => e.type === "trinketProc" && e.id === "doggyLeash"));
  assert.equal(p.deck.filter(c => c.defId === "pet").length, 2);
});

test("psíci: počítadlo prijatých Pohladkaní (inst.pets) cestuje s kartou cez kôpku aj evolve", () => {
  const { state, E } = fresh(71);
  E.startRound(state);
  const p = state.p1;
  const dog = E.makeInst(state, "P001", 1); dog.slot = 0;
  p.board = [dog];
  p.hand = [E.makeInst(state, "pet", 1), E.makeInst(state, "pet", 2)];
  E.castSpell(state, "p1", 0, dog.uid);
  E.castSpell(state, "p1", 0, dog.uid);
  assert.equal(dog.pets, 2);
  const c = E.pileCard(dog);
  assert.equal(c.pets, 2); assert.equal(c.pa, 3);
  p.deck = [c]; p.hand = []; p.board = [];
  E.drawCards(state, p, 1, []);
  assert.equal(p.hand[0].pets, 2);
  // evolve: dve najsilnejšie kópie sčítajú aj pohladkania
  p.deck = [{ defId: "P001", rank: 1, pa: 1, ph: 1, pets: 1 }, { defId: "P001", rank: 1 }];
  E.checkEvolve(state, p, []);
  const silver = p.hand.find(x => x.defId === "P001" && x.rank === 2);
  assert.ok(silver);
  assert.equal(silver.pets, 3); assert.equal(silver.pa, 4);
});
