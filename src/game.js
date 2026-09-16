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

// ---------- Záznam hry (replay log) ----------
// Engine je deterministický: seed + sekvencia akcií = presný replay celej hry
// (tools/replay.mjs). Ukladá sa posledných 10 hier do localStorage.
// Pri hlásení chyby: otvor konzolu, zavolaj arenaLogSave() a pošli súbor.
const GameLog = (() => {
  const KEY = "arena.games";
  let cur = null;
  // actions (voliteľné): log prevzatý pri návrate do hry (rejoin) – záznam
  // pokračuje od miesta, kde preživší hráč skončil.
  function start(seed, meta, actions) {
    cur = { id: Date.now(), date: new Date().toISOString(), seed, ...meta, actions: (actions || []).slice() };
    persist();
  }
  function current() { return cur; }
  function push(actor, name, args) {
    if (!cur) return;
    cur.actions.push([actor, name, ...(args || [])]);
    persist();
  }
  function persist() {
    if (!cur) return;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || "[]").filter(g => g.id !== cur.id);
      all.push(cur);
      while (all.length > 10) all.shift();
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* plné/vypnuté úložisko – hra beží ďalej bez záznamu */ }
  }
  function dump() { try { return localStorage.getItem(KEY) || "[]"; } catch { return "[]"; } }
  return { start, push, dump, current };
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
function rebuildFromLog(seed, mut, ban, trinkets, actions) {
  const s = Engine.newGame(Engine.seededRng(seed), mut === false ? null : undefined, { ban: ban === true, trinkets: trinkets === true });
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

// Voľba „hrať bez mutácií" – checkbox na úvodnej obrazovke, pamätá sa
// v localStorage. V hre po sieti rozhoduje zakladateľ (flag ide v "start").
function mutsOn() { return $("mutToggle").checked; }
// Ban rasy: default ZAPNUTÝ, voľba sa pamätá; v hre po sieti rozhoduje zakladateľ.
function bansOn() { return $("banToggle").checked; }
// Trinkety: default ZAPNUTÉ, voľba sa pamätá; v hre po sieti rozhoduje zakladateľ.
function trinketsOn() { return $("trinketToggle").checked; }
try { $("trinketToggle").checked = localStorage.getItem("arena.trinkets") !== "0"; } catch { $("trinketToggle").checked = true; }
$("trinketToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.trinkets", trinketsOn() ? "1" : "0"); } catch {}
});
try { $("banToggle").checked = localStorage.getItem("arena.ban") !== "0"; } catch { $("banToggle").checked = true; }
$("banToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.ban", bansOn() ? "1" : "0"); } catch {}
});
// Default VYPNUTÉ – mutácia je opt-in („1" v localStorage = hráč si ju zapol).
try { $("mutToggle").checked = localStorage.getItem("arena.muts") === "1"; } catch { $("mutToggle").checked = false; }
$("mutToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.muts", mutsOn() ? "1" : "0"); } catch {}
});

// Verzia klienta = ?v= hashe skriptov z index.html. Keď sa hráčom líšia
// (zastaraná keš), determinizmus je stratený a hra by sa ticho rozišla.
const APP_V = [...document.querySelectorAll('script[src^="src/"]')]
  .map(el => (el.src.split("?v=")[1] || "")).join(".");

