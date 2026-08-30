// Sieťová vrstva. Dva transporty, rovnaký protokol (replikácia akcií):
//   1. WebSocket na lokálny server.mjs – LAN, automatické párovanie.
//   2. PeerJS (WebRTC) – P2P s kódom miestnosti, funguje aj z GitHub Pages
//      (signaling cez verejný PeerJS cloud, potom priamo prehliadač–prehliadač).
// Keď lokálny WS server nebeží, UI dostane onPeerMode a prepne na kód miestnosti.

const Net = (() => {
  let ws = null;
  let peer = null;   // PeerJS inštancia
  let conn = null;   // PeerJS dátové spojenie
  let handlers = {};
  let transport = null; // "ws" | "peer"

  const PEER_PREFIX = "zvieracia-arena-";

  function dispatch(msg) {
    if (typeof msg === "string") {
      try { msg = JSON.parse(msg); } catch { return; }
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "waiting" && handlers.onWaiting) handlers.onWaiting(msg);
    if (msg.type === "start" && handlers.onStart) handlers.onStart(msg);
    if (msg.type === "action" && handlers.onAction) handlers.onAction(msg);
    if (msg.type === "peerLeft" && handlers.onPeerLeft) handlers.onPeerLeft(msg);
  }

  // ---------- WebSocket (lokálny server) ----------
  function connect(h) {
    handlers = h;
    transport = "ws";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let opened = false;
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
      transport = null;
      if (handlers.onPeerMode) handlers.onPeerMode();
      return;
    }
    ws.addEventListener("open", () => { opened = true; });
    ws.addEventListener("message", e => dispatch(e.data));
    ws.addEventListener("close", () => {
      if (!opened) {
        // server nebeží (napr. GitHub Pages) – prepni na kód miestnosti
        ws = null;
        transport = null;
        if (handlers.onPeerMode) handlers.onPeerMode();
      } else if (handlers.onPeerLeft) {
        handlers.onPeerLeft({});
      }
    });
  }

  // ---------- PeerJS (kód miestnosti) ----------
  function peerAvailable() {
    return typeof Peer !== "undefined";
  }

  function wireConn(c) {
    conn = c;
    c.on("data", dispatch);
    c.on("close", () => { if (handlers.onPeerLeft) handlers.onPeerLeft({}); });
    c.on("error", () => { if (handlers.onPeerLeft) handlers.onPeerLeft({}); });
  }

  // Založí hru: čaká na kamaráta na kóde miestnosti. Hostiteľ je p1
  // a po pripojení pošle seed.
  function hostPeer(code, h) {
    handlers = h;
    transport = "peer";
    destroyPeer();
    peer = new Peer(PEER_PREFIX + code);
    peer.on("open", () => { if (handlers.onWaiting) handlers.onWaiting({ code }); });
    peer.on("connection", c => {
      wireConn(c);
      c.on("open", () => {
        const seed = Math.floor(Math.random() * 2 ** 31);
        c.send({ type: "start", seed, you: "p2" });
        dispatch({ type: "start", seed, you: "p1" });
      });
    });
    peer.on("error", err => {
      if (handlers.onPeerError) handlers.onPeerError(err && err.type);
    });
  }

  // Pripojí sa na hru s daným kódom.
  function joinPeer(code, h) {
    handlers = h;
    transport = "peer";
    destroyPeer();
    peer = new Peer();
    peer.on("open", () => {
      const c = peer.connect(PEER_PREFIX + code, { reliable: true });
      wireConn(c);
    });
    peer.on("error", err => {
      if (handlers.onPeerError) handlers.onPeerError(err && err.type);
    });
  }

  function sendAction(name, args) {
    const msg = { type: "action", name, args };
    if (transport === "ws" && ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    if (transport === "peer" && conn && conn.open) conn.send(msg);
  }

  function destroyPeer() {
    if (conn) { try { conn.close(); } catch {} conn = null; }
    if (peer) { try { peer.destroy(); } catch {} peer = null; }
  }

  function disconnect() {
    handlers = {};
    if (ws) { try { ws.close(); } catch {} ws = null; }
    destroyPeer();
    transport = null;
  }

  return { connect, hostPeer, joinPeer, sendAction, disconnect, peerAvailable };
})();

if (typeof module !== "undefined") module.exports = Net;
