// Ideálne strety rás („perfect roll"): hráč A vidí v obchode LEN karty rasy A,
// hráč B len rasy B (spoločná ponuka losuje z oboch rás, bot cudziu rasu
// nekupuje), štartovací balíček sú len t1 karty vlastnej rasy (max 2 kópie,
// teda 4–6 kariet), kúzla ostávajú spoločné. Obaja hrdinovia majú HP_DEFAULT
// (100) životov – vidno dlhodobé škálovanie, nie len early tempo. Hrá hard
// bot BEZ handicapov (Bot.HYGIENE: bez zlata navyše, bez rollBias) proti
// sebe, takže výsledok meria silu rasy, nie bota. Bez banu, bez mutácie.
//
// Použitie: node tools/ideal-sim.mjs [n=100] [hp=100] [races=beast,undead]
//           [trinkets=1] [rounds=40] [mirror=1] [verbose=0] [seed=1000]
//   n        počet hier na matchup (polovica s vymenenými miestami p1/p2)
//   races    ktoré rasy (čiarkou), default všetky
//   trinkets 1 = DMG Meter kolá + draft trinketov (ako v hre), 0 = bez nich
//   rounds   strop kôl (potom remíza)
//   mirror   1 = aj zrkadlové strety (rasa proti sebe)
//   verbose  1 = vypíš priebeh prvej hry každého matchupu po kolách
//
// Injekcie do zdrojov (engine aj bot ostávajú nedotknuté v repe):
//   engine.rollCard  – state.raceLock[poolKey] obmedzí losovanie na rasu
//   engine.setupStart – štartovací balíček len z rasy hráča
//   engine.newGame   – opts.raceLock sa nastaví pred setupStart
//   bot.cardScore    – cudzia rasa −100 (p.forceRace), ogr povolený ogrovi
//   bot.dominantRace – p.forceRace je dominantná rasa od 1. kola
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ALL_RACES = ["beast", "elemental", "undead", "fairy", "dragon", "ogre", "doggy"];
const HP_DEFAULT = 100;

function toVar(src) {
  return src.replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
}

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Presná náhrada reťazca – chýbajúci vzor = zdroj sa zmenil, nástroj treba
// upraviť (radšej spadnúť než ticho simulovať niečo iné).
function patch(src, from, to, expect = 1) {
  const n = src.split(from).length - 1;
  if (n !== expect) throw new Error(`inject: vzor nájdený ${n}×, čakal som ${expect}: ${from.slice(0, 60)}…`);
  return src.split(from).join(to);
}

function loadCtx() {
  const ctx = { console, Math, JSON, Object, Array, module: undefined };
  vm.createContext(ctx);
  // CRLF → LF, aby viacriadkové vzory sedeli bez ohľadu na konce riadkov.
  const read = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
  vm.runInContext(toVar(read("src/i18n.js")), ctx, { filename: "src/i18n.js" });
  vm.runInContext(toVar(read("src/cards.js")), ctx, { filename: "src/cards.js" });

  let eng = read("src/engine.js");
  eng = patch(eng,
    `const defs = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && !isBanned(state, d) && (!filter || filter(d)));`,
    `const defs0 = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && !isBanned(state, d) && (!filter || filter(d)));
    const lock = state.raceLock && state.raceLock[poolKey];
    const defsL = lock ? defs0.filter(d => lock.includes(d.race)) : defs0;
    const defs = defsL.length ? defsL : defs0;`);
  eng = patch(eng,
    `      for (let i = 0; i < 10; i++) {
        let id;
        do { id = pick(basics, rng).id; }`,
    `      const lockP = state.raceLock && state.raceLock[pid];
      const basicsP = lockP ? basics.filter(d => lockP.includes(d.race)) : basics;
      for (let i = 0; i < Math.min(10, basicsP.length * 2); i++) {
        let id;
        do { id = pick(basicsP, rng).id; }`);
  eng = patch(eng,
    `    setupStart(state);
    return state;`,
    `    if (opts && opts.raceLock) state.raceLock = opts.raceLock;
    setupStart(state);
    return state;`);
  // Experimenty s cenou tieru (tierCost=5,8,9,11,12 tierMin=2 tierDrop=1):
  // základné ceny, minimum a zľava za každé kolo čakania.
  if (cfg.tierCost) {
    const c = cfg.tierCost.split(",").map(Number);
    if (c.length !== 5 || c.some(isNaN)) throw new Error("tierCost: 5 čísel, napr. tierCost=5,8,9,11,12");
    eng = patch(eng, `const TIER_BASE_COST = { 2: 5, 3: 8, 4: 9, 5: 11, 6: 12 };`,
      `const TIER_BASE_COST = { 2: ${c[0]}, 3: ${c[1]}, 4: ${c[2]}, 5: ${c[3]}, 6: ${c[4]} };`);
  }
  if (cfg.tierMin !== null) eng = patch(eng, `const TIER_MIN_COST = 2;`, `const TIER_MIN_COST = ${cfg.tierMin};`);
  if (cfg.tierDrop !== null) {
    eng = patch(eng, `base - (state.round - p.reachedRound) - discount`,
      `base - Math.floor((state.round - p.reachedRound) * ${cfg.tierDrop}) - discount`);
  }
  vm.runInContext(toVar(eng), ctx, { filename: "src/engine.js" });

  let bot = read("src/bot.js");
  bot = patch(bot,
    `const HYGIENE = { ...DIFF.hard, rollBias: 0, goldBonus: 0 };`,
    `const HYGIENE = { ...DIFF.hard, rollBias: 0, goldBonus: 0 };
  DIFF.ideal = HYGIENE;`);
  bot = patch(bot,
    `if (state.round < RACE_LOCK_ROUND) return null;`,
    `if (p.forceRace) return p.forceRace;
    if (state.round < RACE_LOCK_ROUND) return null;`);
  bot = patch(bot,
    `let score = (foreignMain || plainDragon ? pw.body : pw.total) / 8;`,
    `let score = (foreignMain || plainDragon ? pw.body : pw.total) / 8;
    if (p.forceRace && def.race && def.race !== p.forceRace) score -= 100;`);
  bot = patch(bot, `def.race === "ogre"`, `(def.race === "ogre" && p.forceRace !== "ogre")`, 2);
  vm.runInContext(toVar(bot), ctx, { filename: "src/bot.js" });
  return ctx;
}