// Tvrdá chyba siete (desync / rozdielne verzie): oznám a ukonči hru,
// tiché pokračovanie by len prehlbovalo rozídený stav.
let fatalShown = false;
function showFatal(text, detail) {
  console.error("[arena] FATAL:", text, detail || "");
  if (fatalShown) return;
  fatalShown = true;
  Net.disconnect();
  clearRejoin();
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
const ANIM = REDUCED ? 0.5 : 1;
const sleep = ms => new Promise(r => setTimeout(r, ms * ANIM));

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("diffTitle").textContent = t(L.diffTitle);
  $("startBtn").textContent = t(L.play);
  $("netBtn").textContent = t(L.netBtn);
  $("netCancel").textContent = t(L.cancel);
  renderRejoinBtn();
  $("peerHostBtn").textContent = t(L.peerHost);
  $("mutToggleLbl").textContent = t(L.mutToggle);
  $("banToggleLbl").textContent = t(L.banToggle);
  $("trinketToggleLbl").textContent = t(L.trinketToggle);
  $("peerJoinBtn").textContent = t(L.peerJoin);
  $("newGameBtn").textContent = t(L.newGame);
  $("discoverTitle").textContent = t(L.discoverTitle);
  $("overAgain").textContent = t(L.again);
  $("deckBtn").textContent = t(L.deckView);
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
    b.textContent = t(L.diffs[d]);
    b.className = difficulty === d ? "active" : "";
    b.addEventListener("click", () => { difficulty = d; localStorage.setItem("arena.diff", d); renderPick(); });
    dbox.appendChild(b);
  }
  // Claude súper: API kľúč (BYO key – len localStorage) + profil hráča.
  const cs = $("claudeSetup");
  cs.classList.toggle("hidden", difficulty !== "claude");
  if (difficulty === "claude" && !cs.dataset.ready) {
    cs.dataset.ready = "1";
    $("claudeKey").value = localStorage.getItem("arena.apiKey") || "";
    $("claudeName").value = localStorage.getItem("arena.playerName") || "";
    $("claudeKey").addEventListener("input", e => localStorage.setItem("arena.apiKey", e.target.value.trim()));
    $("claudeName").addEventListener("input", e => localStorage.setItem("arena.playerName", e.target.value));
  }
  if (difficulty === "claude") {
    $("claudeKeyLabel").textContent = t(L.claudeKeyLabel);
    $("claudeNameLabel").textContent = t(L.claudeNameLabel);
    $("claudeName").placeholder = t(L.claudeNamePh);
    $("claudeKeyNote").textContent = t(L.claudeKeyNote);
  }
}

function startGame() {
  if (difficulty === "claude" && !(localStorage.getItem("arena.apiKey") || "").trim()) {
    alert(t(L.claudeNeedKey));
    $("claudeKey").focus();
    return;
  }
  if (difficulty === "claude" && !ClaudeBot.isAllowed(localStorage.getItem("arena.playerName"))) {
    alert(t(L.claudeNameGate));
    $("claudeName").focus();
    return;
  }
  mode = "bot";
  MY = "p1"; OPP = "p2";
  lastBattleNote = null;
  chatHistory = [];
  playerRoundActions = [];
  lastPlayerRound = [];
  // Chat políčko + uvítacia bublina („zase meškáš“) len v Claude móde.
  $("chatRow").classList.toggle("hidden", difficulty !== "claude");
  if (difficulty === "claude") {
    $("chatInput").placeholder = t(L.chatPh);
    const nm = (localStorage.getItem("arena.playerName") || "").trim();
    // Jazyk pozdravu per hráč (Adam vždy po slovensky), inak podľa UI.
    const gl = ClaudeBot.langFor(nm, I18N.lang);
    setTimeout(() => showTauntBubble((L.claudeGreeting[gl] || L.claudeGreeting.sk).replace("{n}", nm), 6000), 900);
  }
  // Seedovaný rng aj proti botovi – hra je plne deterministická a dá sa
  // replaynúť zo záznamu (GameLog + tools/replay.mjs).
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Hard/Claude bot štartuje so 70 HP (Bot.hpBonus) – replay to odvodí z difficulty v logu.
  state = Engine.newGame(Engine.seededRng(seed), mutsOn() ? undefined : null, { ban: bansOn(), trinkets: trinketsOn(), hpBonus: Bot.hpBonus(difficulty) });
  GameLog.start(seed, { mode: "bot", difficulty, mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn() });
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
  $("deckDdList").classList.add("hidden");
  logClear();
  renderMutator();
  renderBanBox();
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
  box.onclick = () => log(banResultMsg({ race: r, by: state.ban && state.ban.by }));
}

function banResultMsg(ev) {
  const by = ev.by ? ` (${t(ev.by === MY ? L.banByMe : L.banByOpp)})` : "";
  return `🚫 ${t(L.banResult)} ${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]}${by}`;
}

