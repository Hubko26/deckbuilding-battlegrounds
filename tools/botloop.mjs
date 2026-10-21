// Hra botov dookola bez okna: spustí Chrome/Edge v headless režime na
// index.html?botloop – dvaja hard boti hrajú hru za hrou a hra je stále
// v zozname „Práve sa hrá“ (na testovanie divákov). Ctrl+C = koniec.
//   node tools/botloop.mjs                 → GitHub Pages (rovnaká verzia ako hráči)
//   node tools/botloop.mjs local           → http://localhost:5180 (beží node server.mjs)
//   node tools/botloop.mjs <url> [code=1234] [out=cesta.jsonl]
// Divák musí mať rovnakú verziu hry ako stránka s botmi (inak „iná verzia“).
//
// Výsledky: stránka po každej hre vypíše do konzoly „[arena-result] {json}“;
// tento skript ju číta cez DevTools protokol (lokálny port, len 127.0.0.1)
// a pripíše riadok do data/botloop/results.jsonl (rasy, víťaz, kolo, plochy,
// trinkety + seed a akcie na replay). Súhrn: npm run botstats.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGES = "https://hubko26.github.io/deckbuilding-battlegrounds/";
const LOCAL = "http://localhost:5180/";

const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(k + "=")) || "").slice(k.length + 1);
const code = opt("code");
const target = args.find(a => !a.includes("="));
const base = !target ? PAGES : target === "local" ? LOCAL : target;
const url = `${base}${base.includes("?") ? "&" : "?"}botloop${/^\d{4}$/.test(code) ? `&code=${code}` : ""}`;
const OUT = path.resolve(ROOT, opt("out") || "data/botloop/results.jsonl");

const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const browser = CANDIDATES.find(p => fs.existsSync(p));
if (!browser) {
  console.error("Nenašiel som Chrome ani Edge – nastav cestu v premennej CHROME.");
  process.exit(1);
}

// vlastný profil: nemieša sa s bežným prehliadačom (localStorage, záznamy hier)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arena-botloop-"));
const proc = spawn(browser, [
  "--headless=new", "--mute-audio", "--no-first-run", "--no-default-browser-check",
  // stránka musí bežať plnou rýchlosťou aj „v pozadí“
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  // DevTools len na lokálnom porte (0 = voľný port, zapíše ho do profilu)
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "--window-size=1500,850", url,
], { stdio: "ignore" });

console.log(`Boti hrajú: ${url}`);
console.log("Hra je v zozname „Práve sa hrá“ (Robo … vs. Robo …). Ctrl+C = koniec.");
console.log(`Výsledky: ${path.relative(ROOT, OUT)}`);

// ---------- Výsledky hier ----------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const seen = new Set(); // seed – Runtime.enable môže znova poslať staré hlásenia
try {
  for (const line of fs.readFileSync(OUT, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    try { seen.add(JSON.parse(line).seed); } catch {}
  }
} catch {}
let saved = 0;

function onResult(json) {
  let r;
  try { r = JSON.parse(json); } catch { return; }
  if (!r || seen.has(r.seed)) return;
  seen.add(r.seed);
  fs.appendFileSync(OUT, JSON.stringify(r) + "\n");
  saved++;
  const side = p => `${p.raceName || "?"} (${p.name}, ${p.hp} HP, tier ${p.tier})`;
  const w = r[r.winner];
  const win = w ? `vyhral ${w.name} – ${w.raceName || "?"}` : r.winner === "draw" ? "remíza" : "bez víťaza";
  const t = new Date().toLocaleTimeString("sk-SK");
  console.log(`[${t}] #${seen.size} ${side(r.p1)} vs. ${side(r.p2)} → ${win}, kolo ${r.rounds}`);
}

// DevTools protokol: port z DevToolsActivePort, websocket stránky, konzola.
const sleep = ms => new Promise(res => setTimeout(res, ms));
async function devtoolsPort() {
  const f = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100; i++) {
    try { const port = Number(fs.readFileSync(f, "utf8").split(/\r?\n/)[0]); if (port) return port; } catch {}
    await sleep(200);
  }
  return null;
}
async function watchConsole() {
  const port = await devtoolsPort();
  if (!port) { console.warn("DevTools port sa nenašiel – výsledky sa nezapisujú."); return; }
  for (;;) {
    let page = null;
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find(x => x.type === "page" && x.url.includes("botloop"));
    } catch {}
    if (!page) { await sleep(2000); continue; }
    await new Promise(done => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
      ws.onmessage = e => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.method !== "Runtime.consoleAPICalled") return;
        const a = m.params && m.params.args;
        if (a && a[0] && a[0].value === "[arena-result]" && a[1]) {
          try { onResult(a[1].value); } catch (err) { console.warn("Zápis výsledku zlyhal:", err.message); }
        }
      };
      ws.onclose = done;
      ws.onerror = () => { try { ws.close(); } catch {} done(); };
    });
    if (proc.exitCode !== null) return;
    await sleep(2000); // stránka sa znovu načítala / spojenie padlo – znova
  }
}
watchConsole();

const stop = () => {
  console.log(`Koniec – zapísaných hier v tomto behu: ${saved}.`);
  try { proc.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 800);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
proc.on("exit", c => {
  console.log(`Prehliadač skončil (kód ${c}).`);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(c || 0);
});
