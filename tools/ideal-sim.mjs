// Režim targeted=1 (cielenie rasy, 13. 10. 2026): obchod a štartovací balíček
// ako v hre (všetky rasy, 10 náhodných t1 kariet), bot od 1. kola cieli
// zadanú rasu – kupuje len ju (+ draci ako žoldnieri), refreshuje za silnou
// kartou svojej rasy (raceHunt) a upgraduje skôr kvôli silnej karte na
// ďalšom tieri (tierLure). runs=4 zopakuje celú maticu so 4 rôznymi seedmi
// a vypíše priemer aj rozptyl (min–max) – nie výsledok jedného behu.
// Default rasy v targeted móde bez víl (bot ich nevie hrať).
//
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
//           [targeted=1] [runs=4]
//   n        počet hier na matchup (polovica s vymenenými miestami p1/p2)
//   races    ktoré rasy (čiarkou), default všetky
//   trinkets 1 = ponuka trinketov v kole 4 a 8 (ako v hre), 0 = bez nich
//   rounds   strop kôl (potom remíza)
//   mirror   1 = aj zrkadlové strety (rasa proti sebe)
//   verbose  1 = vypíš priebeh prvej hry každého matchupu po kolách
//   exp      zapnuté experimentálne rasy (čiarkou), napr. exp=insect = Hmyz
//            v hre (ako checkbox „Hmyz") aj v matici rás
//
// Injekcie do zdrojov (raceLock, forceRace) – tools/sim-lib.mjs.
import { seeded, loadCtx as loadSimCtx } from "./sim-lib.mjs";

const ALL_RACES = ["beast", "elemental", "undead", "fairy", "dragon", "ogre", "doggy"];
const HP_DEFAULT = 100;
// Injekcie (raceLock, forceRace…) sú v tools/sim-lib.mjs.
const loadCtx = () => loadSimCtx({ variant: opts.variant, tierCost: cfg.tierCost, tierMin: cfg.tierMin, tierDrop: cfg.tierDrop });

// ---------- jedna hra ----------
// Roj (Hmyz) sa pridá až bojovej kópii – do sily plochy ho započítaj tiež.
const swarm = (p, x) => ctx.Engine.swarmBonus(p, ctx.Cards.byId[x.defId]);
const boardSum = p => p.board.reduce((n, x) => { const s = swarm(p, x); return n + x.atk + x.hp + s.a + s.h; }, 0);
const boardStr = p => p.board.map(x => { const s = swarm(p, x); return `${x.defId}${x.rank > 1 ? ":" + x.rank : ""}(${x.atk + s.a}/${x.hp + s.h}${x.taunt ? "T" : ""})`; }).join(" ") || "-";

function playGame(ctx, seed, raceA, raceB, cfg) {
  const E = ctx.Engine, B = ctx.Bot;
  const s = E.newGame(seeded(seed), null, {
    trinkets: !!cfg.trinkets,
    // targeted: obchod a štart ako v hre, bot len cieli rasu
    raceLock: cfg.targeted ? null : { p1: [raceA], p2: [raceB], common: [raceA, raceB] },
    exp: EXP.length ? EXP : null,
  });
  s.p1.forceRace = raceA; s.p2.forceRace = raceB;
  if (cfg.targeted) { s.p1.targeted = true; s.p2.targeted = true; }
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
      rec[pid] = { sum: boardSum(p), n: p.board.length, tier: p.tier, hp: p.hp, board: cfg.verbose ? boardStr(p) : null, kukla: kuklaSize(p) };
    }
    const ev = E.doBattle(s);
    const dmg = ev.find(e => e.type === "heroDmg");
    rec.dmgTo = dmg ? dmg.pid : null;
    rec.dmg = dmg ? dmg.dmg : 0;
    rounds.push(rec);
  }
  return { state: s, rounds, winner: s.phase === "over" ? s.winner : "draw" };
}

