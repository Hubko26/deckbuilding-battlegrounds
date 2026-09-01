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
  // Relay beží na Metered.ca (app „animal-arena", free tier; kvóta ~500 MB/mes.,
  // hra prenáša pár KB za kolo a relay sa použije len keď priame spojenie nejde).
  // Kredencie sa ťahajú z API appky (prežijú rotáciu); API kľúč je zámerne
  // verejný – je kvótovaný a vie len vydávať TURN kredencie. Statický zoznam
  // nižšie je fallback, keď API nejde. Kľúčový je `turns:...443` (TLS):
  // vyzerá ako bežné HTTPS, prejde aj firemnou sieťou.
  const TURN_API = "https://animal-arena.metered.live/api/v1/turn/credentials" +
    "?apiKey=fede242b9a79960d75e2e27b67ce2befe018";
  const TURN_USER = "4d442c97aca135373578360c";
  const TURN_PASS = "YzSRNpA738dMf0zA"; // pozor: S, nie 5 (preklep stál deň ladenia)
  const STATIC_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:global.relay.metered.ca:80", username: TURN_USER, credential: TURN_PASS },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: TURN_USER, credential: TURN_PASS },
    { urls: "turn:global.relay.metered.ca:443", username: TURN_USER, credential: TURN_PASS },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: TURN_USER, credential: TURN_PASS },
  ];
  let peerOptsCache = null;
  async function peerOpts() {
    if (peerOptsCache) return peerOptsCache;
    try {
      const signal = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
      const ice = await (await fetch(TURN_API, { signal })).json();
      if (Array.isArray(ice) && ice.length) {
        console.info("[arena] TURN kredencie z API ✓");
        peerOptsCache = { config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...ice] } };
        return peerOptsCache;
      }
    } catch (e) {
      console.warn("[arena] TURN API nejde, používam statické kredencie:", e && e.message);
    }
    peerOptsCache = { config: { iceServers: STATIC_ICE } };
    return peerOptsCache;
  }

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
  function connect(h, opts) {
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
    ws.addEventListener("open", () => {
      opened = true;
      // Voľba mutácií – server ju vezme od hráča, ktorý čaká prvý (zakladateľ).
      ws.send(JSON.stringify({ type: "hello", mut: !(opts && opts.mut === false), v: opts && opts.v }));
    });
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
  function hostPeer(code, h, opts) {
    handlers = h;
    transport = "peer";
    const mut = !(opts && opts.mut === false);
    const myV = opts && opts.v;
    destroyPeer();
    peerOpts().then(po => {
    if (transport !== "peer" || peer) return; // hráč medzitým zrušil / reštartoval
    peer = new Peer(PEER_PREFIX + code, po);
    keepAlive(peer);
    peer.on("open", () => {
      console.info("[arena] signalizácia OK (host, kód " + code + ")");
      if (handlers.onWaiting) handlers.onWaiting({ code });
    });
    peer.on("connection", c => {
      wireConn(c);
      c.on("open", () => {
        const seed = Math.floor(Math.random() * 2 ** 31);
        // v = verzia DRUHEJ strany: každý klient si ju porovná so svojou.
        const joinerV = (c.metadata || {}).v;
        c.send({ type: "start", seed, you: "p2", mut, v: myV });
        dispatch({ type: "start", seed, you: "p1", mut, v: joinerV });
      });
    });
    peer.on("error", err => {
      if (handlers.onPeerError) handlers.onPeerError(err && err.type);
    });
    });
  }

  // Pripojí sa na hru s daným kódom.
  function joinPeer(code, h, opts) {
    handlers = h;
    transport = "peer";
    destroyPeer();
    // Timeout na CELÝ handshake (vrátane fetchu TURN kredencií): keď sa
    // nepodarí ani signalizácia (peer sa neotvorí), ani P2P kanál (firewall
    // blokuje WebRTC), nepríde žiadna chyba a UI by ticho viselo na „Pripájam sa…".
    let timer = setTimeout(() => {
      timer = null;
      if (!(conn && conn.open) && handlers.onPeerError) handlers.onPeerError("timeout");
    }, 20000);
    const done = () => { if (timer) { clearTimeout(timer); timer = null; } };
    peerOpts().then(po => {
    if (transport !== "peer" || peer) return; // hráč medzitým zrušil / reštartoval
    peer = new Peer(po);
    keepAlive(peer);
    peer.on("open", () => {
      console.info("[arena] signalizácia OK (join, kód " + code + ")");
      const c = peer.connect(PEER_PREFIX + code, { reliable: true, metadata: { v: opts && opts.v } });
      wireConn(c);
      c.on("open", done);
    });
    peer.on("error", err => {
      done();
      if (handlers.onPeerError) handlers.onPeerError(err && err.type);
    });
    });
  }

  function sendAction(name, args, round) {
    const msg = { type: "action", name, args, r: round };
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
