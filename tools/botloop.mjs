// Hra botov dookola bez okna: spustí Chrome/Edge v headless režime na
// index.html?botloop – dvaja hard boti hrajú hru za hrou a hra je stále
// v zozname „Práve sa hrá“ (na testovanie divákov). Ctrl+C = koniec.
//   npm run botloop                 → GitHub Pages (rovnaká verzia ako hráči)
//   npm run botloop -- local        → http://localhost:5180 (beží node server.mjs)
//   npm run botloop -- <url> [code=1234]
// Divák musí mať rovnakú verziu hry ako stránka s botmi (inak „iná verzia“).

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PAGES = "https://hubko26.github.io/deckbuilding-battlegrounds/";
const LOCAL = "http://localhost:5180/";

const args = process.argv.slice(2);
const code = (args.find(a => a.startsWith("code=")) || "").slice(5);
const target = args.find(a => !a.startsWith("code="));
const base = !target ? PAGES : target === "local" ? LOCAL : target;
const url = `${base}${base.includes("?") ? "&" : "?"}botloop${/^\d{4}$/.test(code) ? `&code=${code}` : ""}`;

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
  `--user-data-dir=${profile}`, "--window-size=1500,850", url,
], { stdio: "ignore" });

console.log(`Boti hrajú: ${url}`);
console.log("Hra je v zozname „Práve sa hrá“ (Robo … vs. Robo …). Ctrl+C = koniec.");

const stop = () => {
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