// Fáza BAN: overlay s trojicou rás pre mňa; po výbere čakáme na súpera.
function renderBan() {
  const ov = $("banOverlay");
  if (!state || state.phase !== "ban") { ov.classList.add("hidden"); return; }
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
      state = Engine.newGame(Engine.seededRng(msg.seed), msg.mut === false ? null : undefined, { ban: msg.ban === true, trinkets: msg.trinkets === true });
      GameLog.start(msg.seed, { mode: "net", you: msg.you, mut: msg.mut !== false, ban: msg.ban === true, trinkets: msg.trinkets === true });
      enterGameScreen();
      $("chatRow").classList.remove("hidden");
      $("chatInput").placeholder = t(L.chatPhNet);
      $("chatInput").value = "";
      saveRejoin();
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
    // Chat od kamaráta: bublina pri jeho hrdinovi + log (na mobile je log skrytý).
    onChat: text => {
      if (mode !== "net" || !state) return;
      log(`💬 ${t(L.heroFriend)}: ${text}`);
      showTauntBubble(text, 7000);
    },
    // Kamarát prepol aplikáciu: bublina visí, kým sa nevráti alebo nevyprší limit.
    onPeerAway: limit => {
      if (mode !== "net" || !state || state.phase === "over") return;
      const msg = t(L.netAway).replace("{s}", Math.round(limit / 1000));
      log(msg);
      showTauntBubble(msg, limit);
    },
    onPeerBack: () => {
      if (mode !== "net" || !state || state.phase === "over") return;
      log(t(L.netBack));
      showTauntBubble(t(L.netBack), 3000);
    },
    // ---- návrat do hry ----
    canRejoin: () => !!(state && state.phase !== "over" && !fatalShown),
    getRejoin: () => {
      const g = GameLog.current();
      return g ? { seed: g.seed, mut: g.mut !== false, ban: g.ban === true, trinkets: g.trinkets === true, actions: g.actions } : null;
    },
    // Preživší: kamarát sa vrátil, log odišiel, hráme ďalej.
    onRejoined: msg => {
      if (mode !== "net") return;
      $("netOverlay").classList.add("hidden");
      log(t(L.rejoinedMsg));
      showTauntBubble(t(L.rejoinedMsg), 3000);
      saveRejoin();
      if (msg.v !== APP_V) showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`);
    },
    // Vracajúci sa hráč: prehraj log a pokračuj.
    onRejoin: msg => {
      let s;
      try { s = rebuildFromLog(msg.seed, msg.mut, msg.ban, msg.trinkets, msg.actions); }
      catch (e) { fatalShown = false; showFatal(t(L.netDesync), e); return; }
      fatalShown = false;
      MY = msg.you;
      OPP = msg.you === "p1" ? "p2" : "p1";
      state = s;
      GameLog.start(msg.seed, { mode: "net", you: msg.you, mut: msg.mut !== false, ban: msg.ban === true, trinkets: msg.trinkets === true, rejoined: true }, msg.actions);
      playerRoundActions = [];
      lastPlayerRound = [];
      busy = false;
      remoteQueue = Promise.resolve();
      enterGameScreen();
      $("chatRow").classList.remove("hidden");
      $("chatInput").placeholder = t(L.chatPhNet);
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
  mode = "net";
  $("netOverlay").classList.remove("hidden");
  $("peerSetup").classList.add("hidden");
  $("netUrls").textContent = "";
  $("peerCode").textContent = "";
  $("netMsg").textContent = t(L.netConnecting);
  Net.connect(netHandlers(), { mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn(), v: APP_V });
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
  Net.hostPeer(code, netHandlers(), { mut: mutsOn(), ban: bansOn(), trinkets: trinketsOn(), v: APP_V });
}

function peerJoin() {
  const code = $("peerCodeInput").value.trim();
  if (!code) return;
  $("netMsg").textContent = t(L.netConnecting);
  Net.joinPeer(code, netHandlers(), { v: APP_V });
}

let remoteQueue = Promise.resolve();
async function applyRemote(msg) {
  if (!state || state.phase === "over" || mode !== "net" || fatalShown) return;
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
  Net.disconnect();
  clearRejoin();
  state = null;
  $("chatRow").classList.add("hidden");
  $("gameScreen").classList.add("hidden");
  $("newGameBtn").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("overOverlay").classList.add("hidden");
  $("banOverlay").classList.add("hidden");
  $("pickScreen").classList.remove("hidden");
}

// ---------- Herný tok ----------
async function driveFlow() {
  for (;;) {
    if (state.phase === "over") { renderAll(); showOver(); return; }
    if (state.phase === "ban") {
      // Bot si vyberie hneď (výber sa ukáže až po vylosovaní); hráč klikne
      // v overlayi – jeho pickBan hru rozbehne (startRound je v engine).
      if (mode === "bot" && !state.ban.picks[OPP]) {
        const race = Bot.pickBan(state, OPP);
        GameLog.push(OPP, "pickBan", [race]);
        const ev = Engine.pickBan(state, OPP, race);
        if (ev && ev.some(e => e.type === "ban")) { act(ev); continue; }
      }
      busy = false;
      renderAll();
      return; // čaká sa na výber rasy
    }
    if (state.phase === "battle") { await runBattle(); continue; }
    if (state.active === OPP) {
      if (mode === "bot") { await runBotTurn(); continue; }
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
// `mine` = bublina pri mojom hrdinovi (vlastná chatová správa), inak pri súperovi.
function showTauntBubble(text, ms, mine) {
  document.querySelectorAll(mine ? ".taunt-bubble.mine" : ".taunt-bubble:not(.mine)").forEach(b => b.remove());
  const el = document.createElement("div");
  el.className = mine ? "taunt-bubble mine" : "taunt-bubble";
  el.textContent = text;
  $("stage").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 450); }, ms || 3800);
}
function botTaunt(kind, chance) {
  if (mode !== "bot" || !state || state.phase === "over") return;
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

// ---------- Chat s Claudom (len Claude mód) ----------
// Hráč odpíše do políčka pod doskou, Claude reaguje bublinou – samostatný
// lacný request mimo ťahu. História ide aj do ťahových promptov (banter drží niť).
let chatHistory = []; // { who: "player" | "claude", text }
let chatBusy = false;
async function sendChat() {
  const inp = $("chatInput");
  const text = inp.value.trim();
  if (!text || !state) return;
  // Hra po sieti: správa ide súperovi (bublina u neho), u mňa bublina dole + log.
  if (mode === "net") {
    inp.value = "";
    Net.sendChat(text);
    log(`💬 ${t(L.heroYou)}: ${text}`);
    showTauntBubble(text, 3000, true);
    return;
  }
  if (chatBusy || difficulty !== "claude" || mode !== "bot") return;
  chatBusy = true;
  inp.value = "";
  $("chatSend").disabled = true;
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
    if (reply) { chatHistory.push({ who: "claude", text: reply }); showTauntBubble(reply, 7000); }
  } catch (e) {
    console.warn("Chat s Claudom zlyhal:", e);
  }
  chatBusy = false;
  $("chatSend").disabled = false;
}

async function runBotTurn() {
  busy = true;
  renderAll();
  if (difficulty === "claude") { await runClaudeTurn(); return; }
  botTaunt("turn", 0.3);
  await sleep(600);
  GameLog.push(OPP, "botTurn", [difficulty]);
  const events = Bot.botTurn(state, OPP, difficulty);
  await playOppEvents(events);
}

async function playOppEvents(events) {
  for (const ev of events) {
    const msg = oppEventMsg(ev);
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
  if (res.taunt) showTauntBubble(res.taunt, 6000);
  await playOppEvents(res.events);
}

function oppEventMsg(ev) {
  if (ev.type === "ban") return banResultMsg(ev);
  if (ev.type === "banPick" && ev.pid === OPP) return t(L.banOppPicked);
  if (ev.pid !== OPP) return null;
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
  // v sieťovej hre je súper človek, nie robot
  return mode === "net" ? msg.replace("🤖", "🧑") : msg;
}

// Ogrí kľúč: hod mincou za súperove trinkety (z pohľadu hráča).
function sabotageMsg(ev) {
  if (ev.pid === MY) return t(ev.heads ? L.sabotageHeads : L.sabotageTails);
  return ev.heads ? null : t(L.sabotagedMsg);
}

// ---------- Boj ----------
async function runBattle() {
  busy = true;
  // Kolo hráča skončilo – jeho akcie sa stávajú materiálom pre Clauda.
  lastPlayerRound = playerRoundActions.splice(0);
  // Snímka plôch a počítadiel pred bojom – doBattle stav zmení naraz
  // (kôpky, nové kolo, dotiahnutá ruka), animácia beží nad snímkou,
  // inak by čísla skákali dopredu už na začiatku boja.
  const snap = {
    p1: state.p1.board.map(x => ({ ...x })),
    p2: state.p2.board.map(x => ({ ...x })),
  };
  const pre = {
    p1: { deck: state.p1.deck.length, discard: state.p1.discard.length, hp: state.p1.hp },
    p2: { deck: state.p2.deck.length, discard: state.p2.discard.length, hp: state.p2.hp },
  };
  GameLog.push("_", "doBattle", []);
  const events = Engine.doBattle(state);
  renderAll();
  renderBoardList($("oppBoard"), snap[OPP], false, OPP);
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
  fb.textContent = t(L.fight);
  fb.classList.remove("hidden");
  await sleep(900);
  fb.classList.add("small");

  for (const ev of events) {
    switch (ev.type) {
      case "battleStart":
        log(`${t(L.fight)} ${ev.first === MY ? t(L.you) : t(L.opp)} ${t(L.begins)}.`);
        break;
      case "attack": {
        const a = cardById(ev.aUid), d = cardById(ev.dUid);
        if (a && d) {
          // Útočník priletí pred obrancu a zrazia sa.
          const ra = a.getBoundingClientRect(), rd = d.getBoundingClientRect();
          const dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
          const dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
          a.style.zIndex = "20";
          a.style.transition = "transform .35s ease-in";
          a.style.transform = `translate(${dx * 0.88}px, ${dy * 0.88}px) scale(1.08)`;
          await sleep(370);
          Sfx.hit();
          d.classList.add("hit");
          impactRing(d, "#ff6b6b");
          spawnParticles(d, { n: 6, color: "#ff6b6b", spread: 40 });
          if (ev.aDmg >= 6) screenShake(0.5);
          floatText(d, `${ev.aWild ? "🎲" : ""}-${ev.aDmg}`);
          if (ev.dDmg > 0) floatText(a, `${ev.dWild ? "🎲" : ""}-${ev.dDmg}`);
          // Divoký úder (O009): hodené číslo aj do logu – deti vidia, čo padlo.
          if (ev.aWild) log(`${t(L.wildMsg)}: ${ev.aDmg}`);
          if (ev.dWild) log(`${t(L.wildMsg)}: ${ev.dDmg}`);
          await sleep(480);
          a.style.transition = "transform .25s ease-out";
          a.style.transform = "";
          await sleep(300);
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
            hpEl.textContent = String(Math.max(0, ev.hp));
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
      case "lastStand": {
        // Verný až do konca (P009): sám proti jedinému – výhra boja, súper padne.
        const a = Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang);
        log(t(L.lastStandMsg).replace("{a}", a));
        const el = cardById(ev.uid);
        if (el) {
          floatText(el, "👑🐶", true);
          Sfx.evolve();
          impactRing(el, "#ffd147");
          spawnParticles(el, { n: 14, color: "#ffd147", emoji: "⭐", spread: 80 });
          screenShake(0.8);
          await sleep(900);
        }
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
      case "die": {
        const el = cardById(ev.uid);
        Sfx.die();
        if (el) {
          // mouseleave po remove() nepríde – zatvor preview padlej karty ručne.
          if (previewEl && previewEl._srcCard === el) hidePreview();
          spawnParticles(el, { n: 10, color: "#868e96", emoji: "💨", spread: 55 });
          el.classList.add("dying"); await sleep(500); el.remove();
        }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === MY ? $("myBoard") : $("oppBoard");
        const el = cardEl({
          uid: ev.uid, defId: ev.defId, rank: ev.rank || 1,
          atk: ev.atk ?? def.atk, hp: ev.hp ?? def.hp, maxHp: ev.hp ?? def.hp,
          taunt: !!def.taunt,
        }, { owner: ev.pid });
        el.style.order = String(ev.slot ?? 0);
        row.appendChild(el);
        Sfx.summon();
        impactRing(el, "#4dabf7");
        spawnParticles(el, { n: 8, color: "#4dabf7", emoji: "✨", spread: 50 });
        await sleep(450);
        break;
      }
      case "overflow": {
        // Token sa nezmestil – buff eventy hneď za ním ukážu, kto čo dostal.
        log(`${t(L.overflowMsg)} (+${ev.atk}/+${ev.hp})`);
        break;
      }
      case "reviveAs": {
        // U004: príšerka vstala ako n/n – prepíš staty na karte.
        const el = cardById(ev.uid);
        const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
        log(`${name} ${t(L.reviveAsMsg)} ${ev.atk}/${ev.hp}`);
        if (el) {
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl) atkEl.textContent = String(ev.atk);
          if (hpEl) { hpEl.textContent = String(ev.hp); hpEl.classList.remove("hurt"); }
          el.dataset.maxhp = String(ev.hp);
          floatText(el, "🦋✨", true);
          Sfx.evolve();
          await sleep(800);
        }
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
        log(`${ev.pid === MY ? t(L.you) : t(L.opp)} ${t(L.heroDmgMsg)} 💥 ${ev.dmg}${capNote}${ev.shielded ? " – " + t(L.heroShieldBlockMsg) : ""}`);
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
        log(`${ev.pid === MY ? t(L.you) : t(L.opp)} ${t(L.healWinMsg)} +${ev.n} ❤️`);
        await sleep(400);
        break;
      }
      case "trinketProc": {
        const x = L.trinkets[ev.id];
        if (x) log(`${ev.pid === MY ? t(L.you) : t(L.opp)} ${x.e} ${t(x)}`);
        if (ev.uid) { const el = cardById(ev.uid); if (el) floatText(el, x ? x.e : "🧿", true); }
        await sleep(300);
        break;
      }
      case "sabotage": {
        const m = sabotageMsg(ev);
        if (m) log(m);
        break;
      }
      case "gameOver":
        endBattleUI();
        return; // driveFlow ukáže výsledok
    }
  }
  await sleep(400);
  endBattleUI();
}

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
      const tags = [f.taunt && "🛡️", f.shield && "😇", f.revive && "🪶", f.windfury && "🌪️"].filter(Boolean);
      if (a || h) tags.unshift(fmtBuff(a, h));
      if (tags.length) floatText(targetEl, tags.join(" "), true);
    }
  }
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
  renderBoardList($("oppBoard"), state[OPP].board, false);
  renderBoardList($("myBoard"), state[MY].board, true);
  renderHand();
  renderShop();
  renderDiscover();
  renderDeckList();
}

// ---------- Môj balíček – zoznam vlastných kariet ----------
// Desktop: dropdown vpravo vedľa dosky (#deckDd), mobil: dialóg z ☰ menu
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
  positionDeckDd();
  const dd = $("deckDdList"), ov = $("deckOvList");
  if (!dd.classList.contains("hidden")) fillDeckList(dd);
  if (!$("deckOverlay").classList.contains("hidden")) fillDeckList(ov);
}

// Dropdown sedí vpravo tesne vedľa dosky; keď sa tam nezmestí (úzke okno),
// prilepí sa k pravému okraju nad dosku.
function positionDeckDd() {
  const dd = $("deckDd"), stage = $("stage");
  if (!stage.offsetWidth) return;
  // Voľné miesto vpravo od dosky: dropdown sa zúži až na 150 px; keď ani
  // to nestačí, prekryje pravý okraj dosky.
  const avail = window.innerWidth - stage.getBoundingClientRect().right - 16;
  const fits = avail >= 150;
  dd.style.width = (fits ? Math.min(240, avail) : 240) + "px";
  dd.style.left = fits ? (stage.offsetLeft + stage.offsetWidth + 10) + "px" : "auto";
  dd.style.right = fits ? "auto" : "6px";
  dd.style.top = stage.offsetTop + "px";
}

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
  const hero = p.id === MY
    ? { emoji: "🙂", name: t(L.heroYou) }
    : mode === "net"
      ? { emoji: "🧑", name: t(L.heroFriend) }
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
const trinketArt = id => `assets/trinkets/${id}.webp`;

// Ponuka trinketov (kolo 4 a 8): overlay s tromi kartami, len vo vlastnom ťahu.
function renderTrinketOffer() {
  const ov = $("trinketOverlay");
  const p = state && state[MY];
  const show = p && state.phase === "shop" && state.active === MY && p.trinketOffer && !busy;
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
    const card = cardEl(inst, {});
    attachDrag(card, { type: "hand", idx: i });
    el.appendChild(card);
  }
}

function renderShop() {
  const p = state[MY];
  const myTurn = state.active === MY && !busy;
  $("moneyEl").textContent = `🪙 ${p.money}`;
  // Aktívne permanentné aury („všetky budúce X…“). Spoločný základ všetkých
  // rás (F008 futureAll) sa ukáže raz ako ⭐, rasy len zvyšok nad ním.
  const rb = p.raceBuffs || {};
  const allRaces = Object.keys(Cards.RACES);
  const common = allRaces.every(r => rb[r])
    ? { a: Math.min(...allRaces.map(r => rb[r].a)), h: Math.min(...allRaces.map(r => rb[r].h)) }
    : { a: 0, h: 0 };
  const auraParts = [];
  if (common.a || common.h) auraParts.push(`⭐+${common.a}/+${common.h}`);
  for (const [race, b] of Object.entries(rb)) {
    const a = b.a - common.a, h = b.h - common.h;
    if (a || h) auraParts.push(`${Cards.RACE_ICON[race]}+${a}/+${h}`);
  }
  $("auraEl").textContent = auraParts.join(" ") + (p.dmgBoost ? ` ⚡+${p.dmgBoost}` : "") +
    (p.summonCharge ? ` 🧟+${p.summonCharge}` : "");
  const banner = $("turnBanner");
  if (state.active === MY) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.yourTurn)}`;
    banner.className = "banner";
  } else if (state.active === OPP) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.enemyTurn)}`;
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
  const armed = p.heroShieldRound === state.round;
  const hasShield = p.trinkets.includes("heroShield") && (!p.heroShieldUsed || armed);
  sb.classList.toggle("hidden", !hasShield);
  sb.classList.toggle("armed", armed);
  sb.innerHTML = `<img src="${trinketArt("heroShield")}" alt="🛡️"> ${t(armed ? L.heroShieldArmed : L.heroShieldBtn).replace("🛡️ ", "")}`;
  sb.disabled = !myTurn || armed || !Engine.hasTrinket(state, MY, "heroShield");
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
  const txOpts = isInst ? { atk: instOrId.atk } : undefined;
  const text = Cards.cardText(def, rank, I18N.lang, true, boost, txOpts);
  const plainText = Cards.cardText(def, rank, I18N.lang, false, boost, txOpts);
  const name = Cards.nameOf(def, rank, I18N.lang);
  const art = Cards.artOf(def, rank);
  // Príšery majú kompletnú kartu ako obrázok (rám + art); tier číslo sa
  // kreslí do modrého kryštálu vľavo hore. Kúzla/tokeny majú generický rám.
  let inner = `<span class="tier-tag">${art ? def.tier : "⭐" + def.tier}</span>`;
  if (opts.shop) inner += `<span class="cost">🪙${Engine.cardCost(defId)}</span>`;
  // Koľko kópií už vlastníš (vrátane balíčka a kôpky) – kúpa tretej evolvne.
  // Kúzla sa neevolvujú, počítadlo by na nich zavádzalo.
  if (opts.owned && !def.spell) inner += `<span class="owned${opts.owned >= 2 ? " hot" : ""}">${Math.min(opts.owned, 2)}/3</span>`;
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
  // Obranca ako badge 🛡️ – aj keď ho dal Štít/Koreň (na karte to inak nie je
  // napísané) a aj na Mláďati; modrý rám sám o sebe deťom nestačil.
  if (isInst ? instOrId.taunt : def.taunt) inner += `<span class="taunt-badge">🛡️</span>`;
  // Pohladkanie má dlhé mená stupňov (Super-pohladkanie, Mega-pohladkanie…)
  // – do bannera sa zmestia len v jednom riadku menším písmom, inak sa
  // zalomia cez rám a orežú. Písmo sa zmenšuje s dĺžkou mena.
  const nmStyle = def.pet ? ` style="font-size:${Math.min(0.82, 7.4 / name.length).toFixed(2)}em;white-space:nowrap;letter-spacing:0"` : "";
  inner += `<div class="nm"${nmStyle}>${name}</div>`;
  if (!(art && def.spell)) inner += `<div class="race">${raceLine(def, rank)}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    const atk = isInst ? instOrId.atk : def.atk;
    const hp = isInst ? instOrId.hp : def.hp;
    // Buffnuté staty zelenou – vidno rozdiel oproti základu daného stupňa.
    // Zranená príšerka (hp < maxHp) má život červený; červená vyhráva.
    const baseAtk = def.atk * Cards.STAT_MULT[rank];
    const baseHp = def.hp * Cards.STAT_MULT[rank];
    const maxHp = isInst ? (instOrId.maxHp ?? hp) : def.hp;
    const hurt = isInst && hp < maxHp;
    el.dataset.maxhp = String(maxHp);
    inner += `<span class="atk${atk > baseAtk ? " buffed" : ""}">${atk}</span>` +
      `<span class="hp${hurt ? " hurt" : hp > baseHp ? " buffed" : ""}">${hp}</span>`;
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
  // Ikona rasy pred menom – rasu vidno na prvý pohľad aj na malej karte.
  return `${Cards.RACE_ICON[def.race] || ""} ${t(Cards.RACES[def.race])}`;
}

