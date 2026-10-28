// UI hry: vykresľovanie, drag & drop, prehrávanie eventov z enginu s animáciami.
// Herná logika je celá v engine.js; tu sa len volá a kreslí.
//
// Ovládanie je čisto drag & drop:
//   obchod → ruka/plocha  = kúpa (karta ide do balíčka)
//   ruka → plocha         = vyloženie príšerky / zoslanie kúzla
//   kúzlo s cieľom        = drop priamo na vlastnú príšerku
//   ruka/plocha → obchod  = predaj (+1 peniaz)

// ---------- Preklady ----------
// Všetky texty sú v src/i18n.js (globálne `L` a `t`). Zástupné {x} dopĺňa fmt().

let MY = "p1", OPP = "p2"; // v sieťovej hre môže byť lokálny hráč p2
const $ = id => document.getElementById(id);

let state = null;
let mode = "bot";         // "bot" | "net"
let difficulty = localStorage.getItem("arena.diff") || "normal";
let busy = false;         // beží animácia / ťah bota
let drag = null;          // aktívne ťahanie karty
let spectating = false;   // divák sieťovej hry (mode "net", nič nehrá – len pozerá a píše)
let botLoop = false;      // ?botloop: hard boti hrajú dookola, hra sa dá sledovať (testovanie)
const watchOnly = () => spectating || botLoop; // nikto lokálne nehrá – len pozerá
let names = {};           // { p1, p2 } mená hráčov v sieťovej hre

// ---------- Záznam hry (replay log) ----------
// Engine je deterministický: seed + sekvencia akcií = presný replay celej hry
// (tools/replay.mjs). Ukladá sa posledných 10 hier do localStorage.
// Pri hlásení chyby: otvor konzolu, zavolaj arenaLogSave() a pošli súbor.
const GameLog = (() => {
  const KEY = "arena.games";
  let cur = null;
  // actions (voliteľné): log prevzatý pri návrate do hry (rejoin) – záznam
  // pokračuje od miesta, kde preživší hráč skončil.
  // memOnly: záznam len v pamäti (hry botov v ?botloop nezahltia posledných 10 hier)
  function start(seed, meta, actions, memOnly) {
    cur = { id: Date.now(), date: new Date().toISOString(), seed, ...meta, actions: (actions || []).slice() };
    if (memOnly) Object.defineProperty(cur, "memOnly", { value: true }); // nejde do JSON
    persist();
  }
  function current() { return cur; }
  // Divák nič nezapisuje (jeho hra nie je jeho záznam).
  function stop() { cur = null; }
  function push(actor, name, args) {
    if (!cur) return;
    const entry = [actor, name, ...(args || [])];
    cur.actions.push(entry);
    persist();
    // hostiteľ sieťovej hry: rovnaké poradie akcií dostanú aj diváci
    if (!spectating) Net.feedSpectators(entry); // bez divákov nič nerobí
  }
  function persist() {
    if (!cur || cur.memOnly) return;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || "[]").filter(g => g.id !== cur.id);
      all.push(cur);
      while (all.length > 10) all.shift();
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* plné/vypnuté úložisko – hra beží ďalej bez záznamu */ }
  }
  function dump() { try { return localStorage.getItem(KEY) || "[]"; } catch { return "[]"; } }
  return { start, push, dump, current, stop };
})();
window.arenaLog = () => GameLog.dump();

// ---------- Návrat do hry (rejoin) ----------
// Po pripojení do sieťovej hry sa uloží kód miestnosti (localStorage), takže
// po páde stránky / telefónu stačí na úvodnej obrazovke stlačiť „Vrátiť sa
// do hry" – kód sa nezadáva znova. Preživší hráč pošle celý log a hra sa
// prehrá do aktuálneho stavu (engine je deterministický). Platí 30 minút.
const REJOIN_KEY = "arena.rejoin";
function saveRejoin() {
  const i = Net.info();
  try { localStorage.setItem(REJOIN_KEY, JSON.stringify({ transport: i.transport, code: i.code, at: Date.now() })); } catch {}
  renderRejoinBtn();
}
function clearRejoin() {
  try { localStorage.removeItem(REJOIN_KEY); } catch {}
  renderRejoinBtn();
}
function loadRejoin() {
  try {
    const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || "null");
    if (r && r.at && Date.now() - r.at < 30 * 60000) return r;
  } catch {}
  return null;
}
function renderRejoinBtn() {
  const r = loadRejoin();
  const b = $("rejoinBtn");
  b.classList.toggle("hidden", !r);
  if (r) b.textContent = `${t(L.rejoinBtn)}${r.code ? " " + r.code : ""}`;
  // kód sa predvyplní aj do „Pripojiť sa" – netreba ho písať znova
  if (r && r.code && !$("peerCodeInput").value) $("peerCodeInput").value = r.code;
}

// Hru prehrá z logu (rovnako ako tools/replay.mjs) – vráti stav po poslednej akcii.
// raceCap: počet rás v hre zo záznamu (staré záznamy ho nemajú = všetky rasy).
// exp: zapnuté experimentálne rasy zo záznamu (["insect"]), staré = žiadne.
function rebuildFromLog(seed, mut, ban, trinkets, actions, raceCap, exp) {
  const s = Engine.newGame(Engine.seededRng(seed), mut === false ? null : undefined, { ban: ban === true, trinkets: trinkets === true, raceCap: raceCap || null, exp: exp || null });
  if (s.phase !== "ban") Engine.startRound(s); // s banom štartuje prvé kolo až pickBan
  for (const [actor, name, ...args] of actions) {
    if (name === "doBattle") { Engine.doBattle(s); continue; }
    if (name === "botTurn") { Bot.botTurn(s, actor, args[0] || "normal"); continue; }
    if (typeof Engine[name] !== "function" || !Engine[name](s, actor, ...args)) {
      throw new Error(`replay: nelegálna akcia ${actor} ${name} v kole ${s.round}`);
    }
  }
  return s;
}

// Vráti sa do rozohranej hry: s kódom cez PeerJS, bez kódu cez lokálny
// server (LAN). Z konzoly: arenaRejoin("1234").
function startRejoin(code) {
  const r = loadRejoin() || {};
  if (code) { r.code = String(code); r.transport = "peer"; }
  mode = "net";
  $("pickScreen").classList.add("hidden");
  $("netOverlay").classList.remove("hidden");
  $("peerSetup").classList.add("hidden");
  $("netUrls").textContent = "";
  $("peerCode").textContent = r.code || "";
  $("netMsg").textContent = t(L.rejoining);
  if (r.transport === "peer" && r.code) Net.rejoinPeer(r.code, netHandlers(), { v: APP_V });
  else Net.connect(netHandlers(), { v: APP_V, rejoin: true });
}
window.arenaRejoin = code => startRejoin(code);

// Mutácie sú VŽDY vypnuté a ban rasy VŽDY zapnutý (checkboxy zrušené
// 15. 10. 2026). Staré záznamy si nesú vlastné mut/ban – replay ich rešpektuje.
function mutsOn() { return false; }
function bansOn() { return true; }
// Hmyz (experimentálna rasa): default VYPNUTÝ, voľba sa pamätá; v hre po
// sieti rozhoduje zakladateľ (flag „insects" ide v "start").
function insectsOn() { return $("insectToggle").checked; }
const expOpt = on => on ? ["insect"] : null;
try { $("insectToggle").checked = localStorage.getItem("arena.insects") === "1"; } catch { $("insectToggle").checked = false; }
$("insectToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.insects", insectsOn() ? "1" : "0"); } catch {}
});
// Trinkety: default ZAPNUTÉ, voľba sa pamätá; v hre po sieti rozhoduje zakladateľ.
function trinketsOn() { return $("trinketToggle").checked; }
try { $("trinketToggle").checked = localStorage.getItem("arena.trinkets") !== "0"; } catch { $("trinketToggle").checked = true; }
$("trinketToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.trinkets", trinketsOn() ? "1" : "0"); } catch {}
});

// Verzia klienta = ?v= hashe skriptov z index.html. Keď sa hráčom líšia
// (zastaraná keš), determinizmus je stratený a hra by sa ticho rozišla.
const APP_V = [...document.querySelectorAll('script[src^="src/"]')]
  .map(el => (el.src.split("?v=")[1] || "")).join(".");

