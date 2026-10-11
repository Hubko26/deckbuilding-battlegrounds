// Načíta herné skripty (bez UI) do vm kontextu, aby sa dala testovať logika
// v Node bez prehliadača. Deterministická náhoda cez seeded().
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// `const X` na najvyššej úrovni nie je viditeľné cez ctx.X – prepíšeme na `var`.
function toVar(src) {
  return src.replace(/^(?:const|let) (\w+)(?= *[=,;])/gm, "var $1");
}

// opts.deckMin: true = minimálny počet kariet podľa tieru platí ako v hre.
// Default VYPNUTÝ – staršie testy skladajú umelé mini balíčky (3–5 kariet)
// na testovanie iných mechaník (evolve, predaj, pohladkania…).
export function loadEngine(opts = {}) {
  const ctx = { console, Math, JSON, Object, Array, module: undefined };
  vm.createContext(ctx);
  for (const f of ["src/i18n.js", "src/cards.js", "src/engine.js", "src/bot.js"]) {
    vm.runInContext(toVar(fs.readFileSync(path.join(ROOT, f), "utf8")), ctx, { filename: f });
  }
  if (!opts.deckMin) {
    const newGame = ctx.Engine.newGame;
    ctx.Engine.newGame = (...args) => Object.assign(newGame(...args), { noDeckMin: true });
  }
  return ctx;
}

// Deterministický generátor pseudonáhodných čísel (mulberry32).
export function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