// ---------- Hover preview – zväčšená čitateľná karta ----------
let previewEl = null;

function attachPreview(card, instOrId, opts) {
  card._previewData = { instOrId, opts }; // pre long-press (mobil)
  card.addEventListener("mouseenter", () => { if (!press) showPreview(card, instOrId, opts); });
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
  hidePreview();
  e.preventDefault();
  const canDrag = !busy && state && state.active === MY && !state.pendingDiscover;
  press = { card, src, x0: e.clientX, y0: e.clientY, canDrag };
  press.longTimer = setTimeout(() => {
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
  if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 8) {
    clearTimeout(press.longTimer);
    hidePreview();
    if (press.canDrag) beginDrag(e, press.card, press.src);
    press = null;
  }
}

function onPressUp(e) {
  window.removeEventListener("pointermove", onPressMove);
  if (press) { clearTimeout(press.longTimer); hidePreview(); press = null; }
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
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add("ghost");
  ghost.classList.remove("selected", "buyable");
  ghost.style.width = r.width + "px";
  ghost.style.height = r.height + "px";
  document.body.appendChild(ghost);
  drag = { src, ghost, card, ox: e.clientX - r.left, oy: e.clientY - r.top };
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
const TARGETED_BATTLECRY = new Set(["buffRaceOf", "futureRaceOf", "discoverRace", "evolveTarget", "reviveAs", "buffOne"]);
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
    if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "board", src.idx)); return; }
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
  if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "hand", src.idx)); return; }
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (TARGETED_SPELL.has(fx.type)) {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) act(doAction("castSpell", src.idx, Number(targetEl.dataset.uid)));
      return;
    }
    if (inRect(e, $("myBoard"))) act(doAction("castSpell", src.idx));
    return;
  }
  if (inRect(e, $("myBoard"))) {
    // Cielený battlecry (draci): drop priamo na vlastnú príšerku = cieľ.
    const def = Cards.byId[inst.defId];
    if (TARGETED_BATTLECRY.has(def.power?.fx?.type)) {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) { act(doAction("playMinion", src.idx, Number(targetEl.dataset.uid))); return; }
    }
    act(doAction("playMinion", src.idx));
  }
}

