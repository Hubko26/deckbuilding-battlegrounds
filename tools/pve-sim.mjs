// PvE damage output rás: hard bot (bez handicapov) hrá SÁM jednu rasu
// (obchod a štart len z nej, ako „perfect roll" v ideal-sim) a KAŽDÉ kolo
// 1–N bije Strážcu arény (DMG Meter: ∞ staty, neútočí, úder do neho zabije
// útočníka – kto útočí, padne). Meria sa damage, ktorý plocha spraví za
// kolo: súčet úderov všetkých útočníkov vrátane vyvolaných (tokeny,
// Včielky, Kukla…) a efektov (výboje, výbuchy). Súper (p2) nič nerobí,
// odmena za DMG Meter je vypnutá – čistý výkon plochy rasy po kolách.
//
// Použitie: node tools/pve-sim.mjs [n=100] [rounds=20] [races=beast,insect]
//           [trinkets=1] [seed=1000] [verbose=0]
//   n        počet hier na rasu
//   rounds   počet kôl (default 20)
//   races    rasy (čiarkou), default všetky vrátane Hmyzu
//   trinkets 1 = ponuka trinketov v kole 4 a 8 (ako v hre)
//   verbose  1 = priebeh prvej hry každej rasy (plocha a damage po kolách)
import { seeded, loadCtx } from "./sim-lib.mjs";

const RACES = ["beast", "elemental", "undead", "fairy", "dragon", "ogre", "doggy", "insect"];
const short = r => ({ beast: "zviera", elemental: "živel", undead: "nemŕtvy", fairy: "víla", dragon: "drak", ogre: "ogr", doggy: "psík", insect: "hmyz" })[r] || r;

const opts = {};
for (const a of process.argv.slice(2)) { const i = a.indexOf("="); if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1); }
const cfg = {
  n: Number(opts.n || 100),
  rounds: Number(opts.rounds || 20),
  trinkets: opts.trinkets === undefined ? 1 : Number(opts.trinkets),
  seed: Number(opts.seed || 1000),
  verbose: Number(opts.verbose || 0),
};
const races = opts.races ? opts.races.split(",") : RACES;
for (const r of races) if (!RACES.includes(r)) { console.error("Neznáma rasa: " + r); process.exit(1); }

const ctx = loadCtx({ pve: true, variant: opts.variant });
const E = ctx.Engine, B = ctx.Bot, C = ctx.Cards;

const swarm = (p, x) => E.swarmBonus(p, C.byId[x.defId]);
const boardSum = p => p.board.reduce((n, x) => { const s = swarm(p, x); return n + x.atk + x.hp + s.a + s.h; }, 0);
const boardStr = p => p.board.map(x => { const s = swarm(p, x); return `${x.defId}${x.rank > 1 ? ":" + x.rank : ""}(${x.atk + s.a}/${x.hp + s.h})`; }).join(" ") || "-";

// Jedna hra: vráti po kolách { dmg, sum, n, tier }.
function playGame(race, seed, verbose) {
  const s = E.newGame(seeded(seed), null, {
    trinkets: !!cfg.trinkets,
    raceLock: { p1: [race], p2: [race], common: [race] },
    exp: ["insect"],
  });
  s.pve = true;
  s.p1.forceRace = race;
  E.startRound(s);
  const out = [];
  while (s.round <= cfg.rounds) {
    let guard = 4;
    while (s.phase === "shop" && guard-- > 0) {
      if (s.active === "p1") B.botTurn(s, "p1", "ideal");
      else E.endShopTurn(s, "p2"); // súper nič nerobí (trinket mu vyberie engine)
    }
    if (s.phase !== "battle") throw new Error(`hra sa zasekla vo fáze ${s.phase} (kolo ${s.round})`);
    const rec = { round: s.round, sum: boardSum(s.p1), n: s.p1.board.length, tier: s.p1.tier };
    if (verbose) rec.board = boardStr(s.p1);
    const ev = E.doBattle(s);
    const res = ev.find(e => e.type === "bossResult");
    rec.dmg = res ? res.dmg.p1 : 0;
    out.push(rec);
  }
  return out;
}

const t0 = Date.now();
console.log(`=== PvE damage output: 1 rasa, hard bot bez handicapov, každé kolo Strážca arény, N=${cfg.n}/rasu, kolá 1–${cfg.rounds}, trinkety ${cfg.trinkets ? "áno" : "nie"} ===`);
const agg = {}; // agg[race][round] = { dmg[], sum, n, tier }
for (const race of races) {
  agg[race] = {};
  for (let i = 0; i < cfg.n; i++) {
    const verbose = cfg.verbose && i === 0;
    const recs = playGame(race, cfg.seed + i, verbose);
    if (verbose) {
      console.log(`\n--- ${short(race)}, hra #${cfg.seed} ---`);
      for (const r of recs) console.log(`K${String(r.round).padStart(2)} T${r.tier} Σ${String(r.sum).padStart(4)} dmg ${String(r.dmg).padStart(5)}  [${r.board}]`);
    }
    for (const r of recs) {
      const a = (agg[race][r.round] ||= { dmg: [], sum: 0, n: 0, tier: 0 });
      a.dmg.push(r.dmg); a.sum += r.sum; a.n += r.n; a.tier += r.tier;
    }
  }
  process.stderr.write(`${short(race)} hotovo (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}

const avg = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ROUNDS = Array.from({ length: cfg.rounds }, (_, i) => i + 1);
const W = 6;
const table = (title, cell) => {
  console.log(`\n--- ${title} ---`);
  console.log("kolo".padEnd(10) + ROUNDS.map(r => String(r).padStart(W)).join(""));
  for (const race of races) console.log(short(race).padEnd(10) + ROUNDS.map(r => cell(agg[race][r]).padStart(W)).join(""));
};
table("Priemerný damage do Strážcu za kolo", a => avg(a.dmg).toFixed(0));
table("Medián damage za kolo", a => median(a.dmg).toFixed(0));
table("Sila plochy pred bojom (Σ útok+život, vrátane roja)", a => (a.sum / a.dmg.length).toFixed(0));
table("Priemerný tier", a => (a.tier / a.dmg.length).toFixed(1));

// Súhrn: celkový damage za kolá 1–N a po úsekoch; poradie podľa súčtu.
const sumRange = (race, lo, hi) => ROUNDS.filter(r => r >= lo && r <= hi).reduce((t, r) => t + avg(agg[race][r].dmg), 0);
const third = Math.ceil(cfg.rounds / 3);
const ranges = [[1, third], [third + 1, 2 * third], [2 * third + 1, cfg.rounds]];
console.log(`\n--- Súhrn: súčet priemerného damage po úsekoch (zoradené podľa celku) ---`);
console.log("".padEnd(10) + ranges.map(([a, b]) => `K${a}–${b}`.padStart(10)).join("") + `K1–${cfg.rounds}`.padStart(11));
for (const race of [...races].sort((x, y) => sumRange(y, 1, cfg.rounds) - sumRange(x, 1, cfg.rounds))) {
  console.log(short(race).padEnd(10) + ranges.map(([a, b]) => sumRange(race, a, b).toFixed(0).padStart(10)).join("") + sumRange(race, 1, cfg.rounds).toFixed(0).padStart(11));
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