// ---------- Verzia na úvodnej obrazovke ----------
// APP_BUILD (version.js, čas commitu z pre-commit hooku) vs. posledný commit
// na GitHube: commit výrazne neskôr než build = hráč má starú (keš) verziu.
const REPO_API = "https://api.github.com/repos/Hubko26/deckbuilding-battlegrounds/commits/main";
let latestCommit; // undefined = načítava sa, null = nedostupné
const fmtDate = iso => new Date(iso).toLocaleString(I18N.lang === "en" ? "en-GB" : I18N.lang, { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
function renderVersion() {
  const box = $("versionBox");
  if (!box) return;
  const build = typeof APP_BUILD === "string" ? APP_BUILD : null;
  let html = `${t(L.versionBuild)} ${build ? fmtDate(build) : "?"}`;
  if (latestCommit) {
    const msg = latestCommit.msg.replace(/[<>&]/g, "");
    const fresh = build && new Date(latestCommit.date) - new Date(build) <= 2 * 60 * 1000;
    html += `<br>${t(L.versionLatest)} ${msg} (${fmtDate(latestCommit.date)})`;
    if (build) html += `<br><span class="${fresh ? "ok" : "old"}">${t(fresh ? L.versionOk : L.versionOld)}</span>`;
  } else if (latestCommit === null) {
    html += `<br>${t(L.versionOffline)}`;
  }
  box.innerHTML = html;
}
fetch(REPO_API, { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(j => { latestCommit = { msg: j.commit.message.split("\n")[0], date: j.commit.committer.date }; })
  .catch(() => { latestCommit = null; })
  .finally(renderVersion);

// Tvrdá chyba siete (desync / rozdielne verzie): oznám a ukonči hru,
// tiché pokračovanie by len prehlbovalo rozídený stav.
let fatalShown = false;
function showFatal(text, detail) {
  console.error("[arena] FATAL:", text, detail || "");
  if (fatalShown) return;
  fatalShown = true;
  Net.disconnect();
  if (!spectating) clearRejoin();
  $("overOverlay").classList.remove("hidden");
  $("overTitle").textContent = "⚠️";
  $("overMsg").textContent = text;
}
window.arenaLogSave = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([GameLog.dump()], { type: "application/json" }));
  a.download = "arena-games.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

// Lokálna akcia: vykoná sa v engine a v sieťovej hre sa pošle súperovi,
// ktorý ju aplikuje na svojej (identickej, rovnako seedovanej) kópii stavu.
// Čitateľný popis hráčovej akcie PRED vykonaním (stav ešte nezmenený) –
// Claude z toho v ďalšom ťahu komentuje hráčove rozhodnutia. Len verejné
// info: nákupy a predaje súper legálne vidí, board vidí v boji.
function actionDesc(name, args) {
  const p = state[MY];
  try {
    switch (name) {
      case "buyCommon": return `bought ${state.commons[args[0]]}`;
      case "buyPrivate": return `bought ${p.priv[args[0]].defId}`;
      case "buySpell": return `bought spell ${p.spellShop.defId}`;
      case "playMinion": return `played ${p.hand[args[0]].defId}`;
      case "castSpell": return `cast ${p.hand[args[0]].defId}`;
      case "sellCard": return `sold ${p[args[0]][args[1]].defId} (zone ${args[0]})`;
      case "discardCard": return `discarded ${p[args[0]][args[1]].defId}`;
      case "refreshShop": return "refreshed the shop";
      case "upgradeTier": return `upgraded to tier ${p.tier + 1}`;
      default: return null;
    }
  } catch { return null; }
}

// Akcie hráča v tomto kole – po boji sa stanú "minulým kolom" pre Clauda.
let playerRoundActions = [];
let lastPlayerRound = [];

function doAction(name, ...args) {
  if (watchOnly()) return null; // divák nehrá
  const desc = actionDesc(name, args);
  const round = state.round; // kolo PRED akciou – súper ju aplikuje v rovnakom
  const ev = Engine[name](state, MY, ...args);
  if (ev) GameLog.push(MY, name, args);
  if (ev && mode === "net") {
    Net.sendAction(name, args, round);
    console.info("[arena] →", name, "r" + round);
  }
  if (ev && desc && playerRoundActions.length < 40) playerRoundActions.push(desc);
  // Trash-talk bota na hráčove rozhodnutia (len proti botovi).
  if (ev && name === "sellCard") botTaunt("sell", 0.5);
  if (ev && name === "refreshShop") botTaunt("refresh", 0.5);
  return ev;
}

// Rýchlosť animácií. Pri prefers-reduced-motion sa všetky pauzy skrátia a
// partikle / otrasy obrazu sa vypnú (citlivosť na pohyb, slabé mobily).
const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
// ANIM_BASE: všetky animácie trochu svižnejšie (16. 10. 2026: boj bol pomalý).
// animSpeed: násobok rýchlosti z ladiaceho posuvníka (len „Hubko", localStorage).
const ANIM_BASE = 0.75;
let animSpeed = 1;
try { animSpeed = Number(localStorage.getItem("arena.animSpeed")) || 1; } catch {}
let ANIM = 1;
const setAnimSpeed = v => { animSpeed = v; ANIM = (REDUCED ? 0.5 : 1) * ANIM_BASE / animSpeed; };
setAnimSpeed(animSpeed);
const sleep = ms => new Promise(r => setTimeout(r, ms * ANIM));
// Zrýchlená animácia kariet s def.fastAnim (Včielky – reťaz celého roja).
const FAST_ANIM = 0.3;
const fastAnim = el => !!(el && Cards.byId[el.dataset.defid] && Cards.byId[el.dataset.defid].fastAnim);

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("diffTitle").textContent = "🛡️ " + t(L.diffTitle);
  $("startBtn").textContent = `⚔ ${t(L.play)} ⚔`;
  $("netBtn").textContent = t(L.netBtn);
  $("netCancel").textContent = t(L.cancel);
  renderRejoinBtn();
  $("peerHostBtn").textContent = t(L.peerHost);
  $("playerNameLabel").textContent = "✍️ " + t(L.claudeNameLabel).replace(/:\s*$/, "");
  $("playerName").placeholder = t(L.claudeNamePh);
  $("speedLbl").textContent = t(L.speedLbl);
  renderSpeedRow();
  for (const k of ["insectToggle", "trinketToggle"]) {
    $(k + "Lbl").innerHTML = `<strong>${t(L[k].name)}</strong><small>${t(L[k].desc)}</small>`;
  }
  for (const k of ["homeKicker", "homeHead", "homeSub", "nameHint", "diffHint", "modsTitle", "modsHint", "homeFine", "homeRibbon"]) {
    $(k).textContent = t(L[k]);
  }
  renderVersion();
  $("peerJoinBtn").textContent = t(L.peerJoin);
  $("newGameBtn").textContent = t(L.newGame);
  $("discoverTitle").textContent = t(L.discoverTitle);
  $("overAgain").textContent = t(L.again);
  $("deckBtn").textContent = t(L.deckView);
  $("chatBtn").title = t(L.chatBtn);
  $("specSwapBtn").title = t(L.specSwap);
  $("deckDdBtn").textContent = t(L.deckView);
  $("deckTitle").textContent = t(L.deckView);
  $("deckHint").textContent = t(L.deckHint);
  $("deckClose").textContent = t(L.close);
  $("footNote").textContent = t(L.footNote);
}

// ---------- Pravidlá na úvodnej obrazovke ----------
function renderRules() {
  $("rulesBox").innerHTML =
    `<h3>${t(L.rulesTitle)}</h3><ul>` +
    L.rules.map(r => `<li>${t(r)}</li>`).join("") +
    `</ul>`;
}

// ---------- Výber obtiažnosti ----------
function renderPick() {
  const dbox = $("diffPick");
  dbox.innerHTML = "";
  for (const d of ["easy", "normal", "hard", "claude"]) {
    const b = document.createElement("button");
    // „🙂 Ľahký“ → veľká ikonka nad menom
    const [ic, ...rest] = t(L.diffs[d]).split(" ");
    b.innerHTML = `<span class="d-ic">${ic}</span><span>${rest.join(" ")}</span>`;
    b.className = difficulty === d ? "active" : "";
    b.setAttribute("aria-pressed", String(difficulty === d));
    b.addEventListener("click", () => { difficulty = d; localStorage.setItem("arena.diff", d); renderPick(); });
    dbox.appendChild(b);
  }
  // Claude súper: API kľúč (BYO key – len localStorage) + profil hráča.
  const cs = $("claudeSetup");
  cs.classList.toggle("hidden", difficulty !== "claude");
  if (difficulty === "claude" && !cs.dataset.ready) {
    cs.dataset.ready = "1";
    $("claudeKey").value = localStorage.getItem("arena.apiKey") || "";
    $("claudeKey").addEventListener("input", e => localStorage.setItem("arena.apiKey", e.target.value.trim()));
  }
  if (difficulty === "claude") {
    $("claudeKeyLabel").textContent = t(L.claudeKeyLabel);
    $("claudeKeyNote").textContent = t(L.claudeKeyNote);
  }
}

// ---------- Ukážky kariet na úvodnej obrazovke ----------
// Náhodné zlaté príšery z rôznych rás (len dekorácia, náhoda mimo engine).
function renderHomeArt() {
  // len bežné príšery so zlatým artom (bez tokenov a experimentálneho Hmyzu)
  const exp = Cards.EXP_RACES || new Set();
  const defs = Cards.DEFS.filter(d => d.race && Cards.RACES[d.race] && !exp.has(d.race) && !d.spell && !d.token && !d.noEvolve && Cards.artOf(d, 3));
  const byRace = {};
  for (const d of defs) (byRace[d.race] ||= []).push(d);
  const races = Object.keys(byRace).sort(() => Math.random() - 0.5).slice(0, 3);
  const pick = races.map(r => byRace[r][Math.floor(Math.random() * byRace[r].length)]);
  const card = d => {
    const el = document.createElement("div");
    el.className = "art-card";
    el.innerHTML = `<div class="art-pic"></div><div class="art-name"></div><div class="art-race"></div>`;
    el.querySelector(".art-pic").style.backgroundImage = `url("${Cards.artOf(d, 3)}")`;
    el.querySelector(".art-name").textContent = Cards.nameOf(d, 3, I18N.lang);
    el.querySelector(".art-race").textContent = `${Cards.RACE_ICON[d.race] || ""} ${Cards.RACES_NOM[d.race][I18N.lang] ?? Cards.RACES_NOM[d.race].sk}`;
    return el;
  };
  $("homeArtL").replaceChildren(...pick.slice(0, 2).map(card));
  $("homeArtR").replaceChildren(...pick.slice(2).map(card));
}

// Meno hráča je povinné pred každou hrou (bot aj sieť) – pamätá sa.
function needName() {
  if (playerName()) return false;
  alert(t(L.nameNeeded));
  $("playerName").focus();
  return true;
}
const playerName = () => (localStorage.getItem("arena.playerName") || "").trim();
// Ladiaci posuvník rýchlosti animácií vidí len „Hubko".
const isTuner = () => playerName().toLowerCase() === "hubko";
function renderSpeedRow() {
  $("speedRow").classList.toggle("hidden", !isTuner());
  $("speedRange").value = String(animSpeed);
  $("speedVal").textContent = `${animSpeed}×`;
  renderDevPanel();
}

// Ladiaci panel (len „Hubko"): filter rasy + hľadanie, zoznam kariet,
// stupeň a „Daj do ruky" (Engine.devGive – logovaná akcia ako každá iná).
function renderDevPanel() {
  $("devPanel").classList.toggle("hidden", !isTuner());
  if (!isTuner()) return;
  $("devTitle").textContent = t(L.devTitle);
  $("devSearch").placeholder = t(L.devSearch);
  $("devGiveBtn").textContent = t(L.devGive);
  const f = $("devFilter"), cur = f.value || "all";
  const opts = [["all", t(L.devAll)],
    ...Object.keys(Cards.RACES).map(r => [r, `${Cards.RACE_ICON[r] || ""} ${Cards.RACES_NOM[r][I18N.lang]}`]),
    ["spell", t(L.devSpells)], ["other", t(L.devOther)]];
  f.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  f.value = cur;
  renderDevCards();
}
function renderDevCards() {
  const filter = $("devFilter").value || "all";
  const q = $("devSearch").value.trim().toLowerCase();
  const sel = $("devCard"), cur = sel.value;
  const defs = Object.values(Cards.byId).filter(d => !d.boss
    && (filter === "all" || (filter === "spell" ? d.spell : filter === "other" ? !d.spell && !d.race : d.race === filter && !d.spell)))
    .map(d => ({ d, name: Cards.nameOf(d, 1, I18N.lang) }))
    .filter(x => !q || x.name.toLowerCase().includes(q) || x.d.id.toLowerCase().includes(q))
    .sort((a, b) => (a.d.tier || 0) - (b.d.tier || 0) || a.name.localeCompare(b.name));
  sel.innerHTML = defs.map(({ d, name }) =>
    `<option value="${d.id}">⭐${d.tier ?? "–"} ${d.emoji || ""} ${name} (${d.id})</option>`).join("");
  if (defs.some(x => x.d.id === cur)) sel.value = cur;
  else if (defs.length) sel.selectedIndex = 0;
}
function devGiveCard() {
  const defId = $("devCard").value;
  if (!defId || !state) return;
  const ev = doAction("devGive", defId, Number($("devRank").value));
  if (!ev) log(t(L.devGiveFail));
  act(ev);
}
$("devFilter").addEventListener("change", renderDevCards);
$("devSearch").addEventListener("input", renderDevCards);
$("devGiveBtn").addEventListener("click", devGiveCard);
$("devCard").addEventListener("dblclick", devGiveCard);
$("playerName").value = playerName();
$("playerName").addEventListener("input", e => { localStorage.setItem("arena.playerName", e.target.value); renderSpeedRow(); });
$("speedRange").addEventListener("input", e => {
  if (!isTuner()) return;
  setAnimSpeed(Number(e.target.value));
  try { localStorage.setItem("arena.animSpeed", String(animSpeed)); } catch {}
  renderSpeedRow();
});

function startGame() {
  if (needName()) return;
  if (difficulty === "claude" && !(localStorage.getItem("arena.apiKey") || "").trim()) {
    alert(t(L.claudeNeedKey));
    $("claudeKey").focus();
    return;
  }
  if (difficulty === "claude" && !ClaudeBot.isAllowed(localStorage.getItem("arena.playerName"))) {
    alert(t(L.claudeNameGate));
    $("playerName").focus();
    return;
  }
  mode = "bot";
  MY = "p1"; OPP = "p2";
  lastBattleNote = null;
  chatHistory = [];
  playerRoundActions = [];
  lastPlayerRound = [];
  // Chat okno + uvítanie („zase meškáš“) len v Claude móde.
  chatClear();
  setChat(difficulty === "claude", t(L.chatPh));
  if (difficulty === "claude") {
    const nm = (localStorage.getItem("arena.playerName") || "").trim();
    // Jazyk pozdravu per hráč (Adam vždy po slovensky), inak podľa UI.
    const gl = ClaudeBot.langFor(nm, I18N.lang);
    if (!botMuted) setTimeout(() => say("bot", CLAUDE_LABEL, (L.claudeGreeting[gl] || L.claudeGreeting.sk).replace("{n}", nm), 6000), 900);
  }
  // Seedovaný rng aj proti botovi – hra je plne deterministická a dá sa
  // replaynúť zo záznamu (GameLog + tools/replay.mjs).
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Hard/Claude bot štartuje so 70 HP (Bot.hpBonus) – replay to odvodí z difficulty v logu.
  const exp = expOpt(insectsOn());
  state = Engine.newGame(Engine.seededRng(seed), mutsOn() ? undefined : null, { ban: bansOn(), trinkets: trinketsOn(), hpBonus: Bot.hpBonus(difficulty), raceCap: Engine.RACE_CAP, exp });
  GameLog.start(seed, { mode: "bot", difficulty, mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn(), raceCap: Engine.RACE_CAP, exp });
  enterGameScreen();
  if (state.phase !== "ban") act(Engine.startRound(state));
  driveFlow();
}

function enterGameScreen() {
  $("pickScreen").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  // body.playing: na mobile sa hlavička zbalí do ☰ menu, doska berie celú výšku.
  document.body.classList.add("playing");
  document.querySelector("header").classList.remove("open");
  $("newGameBtn").classList.remove("hidden");
  $("overOverlay").classList.add("hidden");
  $("deckOverlay").classList.add("hidden");
  Lobby.watch(null); // zoznam hier treba len na úvodnej obrazovke
  logClear();
  renderMutator();
  renderBanBox();
  if (state.races && state.phase !== "ban") log(racesMsg());
}

// Rasy vylosované do tejto hry (Engine.RACE_CAP) – log na štarte / po bane.
function racesMsg() {
  return `🎲 ${t(L.racesInPlay)} ${state.races.map(r => `${Cards.RACE_ICON[r]} ${Cards.RACES_NOM[r][I18N.lang]}`).join(", ")}`;
}

// „Bez rasy" – preškrtnutá ikonka rasy v hlavičke obchodu vedľa ↩️; ťuk = pripomenutie v logu.
function renderBanBox() {
  const box = $("banBox");
  const r = state && state.banned;
  if (!r) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const name = Cards.RACES_NOM[r][I18N.lang];
  box.textContent = Cards.RACE_ICON[r];
  box.title = `${t(L.banBoxTitle)}: ${name}`;
  box.onclick = () => {
    log(banResultMsg({ race: r, by: state.ban && state.ban.by }));
    if (state.races) log(racesMsg());
  };
}

function banResultMsg(ev) {
  const by = !ev.by ? "" : watchOnly() ? ` (${names[ev.by] || ev.by})` : ` (${t(ev.by === MY ? L.banByMe : L.banByOpp)})`;
  return `🚫 ${t(L.banResult)} ${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]}${by}`;
}

// Fáza BAN: overlay s trojicou rás pre mňa; po výbere čakáme na súpera.
function renderBan() {
  const ov = $("banOverlay");
  if (!state || state.phase !== "ban" || watchOnly()) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  const b = state.ban, mine = b.picks[MY];
  $("banTitle").textContent = t(L.banTitle);
  $("banMsg").textContent = mine ? t(L.banWait) : t(L.banIntro);
  const row = $("banRow");
  row.innerHTML = "";
  for (const r of b.offers[MY]) {
    const btn = document.createElement("button");
    btn.className = "ban-btn" + (mine === r ? " active" : "");
    btn.disabled = !!mine;
    btn.innerHTML = `<span class="ic">${Cards.RACE_ICON[r]}</span><span class="nm">${Cards.RACES_NOM[r][I18N.lang]}</span>`;
    btn.addEventListener("click", async () => {
      if (busy || state.phase !== "ban" || b.picks[MY]) return;
      act(doAction("pickBan", r));
      await driveFlow();
    });
    row.appendChild(btn);
  }
}

// „Pravidlo dnešnej arény" – ikonka vľavo medzi súperovým balíčkom a kôpkou.
// Ťuk = pripomenutie pravidla v logu (mobil nemá hover na title).
function renderMutator() {
  const box = $("mutatorBox");
  const m = state && state.mutator && L.mutators[state.mutator];
  if (!m) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = `<div class="ic">${m.e}</div><div class="lb">${t(m)}</div>`;
  box.title = `${t(L.mutTitle)}: ${t(m)} – ${t(m.d)}`;
  box.onclick = () => log(`${m.e} ${t(m)}: ${t(m.d)}`);
  log(`${m.e} ${t(L.mutTitle)}: ${t(m)} – ${t(m.d)}`);
}

// ---------- Ping autorovi: začala sieťová hra ----------
// Push notifikácia cez ntfy.sh (bez servera a účtu): autor má v appke ntfy
// odoberanú tému NTFY_TOPIC a pri štarte každej sieťovej hry dostane
// „meno vs. meno“. Téma je verejná (kto ju pozná, vidí mená hráčov), preto
// ide len meno + odkaz na hru. Nie z localhostu (testovanie) a nie, keď
// hrá autor sám (Hubko). Text je pre autora, nie UI hry – preto nie v i18n.
const NTFY_TOPIC = "zvieracia-arena-es3ivkjhid";
const GAME_URL = "https://hubko26.github.io/deckbuilding-battlegrounds/";
function pingGameStart() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const nm = [names.p1 || "?", names.p2 || "?"];
  if (local || nm.some(n => n.toLowerCase() === "hubko")) return;
  // text/plain JSON = jednoduchý request bez CORS preflightu
  fetch("https://ntfy.sh/", {
    method: "POST",
    body: JSON.stringify({ topic: NTFY_TOPIC, title: "🎮 Zvieracia aréna", message: `${nm[0]} vs. ${nm[1]}`, tags: ["video_game"], click: GAME_URL }),
  }).catch(() => { /* bez notifikácie hra beží ďalej */ });
}

// ---------- Hra po sieti ----------
// Najprv skúsi lokálny WS server (LAN, automatické párovanie). Keď nebeží
// (napr. GitHub Pages), prepne na PeerJS s kódom miestnosti.
function netHandlers() {
  return {
    onWaiting: msg => {
      if (msg.code) {
        $("netMsg").textContent = t(L.peerShare);
        $("peerCode").textContent = msg.code;
      } else {
        $("netMsg").textContent = t(L.netWaiting);
        $("netUrls").textContent = (msg.urls || []).join("  ·  ");
      }
    },
    onStart: msg => {
      fatalShown = false;
      MY = msg.you;
      OPP = msg.you === "p1" ? "p2" : "p1";
      names = Net.info().names;
      const exp = expOpt(msg.insects === true);
      state = Engine.newGame(Engine.seededRng(msg.seed), msg.mut === false ? null : undefined, { ban: msg.ban === true, trinkets: msg.trinkets === true, raceCap: Engine.RACE_CAP, exp });
      GameLog.start(msg.seed, { mode: "net", you: msg.you, mut: msg.mut !== false, ban: msg.ban === true, trinkets: msg.trinkets === true, raceCap: Engine.RACE_CAP, exp });
      enterGameScreen();
      chatClear();
      setChat(true, t(L.chatPhNet));
      $("chatInput").value = "";
      saveRejoin();
      Lobby.update();
      if (msg.you === "p1") pingGameStart(); // ping posiela len zakladateľ (raz za hru)
      if (state.phase !== "ban") act(Engine.startRound(state));
      driveFlow();
      // msg.v = verzia druhej strany (od hostiteľa/servera); rozdiel = istý desync
      if (msg.v !== APP_V) showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`);
    },
    // catch drží frontu živú – jedna chybná akcia nesmie umlčať všetky ďalšie
    onAction: msg => {
      remoteQueue = remoteQueue.then(() => applyRemote(msg))
        .catch(err => showFatal(t(L.netDesync), err));
    },
    onPeerLeft: msg => {
      if (mode !== "net") return;
      // Kamarát je preč, ale môže sa vrátiť: čakáme s otvorenou miestnosťou.
      if (msg && msg.rejoin) {
        document.querySelectorAll(".taunt-bubble").forEach(b => b.remove());
        $("netOverlay").classList.remove("hidden");
        $("peerSetup").classList.add("hidden");
        $("netUrls").textContent = "";
        const withCode = msg.transport === "peer" && msg.code;
        $("netMsg").textContent = t(L.rejoinWait) + (withCode ? " " + t(L.rejoinWaitCode) : "");
        $("peerCode").textContent = withCode ? msg.code : "";
        log(t(L.rejoinWait));
        return;
      }
      $("netOverlay").classList.add("hidden");
      clearRejoin();
      if (state && state.phase !== "over") {
        Net.disconnect();
        document.querySelectorAll(".taunt-bubble").forEach(b => b.remove());
        $("overOverlay").classList.remove("hidden");
        $("overTitle").textContent = t(msg && (msg.away || msg.expired) ? L.netAwayLeft : L.netLeft);
        $("overMsg").textContent = "";
      }
    },
    // Výpadok spojenia: hra beží ďalej (akcie sa bufferujú), len o tom vieš.
    onReconnecting: () => { if (mode === "net") log(t(L.netReconnecting)); },
    onResumed: () => { if (mode === "net") log(t(L.netResumed)); },
    // Chat od kamaráta alebo diváka (hostiteľ ho preposlal): chat okno,
    // na mobile aj bublina (pri súperovi; divák fialovo).
    onChat: (text, m) => {
      if (mode !== "net" || !state) return;
      if (m && m.from === "spec") say("spec", m.name, text, 7000);
      else say("opp", names[OPP] || t(L.heroFriend), text, 7000);
    },
    // Diváci: počet v hlavičke chatu + oznam, kto prišiel/odišiel.
    onSpectators: specsInfo,
    getSpectate: () => (state && state.phase !== "over" ? spectateData() : null),
    // Kamarát prepol aplikáciu: bublina visí, kým sa nevráti alebo nevyprší limit.
    onPeerAway: limit => {
      if (mode !== "net" || !state || state.phase === "over") return;
      const msg = t(L.netAway).replace("{s}", Math.round(limit / 1000));
      log(msg);
      say("sys", "", msg, limit);
    },
    onPeerBack: () => {
      if (mode !== "net" || !state || state.phase === "over") return;
      log(t(L.netBack));
      say("sys", "", t(L.netBack), 3000);
    },
    // ---- návrat do hry ----
    canRejoin: () => !!(state && state.phase !== "over" && !fatalShown),
    getRejoin: () => {
      const g = GameLog.current();
      return g ? { seed: g.seed, mut: g.mut !== false, ban: g.ban === true, trinkets: g.trinkets === true, raceCap: g.raceCap || null, exp: g.exp || null, actions: g.actions } : null;
    },
    // Preživší: kamarát sa vrátil, log odišiel, hráme ďalej.
    onRejoined: msg => {
      if (mode !== "net") return;
      $("netOverlay").classList.add("hidden");
      log(t(L.rejoinedMsg));
      say("sys", "", t(L.rejoinedMsg), 3000);
      Lobby.update();
      saveRejoin();
      if (msg.v !== APP_V) showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`);
    },
    // Vracajúci sa hráč: prehraj log a pokračuj.
    onRejoin: msg => {
      let s;
      try { s = rebuildFromLog(msg.seed, msg.mut, msg.ban, msg.trinkets, msg.actions, msg.raceCap, msg.exp); }
      catch (e) { fatalShown = false; showFatal(t(L.netDesync), e); return; }
      fatalShown = false;
      MY = msg.you;
      OPP = msg.you === "p1" ? "p2" : "p1";
      names = Net.info().names;
      state = s;
      GameLog.start(msg.seed, { mode: "net", you: msg.you, mut: msg.mut !== false, ban: msg.ban === true, trinkets: msg.trinkets === true, raceCap: msg.raceCap || null, exp: msg.exp || null, rejoined: true }, msg.actions);
      playerRoundActions = [];
      lastPlayerRound = [];
      busy = false;
      remoteQueue = Promise.resolve();
      enterGameScreen();
      chatClear();
      setChat(true, t(L.chatPhNet));
      $("netOverlay").classList.add("hidden");
      saveRejoin();
      log(t(L.rejoinedMe));
      driveFlow();
      if (msg.v !== APP_V) showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`);
    },
    // Kamarát nás odpojil (boli sme dlho v pozadí) a čaká – vráť sa hneď.
    onKicked: msg => {
      if (mode !== "net") return;
      log(t(L.netKicked));
      startRejoin(msg.transport === "peer" ? msg.code : null);
    },
    onPeerMode: showPeerSetup,
    onPeerError: kind => {
      console.warn("[arena] peer error:", kind); // typ chyby na diagnostiku
      if (kind === "noGame") {
        clearRejoin();
        $("netMsg").textContent = t(L.rejoinNoGame);
        $("peerCode").textContent = "";
      } else if (kind === "peer-unavailable" || kind === "timeout") {
        $("netMsg").textContent = t(kind === "timeout" ? L.peerTimeout : L.peerNotFound);
      } else if (kind === "unavailable-id") {
        $("netMsg").textContent = t(L.peerCodeTaken);
      } else {
        $("netMsg").textContent = `${t(L.peerError)} (${kind || "?"})`;
      }
    },
    onError: () => { $("netMsg").textContent = t(L.netError); },
  };
}

function startNet() {
  if (needName()) return;
  mode = "net";
  $("netOverlay").classList.remove("hidden");
  $("peerSetup").classList.add("hidden");
  $("netUrls").textContent = "";
  $("peerCode").textContent = "";
  $("netMsg").textContent = t(L.netConnecting);
  Net.connect(netHandlers(), { mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn(), insects: insectsOn(), v: APP_V, name: playerName() });
}

// Lokálny server nebeží – hraj cez kód miestnosti (P2P, funguje aj z webu).
function showPeerSetup() {
  if (!Net.peerAvailable()) {
    $("netMsg").textContent = t(L.netError);
    return;
  }
  $("netMsg").textContent = t(L.peerIntro);
  $("peerSetup").classList.remove("hidden");
}

function peerHost() {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  $("peerCode").textContent = "…";
  Net.hostPeer(code, netHandlers(), { mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn(), insects: insectsOn(), v: APP_V, name: playerName() });
}

function peerJoin() {
  const code = $("peerCodeInput").value.trim();
  if (!code) return;
  $("netMsg").textContent = t(L.netConnecting);
  Net.joinPeer(code, netHandlers(), { v: APP_V, name: playerName() });
}

let remoteQueue = Promise.resolve();
async function applyRemote(msg) {
  if (!state || state.phase === "over" || mode !== "net" || fatalShown || spectating) return;
  console.info("[arena] ←", msg.name, "r" + msg.r, "(moje r" + state.round + ", fáza " + state.phase + ")");
  // Akcia súpera nesie číslo kola odosielateľa – nesúlad = stavy sa rozišli.
  if (msg.r != null && msg.r !== state.round) {
    showFatal(t(L.netDesync), `kolo súpera ${msg.r}, moje ${state.round}`);
    return;
  }
  const ev = Engine[msg.name](state, OPP, ...(msg.args || []));
  if (!ev) {
    // V zosynchronizovanej hre je každá akcia súpera legálna – null = desync.
    showFatal(t(L.netDesync), `nelegálna akcia súpera: ${msg.name}`);
    return;
  }
  GameLog.push(OPP, msg.name, msg.args || []);
  for (const e of ev) { const m = oppEventMsg(e); if (m) log(m); }
  renderAll();
  await driveFlow();
}

function backToPick() {
  document.body.classList.remove("playing");
  document.querySelector("header").classList.remove("open");
  const wasSpec = spectating;
  Net.disconnect();
  if (!wasSpec) clearRejoin(); // divák nemá čo obnovovať – rejoin info hráča ostáva
  state = null;
  spectating = false;
  specPending = 0;
  setAnimSpeed(animSpeed); // zrušiť zrýchlenie dobiehania diváka
  botLoop = false;
  document.body.classList.remove("botloop");
  names = {};
  document.body.classList.remove("spectating");
  $("specSwapBtn").classList.add("hidden");
  setChat(false);
  chatClear();
  $("gameScreen").classList.add("hidden");
  $("newGameBtn").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("overOverlay").classList.add("hidden");
  $("banOverlay").classList.add("hidden");
  $("pickScreen").classList.remove("hidden");
  Lobby.update();
  watchGames();
}

// ---------- Divák ----------
// Z tabuľky hier na úvodnej obrazovke: pripojí sa na kód miestnosti ako divák.
// Hostiteľ pošle log hry (rebuildFromLog ako pri rejoin) a potom každú akciu
// v poradí, v akom ju aplikoval. Boj si divák odohrá sám (ako hráči) – živé
// „doBattle" zo záznamu preskakuje. Pohľad = hráč p1 (🔄 prepne na p2).
function startSpectate(code) {
  if (needName()) return;
  mode = "net";
  spectating = true;
  MY = "p1"; OPP = "p2";
  $("pickScreen").classList.add("hidden");
  $("netOverlay").classList.remove("hidden");
  $("peerSetup").classList.add("hidden");
  $("netUrls").textContent = "";
  $("peerCode").textContent = code;
  $("netMsg").textContent = t(L.specConnecting);
  Lobby.watch(null);
  Net.spectatePeer(code, specHandlers(), { v: APP_V, name: playerName() });
}
window.arenaWatch = code => startSpectate(String(code));

function specHandlers() {
  const h = netHandlers();
  return {
    specWanted: () => spectating,
    // Prvé pripojenie aj obnova po výpadku: stav sa vždy prehrá z logu nanovo.
    onSpecInit: msg => {
      remoteQueue = remoteQueue.then(() => specInit(msg)).catch(err => showFatal(t(L.netDesync), err));
    },
    onSpecAction: a => {
      const [actor, name, ...args] = a;
      if (name === "doBattle") return; // boj si divák odohrá sám (driveFlow)
      specPending++;
      specCatchUp();
      remoteQueue = remoteQueue.then(() => applySpec(actor, name, args)).catch(err => showFatal(t(L.netDesync), err))
        .finally(() => { specPending--; specCatchUp(); });
    },
    onSpecLost: () => { if (spectating && state && state.phase !== "over") log(t(L.netReconnecting)); },
    onChat: (text, m) => {
      if (!spectating || !state) return;
      if (m.from === "spec") say("spec", m.name, text, 7000);
      else say("opp", m.name || names[m.from] || m.from, text, 7000, m.from === MY ? "mine" : "");
    },
    onSpectators: specsInfo,
    // Hostiteľ odišiel a nevrátil sa (ani po minúte) – sledovanie končí.
    onPeerLeft: () => {
      if (!spectating || (state && state.phase === "over")) return;
      Net.disconnect();
      $("netOverlay").classList.add("hidden");
      $("overOverlay").classList.remove("hidden");
      $("overTitle").textContent = t(L.specEnded);
      $("overMsg").textContent = "";
    },
    onPeerError: kind => {
      if (!spectating) return;
      if (state) { log(`${t(L.peerError)} (${kind || "?"})`); return; }
      if (kind === "specVersion") $("netMsg").textContent = t(L.gamesOldVer);
      else if (kind === "specFull") $("netMsg").textContent = t(L.specFull);
      else if (kind === "noGame" || kind === "peer-unavailable") $("netMsg").textContent = t(L.specNoGame);
      else h.onPeerError(kind);
    },
  };
}

let specSeed = null; // seed sledovanej hry (iný seed = nová hra)
// Divák zaostáva (pomalé zariadenie, uspatá záložka): keď čaká veľa akcií,
// animácie (aj boj) idú zrýchlene, kým nedobehne hru.
const SPEC_LAG = 6;
let specPending = 0;
function specCatchUp() {
  setAnimSpeed(animSpeed);
  if (spectating && specPending > SPEC_LAG) ANIM *= 0.12;
}
function specInit(msg) {
  if (!spectating) return;
  if (msg.v !== APP_V) { showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`); return; }
  const s = rebuildFromLog(msg.seed, msg.mut, msg.ban, msg.trinkets, msg.actions, msg.raceCap, msg.exp);
  const first = !state;
  // hra botov (?botloop) po konci začne novú – rovnaké spojenie, nový log
  const newGame = !first && (state.phase === "over" || msg.seed !== specSeed);
  specSeed = msg.seed;
  fatalShown = false;
  state = s;
  names = Net.info().names;
  busy = false;
  GameLog.stop();
  playerRoundActions = [];
  lastPlayerRound = [];
  if (first) {
    enterGameScreen();
    document.body.classList.add("spectating");
    $("specSwapBtn").classList.remove("hidden");
    chatClear();
    setChat(true, t(L.chatPhSpec));
    for (const m of Array.isArray(msg.chat) ? msg.chat.slice(-30) : []) {
      if (!m || typeof m.text !== "string") continue;
      const text = m.text.slice(0, 200);
      if (m.from === "spec") chatAdd("spec", specLabel(m.name), text);
      else if (m.from === "p1" || m.from === "p2") chatAdd("opp", String(m.name || names[m.from] || m.from).slice(0, 24), text);
    }
    chatAdd("sys", "", t(L.specWelcome).replace("{a}", names.p1 || "p1").replace("{b}", names.p2 || "p2"));
  } else if (newGame) {
    enterGameScreen();
    chatAdd("sys", "", t(L.specWelcome).replace("{a}", names.p1 || "p1").replace("{b}", names.p2 || "p2"));
  } else {
    log(t(L.netResumed));
  }
  $("netOverlay").classList.add("hidden");
  return driveFlow();
}

