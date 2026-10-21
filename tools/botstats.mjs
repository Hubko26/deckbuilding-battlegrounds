// Súhrn výsledkov hier botov (node tools/botloop.mjs → data/botloop/results.jsonl).
//   node tools/botstats.mjs [súbor.jsonl] [since=2026-10-21] [v=<verzia>] [cards=20]
// Vypíše: winrate rás (dominantná rasa na konci hry, Bot.dominantRace),
// maticu rasa vs. rasa (riadok vyhral nad stĺpcom), dĺžku hier a karty,
// ktoré sú na konci najčastejšie na víťaznej vs. porazenej ploche.
// since / v = len hry od dátumu / z jednej verzie (po zmene kariet či bota).

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(k + "=")) || "").slice(k.length + 1);
const file = path.resolve(ROOT, args.find(a => !a.includes("=")) || "data/botloop/results.jsonl");
const since = opt("since");
const ver = opt("v");
const topN = Number(opt("cards")) || 20;

// mená rás a kariet z hry (rovnako ako tools/replay.mjs)
const ctx = { console, Math, JSON, Object, Array, module: undefined };
vm.createContext(ctx);
for (const f of ["src/i18n.js", "src/cards.js", "src/cards-insect.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1"), ctx, { filename: f });
}
const C = ctx.Cards;
const raceName = r => (r && C.RACES_NOM[r] ? `${C.RACE_ICON[r] || ""} ${C.RACES_NOM[r].sk}` : "? (bez rasy)");
const cardName = id => (C.byId[id] ? C.nameOf(C.byId[id], 1, "sk") : id);

let games;
try {
  games = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
} catch (e) {
  console.error(`Neviem čítať ${file}: ${e.message}`);
  process.exit(1);
}
if (since) games = games.filter(g => g.date >= since);
if (ver) games = games.filter(g => g.v === ver);
if (!games.length) { console.log("Žiadne hry."); process.exit(0); }

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : "–");
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const draws = games.filter(g => g.winner === "draw").length;
const rounds = games.map(g => g.rounds).sort((a, b) => a - b);
console.log(`Hier: ${games.length} (remízy ${draws}), kolá: medián ${rounds[rounds.length >> 1]}, ` +
  `min ${rounds[0]}, max ${rounds[rounds.length - 1]}`);
const p1w = games.filter(g => g.winner === "p1").length;
console.log(`Výhody strany: p1 vyhral ${pct(p1w, games.length - draws)} rozhodnutých hier\n`);

// ---------- Rasy ----------
const race = {};   // r -> { n, w }
const vs = {};     // a -> b -> { n, w }  (w = výhry a nad b)
for (const g of games) {
  for (const [me, op] of [["p1", "p2"], ["p2", "p1"]]) {
    const a = g[me].race || "?", b = g[op].race || "?";
    const won = g.winner === me ? 1 : 0;
    race[a] = race[a] || { n: 0, w: 0 };
    race[a].n++; race[a].w += won;
    vs[a] = vs[a] || {};
    vs[a][b] = vs[a][b] || { n: 0, w: 0 };
    vs[a][b].n++; vs[a][b].w += won;
  }
}
const races = Object.keys(race).sort((a, b) => race[b].w / race[b].n - race[a].w / race[a].n);
console.log("Rasa (dominantná na konci)      hier  výhier  winrate");
for (const r of races) console.log(`${pad(raceName(r), 30)} ${lpad(race[r].n, 5)} ${lpad(race[r].w, 7)} ${lpad(pct(race[r].w, race[r].n), 8)}`);

console.log("\nMatica: riadok vs. stĺpec = winrate riadku (počet hier)");
const short = r => (r === "?" ? "?" : (C.RACE_ICON[r] || "") + C.RACES_NOM[r].sk.slice(0, 5));
console.log(pad("", 14) + races.map(r => lpad(short(r), 12)).join(""));
for (const a of races) {
  const row = races.map(b => {
    const x = vs[a][b];
    return lpad(x ? `${pct(x.w, x.n)} (${x.n})` : "·", 12);
  });
  console.log(pad(short(a), 14) + row.join(""));
}

// ---------- Karty na konci hry ----------
const onWin = {}, onLose = {};
for (const g of games) {
  if (g.winner === "draw") continue;
  const lose = g.winner === "p1" ? "p2" : "p1";
  for (const [side, map] of [[g.winner, onWin], [lose, onLose]]) {
    for (const id of new Set(g[side].board.map(b => b.split(":")[0]))) map[id] = (map[id] || 0) + 1;
  }
}
const decided = games.length - draws;
const cards = Object.keys({ ...onWin, ...onLose })
  .map(id => ({ id, w: onWin[id] || 0, l: onLose[id] || 0 }))
  .filter(c => c.w + c.l >= 3)
  .sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.w - a.w);
console.log(`\nKarty na konečnej ploche (aspoň 3 hry): podiel výhier, keď je karta na ploche`);
console.log("Karta                         na výhre  na prehre  podiel výhier");
const show = list => list.forEach(c => console.log(`${pad(`${cardName(c.id)} (${c.id})`, 30)} ${lpad(c.w, 8)} ${lpad(c.l, 10)} ${lpad(pct(c.w, c.w + c.l), 12)}`));
show(cards.slice(0, topN));
if (cards.length > topN) {
  console.log("…\nNajslabšie:");
  show(cards.slice(-Math.min(10, cards.length - topN)));
}
console.log(`\n(rozhodnutých hier: ${decided}; replay jednej hry: node tools/replay.mjs ${path.relative(ROOT, file)} <id>)`);