// Kukla (Hmyz): veľkosť pred bojom v ktorejkoľvek zóne (inštancia má staty,
// referencia v balíčku len pa/ph), null = hráč Kuklu nemá.
function kuklaSize(p) {
  for (const zone of ["board", "hand"]) {
    const x = p[zone].find(c => c && c.defId === "kukla");
    if (x) return { a: x.atk, h: x.hp };
  }
  for (const zone of ["deck", "discard"]) {
    const c = p[zone].find(c => c.defId === "kukla");
    if (c) { const d = ctx.Cards.byId.kukla; return { a: d.atk + (c.pa || 0), h: d.hp + (c.ph || 0) }; }
  }
  return null;
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
const EXP = opts.exp ? opts.exp.split(",") : [];
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
  targeted: Number(opts.targeted || 0),
  runs: Math.max(1, Number(opts.runs || 1)),
};
ALL_RACES.push(...EXP);
const races = opts.races ? opts.races.split(",") : cfg.targeted ? ALL_RACES.filter(r => r !== "fairy") : ALL_RACES;
for (const r of races) if (!ALL_RACES.includes(r)) { console.error("Neznáma rasa: " + r); process.exit(1); }

const ctx = loadCtx();
const Cards = ctx.Cards;

// ---------- agregácie ----------
const win = {};      // win[A][B] = { a, b, draw, rounds }
const scale = {};    // scale[race][round] = { sum, n, tier, hp, count }
const kuk = {};      // kuk[race][round] = { a, h, has, count } – Kukla (Hmyz)
const dmgBy = {};    // dmgBy[race][bucket] = { dmg, n } – damage, ktorý rasa DALA
const endOwned = {}; // endOwned[race][defId] = súčet vážených kópií
const games = {};    // games[race] = počet odohraných hier (na priemer)
const winByLen = {}; // winByLen[race][bucket] = { w, n } – výhry podľa dĺžky hry
const bucket = r => r <= 8 ? "1–8" : r <= 15 ? "9–15" : "16+";
const BUCKETS = ["1–8", "9–15", "16+"];
for (const r of races) {
  win[r] = {}; scale[r] = {}; kuk[r] = {}; dmgBy[r] = {}; endOwned[r] = {}; games[r] = 0; winByLen[r] = {};
  for (const b of BUCKETS) { dmgBy[r][b] = { dmg: 0, n: 0 }; winByLen[r][b] = { w: 0, n: 0 }; }
}