async function applySpec(actor, name, args) {
  if (!spectating || !state || state.phase === "over" || fatalShown) return;
  if ((actor !== "p1" && actor !== "p2") || (name !== "botTurn" && typeof Engine[name] !== "function")) {
    throw new Error(`divák: neznáma akcia ${actor} ${name}`);
  }
  // ťah bota (hra botov ?botloop): bot je deterministický, divák ho odohrá sám
  if (name === "botTurn") {
    busy = true;
    await playOppEvents(Bot.botTurn(state, actor, args[0] || "hard"), actor);
    renderAll();
    await driveFlow();
    return;
  }
  busy = true;
  const ev = await playWatched(actor, name, args, () => { const e = Engine[name](state, actor, ...args); renderAll(); return e; });
  if (!ev) throw new Error(`divák: nelegálna akcia ${actor} ${name} v kole ${state.round}`);
  for (const e of ev) {
    if (e.type === "ban") { log(banResultMsg(e)); if (state.races) log(racesMsg()); continue; }
    const m = oppEventMsg(e, actor);
    if (m) log(m);
  }
  renderAll();
  await driveFlow();
}

// Divák / ?botloop: prepnutie POV – čiu ruku, obchod a dolný banner vidím.
// Ťuk na 🔄 (hlavička / chat) alebo na horného hrdinu. Počas boja nie
// (animácia beží nad snímkou plôch podľa strán).
function swapPov() {
  if (!watchOnly() || !state || $("stage").classList.contains("battle")) return;
  [MY, OPP] = [OPP, MY];
  renderAll();
  renderPovBtn();
}
function renderPovBtn() {
  const b = $("povBtn");
  b.classList.toggle("hidden", !watchOnly());
  if (watchOnly()) b.textContent = `👁 ${names[MY] || MY} 🔄`;
  b.title = t(L.specSwap);
}
$("specSwapBtn").addEventListener("click", swapPov);
$("povBtn").addEventListener("click", swapPov);
$("oppHero").addEventListener("click", () => { if (watchOnly()) swapPov(); });

// ---------- Animované akcie pri sledovaní (divák, ?botloop) ----------
// Akcia hráča, ktorého POV sledujem, vyzerá ako ťah kartou: karta sa zdvihne
// a letí z obchodu do balíčka (nákup), z ruky na plochu (vyloženie), z ruky/
// plochy do obchodu (predaj). Kúzlo letí ako pri vlastnom zoslaní. Druhý
// hráč: jeho nákup zo spoločnej ponuky letí k jeho balíčku, ostatné akcie
// sú ikonka nad jeho hrdinom. `run` = vykonanie akcie (engine + render).
const handCardEl = i => $("handEl").querySelector(`.card[data-hidx="${i}"]`);
const OPP_ACT_ICON = { buyPrivate: "🛒", buySpell: "🛒", playMinion: "🃏", castSpell: "✨", sellCard: "🪙",
  upgradeTier: "⬆️", refreshShop: "🔄", toggleFreeze: "❄️", toggleFreezeAll: "❄️", discardCard: "🗑️", pickTrinket: "🧿" };
// Klon karty letí v rámci dosky (karty majú veľkosti v cqh – mimo #stage by sa rozpadli).
function flyCard(el, from, to, { fade = false, ms = 520 } = {}) {
  const st = $("stage").getBoundingClientRect();
  const g = el.cloneNode(true);
  g.classList.remove("hov", "buyable", "disabled", "watch-pick", "frozen");
  g.classList.add("fly-card");
  Object.assign(g.style, {
    position: "absolute", left: (from.left - st.left) + "px", top: (from.top - st.top) + "px",
    width: from.width + "px", height: from.height + "px", margin: "0", transform: "none", order: "",
  });
  $("stage").appendChild(g);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const sc = fade ? 0.35 : Math.min(to.width / from.width, to.height / from.height) || 1;
  if (!g.animate) { g.remove(); return Promise.resolve(); }
  // koniec podľa časovača, nie a.finished – v skrytej záložke animácia stojí
  // a promise by sa nikdy nevyriešil (fronta diváka by zamrzla)
  g.animate([
    { transform: "translate(0,0) scale(1.08)", opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(${(1 + sc) / 2 + 0.1})`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: fade ? 0 : 1 },
  ], { duration: ms * ANIM, easing: "cubic-bezier(.35,.1,.35,1)", fill: "forwards" });
  return sleep(ms).then(() => g.remove());
}
async function playWatched(actor, name, args, run) {
  const mine = actor === MY;
  const p = state[actor];
  let src = null, uid = null;
  if (name === "buyCommon") src = $("commonsRow").children[args[0]];
  else if (mine) {
    if (name === "buyPrivate") src = $("privRow").children[args[0]];
    else if (name === "buySpell") src = $("privRow").querySelector(".spell-slot");
    else if (name === "playMinion" || name === "castSpell" || name === "discardCard") {
      src = handCardEl(args[0]);
      uid = p.hand[args[0]] && p.hand[args[0]].uid;
    } else if (name === "sellCard") src = args[0] === "hand" ? handCardEl(args[1]) : $("myBoard").children[args[1]];
  }
  const from = src && src.getBoundingClientRect();
  if (src && from.width) {
    src.classList.add("watch-pick"); // „prst“ kartu zdvihne
    await sleep(380);
  }
  const rows = $("shopPanel").querySelector(".shop-rows");
  if (mine && name === "refreshShop" && rows.animate) {
    rows.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: 220 * ANIM, fill: "forwards" });
    await sleep(220);
  }
  const ev = run();
  if (!ev) return ev;
  const fly = (to, opts) => (src && from.width && to && to.width ? flyCard(src, from, to, opts) : Promise.resolve());
  if (name.startsWith("buy")) {
    if (mine) Sfx.coin();
    await fly($(mine ? "myDeckBox" : "oppDeckBox").getBoundingClientRect(), { fade: true });
  } else if (mine && name === "playMinion") {
    const dest = uid != null && cardById(uid);
    if (dest) dest.style.visibility = "hidden";
    await fly((dest || $("myBoard")).getBoundingClientRect());
    if (dest) dest.style.visibility = "";
  } else if (mine && name === "sellCard") {
    Sfx.coin();
    await fly($("shopPanel").getBoundingClientRect(), { fade: true });
  } else if (mine && name === "discardCard") {
    await fly($("myDiscardBox").getBoundingClientRect(), { fade: true });
  } else if (mine && name === "castSpell") {
    const sp = ev.find(e => e.type === "spell" && e.pid === actor);
    if (sp) await playSpellCast(sp, from);
  } else if (mine && name === "refreshShop") {
    if (rows.animate) rows.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 260 * ANIM, fill: "forwards" });
  } else if (mine && name === "upgradeTier") {
    floatText($("myHero"), "⬆️ ⭐", true);
    Sfx.evolve();
  } else if (!mine && OPP_ACT_ICON[name]) {
    floatText($("oppHero"), OPP_ACT_ICON[name], true);
  }
  return ev;
}

// ---------- Herný tok ----------
async function driveFlow() {
  for (;;) {
    if (state.phase === "over") { renderAll(); showOver(); return; }
    if (state.phase === "ban") {
      // Bot si vyberie hneď (výber sa ukáže až po vylosovaní); hráč klikne
      // v overlayi – jeho pickBan hru rozbehne (startRound je v engine).
      const botPid = mode !== "bot" ? null : !state.ban.picks[OPP] ? OPP : botLoop && !state.ban.picks[MY] ? MY : null;
      if (botPid) {
        if (botLoop) await sleep(1500);
        const race = Bot.pickBan(state, botPid);
        GameLog.push(botPid, "pickBan", [race]);
        const ev = Engine.pickBan(state, botPid, race);
        if (ev && ev.some(e => e.type === "ban")) { act(ev); continue; }
        if (botLoop) continue; // druhý bot ešte vyberá
      }
      busy = false;
      renderAll();
      return; // čaká sa na výber rasy
    }
    if (state.phase === "battle") { await runBattle(); continue; }
    if (state.active === OPP || watchOnly()) {
      if (mode === "bot") { await runBotTurn(state.active); continue; }
      busy = false;
      renderAll();
      return; // sieťová hra: čakáme na akcie súpera
    }
    busy = false;
    renderAll();
    return; // čaká sa na hráča
  }
}

// ---------- Trash-talk bota ----------
// Bot občas hodí bublinu nad svoj banner – vtipné doberanie hráčovych
// rozhodnutí (detská hra: štipľavé, nie zlé). Náhoda tu NEjde cez state.rng –
// je to čisto UI, determinizmus enginu a replay ostávajú nedotknuté.
// Texty hlášok: L.botTaunts (src/i18n.js).
let lastTauntAt = 0;
// Stlmený bot (💬/🤐 v hlavičke): žiadne jeho bubliny – náhodné hlášky,
// Claudov pozdrav ani trash-talk. Odpoveď na hráčov chat ostáva (hráč sa
// pýtal sám) a súper v sieťovej hre sa nestlmuje. Pamätá sa v localStorage.
let botMuted = false;
try { botMuted = localStorage.getItem("arena.botMuted") === "1"; } catch (e) { /* bez úložiska */ }
// `mine` = bublina pri mojom hrdinovi (vlastná chatová správa), inak pri súperovi.
// `spec` = správa diváka (fialová).
function showTauntBubble(text, ms, mine, spec) {
  document.querySelectorAll(mine ? ".taunt-bubble.mine" : ".taunt-bubble:not(.mine)").forEach(b => b.remove());
  const el = document.createElement("div");
  el.className = "taunt-bubble" + (mine ? " mine" : "") + (spec ? " spec" : "");
  el.textContent = text;
  $("stage").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 450); }, ms || 3800);
}
function botTaunt(kind, chance) {
  if (mode !== "bot" || botLoop || !state || state.phase === "over" || botMuted) return;
  if (difficulty === "claude") return; // Claude trash-talkuje vlastnými hláškami
  const now = Date.now();
  if (now - lastTauntAt < 6000) return; // nespamuj
  if (Math.random() > chance) return;
  const pool = L.botTaunts[kind][I18N.lang] || L.botTaunts[kind].sk;
  lastTauntAt = now;
  showTauntBubble(pool[Math.floor(Math.random() * pool.length)]);
}

// Výsledok posledného boja z pohľadu bota – kontext pre Claudov trash-talk.
let lastBattleNote = null;

// ---------- Chat okno ----------
// Spoločný chat hráčov, divákov (fialovo) a Clauda. PC (široké okno na šírku):
// panel vpravo vedľa hry pod šachmi, správy bez bublín. Mobil: panel otvára
// 🗨️ v ☰ menu; kým je zavretý, správa ukáže aj bublinu pri hrdinovi a bodku
// na ☰ (aby hráč vedel, že niečo prišlo). Obyčajný bot chat nemá – jeho
// hlášky ostávajú bublinami.
// Druhy: me / opp (hráči), spec (divák), bot (Claude), sys (oznamy siete).
const SIDE_MQ = matchMedia("(orientation: landscape) and (pointer: fine) and (min-width: 1000px) and (min-height: 601px)");
const CHAT_KEEP = 80;
const CLAUDE_LABEL = "🤖 Claude";
let chatMsgs = []; // { kind, label, text, from, who } – história pre nových divákov
const chatOn = () => document.body.classList.contains("chat-on");
const specLabel = n => `👁 ${String(n || "?").slice(0, 24)}`;
function setChat(on, placeholder) {
  document.body.classList.toggle("chat-on", !!on);
  $("chatPanel").classList.toggle("hidden", !on);
  $("chatBtn").classList.toggle("hidden", !on);
  if (!on) setChatOpen(false);
  if (placeholder) $("chatInput").placeholder = placeholder;
  $("chatTitle").textContent = t(L.chatTitle);
}
function chatClear() {
  chatMsgs = [];
  $("chatLog").innerHTML = "";
  $("chatSpecs").textContent = "";
  setUnread(false);
}
// Chat je na očiach: PC panel vedľa hry alebo otvorený panel na mobile.
const chatVisible = () => chatOn() && (SIDE_MQ.matches || document.body.classList.contains("chat-open"));
function setChatOpen(open) {
  document.body.classList.toggle("chat-open", !!open);
  if (!open) return;
  setUnread(false);
  const lg = $("chatLog");
  lg.scrollTop = lg.scrollHeight;
}
function setUnread(on) {
  $("chatDot").classList.toggle("hidden", !on);
  $("menuBtn").classList.toggle("unread", !!on);
}
function chatAdd(kind, label, text, who) {
  const from = kind === "me" ? MY : kind === "opp" && !spectating ? OPP : kind;
  chatMsgs.push({ kind, label, text, from, who });
  if (chatMsgs.length > CHAT_KEEP) chatMsgs.shift();
  const lg = $("chatLog");
  const atBottom = lg.scrollHeight - lg.scrollTop - lg.clientHeight < 40;
  const d = document.createElement("div");
  d.className = "chat-msg " + kind;
  if (label) {
    const b = document.createElement("b");
    b.textContent = label + ": ";
    d.appendChild(b);
  }
  d.appendChild(document.createTextNode(text));
  lg.appendChild(d);
  while (lg.children.length > CHAT_KEEP) lg.removeChild(lg.firstChild);
  if (atBottom || kind === "me") lg.scrollTop = lg.scrollHeight;
}
// Správa do chatu. Keď chat nie je na očiach (mobil), aj bublina + bodka.
// side: "mine" = bublina pri mojom (dolnom) hrdinovi, inak hore.
function say(kind, label, text, ms, side) {
  if (!chatOn()) { showTauntBubble(text, ms, side === "mine" || kind === "me"); return; }
  const lb = kind === "spec" ? specLabel(label) : label;
  chatAdd(kind, lb, text, kind === "spec" ? label : undefined);
  if (chatVisible()) return;
  showTauntBubble(kind === "spec" ? `${lb}: ${text}` : text, ms, side === "mine" || kind === "me", kind === "spec");
  if (kind !== "me" && kind !== "sys") setUnread(true);
}
// História chatu pre nového diváka (absolútne strany p1/p2, mená hráčov).
function chatHistoryFor() {
  return chatMsgs.filter(m => m.kind !== "sys" && m.kind !== "bot").slice(-30).map(m =>
    m.kind === "spec" ? { from: "spec", name: m.who || "", text: m.text }
      : { from: m.from, name: names[m.from] || "", text: m.text });
}
// Pre nového diváka: log hry (ako rejoin) + história chatu.
function spectateData() {
  const g = GameLog.current();
  if (!g || !state) return null;
  return { seed: g.seed, mut: g.mut !== false, ban: g.ban === true, trinkets: g.trinkets === true, raceCap: g.raceCap || null, exp: g.exp || null,
    actions: g.actions, chat: chatHistoryFor() };
}
// Diváci prišli/odišli: počet v hlavičke chatu + oznam.
function specsInfo(x) {
  if ((mode !== "net" && !botLoop) || !state) return;
  $("chatSpecs").textContent = x.n ? `👁 ${x.n}` : "";
  $("chatSpecs").title = t(L.specCount);
  if (x.name) say("sys", "", `👁 ${x.name} ${t(x.joined ? L.specJoined : L.specLeft)}`, 3000);
  if (!spectating) Lobby.update();
}
$("chatBtn").addEventListener("click", () => setChatOpen(!document.body.classList.contains("chat-open")));
$("chatClose").addEventListener("click", () => setChatOpen(false));

// ---------- Chat s Claudom (len Claude mód) ----------
// Hráč odpíše do chatu, Claude odpovie – samostatný lacný request mimo ťahu.
// História ide aj do ťahových promptov (banter drží niť).
let chatHistory = []; // { who: "player" | "claude", text }
let chatBusy = false;
async function sendChat() {
  const inp = $("chatInput");
  const text = inp.value.trim().slice(0, 200);
  if (!text || !state) return;
  // Hra po sieti: správa ide súperovi (a cez hostiteľa divákom). Divák píše
  // obom hráčom naraz (fialovo).
  if (mode === "net") {
    inp.value = "";
    Net.sendChat(text);
    if (spectating) say("spec", playerName(), text, 3000);
    else say("me", t(L.heroYou), text, 3000, "mine");
    return;
  }
  if (chatBusy || difficulty !== "claude" || mode !== "bot") return;
  chatBusy = true;
  inp.value = "";
  $("chatSend").disabled = true;
  chatAdd("me", t(L.heroYou), text);
  chatHistory.push({ who: "player", text });
  try {
    const reply = await ClaudeBot.chat({
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      text,
      history: chatHistory.slice(-6),
      gameSummary: `round ${state.round}; your HP ${state[OPP].hp}, player's HP ${state[MY].hp}; ` +
        `${lastBattleNote || "no battle yet"}; player's last round: ${lastPlayerRound.join(", ") || "-"}`,
    });
    if (reply) { chatHistory.push({ who: "claude", text: reply }); say("bot", CLAUDE_LABEL, reply, 7000); }
  } catch (e) {
    console.warn("Chat s Claudom zlyhal:", e);
  }
  chatBusy = false;
  $("chatSend").disabled = false;
}

// pid: v ?botloop hrá bot aj za p1
async function runBotTurn(pid = OPP) {
  if (botLoop) return runLoopBotTurn(pid);
  busy = true;
  renderAll();
  if (difficulty === "claude" && !botLoop) { await runClaudeTurn(); return; }
  botTaunt("turn", 0.3);
  await sleep(600);
  GameLog.push(pid, "botTurn", [difficulty]);
  const events = Bot.botTurn(state, pid, difficulty);
  await playOppEvents(events, pid);
}

// ?botloop: ťah bota po jednotlivých akciách (každá ide do GameLog-u aj
// divákom a dá sa animovať). Plán sa spočíta na kópii stavu prehranej
// z logu (engine je deterministický) a potom sa akcia po akcii zahrá
// naostro. Bot bez handicapov (Bot.HYGIENE = hard bez bonusov) – férový zápas.
function planBotTurn(pid) {
  const g = GameLog.current();
  const copy = rebuildFromLog(g.seed, g.mut, g.ban, g.trinkets, g.actions, g.raceCap, g.exp);
  const plan = [];
  Bot.withExecutor((name, st, who, ...args) => {
    const ev = Engine[name](st, who, ...args);
    if (ev) plan.push([name, args]);
    return ev;
  }, () => Bot.completeTurn(copy, pid, Bot.HYGIENE, () => {}));
  plan.push(["endShopTurn", []]);
  return plan;
}
async function runLoopBotTurn(pid) {
  busy = true;
  renderAll();
  await sleep(700);
  let plan = [];
  try { plan = planBotTurn(pid); } catch (e) { console.warn("[arena] botloop: plán zlyhal", e); }
  for (const [name, args] of plan) {
    if (!botLoop || state.phase !== "shop" || state.active !== pid) break;
    const ev = await playWatched(pid, name, args, () => {
      const e = Engine[name](state, pid, ...args);
      if (e) GameLog.push(pid, name, args);
      renderAll();
      return e;
    });
    if (!ev) { console.warn("[arena] botloop: akcia z plánu neprešla", name, args); break; }
    for (const e of ev) { const m = oppEventMsg(e, pid); if (m) log(m); }
    if (name !== "endShopTurn") await sleep(550);
  }
  // poistka: ťah musí skončiť, inak by hra stála
  if (botLoop && state.phase === "shop" && state.active === pid) {
    if (state.pendingDiscover) { Engine.pickDiscover(state, pid, 0); GameLog.push(pid, "pickDiscover", [0]); }
    if (Engine.endShopTurn(state, pid)) GameLog.push(pid, "endShopTurn", []);
  }
}

async function playOppEvents(events, who = OPP) {
  for (const ev of events) {
    const msg = oppEventMsg(ev, who);
    if (msg) { log(msg); renderAll(); await sleep(650); }
  }
}

// Ťah Clauda: reálny model cez API (kľúč hráča). Pri zlyhaní dohrá ťažký
// heuristický bot, nech hra nikdy nezamrzne; replay log sedí v oboch vetvách.
async function runClaudeTurn() {
  let res = null;
  try {
    res = await ClaudeBot.turn(state, OPP, {
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      lastBattle: lastBattleNote,
      humanLastRound: lastPlayerRound,
      recentChat: chatHistory.slice(-6),
      onAction: (name, args) => GameLog.push(OPP, name, args),
      trinketText: id => { const x = L.trinkets[id]; return x ? `${x.en}: ${x.d.en}` : id; },
    });
  } catch (e) {
    console.warn("ClaudeBot zlyhal:", e);
  }
  if (!res) {
    log(t(L.claudeFallback));
    GameLog.push(OPP, "botTurn", ["hard"]);
    await playOppEvents(Bot.botTurn(state, OPP, "hard"));
    return;
  }
  if (res.taunt && !botMuted) say("bot", CLAUDE_LABEL, res.taunt, 6000);
  await playOppEvents(res.events);
}

// Hladkacia rukavica/kefa: Pohladkania do ruky na začiatku môjho ťahu
// (prídu v eventoch súperovho ťahu alebo nového kola po boji).
const petGiftMsg = ev => `${t(L.petGiftMsg)} ${ev.n > 1 ? ev.n + "× " : ""}${Cards.nameOf(Cards.byId.pet, 1, I18N.lang)}`;