// ---------- Interakcie hráča ----------
function act(events) {
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
    if (ev.type === "ban") { log(banResultMsg(ev)); showTauntBubble(banResultMsg(ev), 4000); }
    if ((ev.type === "buy" || ev.type === "sell") && ev.pid === MY) Sfx.coin();
    if (ev.type === "buyBack" && ev.pid === MY) { Sfx.coin(); log(t(L.buyBackMsg)); }
    if (ev.type === "trinketPick" && ev.pid === MY) {
      const x = L.trinkets[ev.id];
      Sfx.evolve();
      log(`${t(ev.auto ? L.trinketAuto : L.trinketPicked)} ${x.e} ${t(x)} – ${t(x.d)}`);
    }
    if (ev.type === "heroShieldArm" && ev.pid === MY) log(t(L.heroShieldArmMsg));
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
    if (ev.type === "addPet" && ev.pid === MY) {
      log(`${t(L.addPetMsg)} ${ev.n > 1 ? ev.n + "× " : ""}${Cards.nameOf(Cards.byId.pet, ev.rank, I18N.lang)}`);
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
    if (ev.type === "reviveAsMark") {
      const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
      log(`${name} ${t(L.reviveAsMarkMsg)} ${ev.n}/${ev.n}`);
      const el = cardById(ev.uid);
      if (el) floatText(el, "🦋", true);
    }
    // Ogrie chaos momenty – nápadne do logu (🪙/👹), nech je derp vidno.
    if (ev.type === "coinflip") {
      log(t(ev.heads ? L.coinHeadsMsg : L.coinTailsMsg));
      const el = cardById(ev.uid);
      if (el) floatText(el, "🪙", true);
    }
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
  if (!pd || pd.pid !== MY) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
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
  if (busy || state.active !== MY || state.pendingDiscover) return;
  act(doAction("endShopTurn"));
  await driveFlow();
}

function showOver() {
  const ov = $("overOverlay");
  ov.classList.remove("hidden");
  if (mode === "net") clearRejoin();
  const w = state.winner;
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
window.addEventListener("resize", () => { if (state) positionDeckDd(); });
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
  if (mode === "net") backToPick();
  else startGame();
});
$("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
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

applyI18n();
renderRules();
renderPick();