// ---------- jedna hra ----------
const boardSum = p => p.board.reduce((n, x) => n + x.atk + x.hp, 0);
const boardStr = p => p.board.map(x => `${x.defId}${x.rank > 1 ? ":" + x.rank : ""}(${x.atk}/${x.hp}${x.taunt ? "T" : ""})`).join(" ") || "-";

function playGame(ctx, seed, raceA, raceB, cfg) {
  const E = ctx.Engine, B = ctx.Bot;
  const s = E.newGame(seeded(seed), null, {
    trinkets: !!cfg.trinkets,
    raceLock: { p1: [raceA], p2: [raceB], common: [raceA, raceB] },
  });
  s.p1.forceRace = raceA; s.p2.forceRace = raceB;
  s.p1.hp = s.p1.maxHp = cfg.hp; s.p2.hp = s.p2.maxHp = cfg.hp;
  E.startRound(s);
  const rounds = []; // { round, p1: {sum, n, tier, hp}, p2: {...}, dmgTo, dmg }
  while (s.phase !== "over" && s.round <= cfg.rounds) {
    B.botTurn(s, s.active, "ideal");
    if (s.phase === "shop") B.botTurn(s, s.active, "ideal");
    if (s.phase !== "battle") throw new Error("hra sa zasekla vo fáze " + s.phase);
    const rec = { round: s.round };
    for (const pid of ["p1", "p2"]) {
      const p = s[pid];
      rec[pid] = { sum: boardSum(p), n: p.board.length, tier: p.tier, hp: p.hp, board: cfg.verbose ? boardStr(p) : null };
    }
    const ev = E.doBattle(s);
    const dmg = ev.find(e => e.type === "heroDmg");
    rec.dmgTo = dmg ? dmg.pid : null;
    rec.dmg = dmg ? dmg.dmg : 0;
    rounds.push(rec);
  }
  return { state: s, rounds, winner: s.phase === "over" ? s.winner : "draw" };
}

// Kópie karty vo všetkých zónach, zlatá = 9 kópií, strieborná = 3.
function ownedWeighted(p, Cards) {
  const m = {};
  const add = (defId, rank) => {
    const d = Cards.byId[defId];
    if (!d || d.token || d.spell) return;
    m[defId] = (m[defId] || 0) + [0, 1, 3, 9][rank || 1];
  };
  for (const c of p.deck) add(c.defId, c.rank);
  for (const c of p.discard) add(c.defId, c.rank);
  for (const x of p.hand) if (x) add(x.defId, x.rank);
  for (const x of p.board) if (x) add(x.defId, x.rank);
  return m;
}