// who = čie eventy sa hlásia (default súper; divák hlási oboch hráčov).
function oppEventMsg(ev, who = OPP) {
  if (ev.type === "ban") return banResultMsg(ev);
  if (ev.type === "petGift" && ev.pid === MY && !watchOnly()) return petGiftMsg(ev);
  if (ev.type === "banPick" && ev.pid === who) return watchOnly() ? null : t(L.banOppPicked);
  if (ev.pid !== who) return null;
  const def = ev.defId ? Cards.byId[ev.defId] : null;
  const name = def ? Cards.nameOf(def, ev.rank || 1, I18N.lang) : "";
  const emoji = def && def.emoji ? def.emoji + " " : "";
  let msg;
  switch (ev.type) {
    case "buy": msg = `${t(L.botBought)} ${emoji}${name}`; break;
    case "play": msg = `${t(L.botPlayed)} ${emoji}${name}`; break;
    case "spell": msg = `${t(L.botSpell)} ${emoji}${name}`; break;
    case "discard": msg = `${t(L.botDiscard)} ${emoji}${name}`; break;
    case "tierUp": msg = `${t(L.botTier)} ${ev.tier}`; break;
    case "evolve": msg = `${t(L.botEvolve)} ${emoji}${name}!`; break;
    case "trinketPick": { const x = L.trinkets[ev.id]; msg = `${t(L.trinketOppPicked)} ${x.e} ${t(x)} – ${t(x.d)}`; break; }
    default: return null;
  }
  // v sieťovej hre je súper človek, nie robot (s menom, keď ho poznáme)
  if (botLoop) return msg.replace("🤖", `🤖 ${names[who] || who}`);
  return mode === "net" ? msg.replace("🤖", names[who] ? `🧑 ${names[who]}` : "🧑") : msg;
}

// Ogrí kľúč: hod mincou za súperove trinkety (z pohľadu hráča).
function sabotageMsg(ev) {
  if (ev.pid === MY) return t(ev.heads ? L.sabotageHeads : L.sabotageTails);
  return ev.heads ? null : t(L.sabotagedMsg);
}

// Meno strany v logu boja: Ty / Súper; divák vidí mená hráčov.
const sideName = pid => watchOnly() ? (names[pid] || pid) : t(pid === MY ? L.you : L.opp);

// ---------- Boj ----------
async function runBattle() {
  busy = true;
  // Kolo hráča skončilo – jeho akcie sa stávajú materiálom pre Clauda.
  lastPlayerRound = playerRoundActions.splice(0);
  // Snímka plôch a počítadiel pred bojom – doBattle stav zmení naraz
  // (kôpky, nové kolo, dotiahnutá ruka), animácia beží nad snímkou,
  // inak by čísla skákali dopredu už na začiatku boja.
  // Roj (Hmyz) dostane až bojová kópia v engine – snímka ho pridá tiež, inak
  // by životy z hp eventov skákali nad zobrazené.
  const withSwarm = (pid, x) => {
    const sw = Engine.swarmBonus(state[pid], Cards.byId[x.defId]);
    return { ...x, atk: x.atk + sw.a, hp: x.hp + sw.h, maxHp: (x.maxHp ?? x.hp) + sw.h, swarmIn: true };
  };
  const snap = {
    p1: state.p1.board.map(x => withSwarm("p1", x)),
    p2: state.p2.board.map(x => withSwarm("p2", x)),
  };
  const pre = {
    p1: { deck: state.p1.deck.length, discard: state.p1.discard.length, hp: state.p1.hp },
    p2: { deck: state.p2.deck.length, discard: state.p2.discard.length, hp: state.p2.hp },
  };
  GameLog.push("_", "doBattle", []);
  const events = Engine.doBattle(state);
  // DMG Meter kolo: na súperovom riadku stojí môj Strážca arény.
  const myBoss = events.find(e => e.type === "bossStart" && e.pid === MY);
  renderAll();
  renderBoardList($("oppBoard"), myBoss ? myBoss.boss : snap[OPP], false, OPP);
  renderBoardList($("myBoard"), snap[MY], false, MY);
  renderHero($("oppHero"), { ...state[OPP], hp: pre[OPP].hp });
  renderHero($("myHero"), { ...state[MY], hp: pre[MY].hp });
  renderCorner($("oppDeckBox"), "🂠", t(L.deck), pre[OPP].deck);
  renderCorner($("oppDiscardBox"), "🗂", t(L.discardPile), pre[OPP].discard);
  renderCorner($("myDiscardBox"), "🗂", t(L.discardPile), pre[MY].discard);
  renderCorner($("myDeckBox"), "🂠", t(L.deck), pre[MY].deck);
  // Boj: skry obchod, ukáž veľký nápis v strede.
  $("stage").classList.add("battle");
  const fb = $("fightBanner");
  fb.textContent = t(myBoss ? L.bossFight : L.fight);
  fb.classList.remove("hidden");
  await sleep(900);
  fb.classList.add("small");

  let skip = false; // súperovo DMG Meter meranie sa neanimuje (len výsledok)
  for (const ev of events) {
    if (ev.type === "bossStart") { skip = ev.pid !== MY; continue; }
    if (ev.type === "bossEnd") {
      if (!skip) { log(watchOnly() ? `🗿 ${sideName(MY)}: ${ev.dmg}` : `🗿 ${t(L.bossYourDmg)} ${ev.dmg}`); await sleep(500); }
      skip = false;
      continue;
    }
    if (skip) continue;
    switch (ev.type) {
      case "bossResult": {
        const mine = ev.dmg[MY], theirs = ev.dmg[OPP];
        fb.textContent = `🗿 ${sideName(MY)} ${mine} : ${theirs} ${sideName(OPP)}`;
        fb.classList.remove("small");
        if (ev.winner === MY && !watchOnly()) Sfx.evolve();
        if (watchOnly()) {
          log(`🗿 ${sideName(OPP)}: ${theirs}`);
          if (ev.winner) log(`${ev.tie ? t(L.bossTie) + " " : ""}🎁 ${sideName(ev.winner)}`);
        } else {
          log(`🗿 ${t(L.bossOppDmg)} ${theirs}`);
          log(`${ev.tie ? t(L.bossTie) + " " : ""}${t(ev.winner === MY ? L.bossWin : L.bossLose)}`);
        }
        lastBattleNote = `DMG Meter round (no hero damage): you dealt ${ev.dmg[OPP]}, the human dealt ${ev.dmg[MY]} – ${ev.winner === OPP ? "you" : "the human"} discovered a higher-tier minion`;
        await sleep(2200);
        fb.classList.add("small");
        break;
      }
      case "battleStart":
        log(`${t(L.fight)} ${sideName(ev.first)} ${t(L.begins)}.`);
        break;
      case "attack": {
        const a = cardById(ev.aUid), d = cardById(ev.dUid);
        if (a && d) {
          const k = fastAnim(a) ? FAST_ANIM : 1; // roj Včielok (Hmyz) – rýchlo
          // Útočník priletí pred obrancu a zrazia sa.
          const ra = a.getBoundingClientRect(), rd = d.getBoundingClientRect();
          const dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
          const dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
          a.style.zIndex = "20";
          a.style.transition = `transform ${0.35 * k * ANIM}s ease-in`;
          a.style.transform = `translate(${dx * 0.88}px, ${dy * 0.88}px) scale(1.08)`;
          await sleep(370 * k);
          Sfx.hit();
          d.classList.add("hit");
          impactRing(d, "#ff6b6b");
          spawnParticles(d, { n: 6, color: "#ff6b6b", spread: 40 });
          if (ev.aDmg >= 6) screenShake(0.5);
          // Vrtkavá koža (O008): 🍀 = polovičný zásah, 💢 = 1,5×.
          const fkIc = f => f === "lucky" ? "🍀" : f === "bad" ? "💢" : "";
          floatText(d, `${ev.aWild ? "🎲" : ""}${fkIc(ev.dFickle)}-${ev.aDmg}`);
          if (ev.dDmg > 0) floatText(a, `${ev.dWild ? "🎲" : ""}${fkIc(ev.aFickle)}-${statNum(ev.dDmg)}`);
          // Divoký úder (O009): hodené číslo aj do logu – deti vidia, čo padlo.
          if (ev.aWild) log(`${t(L.wildMsg)}: ${ev.aDmg}`);
          if (ev.dWild) log(`${t(L.wildMsg)}: ${ev.dDmg}`);
          await sleep(480 * k);
          a.style.transition = `transform ${0.25 * k * ANIM}s ease-out`;
          a.style.transform = "";
          await sleep(300 * k);
          d.classList.remove("hit");
          a.style.zIndex = "";
          a.style.transition = "";
        }
        break;
      }
      case "proc": {
        // Schopnosť sa spúšťa: zlatý záblesk + label kľúčového slova na karte.
        const el = cardById(ev.uid);
        if (el) {
          el.classList.add("proc");
          const badge = document.createElement("div");
          badge.className = "proc-badge";
          badge.textContent = Cards.KW_LABEL[ev.kw][I18N.lang] + "!";
          el.appendChild(badge);
          Sfx.buff();
          await sleep(750);
          el.classList.remove("proc");
          badge.remove();
        }
        break;
      }
      case "hp": {
        const el = cardById(ev.uid);
        if (el) {
          const hpEl = el.querySelector(".hp");
          if (hpEl) {
            hpEl.textContent = statNum(Math.max(0, ev.hp));
            hpEl.classList.toggle("hurt", ev.hp < Number(el.dataset.maxhp || Infinity));
          }
        }
        break;
      }
      case "powerDmg": {
        const el = cardById(ev.uid);
        const fromEl = ev.from ? cardById(ev.from) : null;
        if (el) {
          // Projektil od zdroja k cieľu, potom zásah.
          if (fromEl) await shootProjectile(fromEl, el);
          Sfx.zap();
          el.classList.add("hit");
          floatText(el, `-${ev.n}`);
          await sleep(550);
          el.classList.remove("hit");
        }
        break;
      }
      case "echoProc": {
        // Ozvena: zvonček nad príšerkou, potom jej schopnosť (proc eventy).
        const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
        log(`🔔 ${t(L.echoProcMsg)} ${name}`);
        const el = cardById(ev.uid);
        if (el) { floatText(el, "🔔", true); await sleep(400); }
        break;
      }
      case "chaosTrigger": {
        // O002: kocka nad ogrom + log, koho schopnosť spustil (aj súperovu).
        const a = Cards.nameOf(Cards.byId["O002"], 1, I18N.lang);
        const b = Cards.nameOf(Cards.byId[ev.targetDefId], 1, I18N.lang);
        log(t(L.chaosTriggerMsg).replace("{a}", a).replace("{b}", `${b} (${Cards.KW_LABEL[ev.kw][I18N.lang]})`));
        const el = cardById(ev.uid);
        if (el) { floatText(el, "🎲", true); await sleep(400); }
        break;
      }
      case "shrink": {
        // Oslabenie (D001): −a/−h floatuje červeno, čísla na karte klesnú.
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`${ev.icon || "🐲"} ${name} ${t(L.shrinkMsg)} ${fmtBuff(ev.a, ev.h)}`);
        if (el) {
          floatText(el, fmtBuff(ev.a, ev.h), false);
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a);
          if (hpEl && ev.h) hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h);
          if (ev.h) el.dataset.maxhp = String(Math.max(1, Number(el.dataset.maxhp || 0) + ev.h));
          Sfx.zap();
          await sleep(500);
        }
        break;
      }
      // ----- Psíci -----
      case "pee": {
        // Ocikaj (P003): staty na polovicu – žltá kvapka, čísla klesnú.
        const el = cardById(ev.uid);
        const fromEl = ev.from ? cardById(ev.from) : null;
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🐩 ${name} ${t(L.peeMsg)} ${fmtBuff(ev.a, ev.h)}`);
        if (el) {
          if (fromEl) await shootProjectile(fromEl, el, "#ffd43b");
          floatText(el, `💦 ${fmtBuff(ev.a, ev.h)}`, false);
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a);
          if (hpEl && ev.h) hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h);
          if (ev.h) el.dataset.maxhp = String(Math.max(1, Number(el.dataset.maxhp || 0) + ev.h));
          impactRing(el, "#ffd43b");
          spawnParticles(el, { n: 8, color: "#ffd43b", emoji: "💦", spread: 50 });
          Sfx.hex();
          await sleep(600);
        }
        break;
      }
      case "fetch": {
        // Aport (P004): za ním idú shrink (obranca) a buff (kamarát) eventy.
        const a = Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang);
        const b = ev.targetDefId ? Cards.nameOf(Cards.byId[ev.targetDefId], ev.targetRank || 1, I18N.lang) : "?";
        log(t(L.fetchMsg).replace("{a}", a).replace("{b}", b).replace("{n}", `${ev.a}/${ev.h}`));
        const from = cardById(ev.targetUid), to = cardById(ev.toUid);
        if (from && to) await shootProjectile(from, to, "#f783ac");
        break;
      }
      case "polymorph": {
        // Ovčia premena: karta sa na mieste vymení za Ovečku 0/1 (uid ostáva).
        const el = cardById(ev.uid);
        const name = Cards.nameOf(Cards.byId[ev.fromDefId], ev.fromRank || 1, I18N.lang);
        log(`🐑 ${name} ${t(L.polymorphMsg)}`);
        if (el) {
          if (previewEl && previewEl._srcCard === el) hidePreview();
          Sfx.spell("polymorph");
          impactRing(el, "#e599f7");
          spawnParticles(el, { n: 10, color: "#e599f7", emoji: "☁️", spread: 55 });
          el.classList.add("proc");
          await sleep(350);
          const sheep = cardEl({
            uid: ev.uid, defId: ev.defId, rank: 1, atk: ev.atk, hp: ev.hp, maxHp: ev.hp, taunt: false,
          }, { owner: ev.pid });
          sheep.style.order = el.style.order;
          el.replaceWith(sheep);
          floatText(sheep, "🐑");
          sheep.classList.add("evolving");
          await sleep(500);
          sheep.classList.remove("evolving");
        }
        break;
      }
      case "hex": {
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🐸 ${name} ${t(L.hexMsg)}`);
        if (el) {
          floatText(el, "🐸");
          Sfx.hex();
          impactRing(el, "#be4bdb");
          spawnParticles(el, { n: 8, color: "#be4bdb", emoji: "🐸", spread: 55 });
          await sleep(700);
        }
        break;
      }
      case "shieldPop": {
        const el = cardById(ev.uid);
        log(`😇 ${t(L.shieldPopMsg)}`);
        if (el) {
          el.querySelector(".shield-badge")?.remove();
          floatText(el, "😇💥");
          Sfx.shieldPop();
          impactRing(el, "#ffd147");
          spawnParticles(el, { n: 10, color: "#ffd147", spread: 60 });
          await sleep(500);
        }
        break;
      }
      case "revive": {
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🪶 ${name} ${t(L.reviveMsg)}`);
        if (el) {
          const hpEl = el.querySelector(".hp");
          if (hpEl) hpEl.textContent = "1";
          floatText(el, "🪶✨", true);
          Sfx.revive();
          impactRing(el, "#ff922b");
          spawnParticles(el, { n: 10, color: "#ff922b", emoji: "🪶", spread: 60 });
          await sleep(800);
        }
        break;
      }
      case "silence": {
        // Umlčaná príšerka: trvalý 🤫 badge + preškrtnutý text + log s menom.
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🤫 ${name} ${t(L.silencedMsg)}`);
        if (el) {
          el.classList.add("silenced");
          const badge = document.createElement("div");
          badge.className = "silence-badge";
          badge.textContent = "🤫";
          el.appendChild(badge);
          floatText(el, "🤫");
          Sfx.silence();
          impactRing(el, "#868e96");
          el.classList.add("proc");
          await sleep(900);
          el.classList.remove("proc");
        }
        break;
      }
      case "silenceFizzle": {
        log(t(L.silenceFizzleMsg));
        break;
      }
      case "aoeDmg": {
        // Veľká vlna: zasiahne všetkých nepriateľov NARAZ – žiadne projektily.
        const els = ev.hits.map(h => cardById(h.uid)).filter(Boolean);
        Sfx.spell("bolt");
        if (els[0]) boardWave(els[0].closest(".board"), "#ff7a1a");
        screenShake(1);
        els.forEach((el, i) => {
          el.classList.add("hit");
          // Zásahy rozfázované zľava doprava – vlna, nie jeden blik.
          floatText(el, `-${ev.n}`, false, i * 60 * ANIM);
          setTimeout(() => { impactRing(el, "#ff7a1a"); spawnParticles(el, { n: 5, color: "#ff7a1a", spread: 40 }); }, i * 60 * ANIM);
        });
        for (const h of ev.hits) {
          const el = cardById(h.uid);
          const hpEl = el && el.querySelector(".hp");
          if (hpEl) {
            hpEl.textContent = String(Math.max(0, h.hp));
            hpEl.classList.toggle("hurt", h.hp < Number(el.dataset.maxhp || Infinity));
          }
        }
        await sleep(650);
        for (const el of els) el.classList.remove("hit");
        break;
      }
      case "cleave": {
        // Ogrí Rozmach – susedia cieľa dostali ten istý úder.
        log(`${t(L.cleaveMsg)} (${ev.n} 💥)`);
        const els = ev.uids.map(u => cardById(u)).filter(Boolean);
        for (const el of els) { floatText(el, `-${ev.n} 💥`); el.classList.add("hit"); }
        Sfx.hit();
        await sleep(450);
        for (const el of els) el.classList.remove("hit");
        break;
      }
      case "fickle": {
        // Vrtkavá koža (O008): log s hodom – deti vidia, prečo iné číslo.
        log(`${ev.lucky ? "🍀" : "💢"} ${t(Cards.FICKLE_LABEL)}: ${ev.from} → ${ev.dmg}`);
        break;
      }
      case "backstab": {
        // Ogrí smolný roll sa mení na trvalú Pečať – hneď za ním ide futureBuff.
        Sfx.drunk();
        log(t(L.backstabMsg));
        await sleep(400);
        break;
      }
      case "futureBuff": {
        // Permanentná aura položená uprostred boja (U010 Pri smrti).
        Sfx.evolve();
        log(`${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]} +${ev.a}/+${ev.h}!`);
        break;
      }
      case "buff": {
        const el = cardById(ev.uid);
        if (el) {
          Sfx.buff();
          floatText(el, fmtBuff(ev.a, ev.h), true);
          // Prepíš čísla na karte, nech buff reálne vidno.
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) { atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a); atkEl.classList.add("buffed"); }
          if (hpEl && ev.h) { hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h); hpEl.classList.add("buffed"); }
          // Buff dvíha aj maxHp – zranenie (červená) sa nezamaskuje.
          if (ev.h) el.dataset.maxhp = String(Number(el.dataset.maxhp || 0) + ev.h);
          el.classList.add("evolving");
          await sleep(500);
          el.classList.remove("evolving");
        }
        break;
      }
      case "thorns": { // Roháč (Hmyz): Tŕne vrátia útočníkovi časť zranenia
        const el = cardById(ev.uid);
        if (el) { floatText(el, `🌵-${ev.n}`); await sleep(300); }
        break;
      }
      case "die": {
        const el = cardById(ev.uid);
        Sfx.die();
        if (el) {
          // mouseleave po remove() nepríde – zatvor preview padlej karty ručne.
          if (previewEl && previewEl._srcCard === el) hidePreview();
          spawnParticles(el, { n: 10, color: "#868e96", emoji: "💨", spread: 55 });
          el.classList.add("dying"); await sleep(fastAnim(el) ? 500 * FAST_ANIM : 500); el.remove();
        }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === MY ? $("myBoard") : $("oppBoard");
        const el = cardEl({
          uid: ev.uid, defId: ev.defId, rank: ev.rank || 1,
          atk: ev.atk ?? def.atk, hp: ev.hp ?? def.hp, maxHp: ev.hp ?? def.hp,
          taunt: !!def.taunt, swarmIn: true, // staty z engine už s rojom
        }, { owner: ev.pid });
        el.style.order = String(ev.slot ?? 0);
        row.appendChild(el);
        Sfx.summon();
        impactRing(el, "#4dabf7");
        spawnParticles(el, { n: 8, color: "#4dabf7", emoji: "✨", spread: 50 });
        await sleep(def.fastAnim ? 450 * FAST_ANIM : 450);
        break;
      }
      case "overflow": {
        // Token sa nezmestil – buff eventy hneď za ním ukážu, kto čo dostal.
        log(`${t(L.overflowMsg)} (+${ev.atk}/+${ev.hp})`);
        break;
      }
      case "drunkHit": {
        // Ogr sa ožratým úderom trafil sám – nápadný chaos moment.
        const el = cardById(ev.uid);
        log(`${t(L.drunkMsg)} ${ev.n} 💥`);
        if (el) {
          floatText(el, `🍺 -${ev.n}`);
          Sfx.drunk();
          el.classList.add("hit");
          setTimeout(() => el.classList.remove("hit"), 400);
          await sleep(600);
        }
        break;
      }
      case "ogreGamble": {
        // Ogrí hazard (O010, Pred bojom) – hod mincou; futureBuff (a pri
        // chvoste backstab) idú hneď za ním.
        const el = cardById(ev.uid);
        if (el) floatText(el, "🪙", true);
        const race = Cards.RACES_NOM[ev.race][I18N.lang];
        log(t(ev.heads ? L.ogreGambleWinMsg : L.ogreGambleLoseMsg)
          .replace("{race}", race).replace("{a}", ev.a).replace("{h}", ev.h));
        await sleep(400);
        break;
      }
      case "toDiscard": {
        // Karty z plochy padajú do kôpky – priebežne dvíhaj počítadlo.
        const box = ev.pid === MY ? $("myDiscardBox") : $("oppDiscardBox");
        const ct = box.querySelector(".ct");
        if (ct) ct.textContent = String((parseInt(ct.textContent, 10) || 0) + 1);
        break;
      }
      case "heroDmg": {
        const chip = ev.pid === MY ? $("myHero") : $("oppHero");
        Sfx.hero();
        screenShake(1.3);
        impactRing(chip, "#e03131");
        spawnParticles(chip, { n: 12, color: "#e03131", emoji: "💥", spread: 70 });
        floatText(chip, `-${ev.dmg}`);
        renderHero(chip, { ...state[ev.pid], hp: ev.hp });
        // Strop damage podľa kola: ukáž, koľko by bolo bez stropu.
        const capNote = ev.capped ? ` (${t(L.heroDmgCapMsg)} ${ev.capped}, bez stropu ${ev.raw})` : "";
        log(`${sideName(ev.pid)} ${t(L.heroDmgMsg)} 💥 ${ev.dmg}${capNote}${ev.shielded ? " – " + t(L.heroShieldBlockMsg) : ""}`);
        botTaunt(ev.pid === MY ? "win" : "lose", 0.8);
        lastBattleNote = ev.pid === MY
          ? `you WON the last battle, the human's hero took ${ev.dmg} damage (their HP: ${ev.hp})`
          : `you LOST the last battle, your hero took ${ev.dmg} damage (your HP: ${ev.hp})`;
        await sleep(700);
        break;
      }
      case "battleDraw":
        log(t(L.battleDraw));
        await sleep(500);
        break;
      case "heal": {
        // Liečivé víťazstvo (trinket) – jediné liečenie v boji.
        const chip = ev.pid === MY ? $("myHero") : $("oppHero");
        floatText(chip, `+${ev.n} ❤️`, true);
        log(`${sideName(ev.pid)} ${t(L.healWinMsg)} +${ev.n} ❤️`);
        await sleep(400);
        break;
      }
      case "trinketProc": {
        const x = L.trinkets[ev.id];
        if (x) log(`${sideName(ev.pid)} ${x.e} ${t(x)}`);
        if (ev.uid) { const el = cardById(ev.uid); if (el) floatText(el, x ? x.e : "🧿", true); }
        await sleep(300);
        break;
      }
      case "sabotage": {
        const m = watchOnly() ? null : sabotageMsg(ev);
        if (m) log(m);
        break;
      }
      case "petGift":
        if (ev.pid === MY && !watchOnly()) log(petGiftMsg(ev));
        break;
      case "gameOver":
        endBattleUI();
        return; // driveFlow ukáže výsledok
    }
  }
  await sleep(400);
  endBattleUI();
  if (Engine.isBossRound(state)) log(t(L.bossIntro));
}

