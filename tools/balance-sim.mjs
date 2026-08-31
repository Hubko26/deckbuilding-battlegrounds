// Balance simulácia: bot vs bot (hard), race-forced matchupy + bias testy.
// Použitie: node tools/balance-sim.mjs [počet hier na matchup, default 200]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

function loadCtx() {
  const ctx = { console, Math, JSON, Object, Array, module: undefined };
  vm.createContext(ctx);
  for (const f of ["src/cards.js", "src/engine.js"]) {
    vm.runInContext(toVar(fs.readFileSync(path.join(ROOT, f), "utf8")), ctx, { filename: f });
  }
  // Bot s injektovaným race-force a per-card biasom (číta p.forceRace / p.cardBias).
  let botSrc = fs.readFileSync(path.join(ROOT, "src/bot.js"), "utf8");
  botSrc = botSrc.replace(
    "let score = def.tier;",
    `let score = def.tier;
    if (p.forceRace && def.race && def.race !== p.forceRace) score -= 100;
    if (p.cardBias && p.cardBias[defId] !== undefined) score += p.cardBias[defId];`
  );
  if (!botSrc.includes("p.forceRace")) throw new Error("bot inject failed");
  vm.runInContext(toVar(botSrc), ctx, { filename: "src/bot.js" });
  return ctx;
}

function playGame(seed, cfg1, cfg2) {
  const ctx = loadCtx();
  const E = ctx.Engine, B = ctx.Bot;
  const s = E.newGame(seeded(seed));
  Object.assign(s.p1, cfg1);
  Object.assign(s.p2, cfg2);
  E.startRound(s);
  let guard = 60;
  while (s.phase !== "over" && guard-- > 0) {
    B.botTurn(s, s.active, "hard");
    if (s.phase !== "battle") B.botTurn(s, s.active, "hard");
    if (s.phase === "battle") E.doBattle(s);
  }
  return s;
}

function matchup(name, cfgA, cfgB, games) {
  let a = 0, b = 0, draw = 0, rounds = 0;
  const growth = [];
  for (let i = 0; i < games; i++) {
    // Polovicu hier hrá A ako p1, polovicu ako p2 (p1 začína nepárne kolá).
    const flip = i % 2 === 1;
    const s = playGame(1000 + i, flip ? cfgB : cfgA, flip ? cfgA : cfgB);
    const winA = (s.winner === "p1") !== flip && s.winner !== "draw";
    if (s.winner === "draw" || s.winner === null) draw++;
    else if (winA) a++;
    else b++;
    rounds += s.round;
    for (const pid of ["p1", "p2"]) {
      const g = s[pid].tokenGrowth?.mlada;
      if (g) growth.push(g.a);
    }
  }
  const line = `${name}: A ${a} (${(a / games * 100).toFixed(0)}%) | B ${b} (${(b / games * 100).toFixed(0)}%) | remíza ${draw} | priem. kôl ${(rounds / games).toFixed(1)}`;
  console.log(line + (growth.length ? ` | mlada rast max ${Math.max(...growth)}, priem ${(growth.reduce((x, y) => x + y, 0) / growth.length).toFixed(1)}` : ""));
}

const N = Number(process.argv[2] || 200);


console.log("=== Trojuholník rás (force race, hard bot, N=" + N + ") ===");
matchup("beast(A) vs undead(B)   ", { forceRace: "beast" }, { forceRace: "undead" }, N);
matchup("undead(A) vs elemental(B)", { forceRace: "undead" }, { forceRace: "elemental" }, N);
matchup("elemental(A) vs beast(B) ", { forceRace: "elemental" }, { forceRace: "beast" }, N);

console.log("\n=== Mláďa test (obaja beast; A miluje B007/B008, B ich bojkotuje) ===");
matchup("mlada(A) vs no-mlada(B)  ",
  { forceRace: "beast", cardBias: { B007: 5, B008: 5 } },
  { forceRace: "beast", cardBias: { B007: -100, B008: -100 } }, N);

console.log("\n=== Kontrola artefaktu poolu (obaja beast; B bojkotuje B003/B004 namiesto mláďat) ===");
matchup("ctrl(A) vs no-B003/4(B)  ",
  { forceRace: "beast", cardBias: { B003: 5, B004: 5 } },
  { forceRace: "beast", cardBias: { B003: -100, B004: -100 } }, N);

console.log("\n=== Mirror sanity (rovnaké stratégie) ===");
matchup("beast vs beast           ", { forceRace: "beast" }, { forceRace: "beast" }, N);
matchup("free vs free             ", {}, {}, N);

console.log("\n=== Per-card winrate (free bots, N=" + N * 2 + " hier) ===");
{
  const stats = {}; // defId -> {wins, games}
  for (let i = 0; i < N * 2; i++) {
    const s = playGame(5000 + i, {}, {});
    if (s.winner !== "p1" && s.winner !== "p2") continue;
    for (const pid of ["p1", "p2"]) {
      const won = s.winner === pid;
      const ownedIds = new Set();
      const p = s[pid];
      for (const c of [...p.deck, ...p.discard]) ownedIds.add(c.defId);
      for (const x of [...p.hand, ...p.board]) ownedIds.add(x.defId);
      for (const id of ownedIds) {
        (stats[id] ||= { wins: 0, games: 0 });
        stats[id].games++;
        if (won) stats[id].wins++;
      }
    }
  }
  const rows = Object.entries(stats)
    .filter(([, v]) => v.games >= 20)
    .map(([id, v]) => ({ id, wr: v.wins / v.games, n: v.games }))
    .sort((x, y) => y.wr - x.wr);
  for (const r of rows) {
    console.log(`${r.id.padEnd(8)} winrate ${(r.wr * 100).toFixed(0)}%  (${r.n} hier)`);
  }
}
