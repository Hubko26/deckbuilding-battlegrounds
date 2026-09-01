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

  // Bez TURN relayu WebRTC neprejde cez prísny NAT/firewall (školská či
  // firemná sieť, časť mobilných operátorov) – spojenie sa ticho nenadviaže.
  // PeerJS má vo východzom nastavení len STUN + TURN na UDP 3478, ktorý býva
  // zablokovaný; pridávame verejný TURN aj cez TCP a port 443 (tvári sa ako
  // bežný HTTPS, prejde skoro všade). Ak by verejný TURN prestal fungovať,
  // stačí sem doplniť vlastný.
  const PEER_OPTS = {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
          username: "peerjs", credential: "peerjsp" },
        { urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:443?transport=tcp",
          ],
          username: "openrelayproject", credential: "openrelayproject" },
      ],
    },
  };

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
    wireDiag(c);
  }

  // Diagnostika do konzoly: pri probléme so spojením presne ukáže, ktorý
  // krok zlyhal – signalizácia (peer open), ICE stav a či sa vôbec našiel
  // "relay" kandidát (bez neho TURN nefunguje a prísny NAT spojenie zarezne).
  function wireDiag(c) {
    c.on("open", () => console.info("[arena] P2P kanál otvorený ✓"));
    const pc = c.peerConnection;
    if (!pc) return;
    const types = new Set();
    pc.addEventListener("icecandidate", e => {
      const t = e.candidate && (e.candidate.type ||
        (e.candidate.candidate.match(/ typ (\w+)/) || [])[1]);
      if (t && !types.has(t)) { types.add(t); console.info("[arena] ICE kandidát:", t); }
      if (!e.candidate) console.info("[arena] ICE gathering hotový; kandidáti:",
        [...types].join(", ") || "ŽIADNI", types.has("relay") ? "" : "(relay CHÝBA – TURN nefunguje/blokovaný)");
    });
    pc.addEventListener("iceconnectionstatechange",
      () => console.info("[arena] ICE stav:", pc.iceConnectionState));
  }

  // PeerJS cloud pustí naše ID, keď signaling socket spadne (uspatá záložka
  // na mobile, výpadok siete, idle timeout). Hostiteľ potom stále ukazuje kód,
  // ale kamarát dostane „peer-unavailable". Preto sa vždy skúsime pripojiť späť.
  function keepAlive(pr) {
    pr.on("disconnected", () => {
      if (pr.destroyed) return;
      try { pr.reconnect(); } catch {}
    });
  }

  // Založí hru: čaká na kamaráta na kóde miestnosti. Hostiteľ je p1
  // a po pripojení pošle seed.
  function hostPeer(code, h) {
    handlers = h;
    transport = "peer";
    destroyPeer();
    peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
    keepAlive(peer);
    peer.on("open", () => {
      console.info("[arena] signalizácia OK (host, kód " + code + ")");
      if (handlers.onWaiting) handlers.onWaiting({ code });
    });
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
    peer = new Peer(PEER_OPTS);
    keepAlive(peer);
    // Timeout na CELÝ handshake: keď sa nepodarí ani signalizácia (peer sa
    // neotvorí), ani P2P kanál (firewall blokuje WebRTC), nepríde žiadna
    // chyba a UI by ticho viselo na „Pripájam sa…".
    let timer = setTimeout(() => {
      timer = null;
      if (!(conn && conn.open) && handlers.onPeerError) handlers.onPeerError("timeout");
    }, 20000);
    const done = () => { if (timer) { clearTimeout(timer); timer = null; } };
    peer.on("open", () => {
      console.info("[arena] signalizácia OK (join, kód " + code + ")");
      const c = peer.connect(PEER_PREFIX + code, { reliable: true });
      wireConn(c);
      c.on("open", done);
    });
    peer.on("error", err => {
      done();
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
