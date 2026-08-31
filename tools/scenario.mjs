// Simulátor bojových scenárov: zadáš dva boardy (mid-game stav), nástroj
// odohrá N automatických bojov s rôznymi seedmi a vypíše outcome.
//
// Použitie:
//   node tools/scenario.mjs "B002:2 B001 B001" "U009 U005 U001" [možnosti]
//
// Board = karty oddelené medzerou, formát defId[:stupeň] (stupeň 1–3, default 1).
// Možnosti (key=value):
//   n=500          počet bojov (default 500)
//   aura1=beast:1:2   permanentná aura hráča 1 (rasa:atk:hp) – aplikuje sa na board
//   aura2=...         to isté pre hráča 2
//   boost1=2       dmgCharge hráča 1 (Iskra – ďalší výboj/výbuch +n)
//   boost2=...
//   charge1=1      summonCharge hráča 1 (ďalšie vyvolanie +n navyše)
//   charge2=...
//   verbose=1      vypíše event log prvého boja
//
// Príklady:
//   node tools/scenario.mjs "U009:2 U001 U001" "E005 E002 E001"
//   node tools/scenario.mjs "B008 B007" "U010:2" boost1=2 n=1000
//   node tools/scenario.mjs "E010" "U001 U001 U001 U005 U006" boost1=2 verbose=1

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
  return ctx;
}

// "B002:2" -> { defId: "B002", rank: 2 }
function parseBoard(spec, Cards) {
  return spec.trim().split(/\s+/).filter(Boolean).map(tok => {
    const [defId, rankStr] = tok.split(":");
    const def = Cards.byId[defId];
    if (!def) {
      console.error(`Neznáma karta: ${defId}`);
      console.error("Dostupné: " + Object.keys(Cards.byId).join(", "));
      process.exit(1);
    }
    if (def.spell) {
      console.error(`${defId} je kúzlo – na board patria len príšery/tokeny.`);
      process.exit(1);
    }
    const rank = Math.min(3, Math.max(1, Number(rankStr || 1)));
    return { defId, rank };
  });
}

// key=value možnosti z argv
function parseOpts(args) {
  const o = {};
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq > 0) o[a.slice(0, eq)] = a.slice(eq + 1);
  }
  return o;
}

const [specA, specB, ...rest] = process.argv.slice(2);
if (!specA || !specB) {
  console.log('Použitie: node tools/scenario.mjs "B002:2 B001" "U009 U005" [n=500] [aura1=beast:1:1] [boost1=1] [charge1=1] [verbose=1]');
  process.exit(0);
}
const opts = parseOpts(rest);
const N = Number(opts.n || 500);

const probe = loadCtx();
const boardA = parseBoard(specA, probe.Cards);
const boardB = parseBoard(specB, probe.Cards);

function applyMods(state, E, pid, idx) {
  const p = state[pid];
  const aura = opts["aura" + idx];
  if (aura) {
    const [race, a, h] = aura.split(":");
    p.raceBuffs[race] = { a: Number(a || 0), h: Number(h || 0) };
  }
  p.dmgCharge = Number(opts["boost" + idx] || 0);
  p.summonCharge = Number(opts["charge" + idx] || 0);
}

function setup(seed) {
  const ctx = loadCtx();
  const E = ctx.Engine;
  const s = E.newGame(seeded(seed));
  s.round = 10; // mid-game kontext (na boj nemá vplyv okrem logu)
  for (const [pid, idx, board] of [["p1", 1, boardA], ["p2", 2, boardB]]) {
    applyMods(s, E, pid, idx);
    s[pid].board = board.map((c, i) => {
      const inst = E.makeInst(s, c.defId, c.rank, s[pid]);
      inst.slot = i;
      return inst;
    });
    s[pid].hand = []; s[pid].deck = []; s[pid].discard = [];
  }
  s.phase = "battle";
  return { ctx, s };
}

let winA = 0, winB = 0, draw = 0, dmgToA = 0, dmgToB = 0;
const survivorsA = {}, survivorsB = {};

for (let i = 0; i < N; i++) {
  const { s, ctx } = setup(9000 + i);
  const hpA = s.p1.hp, hpB = s.p2.hp;
  const events = ctx.Engine.doBattle(s);
  if (opts.verbose && i === 0) {
    for (const ev of events) console.log(JSON.stringify(ev));
  }
  const dmgEv = events.find(e => e.type === "heroDmg");
  if (!dmgEv) draw++;
  else if (dmgEv.pid === "p2") { winA++; dmgToB += dmgEv.dmg; }
  else { winB++; dmgToA += dmgEv.dmg; }
  // preživšie: posledný stav strán vyčítame z eventov (die + summon)
  const dead = new Set(events.filter(e => e.type === "die").map(e => e.uid));
  for (const e of events.filter(e => e.type === "summon")) {
    if (!dead.has(e.uid)) (e.pid === "p1" ? survivorsA : survivorsB)[e.defId] =
      ((e.pid === "p1" ? survivorsA : survivorsB)[e.defId] || 0) + 1;
  }
}

const pct = x => (x / N * 100).toFixed(1) + "%";
console.log(`\nScenár: [${specA}]  vs  [${specB}]  (${N} bojov)`);
const mods = ["aura1", "aura2", "boost1", "boost2", "charge1", "charge2"]
  .filter(k => opts[k]).map(k => `${k}=${opts[k]}`).join(" ");
if (mods) console.log(`Modifikátory: ${mods}`);
console.log(`Hráč A vyhral: ${winA} (${pct(winA)}) | priemerný damage hrdinovi B: ${winA ? (dmgToB / winA).toFixed(1) : "-"}`);
console.log(`Hráč B vyhral: ${winB} (${pct(winB)}) | priemerný damage hrdinovi A: ${winB ? (dmgToA / winB).toFixed(1) : "-"}`);
console.log(`Remíza: ${draw} (${pct(draw)})`);
