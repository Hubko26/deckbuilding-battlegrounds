// Spoločný základ simulácií (ideal-sim, pve-sim): načíta i18n, karty (aj
// experimentálny Hmyz), engine a bota do vm kontextu s injekciami, ktoré
// zdroje v repe nemenia:
//   engine.rollCard   – state.raceLock[poolKey] obmedzí losovanie na rasu
//   engine.setupStart – štartovací balíček len z rasy hráča
//   engine.newGame    – opts.raceLock sa nastaví pred setupStart
//   bot.cardScore     – cudzia rasa −100 (p.forceRace), ogr povolený ogrovi
//   bot.dominantRace  – p.forceRace je dominantná rasa od 1. kola
// cfg: { variant, tierCost, tierMin, tierDrop, pve }
//   pve = každé kolo je DMG Meter (boj so Strážcom arény), bez odmeny za
//         výhru – meria čistý damage output plochy (tools/pve-sim.mjs)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function toVar(src) {
  return src.replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
}

export function seeded(seed) {
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
export function patch(src, from, to, expect = 1) {
  const n = src.split(from).length - 1;
  if (n !== expect) throw new Error(`inject: vzor nájdený ${n}×, čakal som ${expect}: ${from.slice(0, 60)}…`);
  return src.split(from).join(to);
}

export function loadCtx(cfg = {}) {
  const ctx = { console, Math, JSON, Object, Array, module: undefined };
  vm.createContext(ctx);
  // CRLF → LF, aby viacriadkové vzory sedeli bez ohľadu na konce riadkov.
  const read = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
  vm.runInContext(toVar(read("src/i18n.js")), ctx, { filename: "src/i18n.js" });
  vm.runInContext(toVar(read("src/cards.js")), ctx, { filename: "src/cards.js" });
  ctx.EXP_VARIANT = cfg.variant || ""; // varianty experimentálnej rasy (cards-<rasa>.js)
  // Experimentálne rasy sa načítajú vždy (ako v hre); do hry idú len s exp=….
  vm.runInContext(toVar(read("src/cards-insect.js")), ctx, { filename: "src/cards-insect.js" });

  let eng = read("src/engine.js");
  eng = patch(eng,
    `const defs = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && !d.gen && !isBanned(state, d) && (!filter || filter(d)));`,
    `const defs0 = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && !d.gen && !isBanned(state, d) && (!filter || filter(d)));
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
  if (cfg.tierMin != null) eng = patch(eng, `const TIER_MIN_COST = 2;`, `const TIER_MIN_COST = ${cfg.tierMin};`);
  if (cfg.tierDrop != null) {
    eng = patch(eng, `base - (state.round - p.reachedRound) - discount`,
      `base - Math.floor((state.round - p.reachedRound) * ${cfg.tierDrop}) - discount`);
  }
  if (cfg.pve) {
    eng = patch(eng, `if (isBossRound(state)) return doBossBattle(state);`,
      `if (isBossRound(state) || state.pve) return doBossBattle(state);`);
    eng = patch(eng, `  function bossReward(state, p, events) {
    const br = state.bossResult;`, `  function bossReward(state, p, events) {
    if (state.pve) return;
    const br = state.bossResult;`);
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
    if (p.forceRace && def.race && def.race !== p.forceRace && !(p.targeted && def.race === "dragon")) score -= 100;`);
  bot = patch(bot, `def.race === "ogre"`, `(def.race === "ogre" && p.forceRace !== "ogre")`, 2);
  vm.runInContext(toVar(bot), ctx, { filename: "src/bot.js" });
  return ctx;
}