// ---------- parametre ----------
const opts = {};
for (const a of process.argv.slice(2)) { const i = a.indexOf("="); if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1); }
const cfg = {
  n: Number(opts.n || 100),
  hp: Number(opts.hp || HP_DEFAULT),
  trinkets: opts.trinkets === undefined ? 1 : Number(opts.trinkets),
  rounds: Number(opts.rounds || 40),
  mirror: opts.mirror === undefined ? 1 : Number(opts.mirror),
  verbose: Number(opts.verbose || 0),
  seed: Number(opts.seed || 1000),
  tierCost: opts.tierCost || null,
  tierMin: opts.tierMin !== undefined ? Number(opts.tierMin) : null,
  tierDrop: opts.tierDrop !== undefined ? Number(opts.tierDrop) : null,
};
const races = opts.races ? opts.races.split(",") : ALL_RACES;
for (const r of races) if (!ALL_RACES.includes(r)) { console.error("Neznáma rasa: " + r); process.exit(1); }

const ctx = loadCtx();
const Cards = ctx.Cards;

// ---------- agregácie ----------
const win = {};      // win[A][B] = { a, b, draw, rounds }
const scale = {};    // scale[race][round] = { sum, n, tier, hp, count }
const dmgBy = {};    // dmgBy[race][bucket] = { dmg, n } – damage, ktorý rasa DALA
const endOwned = {}; // endOwned[race][defId] = súčet vážených kópií
const games = {};    // games[race] = počet odohraných hier (na priemer)
const winByLen = {}; // winByLen[race][bucket] = { w, n } – výhry podľa dĺžky hry
const bucket = r => r <= 8 ? "1–8" : r <= 15 ? "9–15" : "16+";
const BUCKETS = ["1–8", "9–15", "16+"];
for (const r of races) {
  win[r] = {}; scale[r] = {}; dmgBy[r] = {}; endOwned[r] = {}; games[r] = 0; winByLen[r] = {};
  for (const b of BUCKETS) { dmgBy[r][b] = { dmg: 0, n: 0 }; winByLen[r][b] = { w: 0, n: 0 }; }
}

function record(res, raceOf) {
  for (const rec of res.rounds) {
    for (const pid of ["p1", "p2"]) {
      const race = raceOf[pid];
      const sc = (scale[race][rec.round] ||= { sum: 0, n: 0, tier: 0, hp: 0, count: 0 });
      sc.sum += rec[pid].sum; sc.n += rec[pid].n; sc.tier += rec[pid].tier; sc.hp += rec[pid].hp; sc.count++;
    }
    if (rec.dmgTo) {
      const dealer = rec.dmgTo === "p1" ? "p2" : "p1";
      const d = dmgBy[raceOf[dealer]][bucket(rec.round)];
      d.dmg += rec.dmg; d.n++;
    }
  }
  for (const pid of ["p1", "p2"]) {
    const race = raceOf[pid];
    games[race]++;
    const ow = ownedWeighted(res.state[pid], Cards);
    for (const [id, n] of Object.entries(ow)) endOwned[race][id] = (endOwned[race][id] || 0) + n;
    if (res.winner !== "draw") {
      const wl = winByLen[race][bucket(res.state.round)];
      wl.n++; if (res.winner === pid) wl.w++;
    }
  }
}

function matchup(A, B) {
  const m = { a: 0, b: 0, draw: 0, rounds: 0 };
  for (let i = 0; i < cfg.n; i++) {
    const flip = i % 2 === 1; // polovicu hier hrá A ako p2
    const res = playGame(ctx, cfg.seed + i, flip ? B : A, flip ? A : B, cfg);
    const raceOf = { p1: flip ? B : A, p2: flip ? A : B };
    if (cfg.verbose && i === 0) {
      console.log(`\n--- ${A} vs ${B}, hra #${cfg.seed} (p1=${raceOf.p1}, p2=${raceOf.p2}) ---`);
      for (const r of res.rounds) {
        console.log(`K${String(r.round).padStart(2)} p1 T${r.p1.tier} HP${String(r.p1.hp).padStart(3)} Σ${String(r.p1.sum).padStart(4)} [${r.p1.board}]`);
        console.log(`    p2 T${r.p2.tier} HP${String(r.p2.hp).padStart(3)} Σ${String(r.p2.sum).padStart(4)} [${r.p2.board}]  → ${r.dmgTo ? `${r.dmgTo} −${r.dmg}` : "remíza"}`);
      }
      console.log(`víťaz: ${res.winner} (${raceOf[res.winner] || "-"}), kolo ${res.state.round}`);
    }
    if (res.winner === "draw") m.draw++;
    else if ((res.winner === "p1") !== flip) m.a++;
    else m.b++;
    m.rounds += res.state.round;
    record(res, raceOf);
  }
  return m;
}