// „Nekonečné" staty Strážcu arény (Engine.BOSS_STAT) sa píšu ako ∞.
const statNum = n => n >= 1e6 ? "∞" : String(n);

function endBattleUI() {
  $("stage").classList.remove("battle");
  const fb = $("fightBanner");
  fb.classList.add("hidden");
  fb.classList.remove("small");
}

function cardById(uid) {
  return document.querySelector(`.card[data-uid="${uid}"]`);
}

// ---------- Vizuálne efekty ----------
// Všetky efekty sú dočasné <div>y pripnuté na <body> (position: fixed),
// animované cez Web Animations API – nezávislé od prerenderu kariet.

const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// Farba + emoji + režim každého kúzla (fx.type). target = letí na vybranú
// príšerku, board = vlna cez celú vlastnú plochu, self = k hrdinovi/peniazom.
const SPELL_FX = {
  buffTarget:     { color: "#40c057", emoji: "✨", mode: "target" },
  petBuff:        { color: "#f783ac", emoji: "👋", mode: "target" },
  copyToDeck:     { color: "#4dabf7", emoji: "🪞", mode: "target" },
  transform:      { color: "#9775fa", emoji: "🎩", mode: "target" },
  swapDeck:       { color: "#3bc9db", emoji: "🌀", mode: "target" },
  buffAllFriends: { color: "#22b8cf", emoji: "🌊", mode: "board" },
  bolt:           { color: "#fcc419", emoji: "⚡", mode: "board", shake: 0.8 },
  hex:            { color: "#be4bdb", emoji: "🐸", mode: "board" },
  polymorph:      { color: "#e599f7", emoji: "🐑", mode: "board" },
  starPower:      { color: "#ffd147", emoji: "🌟", mode: "board", shake: 0.5 },
  silence:        { color: "#868e96", emoji: "🤫", mode: "board" },
  dmgBoost:       { color: "#ff922b", emoji: "⚡", mode: "self" },
  discover:       { color: "#4dabf7", emoji: "📖", mode: "self" },
  gold:           { color: "#ffd147", emoji: "🪙", mode: "money" },
  goldLater:      { color: "#ffd147", emoji: "💰", mode: "money" },
};

// Letiaci projektil zo stredu jednej karty do stredu druhej; farba podľa
// zdroja (výboj, bublina…), na dopade prstenec + iskry.
function shootProjectile(fromEl, toEl, color = "#ff7a1a") {
  return new Promise(resolve => {
    const a = center(fromEl.getBoundingClientRect()), b = center(toEl.getBoundingClientRect());
    const p = document.createElement("div");
    p.className = "projectile";
    p.style.left = a.x + "px";
    p.style.top = a.y + "px";
    p.style.setProperty("--fx", color);
    document.body.appendChild(p);
    const ms = 400 * ANIM;
    if (p.animate) {
      p.animate([
        { transform: "translate(0,0) scale(.6)", opacity: 0.6 },
        { transform: `translate(${(b.x - a.x) / 2}px, ${(b.y - a.y) / 2 - 30}px) scale(1.3)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(1)`, opacity: 1 },
      ], { duration: ms, easing: "cubic-bezier(.3,.1,.7,1)", fill: "forwards" });
    }
    setTimeout(() => {
      p.remove();
      impactRing(toEl, color);
      spawnParticles(toEl, { n: 7, color, spread: 50 });
      resolve();
    }, ms);
  });
}

// Emoji kúzla letí oblúkom z ruky na cieľ, cestou sa zväčší a rozžiari.
function flyEmoji(from, to, emoji, color, ms = 480) {
  ms *= ANIM;
  const a = center(from), b = center(to);
  const el = document.createElement("div");
  el.className = "cast-fx";
  el.textContent = emoji;
  el.style.left = a.x + "px";
  el.style.top = a.y + "px";
  el.style.setProperty("--fx", color);
  document.body.appendChild(el);
  const dx = b.x - a.x, dy = b.y - a.y;
  const lift = Math.max(70, Math.abs(dx) * 0.3);
  if (el.animate) {
    el.animate([
      { transform: "translate(-50%,-50%) scale(.4) rotate(-25deg)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - lift}px)) scale(1.7) rotate(8deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
    ], { duration: ms, easing: "cubic-bezier(.35,.1,.35,1)", fill: "forwards" });
  }
  return sleep(ms / ANIM).then(() => el.remove());
}

// Expandujúci prstenec na mieste zásahu.
function impactRing(el, color = "#ffd147") {
  if (REDUCED || !el) return;
  const r = el.getBoundingClientRect(), c = center(r);
  const d = document.createElement("div");
  d.className = "fx-ring";
  d.style.left = c.x + "px";
  d.style.top = c.y + "px";
  d.style.setProperty("--fx", color);
  d.style.setProperty("--sz", Math.max(r.width, r.height) * 0.9 + "px");
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 520 * ANIM);
}

// Iskry / emoji rozletené z karty do všetkých strán, padajú dole.
function spawnParticles(el, opts = {}) {
  if (REDUCED || !el) return;
  const { n = 8, color = "#ffd147", emoji = null, spread = 70 } = opts;
  const c = center(el.getBoundingClientRect());
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "fx-particle" + (emoji ? " emoji" : "");
    if (emoji) p.textContent = emoji;
    p.style.left = c.x + "px";
    p.style.top = c.y + "px";
    p.style.setProperty("--fx", color);
    document.body.appendChild(p);
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = spread * (0.6 + Math.random() * 0.8);
    const dur = (450 + Math.random() * 250) * ANIM;
    if (p.animate) {
      p.animate([
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 24}px)) scale(.15) rotate(${Math.random() * 180 - 90}deg)`, opacity: 0 },
      ], { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" });
    }
    setTimeout(() => p.remove(), dur + 60);
  }
}

// Krátky otras celej dosky (blesk, plošný útok, zásah hrdinu).
function screenShake(strength = 1) {
  if (REDUCED) return;
  const st = $("stage");
  if (!st || !st.animate) return;
  const m = 6 * strength;
  st.animate([
    { transform: "translate(0,0)" },
    { transform: `translate(${m}px, ${-m * 0.6}px)` },
    { transform: `translate(${-m}px, ${m * 0.5}px)` },
    { transform: `translate(${m * 0.5}px, ${m * 0.3}px)` },
    { transform: "translate(0,0)" },
  ], { duration: 280 * ANIM, easing: "ease-out" });
}

// Farebná vlna prebehne cez celú plochu (plošné kúzla, AoE výbuch).
function boardWave(boardEl, color) {
  if (REDUCED || !boardEl) return;
  const r = boardEl.getBoundingClientRect();
  const w = document.createElement("div");
  w.className = "fx-wave";
  w.style.left = r.left + "px";
  w.style.top = r.top + "px";
  w.style.width = r.width + "px";
  w.style.height = r.height + "px";
  w.style.setProperty("--fx", color);
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 650 * ANIM);
}

// Zoslanie kúzla v nákupnej fáze: emoji letí z ruky na cieľ, tam praskne.
// fromRect = pozícia karty v ruke ZACHYTENÁ pred prerenderom (karta zmizne).
async function playSpellCast(ev, fromRect) {
  const def = Cards.byId[ev.defId];
  if (!def || !def.fx) return;
  const fx = SPELL_FX[def.fx.type] || { color: "#ffd147", mode: "self" };
  const emoji = fx.emoji || def.emoji;
  const targetEl = ev.targetUid ? cardById(ev.targetUid) : null;
  const dest = targetEl
    || (fx.mode === "board" ? $("myBoard") : fx.mode === "money" ? $("moneyEl") : $("myHero"));
  Sfx.cast();
  await flyEmoji(fromRect || $("handEl").getBoundingClientRect(), dest.getBoundingClientRect(), emoji, fx.color);
  Sfx.spell(def.fx.type);
  if (fx.mode === "board") {
    boardWave(dest, fx.color);
    if (fx.shake) screenShake(fx.shake);
    const cards = [...dest.querySelectorAll(".card")];
    cards.forEach((c, i) => setTimeout(() => {
      impactRing(c, fx.color);
      spawnParticles(c, { n: 5, color: fx.color, emoji, spread: 45 });
    }, i * 60 * ANIM));
  } else {
    impactRing(dest, fx.color);
    spawnParticles(dest, { n: 10, color: fx.color, emoji, spread: 65 });
    if (targetEl) {
      targetEl.classList.add("evolving");
      setTimeout(() => targetEl.classList.remove("evolving"), 600 * ANIM);
      // Cielený buff nevracia „buff“ event – ukáž, čo príšerka dostala
      // (ev.a/ev.h už aj so Živelnou silou).
      const f = def.fx;
      const a = ev.a ?? f.a, h = ev.h ?? f.h;
      const tags = [f.taunt && "🛡️", f.shield && "😇", f.revive && "🪶", f.windfury && "🌪️", f.echo && "🔔", f.hunt && "🎯"].filter(Boolean);
      if (a || h) tags.unshift(fmtBuff(a, h));
      if (tags.length) floatText(targetEl, tags.join(" "), true);
    }
  }
}

// Rast v balíčku (Mravec, Hmyz): príšerka vyjde z balíčka, zelene
// sa buffne a vráti sa späť. Viac rastov ide za sebou (fronta).
let deckGrowQ = Promise.resolve();
function playDeckGrow(ev) {
  deckGrowQ = deckGrowQ.then(() => deckGrowFx(ev)).catch(e => console.warn("deckGrow animácia:", e));
}
async function deckGrowFx(ev) {
  // Odkiaľ karta vyjde: kôpka balíčka alebo odhodených (rast cieli obe).
  const stage = $("stage"), deck = $(ev.zone === "discard" ? "myDiscardBox" : "myDeckBox");
  const def = Cards.byId[ev.defId];
  if (!stage || !deck || !def) return;
  const rank = ev.rank || 1, m = Cards.STAT_MULT[rank];
  const atk = def.atk * m + (ev.pa ?? ev.a), hp = def.hp * m + (ev.ph ?? ev.h);
  // Pred buffom staré staty; swarmIn = roj sa nepripočíta (karta je v balíčku).
  const el = cardEl({ uid: "dg", defId: ev.defId, rank, atk: atk - ev.a, hp: hp - ev.h, maxHp: hp - ev.h, taunt: !!def.taunt, swarmIn: true }, { noPreview: true });
  el.classList.add("deck-grow-fx");
  const sr = stage.getBoundingClientRect();
  const d = center(deck.getBoundingClientRect());
  const dx = d.x - sr.left - sr.width / 2, dy = d.y - sr.top - sr.height / 2;
  stage.appendChild(el);
  const hidden = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.15)`;
  const shown = "translate(-50%,-50%) scale(1)";
  const fly = (from, to, o1, o2, ms) => el.animate
    ? el.animate([{ transform: from, opacity: o1 }, { transform: to, opacity: o2 }],
      { duration: ms * ANIM, easing: "cubic-bezier(.3,.1,.3,1)", fill: "forwards" }).finished
    : Promise.resolve();
  await fly(hidden, shown, 0, 1, 380);
  await sleep(120);
  // Buff: staty zozelenejú, iskry, +a/+h nad kartou.
  const a = el.querySelector(".atk"), h = el.querySelector(".hp");
  if (a) { a.textContent = statNum(atk); a.classList.add("buffed"); }
  if (h) { h.textContent = statNum(hp); h.classList.add("buffed"); }
  if (el.animate) el.animate([
    { transform: shown, filter: "brightness(1)" },
    { transform: "translate(-50%,-50%) scale(1.18)", filter: "brightness(1.5)" },
    { transform: shown, filter: "brightness(1)" },
  ], { duration: 500 * ANIM, easing: "ease-out" });
  Sfx.buff();
  impactRing(el, "#40c057");
  spawnParticles(el, { n: 10, color: "#40c057", spread: 70 });
  floatText(el, fmtBuff(ev.a, ev.h), true);
  await sleep(750);
  await fly(shown, hidden, 1, 0, 380);
  el.remove();
  impactRing(deck, "#40c057");
}

// Formát buff čísel so znamienkom – ogrí hod mincou môže byť aj záporný.
function fmtBuff(a, h) {
  const s = n => (n >= 0 ? `+${n}` : String(n));
  return `${s(a)}/${s(h)}`;
}

// Číslo/emoji vyskočí nad kartou; delay (ms) na rozfázovanie AoE zásahov.
function floatText(el, text, heal, delay = 0) {
  const f = document.createElement("div");
  f.className = "dmg-float" + (heal ? " heal" : "");
  f.textContent = text;
  f.style.setProperty("--tilt", (Math.random() * 16 - 8).toFixed(1) + "deg");
  if (delay) f.style.animationDelay = delay + "ms";
  el.appendChild(f);
  setTimeout(() => f.remove(), 800 * ANIM + delay);
}

// ---------- Vykresľovanie ----------
// Aktívne permanentné aury hráča (Pečate „všetky budúce X…“) ako text.
// Spoločný základ všetkých rás v hre (F008 futureAll) sa ukáže raz ako ⭐,
// rasy len zvyšok nad ním; Pečať jednej karty (Kráľovná → Včielky) s jej
// emoji; ⚡ Živelná sila, 🧟 nabité vyvolanie.
function auraText(p) {
  const rb = p.raceBuffs || {};
  const exp = state.exp || [];
  const allRaces = Object.keys(Cards.RACES).filter(r => !(Cards.EXP_RACES && Cards.EXP_RACES.has(r) && !exp.includes(r)));
  const common = allRaces.every(r => rb[r])
    ? { a: Math.min(...allRaces.map(r => rb[r].a)), h: Math.min(...allRaces.map(r => rb[r].h)) }
    : { a: 0, h: 0 };
  const parts = [];
  if (common.a || common.h) parts.push(`⭐+${common.a}/+${common.h}`);
  for (const [race, b] of Object.entries(rb)) {
    const a = b.a - common.a, h = b.h - common.h;
    if (a || h) parts.push(`${Cards.RACE_ICON[race]}+${a}/+${h}`);
  }
  for (const [id, b] of Object.entries(p.cardBuffs || {})) {
    if (b.a || b.h) parts.push(`${Cards.byId[id].emoji || "🃏"}+${b.a}/+${b.h}`);
  }
  if (p.dmgBoost) parts.push(`⚡+${p.dmgBoost}`);
  if (p.summonCharge) parts.push(`🧟+${p.summonCharge}`);
  return parts.join(" ");
}

// Pečate súpera vpravo hore (nad kôpkou) – vidno, ako mu rastie rasa.
function renderOppAura() {
  const el = $("oppAura");
  if (!el || !state) return;
  const txt = auraText(state[OPP]);
  el.classList.toggle("hidden", !txt);
  el.innerHTML = txt ? `<span class="lb">${t(L.oppImprints)}</span><span class="tx">${txt}</span>` : "";
}

function renderAll() {
  if (!state) return;
  hidePreview();
  renderBan();
  renderBanBox();
  renderTrinketOffer();
  renderHero($("oppHero"), state[OPP]);
  renderHero($("myHero"), state[MY]);
  renderCorner($("oppDeckBox"), "🂠", t(L.deck), state[OPP].deck.length);
  renderCorner($("oppDiscardBox"), "🗂", t(L.discardPile), state[OPP].discard.length);
  renderCorner($("myDiscardBox"), "🗂", t(L.discardPile), state[MY].discard.length);
  renderCorner($("myDeckBox"), "🂠", t(L.deck), state[MY].deck.length);
  // Počet všetkých kariet / minimum tieru (predaj a evolve pod ním nejdú).
  $("myDeckBox").title = t(L.deckMinTip).replace("{n}", Engine.cardCount(state[MY])).replace("{min}", Engine.deckMin(state[MY].tier));
  renderBoardList($("oppBoard"), state[OPP].board, false);
  renderBoardList($("myBoard"), state[MY].board, true);
  renderHand();
  renderShop();
  renderDiscover();
  renderDeckList();
  markTargeting();
  renderPovBtn();
}

// ---------- Môj balíček – zoznam vlastných kariet ----------
// PC: stĺpec vpravo od dosky na celú výšku (#deckDd), mobil: dialóg z ☰ menu
// (#deckOverlay). Riadok = miniatúra + meno (×počet); hover / podržanie
// ukáže veľkú kartu s popisom. Balíček je zoradený (tier, meno) – poradie
// ťahania sa neprezradí. Kôpka je druhá sekcia.
function deckRows(list) {
  const groups = new Map();
  for (const c of list) {
    const key = c.defId + "#" + c.rank;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { defId: c.defId, rank: c.rank, n: 1 });
  }
  const arr = [...groups.values()];
  arr.sort((a, b) => {
    const da = Cards.byId[a.defId], db = Cards.byId[b.defId];
    return (da.tier - db.tier) || (a.rank - b.rank) ||
      Cards.nameOf(da, a.rank, I18N.lang).localeCompare(Cards.nameOf(db, b.rank, I18N.lang));
  });
  return arr;
}

function fillDeckList(el) {
  el.innerHTML = "";
  const p = state[MY];
  const sections = [[t(L.deck), p.deck], [t(L.discardPile), p.discard]];
  let any = false;
  for (const [label, list] of sections) {
    if (!list.length) continue;
    any = true;
    const hdr = document.createElement("div");
    hdr.className = "hdr";
    hdr.textContent = `${label} · ${list.length}`;
    el.appendChild(hdr);
    for (const g of deckRows(list)) {
      const def = Cards.byId[g.defId];
      const m = Cards.STAT_MULT[g.rank];
      // Karty v balíčku/kôpke sú len { defId, rank } – pre náhľad postavíme
      // inštanciu so základnými statmi stupňa.
      const inst = def.spell
        ? { uid: "dk", defId: g.defId, rank: 1, spell: true }
        : { uid: "dk", defId: g.defId, rank: g.rank, atk: def.atk * m, hp: def.hp * m, maxHp: def.hp * m, taunt: !!def.taunt };
      const row = document.createElement("div");
      row.className = "deck-row";
      row.appendChild(cardEl(inst, { noPreview: true }));
      const stats = def.spell ? t(L.spellWord) : `⚔️${inst.atk} ❤️${inst.hp} · ${raceLine(def, g.rank)}`;
      const dn = document.createElement("span");
      dn.className = "dn";
      dn.innerHTML = `${Cards.nameOf(def, g.rank, I18N.lang)}${g.n > 1 ? ` <b>×${g.n}</b>` : ""}<span class="ds">${stats}</span>`;
      row.appendChild(dn);
      attachPreview(row, inst, {});
      el.appendChild(row);
    }
  }
  if (!any) el.innerHTML = `<div class="deck-empty">${t(L.deckEmpty)}</div>`;
}

function renderDeckList() {
  const dd = $("deckDdList"), ov = $("deckOvList");
  // stĺpec vpravo je len na PC (na mobile display:none → offsetParent null)
  if (!dd.classList.contains("hidden") && dd.offsetParent) fillDeckList(dd);
  if (!$("deckOverlay").classList.contains("hidden")) fillDeckList(ov);
}

// Hlavička stĺpca balíčka zbalí / rozbalí zoznam.
function toggleDeckDd() {
  const list = $("deckDdList");
  list.classList.toggle("hidden");
  if (!list.classList.contains("hidden") && state) fillDeckList(list);
}

function openDeckOverlay() {
  if (!state) return;
  fillDeckList($("deckOvList"));
  $("deckOverlay").classList.remove("hidden");
}

function renderCorner(el, icon, label, count) {
  el.innerHTML = `<span class="ic">${icon}</span><span class="lb">${label}</span><span class="ct">${count}</span>`;
}