function record(res, raceOf) {
  for (const rec of res.rounds) {
    for (const pid of ["p1", "p2"]) {
      const race = raceOf[pid];
      const sc = (scale[race][rec.round] ||= { sum: 0, n: 0, tier: 0, hp: 0, count: 0 });
      sc.sum += rec[pid].sum; sc.n += rec[pid].n; sc.tier += rec[pid].tier; sc.hp += rec[pid].hp; sc.count++;
      const kk = (kuk[race][rec.round] ||= { a: 0, h: 0, has: 0, count: 0 });
      kk.count++;
      if (rec[pid].kukla) { kk.a += rec[pid].kukla.a; kk.h += rec[pid].kukla.h; kk.has++; }
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

function matchup(A, B, seedBase) {
  const m = { a: 0, b: 0, draw: 0, rounds: 0 };
  for (let i = 0; i < cfg.n; i++) {
    const flip = i % 2 === 1; // polovicu hier hrá A ako p2
    const res = playGame(ctx, seedBase + i, flip ? B : A, flip ? A : B, cfg);
    const raceOf = { p1: flip ? B : A, p2: flip ? A : B };
    if (cfg.verbose && i === 0 && seedBase === cfg.seed) {
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
console.log(`=== ${cfg.targeted ? "Cielenie rasy (obchod a štart ako v hre)" : "Ideálne strety (perfect roll)"}: HP ${cfg.hp}, hard bot bez handicapov, N=${cfg.n}/matchup × ${cfg.runs} beh${cfg.runs > 1 ? "y" : ""}, trinkety ${cfg.trinkets ? "áno" : "nie"}, strop ${cfg.rounds} kôl ===`);
if (cfg.tierCost || cfg.tierMin !== null || cfg.tierDrop !== null) {
  console.log(`(experiment: cena tieru ${cfg.tierCost || "5,8,9,11,12"}, minimum ${cfg.tierMin ?? 2}, zľava za kolo ${cfg.tierDrop ?? 1})`);
}
// Behy s rôznymi seedmi; win = súčet cez behy, runAvg[race] = priemer rasy v každom behu.
const runAvg = {};
for (const r of races) runAvg[r] = [];
const add = (x, y) => ({ a: x.a + y.a, b: x.b + y.b, draw: x.draw + y.draw, rounds: x.rounds + y.rounds });
for (let run = 0; run < cfg.runs; run++) {
  const seedBase = cfg.seed + run * 100000;
  const runWin = {};
  for (const r of races) runWin[r] = {};
  for (let i = 0; i < races.length; i++) {
    for (let j = i; j < races.length; j++) {
      if (i === j && !cfg.mirror) continue;
      const A = races[i], B = races[j];
      const m = matchup(A, B, seedBase);
      runWin[A][B] = m;
      win[A][B] = win[A][B] ? add(win[A][B], m) : m;
      if (A !== B) {
        const rev = { a: m.b, b: m.a, draw: m.draw, rounds: m.rounds };
        runWin[B][A] = rev;
        win[B][A] = win[B][A] ? add(win[B][A], rev) : rev;
      }
      process.stderr.write(`[beh ${run + 1}/${cfg.runs}] ${A} vs ${B}: ${m.a}/${m.b}/${m.draw} (priem. ${(m.rounds / cfg.n).toFixed(1)} kôl)\n`);
    }
  }
  for (const A of races) {
    let w = 0, tot = 0;
    for (const B of races) if (A !== B && runWin[A][B]) { w += runWin[A][B].a; tot += runWin[A][B].a + runWin[A][B].b; }
    runAvg[A].push(tot ? w / tot * 100 : 0);
  }
}

const pct = (a, tot) => tot ? (a / tot * 100).toFixed(0).padStart(3) + "%" : "   -";
const short = r => ({ beast: "zviera", elemental: "živel", undead: "nemŕtvy", fairy: "víla", dragon: "drak", ogre: "ogr", doggy: "psík", insect: "hmyz" })[r] || r;
const col = 9;

console.log("\n--- Winrate (riadok proti stĺpcu, % výhier riadku z rozhodnutých hier) ---");
console.log("".padEnd(10) + races.map(r => short(r).padStart(col)).join("") + "  | priemer  dĺžka");
for (const A of races) {
  let w = 0, tot = 0, rounds = 0, n = 0;
  const cells = races.map(B => {
    const m = win[A][B];
    if (!m) return "-".padStart(col);
    if (A !== B) { w += m.a; tot += m.a + m.b; rounds += m.rounds; n += cfg.n * cfg.runs; }
    return pct(m.a, m.a + m.b).padStart(col);
  });
  console.log(short(A).padEnd(10) + cells.join("") + `  | ${pct(w, tot)}    ${n ? (rounds / n).toFixed(1) : "-"}`);
}
{
  let draws = 0, total = 0;
  for (let i = 0; i < races.length; i++) for (let j = i; j < races.length; j++) { const m = win[races[i]][races[j]]; if (m) { draws += m.draw; total += cfg.n * cfg.runs; } }
  console.log(`remízy (strop kôl / obaja mŕtvi): ${draws} z ${total} hier`);
}
if (cfg.runs > 1) {
  console.log(`\n--- Priemerný winrate rasy v jednotlivých behoch (${cfg.runs}×, rôzne seedy): priemer, min–max ---`);
  for (const r of races) {
    const v = runAvg[r];
    const avg = v.reduce((x, y) => x + y, 0) / v.length;
    console.log(short(r).padEnd(10) + `${avg.toFixed(0).padStart(4)}%   (${Math.min(...v).toFixed(0)}–${Math.max(...v).toFixed(0)} %)   behy: ${v.map(x => x.toFixed(0)).join(" / ")}`);
  }
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
const kukRaces = races.filter(r => Object.values(kuk[r]).some(k => k.has));
if (kukRaces.length) {
  const KR = [4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 20];
  console.log("\n--- Kukla (Hmyz): priemerná veľkosť pred bojom u hráčov, čo ju majú (% hráčov s Kuklou) ---");
  console.log("kolo".padEnd(10) + KR.map(r => String(r).padStart(12)).join(""));
  for (const r of kukRaces) {
    console.log(short(r).padEnd(10) + KR.map(rd => {
      const k = kuk[r][rd];
      if (!k || !k.has) return "-".padStart(12);
      return `${(k.a / k.has).toFixed(0)}/${(k.h / k.has).toFixed(0)} ${(k.has / k.count * 100).toFixed(0)}%`.padStart(12);
    }).join(""));
  }
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