// ---------- beh ----------
const t0 = Date.now();
console.log(`=== Ideálne strety (perfect roll): HP ${cfg.hp}, hard bot bez handicapov, N=${cfg.n}/matchup, trinkety ${cfg.trinkets ? "áno" : "nie"}, strop ${cfg.rounds} kôl ===`);
if (cfg.tierCost || cfg.tierMin !== null || cfg.tierDrop !== null) {
  console.log(`(experiment: cena tieru ${cfg.tierCost || "5,8,9,11,12"}, minimum ${cfg.tierMin ?? 2}, zľava za kolo ${cfg.tierDrop ?? 1})`);
}
for (let i = 0; i < races.length; i++) {
  for (let j = i; j < races.length; j++) {
    if (i === j && !cfg.mirror) continue;
    const A = races[i], B = races[j];
    const m = matchup(A, B);
    win[A][B] = m;
    if (A !== B) win[B][A] = { a: m.b, b: m.a, draw: m.draw, rounds: m.rounds };
    process.stderr.write(`${A} vs ${B}: ${m.a}/${m.b}/${m.draw} (priem. ${(m.rounds / cfg.n).toFixed(1)} kôl)\n`);
  }
}

const pct = (a, tot) => tot ? (a / tot * 100).toFixed(0).padStart(3) + "%" : "   -";
const short = r => ({ beast: "zviera", elemental: "živel", undead: "nemŕtvy", fairy: "víla", dragon: "drak", ogre: "ogr", doggy: "psík" })[r] || r;
const col = 9;

console.log("\n--- Winrate (riadok proti stĺpcu, % výhier riadku z rozhodnutých hier) ---");
console.log("".padEnd(10) + races.map(r => short(r).padStart(col)).join("") + "  | priemer  dĺžka");
for (const A of races) {
  let w = 0, tot = 0, rounds = 0, n = 0;
  const cells = races.map(B => {
    const m = win[A][B];
    if (!m) return "-".padStart(col);
    if (A !== B) { w += m.a; tot += m.a + m.b; rounds += m.rounds; n += cfg.n; }
    return pct(m.a, m.a + m.b).padStart(col);
  });
  console.log(short(A).padEnd(10) + cells.join("") + `  | ${pct(w, tot)}    ${n ? (rounds / n).toFixed(1) : "-"}`);
}
{
  let draws = 0, total = 0;
  for (let i = 0; i < races.length; i++) for (let j = i; j < races.length; j++) { const m = win[races[i]][races[j]]; if (m) { draws += m.draw; total += cfg.n; } }
  console.log(`remízy (strop kôl / obaja mŕtvi): ${draws} z ${total} hier`);
}

console.log("\n--- Výhry podľa dĺžky hry (kedy rasa vyhráva: % výhier z hier, ktoré skončili v danom kole) ---");
console.log("".padEnd(10) + BUCKETS.map(b => b.padStart(12)).join(""));
for (const r of races) {
  console.log(short(r).padEnd(10) + BUCKETS.map(b => { const x = winByLen[r][b]; return (x.n ? `${pct(x.w, x.n)} (${x.n})` : "-").padStart(12); }).join(""));
}

const SCALE_ROUNDS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
const fmtScale = (key, div) => {
  console.log("kolo".padEnd(10) + SCALE_ROUNDS.map(r => String(r).padStart(6)).join(""));
  for (const race of races) {
    console.log(short(race).padEnd(10) + SCALE_ROUNDS.map(r => {
      const sc = scale[race][r];
      if (!sc || sc.count < 3) return "-".padStart(6);
      return (sc[key] / sc.count / (div || 1)).toFixed(key === "sum" ? 0 : 1).padStart(6);
    }).join(""));
  }
};
console.log("\n--- Škálovanie: priemerná sila plochy pred bojom (Σ útok+život, len hry, ktoré kolo dosiahli; aspoň 3) ---");
fmtScale("sum");
console.log("\n--- Priemerný tier obchodu podľa kola ---");
fmtScale("tier");
console.log("\n--- Priemerný počet príšeriek na ploche pred bojom ---");
fmtScale("n");

console.log("\n--- Damage hrdinovi za vyhraný boj (priemer, podľa kola) ---");
console.log("".padEnd(10) + BUCKETS.map(b => b.padStart(10)).join(""));
for (const r of races) {
  console.log(short(r).padEnd(10) + BUCKETS.map(b => { const d = dmgBy[r][b]; return (d.n ? (d.dmg / d.n).toFixed(1) : "-").padStart(10); }).join(""));
}

console.log("\n--- Karty na konci hry (priemer vážených kópií na hru: bronz 1, striebro 3, zlato 9; top 8) ---");
for (const r of races) {
  const rows = Object.entries(endOwned[r]).map(([id, n]) => [id, n / games[r]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(short(r).padEnd(10) + rows.map(([id, v]) => `${id} ${v.toFixed(1)}`).join("  "));
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