// Tier hrdinu je veľké číslo na štíte s labkou uprostred bannera.
function renderHero(el, p) {
  // mená prichádzajú zo siete – do innerHTML len escapované
  const short = n => (n.length > 14 ? n.slice(0, 13) + "…" : n).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const hero = watchOnly()
    ? { emoji: "🧑", name: short(names[p.id] || p.id) }
    : p.id === MY
      ? { emoji: "🙂", name: t(L.heroYou) }
      : mode === "net"
        ? { emoji: "🧑", name: short(names[p.id] || t(L.heroFriend)) }
        : { emoji: "🤖", name: t(L.heroBot) };
  // Počas animácie boja active už ukazuje na nové kolo – peniaze ešte neukazuj.
  const gold = p.id === MY && state.active === MY && !busy ? ` · 🪙 ${p.money}` : "";
  // Trinkety hráča: ikonky za menom (ťuk = pripomenutie v logu); počas
  // súperovho Ogrieho kľúča (trinketOff = toto kolo) sú stlmené.
  const off = state && p.trinketOff === state.round;
  const tks = (p.trinkets || []).map(id => {
    const x = L.trinkets[id];
    return x ? `<button class="tk${off ? " off" : ""}" data-id="${id}" title="${t(x)}: ${t(x.d)}"><img src="${trinketArt(id)}" alt="${x.e}"></button>` : "";
  }).join("");
  el.innerHTML = `<span class="who">${hero.emoji} ${hero.name}${tks ? `<span class="trinkets">${tks}</span>` : ""}</span>` +
    `<span class="tier-shield">${p.tier}</span>` +
    `<span class="nums">❤️ ${Math.max(0, p.hp)}${gold}</span>`;
  for (const b of el.querySelectorAll(".tk")) {
    b.addEventListener("click", e => { e.stopPropagation(); showTrinketInfo(b.dataset.id, off); });
  }
  if (p.id === MY) renderRaceNote(p);
  else renderOppAura();
}

// Meno karty na páske: SVG text po miernom oblúku (#nmArc v index.html),
// vždy v jednom riadku. Písmo sa zmenšuje podľa skutočnej šírky mena
// (meraná canvasom, cache) – dlhé mená (Ancient Grove Guardian,
// Super-pohladkanie…) sa zmestia na rovnú časť pásky; zakrútené konce
// pásky sú tmavé a text by na nich zanikol. viewBox 124 × 20 = pomer boxu
// .nm, NAME_ROOM = šírka rovnej časti pásky v jednotkách viewBoxu.
const NAME_ROOM = 88;
const nameEm = new Map(); // meno → šírka v em (Georgia 800 + letter-spacing)
const nameCtx = document.createElement("canvas").getContext("2d");
function nameWidthEm(up) {
  if (!nameEm.has(up)) {
    nameCtx.font = '800 100px Georgia, "Times New Roman", serif';
    nameEm.set(up, nameCtx.measureText(up).width / 100 + up.length * 0.02);
  }
  return nameEm.get(up);
}
function nameArc(name) {
  const raw = String(name).toLocaleUpperCase(I18N.lang);
  const up = raw.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const fs = Math.min(11, NAME_ROOM / Math.max(1, nameWidthEm(raw))).toFixed(1);
  return `<svg viewBox="0 0 124 20" aria-hidden="true"><text font-size="${fs}" text-anchor="middle" dominant-baseline="central">` +
    `<textPath href="#nmArc" startOffset="50%">${up}</textPath></text></svg><span class="sr">${up}</span>`;
}

// Pravidlo rasy pod doskou hráča: rasa, ktorej má najviac kariet (aspoň
// RACE_NOTE_MIN, všetky zóny) a ktorá má pravidlo pre celú rasu (L.raceNote).
const RACE_NOTE_MIN = 3;
function renderRaceNote(p) {
  const el = $("myRaceNote");
  if (!el) return;
  const counts = {};
  for (const c of [...p.deck, ...p.discard, ...p.hand, ...p.board]) {
    const d = c && Cards.byId[c.defId];
    if (d && d.race && !d.token) counts[d.race] = (counts[d.race] || 0) + 1;
  }
  const race = Object.keys(L.raceNote)
    .filter(r => (counts[r] || 0) >= RACE_NOTE_MIN)
    .sort((a, b) => counts[b] - counts[a])[0];
  el.classList.toggle("hidden", !race);
  el.textContent = race ? t(L.raceNote[race]) : "";
}

// Ťuk na ikonku trinketu: veľký medailón s menom a popisom (na mobile je
// log skrytý, popis inak nevidno). Ťuk kdekoľvek zavrie; log dostane riadok.
function showTrinketInfo(id, off) {
  const x = L.trinkets[id];
  if (!x) return;
  document.querySelectorAll(".trinket-pop").forEach(el => el.remove());
  const pop = document.createElement("div");
  pop.className = "trinket-pop";
  pop.innerHTML = `<div class="box"><img src="${trinketArt(id)}" alt="${x.e}"><div class="nm">${t(x)}</div><div class="ds">${t(x.d)}</div>${off ? `<div class="off">${t(L.trinketOffMsg)}</div>` : ""}</div>`;
  pop.addEventListener("click", () => pop.remove());
  document.body.appendChild(pop);
  log(`${x.e} ${t(x)}: ${t(x.d)}${off ? " – " + t(L.trinketOffMsg) : ""}`);
}

// Art trinketu: okrúhly medailón s rámom (assets/trinkets/<id>.webp, 512 px).
// Trinkety bez ilustrácie majú dočasný medailón: rám + emoji
// (tools/trinket-placeholder.py). Alias = požičaný medailón iného trinketu.
const TRINKET_ART_ALIAS = {};
const trinketArt = id => `assets/trinkets/${TRINKET_ART_ALIAS[id] || id}.webp`;

// Ponuka trinketov (kolo 4 a 8): overlay s tromi kartami, len vo vlastnom ťahu.
function renderTrinketOffer() {
  const ov = $("trinketOverlay");
  const p = state && state[MY];
  const show = p && state.phase === "shop" && state.active === MY && p.trinketOffer && !busy && !watchOnly();
  if (!show) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  $("trinketTitle").textContent = t(L.trinketTitle);
  $("trinketMsg").textContent = t(L.trinketIntro);
  const row = $("trinketRow");
  row.innerHTML = "";
  for (const id of p.trinketOffer) {
    const x = L.trinkets[id];
    if (!x) continue;
    const btn = document.createElement("button");
    btn.className = "trinket-btn";
    btn.innerHTML = `<img class="ic" src="${trinketArt(id)}" alt="${x.e}"><span class="tb"><span class="nm">${t(x)}</span><span class="ds">${t(x.d)}</span></span>`;
    btn.addEventListener("click", () => {
      if (busy || !state[MY].trinketOffer) return;
      act(doAction("pickTrinket", id));
    });
    row.appendChild(btn);
  }
}
$("shieldBtn").addEventListener("click", () => act(doAction("useHeroShield")));

// mine = drag&drop; ownerPid (voliteľné) = koho boost/aury popisok ukáže.
// V boji je mine=false aj pre vlastnú plochu – owner treba poslať explicitne,
// inak by moje karty ukazovali súperov dmgBoost (Živelná sila) zeleno.
function renderBoardList(el, list, mine, ownerPid) {
  el.innerHTML = "";
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    const card = cardEl(inst, { owner: ownerPid || (mine ? MY : OPP) });
    // Rad je vycentrovaný (flex); poradie útoku zľava doprava drží CSS order.
    const slot = inst.slot ?? i;
    card.style.order = String(slot);
    card.dataset.slot = String(slot);
    if (mine) attachDrag(card, { type: "board", idx: i });
    el.appendChild(card);
  }
}

function renderHand() {
  const el = $("handEl");
  el.innerHTML = "";
  const p = state[MY];
  // Pevné pozície: minutá karta nechá medzeru, zvyšok sa nepreskladáva.
  const maxSlot = Math.max(4, ...p.hand.map((c, i) => c.slot ?? i));
  const bySlot = {};
  p.hand.forEach((inst, i) => { bySlot[inst.slot ?? i] = { inst, i }; });
  for (let s = 0; s <= maxSlot; s++) {
    if (!bySlot[s]) {
      const gap = document.createElement("div");
      gap.className = "card gap";
      el.appendChild(gap);
      continue;
    }
    const { inst, i } = bySlot[s];
    const card = cardEl(inst, { hand: true });
    card.dataset.hidx = i;
    card.style.setProperty("--i", el.querySelectorAll(".card:not(.gap)").length);
    attachDrag(card, { type: "hand", idx: i });
    el.appendChild(card);
  }
  // Desktop: ruka ako vejár (Hearthstone) – karty sa prekrývajú, CSS z --n
  // vypočíta prekryv a natočenie, hover kartu vysunie a zväčší.
  el.style.setProperty("--n", p.hand.length);
}

function renderShop() {
  const p = state[MY];
  const myTurn = state.active === MY && !busy && !watchOnly();
  $("moneyEl").textContent = `🪙 ${p.money}`;
  $("auraEl").textContent = auraText(p);
  const banner = $("turnBanner");
  const bossTag = Engine.isBossRound(state) ? ` · ${t(L.bossRoundTag)}` : "";
  if (watchOnly()) {
    // divák: kto práve nakupuje (menom)
    const who = state.active && (names[state.active] || state.active);
    banner.textContent = `${t(L.round)} ${state.round}${bossTag}${who ? ` · 🛒 ${who}` : ""}`;
    banner.className = state.active === MY ? "banner" : "banner enemy";
  } else if (state.active === MY) {
    banner.textContent = `${t(L.round)} ${state.round}${bossTag} · ${t(L.yourTurn)}`;
    banner.className = "banner";
  } else if (state.active === OPP) {
    banner.textContent = `${t(L.round)} ${state.round}${bossTag} · ${t(L.enemyTurn)}`;
    banner.className = "banner enemy";
  }

  const commons = $("commonsRow");
  commons.innerHTML = "";
  state.commons.forEach((defId, i) => {
    const card = cardEl(defId, { shop: true, owned: Bot.ownedCount(p, defId) });
    if (myTurn && p.money >= Engine.cardCost(defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "common", idx: i });
    } else card.classList.add("disabled");
    commons.appendChild(card);
  });

  const priv = $("privRow");
  priv.innerHTML = "";
  p.priv.forEach((s, i) => {
    const card = cardEl(s.defId, { shop: true, owned: Bot.ownedCount(p, s.defId) });
    if (s.frozen) card.classList.add("frozen");
    if (myTurn && p.money >= Engine.cardCost(s.defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "priv", idx: i });
    } else card.classList.add("disabled");
    priv.appendChild(card);
  });
  // Špeciálny slot na kúzlo – neberie miesto príšerám.
  if (p.spellShop) {
    const s = p.spellShop;
    const card = cardEl(s.defId, { shop: true });
    card.classList.add("spell-slot");
    if (s.frozen) card.classList.add("frozen");
    if (myTurn && p.money >= Engine.cardCost(s.defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "spell", idx: 0 });
    } else card.classList.add("disabled");
    priv.appendChild(card);
  }

  $("refreshBtn").textContent = `${t(L.refresh)} (${Engine.refreshCost(state)}🪙)`;
  $("refreshBtn").disabled = !myTurn || p.money < Engine.refreshCost(state);
  const allFrozen = p.priv.length > 0 && p.priv.every(s => s.frozen) &&
    (!p.spellShop || p.spellShop.frozen);
  $("freezeBtn").textContent = allFrozen ? t(L.unfreeze) : t(L.freeze);
  $("freezeBtn").classList.toggle("frozen-on", allFrozen);
  $("freezeBtn").disabled = !myTurn;
  const cost = Engine.upgradeCost(state, MY);
  $("tierBtn").textContent = cost === null ? `⭐ MAX` : `${t(L.tierUp)} (${cost}🪙)`;
  $("tierBtn").disabled = !myTurn || cost === null || p.money < cost;
  // Buyback: raz za ťah vráti poslednú predanú kartu (omyl pri ťahaní).
  const ls = p.lastSold;
  $("buyBackBtn").textContent = `${t(L.buyBack)}${ls ? ` (${ls.gain}🪙)` : ""}`;
  $("buyBackBtn").disabled = !myTurn || !ls || p.buyBackUsed || p.money < ls.gain;
  $("buyBackBtn").classList.toggle("hidden", !ls && !!p.buyBackUsed);
  // Štít hrdinu (trinket): tlačidlo kým je nepoužitý; po zapnutí ostáva
  // do konca kola ako „aktívny", potom zmizne.
  const sb = $("shieldBtn");
  const armed = !!p.heroShieldArmed;
  const hasShield = p.trinkets.includes("heroShield") && (!p.heroShieldUsed || armed);
  sb.classList.toggle("hidden", !hasShield);
  sb.classList.toggle("armed", armed);
  sb.innerHTML = `<img src="${trinketArt("heroShield")}" alt="🛡️"> ${t(armed ? L.heroShieldArmed : L.heroShieldBtn).replace("🛡️ ", "")}`;
  sb.disabled = !myTurn || armed || !Engine.hasTrinket(state, MY, "heroShield") || Engine.isBossRound(state);
  $("endTurnBtn").textContent = t(L.endTurn);
  $("endTurnBtn").disabled = !myTurn || !!state.pendingDiscover;
}

