// Teoretická sila kariet (Bot.cardPower): telo + odhad schopnosti v stat
// bodoch, zoradené podľa rasy a tieru. Známka porovnáva celok s priemerom
// tieru (A ≥ 1,3×, B ≥ 1×, C ≥ 0,75×, inak D). Rovnaké čísla dostáva
// Claude bot v katalógu kariet – pri zmene kariet si tabuľku pozri.
//
// Použitie: node tools/card-power.mjs [race=beast] [md=1]

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const toVar = src => src.replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
const ctx = { console, Math, JSON, Object, Array, module: undefined };
vm.createContext(ctx);
for (const f of ["src/cards.js", "src/engine.js", "src/bot.js"]) {
  vm.runInContext(toVar(fs.readFileSync(path.join(ROOT, f), "utf8")), ctx, { filename: f });
}
const { Cards, Bot } = ctx;
const opts = {};
for (const a of process.argv.slice(2)) { const i = a.indexOf("="); if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1); }

const rows = Cards.DEFS.map(d => ({ d, ...Bot.cardPower(d) }));
const tierAvg = {};
for (const r of rows) { if (r.d.spell) continue; (tierAvg[r.d.tier] ||= []).push(r.total); }
for (const t in tierAvg) tierAvg[t] = tierAvg[t].reduce((a, b) => a + b, 0) / tierAvg[t].length;
const grade = r => {
  if (r.d.spell) return "";
  const k = r.total / tierAvg[r.d.tier];
  return k >= 1.3 ? "A" : k >= 1 ? "B" : k >= 0.75 ? "C" : "D";
};
const order = ["beast", "elemental", "undead", "fairy", "dragon", "ogre", undefined];
rows.sort((a, b) => (order.indexOf(a.d.race) - order.indexOf(b.d.race)) || (a.d.tier - b.d.tier) || (b.total - a.total));
const md = opts.md === "1";
const line = md ? c => "| " + c.join(" | ") + " |" : c => c.join("\t");
console.log(line(["id", "rasa", "t", "telo", "schopnosť", "spolu", "zn.", "text"]));
if (md) console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (opts.race && r.d.race !== opts.race) continue;
  console.log(line([r.d.id, r.d.race || "kúzlo", r.d.tier, r.d.spell ? "–" : r.body, r.ability, r.total, grade(r),
    (r.d.spell ? "" : `${r.d.atk}/${r.d.hp} `) + (Cards.cardText(r.d, 1, "sk") || "")]));
}
console.log("\npriemer tieru (príšery): " + Object.entries(tierAvg).map(([t, v]) => `t${t}=${v.toFixed(1)}`).join("  "));
