// Zoznam práve prebiehajúcich hier (úvodná obrazovka → tabuľka vpravo).
// Hra cez kód miestnosti nemá vlastný server, preto adresár hier drží jeden
// z hráčov: kto prvý obsadí PeerJS ID LOBBY_ID, je „správca" (holder) a drží
// register v pamäti; ostatní sa naň pripoja ako klienti. Hostiteľ rozohranej
// hry posiela každých REG_EVERY ms info o hre (kód, mená, kolo, HP, tier,
// počet divákov), úvodná obrazovka si pýta zoznam. Keď správca odíde, ID sa
// uvoľní, niekto iný ho obsadí a hostitelia register do REG_EVERY obnovia.
// Len peer transport (LAN hra cez server.mjs sa tu nezobrazuje).

const Lobby = (() => {
  const LOBBY_ID = "zvieracia-arena-lobby-v1";
  const TTL = 35000;        // záznam bez obnovy vypadne
  const REG_EVERY = 10000;  // hostiteľ obnovuje svoju hru
  const PUSH_EVERY = 5000;  // správca posiela zoznam odberateľom
  const STALE = 16000;      // klient bez správy od správcu = správca je preč
  const MAX_GAMES = 50;

  // ---------- Register (čisté funkcie – testy) ----------
  const str = (s, n) => String(s == null ? "" : s).slice(0, n);
  const num = x => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);
  function clean(g) {
    if (!g || typeof g !== "object" || !/^\d{4}$/.test(String(g.code))) return null;
    const names = Array.isArray(g.names) ? g.names : [];
    const hp = Array.isArray(g.hp) ? g.hp : [];
    const tier = Array.isArray(g.tier) ? g.tier : [];
    return {
      code: String(g.code),
      names: [str(names[0], 24), str(names[1], 24)],
      round: num(g.round), hp: [num(hp[0]), num(hp[1])], tier: [num(tier[0]), num(tier[1])],
      specs: num(g.specs), v: str(g.v, 300),
    };
  }
  function upsert(reg, g, now) {
    const c = clean(g);
    if (!c) return false;
    if (!reg.has(c.code) && reg.size >= MAX_GAMES) return false;
    reg.set(c.code, { game: c, at: now });
    return true;
  }
  function prune(reg, now) {
    for (const [code, e] of reg) if (now - e.at > TTL) reg.delete(code);
  }
  const listOf = reg => [...reg.values()].map(e => e.game).sort((a, b) => b.round - a.round);

  // ---------- Spojenie ----------
  const reg = new Map();
  let peer = null, holderConn = null, role = null; // role: "holder" | "client" | null
  const conns = new Set(); // správca: pripojení klienti
  const subs = new Set();  // správca: klienti, ktorí chcú zoznam
  let started = false, lastSeen = 0, retryTimer = null;
  let getGame = () => null; // hostiteľ: info o rozohranej hre (alebo null)
  let onList = null;        // úvodná obrazovka: odber zoznamu
  let lastCode = null;      // naposledy registrovaný kód (unreg po konci hry)
  let optsFn = null;        // PeerJS options (TURN) z net.js

  const available = () => typeof Peer !== "undefined";

  function reset() {
    if (holderConn) { try { holderConn.close(); } catch {} holderConn = null; }
    for (const c of conns) { try { c.close(); } catch {} }
    conns.clear(); subs.clear();
    if (peer) { try { peer.destroy(); } catch {} peer = null; }
    role = null;
  }
  function retry(ms) {
    reset();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; claim(); }, ms + Math.random() * 1500);
  }

  async function popts() {
    try { return optsFn ? await optsFn() : {}; } catch { return {}; }
  }

  // Skús obsadiť ID správcu; keď je obsadené, pripoj sa k nemu ako klient.
  async function claim() {
    if (!started || peer) return;
    const po = await popts();
    if (!started || peer) return;
    const p = new Peer(LOBBY_ID, po);
    peer = p;
    p.on("open", () => {
      if (peer !== p) return;
      role = "holder";
      console.info("[arena] lobby: som správca zoznamu hier");
      tick();
    });
    p.on("connection", c => {
      conns.add(c);
      c.on("data", m => holderMsg(c, m));
      c.on("close", () => { conns.delete(c); subs.delete(c); });
      c.on("error", () => { conns.delete(c); subs.delete(c); });
    });
    p.on("disconnected", () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch {} } });
    p.on("error", err => {
      if (peer !== p) return;
      const kind = err && err.type;
      // ID má niekto iný (aj po návrate z pozadia) → buď jeho klientom
      if (kind === "unavailable-id") { reset(); joinHolder(); return; }
      if (kind === "network" || kind === "server-error" || kind === "socket-error") retry(8000);
    });
  }

  async function joinHolder() {
    if (!started || peer) return;
    const po = await popts();
    if (!started || peer) return;
    const p = new Peer(po);
    peer = p;
    p.on("open", () => {
      if (peer !== p) return;
      const c = p.connect(LOBBY_ID, { reliable: true });
      holderConn = c;
      c.on("open", () => {
        if (holderConn !== c) return;
        role = "client";
        lastSeen = Date.now();
        if (onList) c.send({ type: "sub", on: true });
        sendReg();
      });
      c.on("data", m => {
        if (holderConn !== c || !m || typeof m !== "object") return;
        lastSeen = Date.now();
        if (m.type === "games" && Array.isArray(m.games) && onList) onList(m.games.map(clean).filter(Boolean));
      });
      c.on("close", () => { if (holderConn === c) retry(500); });
      c.on("error", () => { if (holderConn === c) retry(500); });
    });
    p.on("disconnected", () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch {} } });
    p.on("error", err => {
      if (peer !== p) return;
      // správca medzitým odišiel → skús ID obsadiť sám
      retry(err && err.type === "peer-unavailable" ? 300 : 5000);
    });
    lastSeen = Date.now();
  }

  function holderMsg(c, m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "sub") { if (m.on) { subs.add(c); pushTo(c); } else subs.delete(c); }
    if (m.type === "reg") upsert(reg, m.game, Date.now());
    if (m.type === "unreg" && m.code) reg.delete(String(m.code));
  }
  function pushTo(c) { try { c.send({ type: "games", games: listOf(reg) }); } catch {} }

  // Hostiteľ: pošli (alebo u správcu rovno zapíš) info o svojej hre.
  function sendReg() {
    let g = null;
    try { g = getGame(); } catch {}
    if (!g && lastCode) {
      const code = lastCode;
      lastCode = null;
      if (role === "holder") reg.delete(code);
      else if (role === "client" && holderConn && holderConn.open) { try { holderConn.send({ type: "unreg", code }); } catch {} }
    }
    if (!g) return;
    lastCode = String(g.code);
    if (role === "holder") upsert(reg, g, Date.now());
    else if (role === "client" && holderConn && holderConn.open) { try { holderConn.send({ type: "reg", game: g }); } catch {} }
  }

  let regAt = 0;
  function tick() {
    if (!started) return;
    const now = Date.now();
    if (now - regAt >= REG_EVERY) { regAt = now; sendReg(); }
    if (role === "holder") {
      prune(reg, now);
      for (const c of subs) pushTo(c);
      if (onList) onList(listOf(reg));
    }
    // správca mlčí (uspatá záložka, výpadok) → znova od začiatku
    if (role === "client" && onList && now - lastSeen > STALE) retry(200);
    if (!peer && !retryTimer) claim();
  }
  const iv = setInterval(() => { if (started) tick(); }, PUSH_EVERY);
  if (iv && iv.unref) iv.unref(); // Node (testy) nesmie čakať na časovač

  function start(opts) {
    if (!available()) return false;
    if (opts && opts.peerOpts) optsFn = opts.peerOpts;
    if (started) return true;
    started = true;
    claim();
    return true;
  }
  // Úvodná obrazovka: fn(list) dostáva zoznam hier; null = odber vypnúť.
  function watch(fn) {
    onList = fn;
    if (role === "client" && holderConn && holderConn.open) {
      try { holderConn.send({ type: "sub", on: !!fn }); } catch {}
      lastSeen = Date.now();
    }
    if (fn && role === "holder") fn(listOf(reg));
  }
  // Hostiteľ: fn() vráti info o rozohranej hre alebo null; update() = pošli hneď.
  function setGame(fn) { getGame = fn || (() => null); }
  function update() { regAt = Date.now(); sendReg(); if (role === "holder" && onList) onList(listOf(reg)); }

  if (typeof window !== "undefined" && window.addEventListener) {
    // zavretie stránky: pusti ID správcu hneď, nech ho niekto prevezme
    window.addEventListener("pagehide", e => { if (!e.persisted && role === "holder") reset(); });
  }

  return {
    start, watch, setGame, update, available,
    _test: { clean, upsert, prune, listOf, TTL, MAX_GAMES },
  };
})();

if (typeof module !== "undefined") module.exports = Lobby;