// inst: inštancia karty ALEBO defId (obchod). Karta = rám blank.png,
// art v oblúku, meno na páske, rasa · stupeň, text v boxe, staty v kruhoch.
function cardEl(instOrId, opts) {
  const isInst = typeof instOrId === "object";
  const defId = isInst ? instOrId.defId : instOrId;
  const def = Cards.byId[defId];
  const rank = isInst ? instOrId.rank : 1;
  const el = document.createElement("div");
  el.className = "card" + ((isInst ? instOrId.taunt : def.taunt) ? " taunt" : "");
  el.dataset.rank = rank;
  el.dataset.defid = defId;
  if (isInst) el.dataset.uid = instOrId.uid;
  // Trvalý bonus Živelnej sily majiteľa (opts.owner, default ja) – výboje,
  // výbuchy a „Pri útoku" bonus ukážu v popisku navýšené číslo (zeleno).
  const owner = state ? state[opts.owner || MY] : null;
  const boost = (owner && owner.dmgBoost) || 0;
  // Divoký úder (O009): rozsah podľa aktuálneho útoku inštancie (buffy ho posúvajú).
  const txOpts = isInst ? { atk: instOrId.atk } : {};
  // Roj (Hmyz): aktuálny bonus majiteľa do textu karty („teraz +X/+Y");
  // owner = aktuálne X v textoch hmyzu („X = Húsenice v balíčku: 4").
  if (def.swarm && owner) txOpts.swarm = Engine.swarmBonus(owner, def);
  if (owner && def.race === "insect") txOpts.owner = owner;
  const text = Cards.cardText(def, rank, I18N.lang, true, boost, txOpts);
  const plainText = Cards.cardText(def, rank, I18N.lang, false, boost, txOpts);
  const name = Cards.nameOf(def, rank, I18N.lang);
  const art = Cards.artOf(def, rank);
  // Príšery majú kompletnú kartu ako obrázok (rám + art); tier číslo sa
  // kreslí do modrého kryštálu vľavo hore. Kúzla/tokeny majú generický rám.
  let inner = `<span class="tier-tag">${def.boss ? "∞" : art ? def.tier : "⭐" + def.tier}</span>`;
  if (opts.shop) inner += `<span class="cost">🪙${Engine.cardCost(defId)}</span>`;
  // Koľko kópií už vlastníš (vrátane balíčka a kôpky) – kúpa tretej evolvne.
  // Kúzla sa neevolvujú, počítadlo by na nich zavádzalo.
  // Hmyz evolve nemá – ukáž počet kópií (roj), nie x/3.
  if (opts.owned && !def.spell) inner += def.noEvolve
    ? `<span class="owned hot">${opts.owned}×</span>`
    : `<span class="owned${opts.owned >= 2 ? " hot" : ""}">${Math.min(opts.owned, 2)}/3</span>`;
  if (art) {
    el.classList.add("full-art");
    if (def.spell) el.classList.add("spell-art"); // cena v kruhu dole, bez pilulky „Kúzlo"
    el.style.backgroundImage = `url("${art}")`;
  } else {
    inner += `<div class="em">${def.emoji}</div>`;
  }
  // Božský štít / Fénixovo pierko – trvalé badge, kým efekt drží.
  if (isInst && instOrId.shield) inner += `<span class="shield-badge">😇</span>`;
  if (isInst && instOrId.revive) inner += `<span class="revive-badge">🪶</span>`;
  if (isInst && instOrId.windfury) inner += `<span class="windfury-badge">🌪️</span>`;
  if (isInst && instOrId.echo) inner += `<span class="echo-badge">🔔</span>`;
  if (isInst && instOrId.hunt) inner += `<span class="hunt-badge">🎯</span>`;
  if (isInst && instOrId.cloneOf) inner += `<span class="clone-badge" title="${Cards.nameOf(Cards.byId[instOrId.cloneOf], 1, I18N.lang)}">🦋</span>`;
  // Obranca ako badge 🛡️ – aj keď ho dal Štít/Koreň (na karte to inak nie je
  // napísané) a aj na Mláďati; modrý rám sám o sebe deťom nestačil.
  if (isInst ? instOrId.taunt : def.taunt) inner += `<span class="taunt-badge">🛡️</span>`;
  // Páska s menom je na niektorých artoch nižšie (src/name-band.js).
  const band = art && typeof NAME_BAND !== "undefined" ? NAME_BAND[art.replace(/^.*\/|\.webp$/g, "")] : 0;
  inner += `<div class="nm"${band ? ` style="top:${(49.5 + band).toFixed(1)}%"` : ""}>${nameArc(name)}</div>`;
  if (!(art && def.spell)) inner += `<div class="race">${raceLine(def, rank)}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    // Roj (Hmyz): v ruke a na ploche ukáž staty už s rojom (engine ho
    // pripočíta až bojovej kópii). Bojové karty (snímka boja, vyvolané) ho
    // už majú – nesú swarmIn, nepripočítava sa druhýkrát.
    const sw = isInst && def.swarm && owner && !instOrId.swarmIn ? Engine.swarmBonus(owner, def) : { a: 0, h: 0 };
    const atk = (isInst ? instOrId.atk : def.atk) + sw.a;
    const hp = (isInst ? instOrId.hp : def.hp) + sw.h;
    // Buffnuté staty zelenou – vidno rozdiel oproti základu daného stupňa.
    // Zranená príšerka (hp < maxHp) má život červený; červená vyhráva.
    const baseAtk = def.atk * Cards.STAT_MULT[rank];
    const baseHp = def.hp * Cards.STAT_MULT[rank];
    const maxHp = isInst ? (instOrId.maxHp ?? instOrId.hp) + sw.h : def.hp;
    const hurt = isInst && hp < maxHp;
    el.dataset.maxhp = String(maxHp);
    inner += `<span class="atk${atk > baseAtk && !def.boss ? " buffed" : ""}">${statNum(atk)}</span>` +
      `<span class="hp${hurt ? " hurt" : hp > baseHp && !def.boss ? " buffed" : ""}">${statNum(hp)}</span>`;
  }
  el.innerHTML = inner;
  if (!opts.big && !opts.noPreview) {
    el.title = `${name}${plainText ? " – " + plainText : ""}`;
    attachPreview(el, instOrId, opts);
  }
  return el;
}

// Rasa úplne dole medzi útokom a životom. Stupeň sa nepíše –
// vidno ho podľa farby kryštálu na ráme karty.
function raceLine(def, rank) {
  if (def.spell) return t(L.spellWord);
  if (!def.race) return ""; // Strážca arény nemá rasu
  // Ikona rasy pred menom – rasu vidno na prvý pohľad aj na malej karte.
  return `${Cards.RACE_ICON[def.race] || ""} ${t(Cards.RACES[def.race])}`;
}

// ---------- Hover preview – zväčšená čitateľná karta ----------
let previewEl = null;

const HAND_FAN = window.matchMedia("(hover: hover)");
// Hover vo vejári ruky: zväčšená karta zakrýva susedov, preto sa vybraná karta
// určuje podľa x kurzora voči NEtransformovaným pozíciám (offsetLeft) – pásik
// karty siaha od jej ľavého okraja po ľavý okraj ďalšej karty.
// force = dotyk (mobil): prst položený na ruke listuje kartami ako hover.
function handHover(e, force = false) {
  const hand = $("handEl");
  const cards = [...hand.querySelectorAll(".card:not(.gap)")];
  let hit = null;
  if ((HAND_FAN.matches || force) && !drag && !targeting) {
    const x = e.clientX - hand.getBoundingClientRect().left;
    hit = cards.find((c, i) => x >= c.offsetLeft
      && x < (i + 1 < cards.length ? cards[i + 1].offsetLeft : c.offsetLeft + c.offsetWidth)) || null;
  }
  for (const c of cards) c.classList.toggle("hov", c === hit);
  // Zväčšená karta má rovnakú veľkosť ako náhľad (.preview-card, ~348 px
  // vysoká), nech vyzerá rovnako; aspoň 2.1×, najviac 60 % výšky okna.
  if (hit && hit.offsetHeight) {
    const h = hit.offsetHeight;
    hand.style.setProperty("--hov-s", Math.min(Math.max(2.1, PREVIEW_H / h), innerHeight * 0.6 / h).toFixed(2));
  }
}
const PREVIEW_H = 250 * 780 / 560; // výška .preview-card (šírka 250 px, pomer karty)
$("handEl").addEventListener("pointermove", e => handHover(e, !!(press && press.fan)));
$("handEl").addEventListener("pointerleave", () => $("handEl").querySelectorAll(".hov").forEach(c => c.classList.remove("hov")));
function attachPreview(card, instOrId, opts) {
  card._previewData = { instOrId, opts }; // pre long-press (mobil)
  card.addEventListener("mouseenter", () => {
    // Vejár ruky na desktope: karta sa zväčší sama (CSS hover), preview netreba.
    if (opts.hand && HAND_FAN.matches) return;
    if (!press) showPreview(card, instOrId, opts);
  });
  card.addEventListener("mouseleave", () => { if (!press) hidePreview(); });
  // Karty bez drag & dropu (súperov board, vypnutý obchod): podržanie = preview.
  card.addEventListener("pointerdown", e => {
    if (card._hasDrag) return; // rieši startDrag/press
    hidePreview();
    const timer = setTimeout(() => showPreview(card, instOrId, opts), 420);
    const up = () => { clearTimeout(timer); hidePreview(); };
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  });
}

// Funguje aj počas boja a ťahu súpera (busy) – hráč si chce prezrieť
// súperove príšery; blokuje ho len aktívne ťahanie karty.
function showPreview(card, instOrId, opts) {
  if (drag) return;
  hidePreview();
  const big = cardEl(instOrId, { ...opts, big: true });
  big.classList.add("preview-card");
  const info = statBreakdown(instOrId, opts);
  if (info) big.appendChild(info);
  document.body.appendChild(big);
  const r = card.getBoundingClientRect();
  const pw = big.offsetWidth, ph = big.offsetHeight;
  let x, y;
  if (window.innerWidth < 700) {
    // Mobil: preview na stred obrazovky, nech nikdy neutečie mimo.
    x = (window.innerWidth - pw) / 2;
    y = (window.innerHeight - ph) / 2;
  } else {
    // Desktop: napravo od karty; keď sa nezmestí, naľavo. Zvislo pri karte.
    x = r.right + 12;
    if (x + pw > window.innerWidth - 8) x = r.left - pw - 12;
    y = r.top + r.height / 2 - ph / 2;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - ph - 8));
  big.style.left = x + "px";
  big.style.top = y + "px";
  big._srcCard = card;
  previewEl = big;
}

function hidePreview() {
  if (previewEl) { previewEl.remove(); previewEl = null; }
}

// Súhrn statov príšerky pod preview kartou: Základ (karta × stupeň), Pečať
// (rasová aura majiteľa), Navždy (pa/ph – rast z pohladkaní, Po nákupe…),
// Dočasne (zvyšok do aktuálnych statov: kúzla, dračie buffy, boj), počet
// prijatých Pohladkaní. Hráč tak vidí, odkiaľ sa čísla vzali (hlásenie
// „všetci dostali buff" = Vodca svorky P009 na ploche). Len pre inštancie
// príšer (nie ponuka, nie kúzla). Zranenie = maxHp − hp.
function statBreakdown(instOrId, opts) {
  if (!state || typeof instOrId !== "object" || instOrId.spell) return null;
  const def = Cards.byId[instOrId.defId];
  if (!def || def.spell) return null;
  const owner = state[opts.owner || MY];
  const mult = Cards.STAT_MULT[instOrId.rank || 1] || 1;
  const baseA = def.atk * mult, baseH = def.hp * mult;
  let aura = { a: 0, h: 0 };
  if (owner && def.race && owner.raceBuffs) {
    // Dračia krv: drak berie súčet Pečatí všetkých rás.
    const all = def.race === "dragon" && Engine.hasTrinket(state, owner.id, "dragonBlood");
    for (const [race, b] of Object.entries(owner.raceBuffs)) {
      if (all || race === def.race) { aura.a += b.a; aura.h += b.h; }
    }
  }
  const pa = instOrId.pa || 0, ph = instOrId.ph || 0;
  const maxHp = instOrId.maxHp ?? instOrId.hp;
  const tempA = instOrId.atk - baseA - aura.a - pa;
  const tempH = maxHp - baseH - aura.h - ph;
  const dmg = maxHp - instOrId.hp;
  const T = L.statBreak;
  const rows = [`${t(T.base)} ${baseA}/${baseH}`];
  if (aura.a || aura.h) rows.push(`${t(Cards.IMPRINT)} ${fmtBuff(aura.a, aura.h)}`);
  if (pa || ph) rows.push(`${t(T.forever)} ${fmtBuff(pa, ph)}`);
  if (tempA || tempH) rows.push(`${t(T.temp)} ${fmtBuff(tempA, tempH)}`);
  if (instOrId.pets) rows.push(`${t(T.pets)}: ${instOrId.pets}`);
  if (dmg > 0) rows.push(`${t(T.damage)} −${dmg}`);
  if (rows.length <= 1) return null; // čistý základ – nič na vysvetľovanie
  const box = document.createElement("div");
  box.className = "info";
  box.innerHTML = rows.map(r => `<span>${r}</span>`).join("");
  return box;
}

// ---------- Drag & drop ----------
function attachDrag(card, src) {
  card._hasDrag = true;
  card.addEventListener("pointerdown", e => startDrag(e, card, src));
}

// Ťahanie začína až po pohybe > 8 px. Podržanie prsta bez pohybu ukáže
// zväčšenú kartu (mobilná náhrada za hover preview).
let press = null; // { card, src, x0, y0, canDrag, longTimer }

function startDrag(e, card, src) {
  if (drag || press) return;
  // Vejár ruky: klik patrí zväčšenej (.hov) karte, aj keď pod kurzorom
  // fyzicky leží susedná (vysunutá karta uvoľnila spodok svojho pásika).
  // Dotyk na ruke (mobil): prst kartu zväčší, posun do strán listuje,
  // ťah nahor ju chytí – ako Hearthstone na mobile (onPressMove).
  const fan = src.type === "hand" && e.pointerType !== "mouse";
  if (fan) handHover(e, true);
  if (src.type === "hand") {
    const hov = $("handEl").querySelector(".card.hov");
    if (hov && hov !== card) { card = hov; src = { type: "hand", idx: Number(hov.dataset.hidx) }; }
  }
  hidePreview();
  e.preventDefault();
  const canDrag = !busy && !watchOnly() && state && state.active === MY && !state.pendingDiscover;
  press = { card, src, x0: e.clientX, y0: e.clientY, canDrag, fan };
  if (!fan) press.longTimer = setTimeout(() => {
    if (press && !drag && card._previewData) {
      showPreview(card, card._previewData.instOrId, card._previewData.opts);
    }
  }, 420);
  window.addEventListener("pointermove", onPressMove);
  window.addEventListener("pointerup", onPressUp, { once: true });
}

function onPressMove(e) {
  if (drag) { moveGhost(e); return; }
  if (!press) return;
  if (press.fan) {
    // Listovanie rieši handHover (pointermove na ruke); ťah nahor = chyť
    // práve zväčšenú kartu.
    if (press.y0 - e.clientY > 24) {
      const hov = $("handEl").querySelector(".card.hov") || press.card;
      if (press.canDrag) beginDrag(e, hov, { type: "hand", idx: Number(hov.dataset.hidx) });
      press = null;
    }
    return;
  }
  if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 8) {
    clearTimeout(press.longTimer);
    hidePreview();
    if (press.canDrag) beginDrag(e, press.card, press.src);
    press = null;
  }
}

function onPressUp(e) {
  window.removeEventListener("pointermove", onPressMove);
  if (press) {
    if (press.fan) $("handEl").querySelectorAll(".hov").forEach(c => c.classList.remove("hov"));
    clearTimeout(press.longTimer); hidePreview(); press = null;
  }
  if (drag) endDrag(e);
}

// Zruš rozbehnuté ťahanie bez vykonania akcie (druhý prst = pinch zoom).
function cancelDrag() {
  window.removeEventListener("pointermove", onPressMove);
  if (press) { clearTimeout(press.longTimer); press = null; }
  hidePreview();
  if (drag) {
    drag.ghost.remove();
    drag.card.classList.remove("drag-src");
    markZones(drag.src, false);
    drag = null;
  }
}

// ---------- Pinch zoom: 2 prsty zväčšia a posúvajú dosku ----------
// Jeden prst ďalej normálne ťahá karty; položenie druhého prsta ťahanie
// zruší a začne zoom. Stiahnutie prstov späť pod 1× zoom celý resetne.
const zoomSt = { s: 1, tx: 0, ty: 0 };
const zoomPts = new Map(); // pointerId -> posledná poloha prsta
let pinch = null; // { d0, s0, c0x, c0y, ux, uy } – stred štipca drží miesto

function applyZoom() {
  const st = $("stage");
  if (zoomSt.s <= 1.02) {
    zoomSt.s = 1; zoomSt.tx = 0; zoomSt.ty = 0;
    st.style.transform = "";
  } else {
    st.style.transform = `translate(${zoomSt.tx}px, ${zoomSt.ty}px) scale(${zoomSt.s})`;
  }
}

$("gameScreen").addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  zoomPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (zoomPts.size !== 2) return;
  cancelDrag();
  const [a, b] = [...zoomPts.values()];
  const r = $("stage").getBoundingClientRect();
  // Stred dosky bez transformu (translate posúva aj stred rectu).
  const c0x = (r.left + r.right) / 2 - zoomSt.tx;
  const c0y = (r.top + r.bottom) / 2 - zoomSt.ty;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  pinch = {
    d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    s0: zoomSt.s, c0x, c0y,
    ux: (mx - c0x - zoomSt.tx) / zoomSt.s,
    uy: (my - c0y - zoomSt.ty) / zoomSt.s,
  };
});
window.addEventListener("pointermove", e => {
  if (!zoomPts.has(e.pointerId)) return;
  zoomPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || zoomPts.size < 2) return;
  const [a, b] = [...zoomPts.values()];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  zoomSt.s = Math.min(3, Math.max(1, pinch.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0)));
  zoomSt.tx = mx - pinch.c0x - zoomSt.s * pinch.ux;
  zoomSt.ty = my - pinch.c0y - zoomSt.s * pinch.uy;
  applyZoom();
});
function zoomPtUp(e) {
  zoomPts.delete(e.pointerId);
  if (zoomPts.size < 2) pinch = null;
}
window.addEventListener("pointerup", zoomPtUp);
window.addEventListener("pointercancel", zoomPtUp);

function beginDrag(e, card, src) {
  card.classList.remove("hov"); // ghost v bežnej veľkosti, nie zväčšený
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add("ghost");
  ghost.classList.remove("selected", "buyable");
  // Rozmer z layoutu (offset*), nie z rectu – karta v ruke je natočená a
  // môže byť ešte uprostred prechodu zo zväčšenia.
  const w = card.offsetWidth || r.width, h = card.offsetHeight || r.height;
  ghost.style.width = w + "px";
  ghost.style.height = h + "px";
  document.body.appendChild(ghost);
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  drag = { src, ghost, card, ox: clamp(e.clientX - r.left, w), oy: clamp(e.clientY - r.top, h) };
  card.classList.add("drag-src");
  markZones(src, true);
  moveGhost(e);
}

function moveGhost(e) {
  if (!drag) return;
  drag.ghost.style.left = (e.clientX - drag.ox) + "px";
  drag.ghost.style.top = (e.clientY - drag.oy) + "px";
}

function inRect(e, el) {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

// Zvýrazni platné ciele počas ťahania.
function markZones(src, on) {
  const set = (el, cls) => el.classList.toggle(cls, on);
  if (src.type === "common" || src.type === "priv" || src.type === "spell") {
    set($("handEl"), "drop-ok");
    set($("myBoard"), "drop-ok");
    return;
  }
  if (src.type === "board") {
    set($("shopPanel"), "drop-sell");
    set($("myDiscardBox"), "drop-ok"); // odhodenie do kôpky
    set($("myBoard"), "drop-ok"); // presun na iný slot
    return;
  }
  const inst = state[MY].hand[src.idx];
  if (!inst) return;
  set($("shopPanel"), "drop-sell");
  set($("myDiscardBox"), "drop-ok"); // odhodenie do kôpky
  const def = Cards.byId[inst.defId];
  if (inst.spell && TARGETED_SPELL.has(def.fx.type)) {
    $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
  } else {
    set($("myBoard"), "drop-ok");
    // Cielený battlecry (draci): karty na ploche svietia ako ciele –
    // drop na konkrétnu príšerku vyberie jej rasu, drop vedľa = fallback.
    if (!inst.spell && TARGETED_BATTLECRY.has(def.power?.fx?.type)) {
      $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
    }
  }
}

// Battlecry efekty, ktoré berú cieľ (draci) – drop na vlastnú príšerku.
const TARGETED_BATTLECRY = new Set(["buffRaceOf", "futureRaceOf", "discoverRace", "copyAbility", "replayBattlecry", "buffOne", "mirrorRace"]);
// Kúzla, ktoré sa hádžu na konkrétnu vlastnú príšerku.
const TARGETED_SPELL = new Set(["buffTarget", "petBuff", "copyToDeck", "transform", "swapDeck"]);

function endDrag(e) {
  const d = drag;
  drag = null;
  if (!d) return;
  d.ghost.remove();
  d.card.classList.remove("drag-src");
  markZones(d.src, false);
  const src = d.src;
  const p = state[MY];

  if (src.type === "common" || src.type === "priv" || src.type === "spell") {
    if (inRect(e, $("handEl")) || inRect(e, $("myBoard"))) {
      act(src.type === "common" ? doAction("buyCommon", src.idx)
        : src.type === "priv" ? doAction("buyPrivate", src.idx)
        : doAction("buySpell"));
    }
    return;
  }

  if (src.type === "board") {
    // Kôpka pred obchodom – jej menší rect sa prekrýva s rectom obchodu,
    // špecifickejší cieľ musí vyhrať (inak drop na kôpku omylom predá).
    if (inRect(e, $("myDiscardBox"))) { act(doAction("discardCard", "board", src.idx)); return; }
    if (inRect(e, $("shopPanel"))) { trySell("board", src.idx); return; }
    if (inRect(e, $("myBoard"))) {
      // Presun podľa miesta dropu: rad je vycentrovaný, tak sa slot určí
      // z pozícií vykreslených kariet (na kartu = výmena, vedľa = posun na kraj).
      const others = [...$("myBoard").querySelectorAll(".card")]
        .filter(c => !c.classList.contains("drag-src"))
        .map(c => {
          const r = c.getBoundingClientRect();
          return { x: r.left + r.width / 2, slot: Number(c.dataset.slot) };
        })
        .sort((a, b) => a.x - b.x);
      let slot;
      if (!others.length) slot = 0;
      else if (e.clientX < others[0].x - 40) slot = Math.max(0, others[0].slot - 1);
      else if (e.clientX > others[others.length - 1].x + 40) {
        slot = Math.min(Engine.BOARD_MAX - 1, others[others.length - 1].slot + 1);
      } else {
        // najbližšia karta pod kurzorom = výmena miest
        slot = others.reduce((best, o) =>
          Math.abs(o.x - e.clientX) < Math.abs(best.x - e.clientX) ? o : best).slot;
      }
      act(doAction("moveOnBoard", src.idx, slot));
    }
    return;
  }

  // src.type === "hand"
  const inst = p.hand[src.idx];
  if (!inst) { renderAll(); return; }
  if (inRect(e, $("myDiscardBox"))) { act(doAction("discardCard", "hand", src.idx)); return; }
  if (inRect(e, $("shopPanel"))) { trySell("hand", src.idx); return; }
  const hasTargets = p.board.some(Boolean);
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (!inRect(e, $("myBoard"))) return;
    if (TARGETED_SPELL.has(fx.type)) {
      // Cielené kúzlo: karta sa položí, kurzor = terč, klik na príšerku = cieľ.
      if (hasTargets) startTargeting(d, src.idx, "castSpell");
      return;
    }
    act(doAction("castSpell", src.idx));
    return;
  }
  if (inRect(e, $("myBoard"))) {
    // Cielený battlecry (draci): karta sa položí a cieľ sa vyberá terčom;
    // bez príšeriek na ploche (alebo na plnej ploche) sa zahrá bez cieľa.
    const def = Cards.byId[inst.defId];
    if (TARGETED_BATTLECRY.has(def.power?.fx?.type) && hasTargets && p.board.filter(Boolean).length < Engine.BOARD_MAX) {
      startTargeting(d, src.idx, "playMinion");
      return;
    }
    act(doAction("playMinion", src.idx));
  }
}

// ---------- Cielenie terčom (cielené kúzla, draci) ----------
// Karta položená na plochu čaká vedľa príšeriek, kurzor je terč (~2×2 cm).
// Ľavý klik na vlastnú príšerku = cieľ (efekt sa vykoná), pravý klik / Esc /
// ťuk na položenú kartu = karta sa vráti do ruky, efekt sa zruší.
let targeting = null; // { idx, action, placed, cursor }
let suppressCtx = false;
// Ťuk, ktorým sa cieľ vyberie, vyrobí po pointerup ešte „click" na tom istom
// mieste – tam sa medzitým otvorí discover (Shardnip) a klik by hneď vybral
// kartu, ktorú hráč ani nevidel (hlásenie z mobilu). Ten klik zahodíme.
let swallowClickUntil = 0;
window.addEventListener("click", e => {
  if (Date.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); swallowClickUntil = 0; }
}, true);

function startTargeting(d, idx, action) {
  const r = d.card.getBoundingClientRect();
  const br = $("myBoard").getBoundingClientRect();
  const placed = d.card.cloneNode(true);
  placed.classList.remove("drag-src", "selected", "buyable");
  placed.classList.add("ghost", "placed");
  const h = br.height * 0.9, w = h * r.width / r.height;
  placed.style.width = w + "px";
  placed.style.height = h + "px";
  placed.style.fontSize = parseFloat(getComputedStyle(d.card).fontSize) * h / r.height + "px";
  placed.style.left = (br.left - w * 0.55) + "px";
  placed.style.top = (br.top + (br.height - h) / 2) + "px";
  document.body.appendChild(placed);
  const cursor = document.createElement("div");
  cursor.className = "target-cursor";
  const g = d.ghost.getBoundingClientRect();
  cursor.style.left = (g.left + g.width / 2) + "px";
  cursor.style.top = (g.top + g.height / 2) + "px";
  document.body.appendChild(cursor);
  document.body.classList.add("targeting");
  targeting = { idx, action, placed, cursor };
  markTargeting();
}

// Po prerenderi znova: karta v ruke stlmená, príšerky svietia ako ciele.
function markTargeting() {
  if (!targeting) return;
  const hc = $("handEl").querySelector(`.card[data-hidx="${targeting.idx}"]`);
  if (hc) hc.classList.add("drag-src");
  $("myBoard").querySelectorAll(".card").forEach(c => c.classList.add("target-ok"));
}

function endTargeting() {
  const tg = targeting;
  if (!tg) return null;
  targeting = null;
  tg.placed.remove();
  tg.cursor.remove();
  document.body.classList.remove("targeting");
  $("myBoard").querySelectorAll(".card").forEach(c => c.classList.remove("target-ok"));
  return tg;
}

function cancelTargeting() {
  if (endTargeting()) renderAll();
}

window.addEventListener("pointermove", e => {
  if (!targeting) return;
  targeting.cursor.style.left = e.clientX + "px";
  targeting.cursor.style.top = e.clientY + "px";
});
// Capture: počas cielenia klik nezačne ťahanie ani iné akcie.
window.addEventListener("pointerdown", e => {
  if (!targeting) return;
  e.preventDefault();
  e.stopPropagation();
  targeting.cursor.style.left = e.clientX + "px";
  targeting.cursor.style.top = e.clientY + "px";
  if (e.button === 2) { suppressCtx = true; cancelTargeting(); return; }
  if (e.button !== 0) return;
  swallowClickUntil = Date.now() + 700;
  const el = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
  if (el) {
    const tg = endTargeting();
    act(doAction(tg.action, tg.idx, Number(el.dataset.uid)));
    return;
  }
  if (inRect(e, targeting.placed)) cancelTargeting();
}, true);
window.addEventListener("keydown", e => {
  if (targeting && e.key === "Escape") cancelTargeting();
});
// Pravý klik na zrušenie nesmie otvoriť kontextové menu.
window.addEventListener("contextmenu", e => {
  if (targeting || suppressCtx) { e.preventDefault(); suppressCtx = false; }
}, true);

// Predaj s vysvetlením, keď ho blokuje minimálny počet kariet tieru.
function trySell(zone, idx) {
  const p = state[MY], inst = p[zone][idx];
  if (inst && Engine.sellBlocked(state, p, inst)) {
    log(t(L.sellBlockedMsg).replace("{n}", Engine.cardCount(p)).replace("{min}", Engine.deckMin(p.tier)).replace("{tier}", p.tier));
    renderAll();
    return;
  }
  act(doAction("sellCard", zone, idx));
}

// ---------- Interakcie hráča ----------
let evolveWaitRound = 0;
function act(events) {
  endTargeting(); // iná akcia (napr. súper, časovač) ruší rozbehnuté cielenie
  if (!events) { renderAll(); return; }
  const hiddenEvolves = [];
  // Zoslané kúzlo: zapamätaj si, kde v ruke karta bola – renderAll ju
  // odstráni a animácia potrebuje štart letu.
  // Kniha (discover) nevracia „spell“ event, ale discoverStart – bez „play“
  // v tej istej dávke (draci majú discover ako battlecry) je to kúzlo.
  let spellEv = events.find(e => e.type === "spell" && e.pid === MY);
  if (!spellEv && events.some(e => e.type === "discoverStart" && e.pid === MY) && !events.some(e => e.type === "play")) {
    spellEv = { type: "spell", pid: MY, defId: "kniha" };
  }
  let castFrom = null;
  if (spellEv) {
    const src = [...$("handEl").querySelectorAll(".card")].find(c => c.dataset.defid === spellEv.defId);
    castFrom = (src || $("handEl")).getBoundingClientRect();
  }
  for (const ev of events) {
    if (ev.type === "evolve" && ev.pid === MY) {
      Sfx.evolve();
      log(`${t(L.youEvolve)} ${Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang)}`);
      if (ev.hidden) hiddenEvolves.push(Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang));
    }
    if (ev.type === "ban") {
      log(banResultMsg(ev)); showTauntBubble(banResultMsg(ev), 4000);
      if (state.races) log(racesMsg());
    }
    if ((ev.type === "buy" || ev.type === "sell") && ev.pid === MY) Sfx.coin();
    if (ev.type === "buyBack" && ev.pid === MY) { Sfx.coin(); log(t(L.buyBackMsg)); }
    if (ev.type === "trinketPick" && ev.pid === MY) {
      const x = L.trinkets[ev.id];
      Sfx.evolve();
      log(`${t(ev.auto ? L.trinketAuto : L.trinketPicked)} ${x.e} ${t(x)} – ${t(x.d)}`);
    }
    if (ev.type === "heroShieldArm" && ev.pid === MY) log(t(L.heroShieldArmMsg));
    if (ev.type === "trinketProc" && ev.pid === MY && ev.id === "ogreLuck") {
      const x = L.trinkets.ogreLuck;
      log(`${x.e} ${t(x)}: ${t(ev.heads ? L.ogreLuckDraw : L.ogreLuckImprint)}`);
    }
    if (ev.type === "sabotage") log(sabotageMsg(ev));
    if (ev.type === "toHand" && ev.pid === MY) log(t(L.pulledCopies));
    if (ev.type === "backstab" && ev.pid === MY) { Sfx.drunk(); log(t(L.backstabMsg)); }
    if (ev.type === "futureBuff" && ev.pid === MY) {
      Sfx.evolve();
      log(`${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]} +${ev.a}/+${ev.h}!`);
    }
    if (ev.type === "futureAllBuff" && ev.pid === MY) {
      Sfx.evolve();
      log(`⭐ ${t(L.allMinionsForever)} +${ev.a}/+${ev.h}!`);
    }
    // Psíci: Pohladkanie do balíčka / spojenie troch na vyšší stupeň.
    if (ev.type === "petGift" && ev.pid === MY) log(petGiftMsg(ev));
    if (ev.type === "replayNone" && ev.pid === MY) {
      log(`${Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang)} ${t(L.replayNoneMsg)}`);
    }
    if (ev.type === "replayAfterSpell" && ev.pid === MY) {
      log(`${t(L.replayAfterSpellMsg)}${ev.n > 1 ? " ×" + ev.n : ""}`);
    }
    if (ev.type === "replayBattlecry" && ev.pid === MY) {
      log(`${t(ev.random ? L.replayRandomMsg : L.replayBattlecryMsg)} ${Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang)}${ev.n > 1 ? " ×" + ev.n : ""}`);
      const el = cardById(ev.targetUid);
      if (el) floatText(el, "🌸", true);
    }
    // Trojica čaká na limit kariet – hlás raz za kolo, nech to nespamuje.
    if (ev.type === "evolveWait" && ev.pid === MY && evolveWaitRound !== state.round) {
      evolveWaitRound = state.round;
      log(t(L.evolveWaitMsg).replace("{n}", ev.count).replace("{min}", ev.min));
    }
    if (ev.type === "addPet" && ev.pid === MY) {
      log(`${t(L.addPetMsg)} ${ev.n > 1 ? ev.n + "× " : ""}${Cards.nameOf(Cards.byId.pet, ev.rank, I18N.lang)}`);
    }
    if (ev.type === "breed" && ev.pid === MY) { // Kobylka (Hmyz) sa vyliahla do balíčka
      log(`🦗 ${t(L.addPetMsg).replace(/^🐶 /, "")} ${Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang)}`);
    }
    if (ev.type === "mirror" && ev.pid === MY) { // Svätojánska muška (Hmyz): kópia do balíčka
      log(`🪞 ${t(L.addPetMsg).replace(/^🐶 /, "")} ${Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang)}`);
      const el = cardById(ev.uid);
      if (el) floatText(el, "🪞", true);
    }
    if (ev.type === "petMerge" && ev.pid === MY) {
      Sfx.evolve();
      log(`${t(L.petMergeMsg)} ${Cards.nameOf(Cards.byId.pet, ev.rank, I18N.lang)}`);
    }
  }
  renderAll();
  // Evolve animácia po prerenderi.
  for (const ev of events) {
    if ((ev.type === "evolve" || ev.type === "petMerge") && ev.uid) {
      const el = cardById(ev.uid);
      if (el) { el.classList.add("evolving"); spawnParticles(el, { n: 12, color: ev.type === "petMerge" ? "#f783ac" : "#ffd147", emoji: ev.type === "petMerge" ? "👋" : "⭐", spread: 80 }); }
    }
  }
  if (spellEv) playSpellCast(spellEv, castFrom);
  // Efekty schopností v nákupnej fáze (battlecry, Po nákupe, kúzla) – nech
  // hráč VIDÍ, že sa niečo stalo: proc badge, +a/+h nad kartou, log chárg.
  for (const ev of events) {
    if (ev.pid !== MY) continue;
    if (ev.type === "play" || (ev.type === "proc" && ev.kw === "afterSpell")) {
      const kw = ev.type === "play" ? "battlecry" : "afterSpell";
      const def = ev.type === "play" ? Cards.byId[ev.defId] : null;
      if (ev.type === "proc" || (def.power && def.power.kw === "battlecry")) {
        const el = cardById(ev.uid);
        if (el) {
          el.classList.add("proc");
          const badge = document.createElement("div");
          badge.className = "proc-badge";
          badge.textContent = Cards.KW_LABEL[kw][I18N.lang] + "!";
          el.appendChild(badge);
          Sfx.buff();
          setTimeout(() => { el.classList.remove("proc"); badge.remove(); }, 900);
        }
      }
    }
    if (ev.type === "buff" && ev.uid) {
      const el = cardById(ev.uid);
      if (el) {
        floatText(el, fmtBuff(ev.a, ev.h), true);
        spawnParticles(el, { n: 6, color: "#40c057", spread: 45 });
        el.classList.add("evolving");
        setTimeout(() => el.classList.remove("evolving"), 600);
      }
    }
    if (ev.type === "copyAbility" && ev.pid === MY) {
      const a = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang), b = Cards.nameOf(Cards.byId[ev.fromDefId], 1, I18N.lang);
      log(t(L.copyAbilityMsg).replace("{a}", a).replace("{b}", b));
      const el = cardById(ev.uid);
      if (el) floatText(el, "🦋", true);
    }
    // Ogrie chaos momenty – nápadne do logu (🪙/👹), nech je derp vidno.
    if (ev.type === "coinflip") {
      log(t(ev.heads ? L.coinHeadsMsg : L.coinTailsMsg));
      const el = cardById(ev.uid);
      if (el) floatText(el, "🪙", true);
    }
    if (ev.type === "deckGrow") playDeckGrow(ev);
    if (ev.type === "gold") floatText($("moneyEl"), `+${ev.n} 🪙`, true);
    if (ev.type === "heal") floatText($("myHero"), `+${ev.n} ❤️`, true);
    if (ev.type === "dmgBoost") log(t(L.chargeDmgMsg).replaceAll("{n}", ev.n).replace("{t}", ev.total));
    if (ev.type === "summonCharge") log(t(L.chargeSummonMsg).replace("{n}", ev.n));
    if (ev.type === "silencePending") log(t(L.silencePendingMsg));
    if (ev.type === "hexPending") log(t(L.hexPendingMsg));
    if (ev.type === "polymorphPending") log(t(L.polymorphPendingMsg));
    if (ev.type === "shrinkPending") log(t(L.shrinkPendingMsg));
    if (ev.type === "boltPending") log(t(L.boltPendingMsg));
    if (ev.type === "goldLater") log(t(L.goldLaterMsg).replace("{n}", ev.n));
    if (ev.type === "transform" || ev.type === "swapDeck") {
      const a = Cards.nameOf(Cards.byId[ev.fromDefId], 1, I18N.lang);
      const b = Cards.nameOf(Cards.byId[ev.toDefId], 1, I18N.lang);
      log(t(ev.type === "transform" ? L.transformMsg : L.swapDeckMsg).replace("{a}", a).replace("{b}", b));
    }
  }
  // Trojica zo skrytých kópií (balíček/kôpka) – ohlás popupom.
  if (hiddenEvolves.length) {
    $("evolveMsg").textContent = `${t(L.hiddenEvolve)} ${hiddenEvolves.join(", ")}!`;
    $("evolveOverlay").classList.remove("hidden");
  }
}

function renderDiscover() {
  const ov = $("discoverOverlay");
  const pd = state.pendingDiscover;
  // Počas animácie (busy) nie: odmena za DMG Meter vzniká v engine už pri
  // doBattle (nové kolo), overlay sa ukáže až po dohraní boja.
  if (!pd || pd.pid !== MY || busy || watchOnly()) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  $("discoverTitle").textContent = pd.boss ? `${t(L.bossRewardTitle)} ${pd.tier}` : t(L.discoverTitle);
  const row = $("discoverRow");
  row.innerHTML = "";
  pd.options.forEach((defId, i) => {
    const card = cardEl(defId, {});
    card.classList.add("buyable");
    card.addEventListener("click", () => act(doAction("pickDiscover", i)));
    row.appendChild(card);
  });
}

async function onEndTurn() {
  if (busy || watchOnly() || state.active !== MY || state.pendingDiscover) return;
  act(doAction("endShopTurn"));
  await deckGrowQ; // Mravce (Hmyz): rast v balíčku dohrá pred bojom
  await driveFlow();
}

function showOver() {
  const ov = $("overOverlay");
  ov.classList.remove("hidden");
  const w = state.winner;
  if (watchOnly()) {
    $("overTitle").textContent = w === "draw" ? t(L.drawGame) : `🏆 ${names[w] || w} ${t(L.specWon)}`;
    $("overMsg").textContent = `${t(L.round)}: ${state.round}`;
    if (botLoop) { reportBotResult(); Lobby.update(); setTimeout(newBotGame, BOT_LOOP_PAUSE); }
    return;
  }
  if (mode === "net") clearRejoin();
  if (w === MY) Sfx.win(); else if (w === OPP) Sfx.lose();
  $("overTitle").textContent = w === "draw" ? t(L.drawGame) : w === MY ? t(L.win) : t(L.lose);
  $("overMsg").textContent = `${t(L.round)}: ${state.round}`;
  // Claude mód: prehra hráča = záverečný výsmech priamo v okne výsledku.
  if (mode === "bot" && difficulty === "claude" && w === OPP) {
    ClaudeBot.chat({
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      text: "(system: the player just LOST the whole game to you – deliver your final victory gloat, rub it in)",
      history: chatHistory.slice(-6),
      gameSummary: `GAME OVER after round ${state.round}: YOU WON, the player's hero is at 0 HP (your HP: ${state[OPP].hp})`,
    }).then(roast => {
      if (roast && !$("overOverlay").classList.contains("hidden")) {
        const d = document.createElement("div");
        d.className = "over-roast";
        d.textContent = `🤖 ${roast}`;
        $("overMsg").appendChild(d);
      }
    }).catch(e => console.warn("Záverečný výsmech zlyhal:", e));
  }
}

