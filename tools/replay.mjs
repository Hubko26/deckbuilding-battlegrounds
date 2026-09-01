// Replay zaznamenanej hry: hra loguje seed + sekvenciu akcií (GameLog
// v src/game.js, localStorage "arena.games"). Hráč záznam stiahne v konzole
// cez arenaLogSave() -> arena-games.json a tento nástroj hru presne prehrá
// (engine je deterministický) a vypíše všetky výpočty.
//
// Použitie:
//   node tools/replay.mjs arena-games.json            # zoznam hier v súbore
//   node tools/replay.mjs arena-games.json last       # prehraj poslednú hru
//   node tools/replay.mjs arena-games.json <id>       # prehraj hru podľa id
//   ... [round=5]      vypíš detailné battle eventy len pre dané kolo
//   ... [verbose=1]    vypíš battle eventy všetkých kôl
//
// POZOR: replay musí bežať na rovnakej verzii engine/cards ako hra, v ktorej
// záznam vznikol (inak sa výpočty rozídu) – porovnaj dátum hry s git logom.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function toVar(src) {
  return src.replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
}

function loadCtx() {
  const ctx = { console, Math, JSON, Object, Array, module: undefined };
  vm.createContext(ctx);
  for (const f of ["src/cards.js", "src/engine.js", "src/bot.js"]) {
    vm.runInContext(toVar(fs.readFileSync(path.join(ROOT, f), "utf8")), ctx, { filename: f });
  }
  return ctx;
}

const [file, pick, ...rest] = process.argv.slice(2);
if (!file) {
  console.log("Použitie: node tools/replay.mjs arena-games.json [last|<id>] [round=N] [verbose=1]");
  process.exit(0);
}
const games = JSON.parse(fs.readFileSync(file, "utf8"));
if (!pick) {
  for (const g of games) {
    console.log(`id=${g.id}  ${g.date}  mode=${g.mode}${g.difficulty ? " (" + g.difficulty + ")" : ""}  seed=${g.seed}  akcií=${g.actions.length}`);
  }
  process.exit(0);
}
const game = pick === "last" ? games[games.length - 1] : games.find(g => String(g.id) === pick);
if (!game) { console.error("Hra nenájdená: " + pick); process.exit(1); }

const opts = {};
for (const a of rest) { const i = a.indexOf("="); if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1); }
const onlyRound = opts.round ? Number(opts.round) : null;
const verbose = !!opts.verbose;

const ctx = loadCtx();
const E = ctx.Engine, B = ctx.Bot, C = ctx.Cards;
// mut:false v zázname = hra bez mutácie; staré záznamy flag nemajú (= mutácia zo seedu)
const s = E.newGame(E.seededRng(game.seed), game.mut === false ? null : undefined);
E.startRound(s);

const boardStr = p => p.board.map(x =>
  `${x.defId}:${x.rank}(${x.atk}/${x.hp}${x.taunt ? "T" : ""})`).join(" ") || "-";

console.log(`Replay hry ${game.id} (${game.date}), seed=${game.seed}, mode=${game.mode}\n`);

for (const action of game.actions) {
  const [actor, name, ...args] = action;
  const round = s.round;
  let events = null;
  if (name === "botTurn") {
    events = B.botTurn(s, actor, args[0] || "normal");
  } else if (name === "doBattle") {
    console.log(`\n=== KOLO ${round} – BOJ ===`);
    console.log(`p1 board: ${boardStr(s.p1)}`);
    console.log(`p2 board: ${boardStr(s.p2)}`);
    console.log(`chargy p1: dmg+${s.p1.dmgCharge} summon+${s.p1.summonCharge} silence ${s.p1.silences} | p2: dmg+${s.p2.dmgCharge} summon+${s.p2.summonCharge} silence ${s.p2.silences}`);
    events = E.doBattle(s);
    if (verbose || onlyRound === round) {
      for (const ev of events) console.log("  " + JSON.stringify(ev));
    } else {
      const dmg = events.find(e => e.type === "heroDmg");
      console.log(dmg ? `výsledok: ${dmg.pid} dostal ${dmg.dmg} (HP ${dmg.hp})` : "výsledok: remíza");
    }
    console.log(`HP po boji: p1 ${s.p1.hp} | p2 ${s.p2.hp}`);
    continue;
  } else {
    events = E[name](s, actor, ...args);
  }
  if (onlyRound === null || onlyRound === round) {
    const extra = args.length ? " " + JSON.stringify(args) : "";
    console.log(`kolo ${round}: ${actor} ${name}${extra}` +
      (events === null ? "  !! NELEGÁLNE (replay sa rozišiel s hrou?)" : ""));
  }
}

console.log(`\nKoniec záznamu: fáza=${s.phase}, kolo=${s.round}, HP p1=${s.p1.hp}, p2=${s.p2.hp}` +
  (s.winner ? `, víťaz=${s.winner}` : ""));