// ---------- Log ----------
function log(msg) {
  const el = $("logEl");
  const d = document.createElement("div");
  d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 2) el.removeChild(el.firstChild);
}
function logClear() { $("logEl").innerHTML = ""; }

// ---------- Štart ----------
$("startBtn").addEventListener("click", startGame);
$("netBtn").addEventListener("click", startNet);
$("netCancel").addEventListener("click", backToPick);
$("rejoinBtn").addEventListener("click", () => startRejoin());
$("peerHostBtn").addEventListener("click", peerHost);
$("peerJoinBtn").addEventListener("click", peerJoin);
$("peerCodeInput").addEventListener("keydown", e => { if (e.key === "Enter") peerJoin(); });
$("newGameBtn").addEventListener("click", backToPick);
// ☰ menu (mobil v hre): hlavička je fixný overlay, ☰ ju otvára/zatvára;
// ťuk na hociktoré tlačidlo v nej alebo na tmavé pozadie ju zavrie.
$("menuBtn").addEventListener("click", () => document.querySelector("header").classList.toggle("open"));
document.querySelector("header").addEventListener("click", e => {
  if (e.target.tagName === "BUTTON" || e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});
// Môj balíček: desktop dropdown / mobilný dialóg (z ☰ menu – hlavička sa sama zavrie).
$("deckDdBtn").addEventListener("click", toggleDeckDd);
$("deckBtn").addEventListener("click", openDeckOverlay);
$("deckClose").addEventListener("click", () => { hidePreview(); $("deckOverlay").classList.add("hidden"); });
$("deckOverlay").addEventListener("click", e => { if (e.target === e.currentTarget) { hidePreview(); e.currentTarget.classList.add("hidden"); } });
// okno sa zväčšilo na PC rozloženie → stĺpec balíčka sa ukáže a treba ho naplniť
window.addEventListener("resize", () => { if (state) renderDeckList(); });
$("endTurnBtn").addEventListener("click", onEndTurn);
$("evolveOk").addEventListener("click", () => $("evolveOverlay").classList.add("hidden"));
$("refreshBtn").addEventListener("click", () => act(doAction("refreshShop")));
$("chatSend").addEventListener("click", sendChat);
$("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });
$("freezeBtn").addEventListener("click", () => { Sfx.freeze(); act(doAction("toggleFreezeAll")); });
$("tierBtn").addEventListener("click", () => act(doAction("upgradeTier")));
$("buyBackBtn").addEventListener("click", () => act(doAction("buyBack")));
$("overAgain").addEventListener("click", () => {
  $("overOverlay").classList.add("hidden");
  if (mode === "net" || botLoop) backToPick();
  else startGame();
});
$("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
function renderBotMute() {
  $("botMuteBtn").textContent = botMuted ? "🤐" : "💬";
  $("botMuteBtn").title = t(botMuted ? L.botMutedTitle : L.botMuteTitle);
}
renderBotMute();
$("botMuteBtn").addEventListener("click", () => {
  botMuted = !botMuted;
  try { localStorage.setItem("arena.botMuted", botMuted ? "1" : "0"); } catch (e) { /* bez úložiska */ }
  if (botMuted) document.querySelectorAll(".taunt-bubble:not(.mine)").forEach(b => b.remove());
  renderBotMute();
});
$("muteBtn").addEventListener("click", () => {
  $("muteBtn").textContent = Sfx.toggleMute() ? "🔇" : "🔊";
});

// ---------- Celá obrazovka (⛶) ----------
// Desktop + Android: Fullscreen API. iOS Safari API nemá – tlačidlo schováme
// a fullscreen tam rieši PWA („Pridať na plochu“, viď manifest.json).
// body.fs → CSS dá doske takmer celú výšku obrazovky.
const fsRoot = document.documentElement;
function fsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFsUi() {
  const standalone = navigator.standalone === true ||
    matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  document.body.classList.toggle("fs", fsActive() || standalone);
  $("fsBtn").textContent = fsActive() ? "🗗" : "⛶";
}
async function toggleFullscreen() {
  try {
    if (fsActive()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen).call(fsRoot);
    }
  } catch { /* prehliadač fullscreen odmietol – ostávame ako sme */ }
  updateFsUi();
}
if (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen) {
  $("fsBtn").addEventListener("click", toggleFullscreen);
} else {
  $("fsBtn").classList.add("hidden");
}
document.addEventListener("fullscreenchange", updateFsUi);
document.addEventListener("webkitfullscreenchange", updateFsUi);
updateFsUi();

// Dlhé podržanie na karte nesmie otvoriť natívne menu prehliadača
// („stiahnuť obrázok“) – long-press ukazuje preview karty.
document.addEventListener("contextmenu", e => {
  if (e.target.closest && e.target.closest(".card")) e.preventDefault();
});

// ---------- Práve prebiehajúce hry (úvodná obrazovka) ----------
// Adresár hier drží src/lobby.js (jeden z hráčov ako správca). Tabuľka vpravo:
// ťuk na riadok ukáže, kto hrá (mená, životy, tier), 👁 = sledovať ako divák.
let gamesList = null; // null = zoznam ešte neprišiel
let gamesOpen = null; // rozbalený kód
// Hostiteľ (peer transport) hlási svoju rozohranú hru.
function lobbyGame() {
  if (spectating || !state || fatalShown) return null;
  if (!botLoop && (mode !== "net" || state.phase === "over")) return null;
  const i = Net.info();
  if (i.transport !== "peer" || i.role !== "host" || !i.code) return null;
  return {
    code: i.code, names: [names.p1 || "?", names.p2 || "?"], round: state.round,
    hp: [Math.max(0, state.p1.hp), Math.max(0, state.p2.hp)], tier: [state.p1.tier, state.p2.tier],
    specs: i.specs, v: APP_V,
  };
}
function renderGames() {
  $("gamesTitle").textContent = t(L.gamesTitle);
  const box = $("gamesList");
  const note = txt => { box.innerHTML = ""; const d = document.createElement("div"); d.className = "games-empty"; d.textContent = txt; box.appendChild(d); };
  if (!Lobby.available()) return note(t(L.gamesOff));
  if (!gamesList) return note(t(L.gamesLoading));
  if (!gamesList.length) return note(t(L.gamesEmpty));
  box.innerHTML = "";
  for (const g of gamesList) {
    const open = gamesOpen === g.code;
    const row = document.createElement("div");
    row.className = "game-row" + (open ? " open" : "");
    const head = document.createElement("button");
    head.className = "game-head";
    // „meno vs. meno" – mená idú zo siete, preto textContent
    head.innerHTML = `<span class="gc"></span><span class="gr">${t(L.round)} ${g.round}</span><span class="gs">${g.specs ? "👁 " + g.specs : ""}</span><span class="gx">${open ? "▴" : "▾"}</span>`;
    head.querySelector(".gc").textContent = `${g.names[0] || "?"} vs. ${g.names[1] || "?"}`;
    head.title = `🎮 ${g.code}`;
    head.addEventListener("click", () => { gamesOpen = open ? null : g.code; renderGames(); });
    row.appendChild(head);
    if (open) {
      const det = document.createElement("div");
      det.className = "game-det";
      for (const i of [0, 1]) {
        const p = document.createElement("div");
        p.className = "gp";
        p.textContent = `🧑 ${g.names[i] || "?"}  ·  ❤️ ${g.hp[i]}  ·  ⭐ ${g.tier[i]}`;
        det.appendChild(p);
      }
      const same = g.v === APP_V;
      const btn = document.createElement("button");
      btn.className = "primary";
      btn.textContent = t(L.watchBtn);
      btn.disabled = !same;
      btn.addEventListener("click", () => startSpectate(g.code));
      det.appendChild(btn);
      if (!same) { const w = document.createElement("div"); w.className = "games-empty"; w.textContent = t(L.gamesOldVer); det.appendChild(w); }
      row.appendChild(det);
    }
    box.appendChild(row);
  }
}
function watchGames() {
  renderGames();
  Lobby.watch(list => {
    if ($("pickScreen").classList.contains("hidden")) return;
    gamesList = list;
    if (gamesOpen && !list.some(g => g.code === gamesOpen)) gamesOpen = null;
    renderGames();
  });
}
Lobby.setGame(lobbyGame);
Lobby.start({ peerOpts: Net.peerOpts });

// ---------- Boti hrajú dookola (index.html?botloop) ----------
// Na testovanie divákov: dvaja hard boti hrajú hru za hrou, stránka drží kód
// miestnosti len pre divákov a hra je stále v zozname „Práve sa hrá“.
// ?code=1234 = pevný kód. Bez okna: npm run botloop (headless Chrome/Edge).
const BOT_NAMES = ["Robo Bruno", "Robo Ferko", "Robo Zuzka", "Robo Maťo", "Robo Lili", "Robo Dodo", "Robo Kiko", "Robo Mia"];
const BOT_LOOP_PAUSE = 15000; // pauza medzi hrami (diváci vidia výsledok)
const randCode = () => String(1000 + Math.floor(Math.random() * 9000));
function startBotLoop() {
  botLoop = true;
  mode = "bot";
  difficulty = "hard"; // bez localStorage – hráčova voľba ostáva
  MY = "p1"; OPP = "p2";
  document.body.classList.add("spectating", "botloop");
  const want = new URLSearchParams(location.search).get("code");
  const host = code => Net.hostShow(code, {
    getSpectate: spectateData,
    onChat: (text, m) => say("spec", m.name, text, 7000),
    onSpectators: specsInfo,
    // kód už niekto má → iný kód
    onPeerError: kind => { if (kind === "unavailable-id" && botLoop) host(randCode()); },
  }, { v: APP_V });
  host(/^\d{4}$/.test(want || "") ? want : randCode());
  newBotGame();
}
// Výsledok hry botov do konzoly – tools/botloop.mjs ho cez DevTools protokol
// zapíše do data/botloop/results.jsonl (dáta na ladenie bota). Riadok má
// aj seed + akcie, takže ide prehrať: npm run replay -- <súbor>.jsonl <id>.
function reportBotResult() {
  const g = GameLog.current();
  if (!g || !state) return;
  const side = pid => {
    const p = state[pid];
    const counts = {};
    for (const x of p.board) { const r = Cards.byId[x.defId] && Cards.byId[x.defId].race; if (r) counts[r] = (counts[r] || 0) + 1; }
    const race = Bot.dominantRace(state, p);
    return {
      name: names[pid], race, raceName: race ? Cards.RACES_NOM[race].sk : null,
      hp: p.hp, tier: p.tier, boardRaces: counts,
      board: p.board.map(x => `${x.defId}:${x.rank || 1}(${x.atk}/${x.hp})`),
      trinkets: (p.trinkets || []).slice(),
    };
  };
  const res = {
    id: g.id, date: new Date().toISOString(), mode: "botloop", bot: "hygiene", v: APP_V,
    build: typeof APP_BUILD === "string" ? APP_BUILD : null,
    winner: state.winner, rounds: state.round, banned: state.banned || null, races: state.races || null,
    p1: side("p1"), p2: side("p2"),
    seed: g.seed, mut: false, ban: g.ban, trinkets: g.trinkets, raceCap: g.raceCap, exp: g.exp, actions: g.actions,
  };
  console.info("[arena-result]", JSON.stringify(res));
}
function newBotGame() {
  if (!botLoop) return;
  const pool = BOT_NAMES.slice();
  const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  names = { p1: a, p2: pool[Math.floor(Math.random() * pool.length)] };
  const seed = Math.floor(Math.random() * 2 ** 31);
  const meta = { ban: true, trinkets: true, raceCap: Engine.RACE_CAP, exp: null };
  state = Engine.newGame(Engine.seededRng(seed), null, meta);
  GameLog.start(seed, { mode: "botloop", mut: false, ...meta }, null, true);
  busy = false;
  enterGameScreen();
  setChat(true);
  chatAdd("sys", "", `🤖 ${names.p1} vs. ${names.p2}`);
  Net.showGame(names, spectateData());
  Lobby.update();
  if (state.phase !== "ban") act(Engine.startRound(state));
  driveFlow();
}

applyI18n();
renderRules();
renderPick();
renderHomeArt();
watchGames();
if (new URLSearchParams(location.search).has("botloop")) startBotLoop();
