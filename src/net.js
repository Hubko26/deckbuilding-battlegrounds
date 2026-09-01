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

  // ---------- Obnova spojenia (len peer transport) ----------
  // Nestabilná sieť trhá aj aktívne WebRTC spojenia (ICE disconnected/failed
  // aj s keepalive pingom). Namiesto zabitia hry sa spojenie obnoví a strany
  // si dosynchronizujú akcie: každá odoslaná akcia má poradové číslo `q`
  // a odosielateľ si ju drží v bufferi. Po znovupripojení si klienti povedia
  // „mám prijaté po q=X" a pošlú si to, čo druhému chýba. Engine je
  // deterministický, takže hra pokračuje presne tam, kde bola.
  let sendSeq = 0;   // q poslednej odoslanej akcie
  let recvSeq = 0;   // q poslednej prijatej akcie (dedup pri resende)
  let sentBuf = [];  // odoslané akcie tejto hry (na resend po výpadku)
  let role = null;   // "host" | "join" – kto obnovuje spojenie (joiner volá)
  let roomCode = null;
  let resuming = false;
  let resumeUnavail = 0; // koľkokrát reconnect dostal peer-unavailable

  function resetSync() { sendSeq = 0; recvSeq = 0; sentBuf = []; resuming = false; }

  function dispatch(msg) {
    if (typeof msg === "string") {
      try { msg = JSON.parse(msg); } catch { return; }
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "waiting" && handlers.onWaiting) handlers.onWaiting(msg);
    if (msg.type === "start") { resetSync(); if (handlers.onStart) handlers.onStart(msg); }
    if (msg.type === "action") {
      // resend po obnove môže duplikovať už prijaté akcie – q ich odfiltruje
      if (msg.q != null) {
        if (msg.q <= recvSeq) return;
        recvSeq = msg.q;
      }
      if (handlers.onAction) handlers.onAction(msg);
    }
    if (msg.type === "resumeReq") resumeSync(msg, true);
    if (msg.type === "resumeAck") resumeSync(msg, false);
    if (msg.type === "peerLeft" && handlers.onPeerLeft) handlers.onPeerLeft(msg);
  }

  // Druhá strana hlási, po ktoré q má prijaté – pošli jej zvyšok. `ack`:
  // resumeReq (od joinera) sa potvrdí resumeAck-om, aby aj joiner resendol.
  function resumeSync(msg, ack) {
    if (!conn) return;
    const missing = sentBuf.filter(m => m.q > (msg.q || 0));
    console.info("[arena] obnova spojenia: resend", missing.length, "akcií");
    for (const m of missing) { try { conn.send(m); } catch {} }
    if (ack) { try { conn.send({ type: "resumeAck", q: recvSeq }); } catch {} }
    resuming = false;
    if (handlers.onResumed) handlers.onResumed();
  }

  // Výpadok spojenia počas hry: joiner sa opakovane pripája na rovnaký kód
  // (nové spojenie = čerstvé ICE aj relay), host drží miestnosť otvorenú
  // a čaká. Po minúte márnych pokusov hra skončí oznamom o odpojení.
  function linkDead(c) {
    if (c !== conn || resuming || transport !== "peer") return;
    console.info("[arena] spojenie vypadlo – skúšam obnoviť");
    resuming = true;
    resumeUnavail = 0;
    stopPing();
    if (handlers.onReconnecting) handlers.onReconnecting();
    const deadline = Date.now() + 60000;
    if (role === "join") reconnectLoop(deadline);
    else hostWaitResume(deadline);
  }

  function giveUpResume() {
    resuming = false;
    if (handlers.onPeerLeft) handlers.onPeerLeft({});
  }

  function hostWaitResume(deadline) {
    const t = setInterval(() => {
      if (!resuming) { clearInterval(t); return; }
      if (Date.now() > deadline) { clearInterval(t); giveUpResume(); }
    }, 1000);
  }

  function reconnectLoop(deadline) {
    if (!resuming) return;
    if (Date.now() > deadline || !peer || peer.destroyed) { giveUpResume(); return; }
    if (peer.disconnected) { try { peer.reconnect(); } catch {} }
    let c = null;
    try { c = peer.connect(PEER_PREFIX + roomCode, { reliable: true, metadata: { resume: true } }); } catch {}
    if (!c) { setTimeout(() => reconnectLoop(deadline), 3000); return; }
    let opened = false;
    c.on("open", () => {
      opened = true;
      if (!resuming) { try { c.close(); } catch {} return; }
      // Staré spojenie nezatvárame aktívne – je mŕtve; close frame by mohol
      // na druhej strane predbehnúť swap a zabiť hru. Len ho opustíme.
      wireConn(c);
      startPing(c);
      try { c.send({ type: "resumeReq", q: recvSeq }); } catch {}
    });
    c.on("error", () => { if (!opened && resuming) setTimeout(() => reconnectLoop(deadline), 3000); });
    setTimeout(() => {
      if (!opened && resuming) { try { c.close(); } catch {} reconnectLoop(deadline); }
    }, 5000);
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
    // Close/error NEZABÍJA hru – PeerJS zatvára DataConnection aj pri výpadku
    // ICE (failed) a to isté vyzerá ako odchod súpera. Skúsime obnovu; keď
    // súper naozaj odišiel, reconnect dostane peer-unavailable a hra skončí.
    c.on("close", () => { if (c !== conn || resuming) return; linkDead(c); });
    c.on("error", () => { if (c !== conn || resuming) return; linkDead(c); });
    c.on("open", () => startPing(c));
    wireDiag(c);
    watchIce(c);
  }

  // Keepalive: počas boja sa ~30+ s nič neposiela a NAT/firewall medzitým
  // zahodí nečinný UDP mapping (bežný timeout 30–60 s) – spojenie potom
  // „ticho" umrie presne po dlhšej animácii. Ping každých 5 s drží mapping
  // (aj TURN alokáciu) živý. Druhá strana ping ignoruje (dispatch nepozná typ).
  let pingTimer = null;
  function startPing(c) {
    stopPing();
    pingTimer = setInterval(() => {
      if (c !== conn || !c.open) { stopPing(); return; }
      try { c.send({ type: "ping" }); } catch {}
    }, 5000);
  }
  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  // Mŕtve spojenie nesmie visieť ticho: DataChannel pri výpadku ICE neposiela
  // close event – hráč by len čakal na súperov ťah donekonečna. "failed" =
  // obnova hneď; "disconnected" dostane 8 s na samoopravu (ICE to bežne
  // zvládne), potom sa spúšťa obnova spojenia (linkDead).
  function watchIce(c) {
    const pc = c.peerConnection;
    if (!pc) return;
    let deadTimer = null;
    pc.addEventListener("iceconnectionstatechange", () => {
      const st = pc.iceConnectionState;
      if (st === "failed") {
        linkDead(c);
      } else if (st === "disconnected") {
        if (!deadTimer) deadTimer = setTimeout(() => {
          deadTimer = null;
          if (pc.iceConnectionState === "disconnected") linkDead(c);
        }, 8000);
      } else if (deadTimer) {
        clearTimeout(deadTimer);
        deadTimer = null;
      }
    });
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
    pc.addEventListener("icecandidateerror",
      e => console.info("[arena] ICE chyba:", e.errorCode, e.url, e.errorText));
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
    role = "host";
    roomCode = code;
    peerOpts().then(po => {
    if (transport !== "peer" || peer) return; // hráč medzitým zrušil / reštartoval
    peer = new Peer(PEER_PREFIX + code, po);
    keepAlive(peer);
    peer.on("open", () => {
      console.info("[arena] signalizácia OK (host, kód " + code + ")");
      if (handlers.onWaiting) handlers.onWaiting({ code });
    });
    peer.on("connection", c => {
      // Obnova po výpadku: joiner sa vracia s metadata.resume – žiadna nová
      // hra, len prehoď spojenie a čakaj resumeReq (dosync akcií).
      if (c.metadata && c.metadata.resume) {
        c.on("open", () => {
          // staré spojenie len opúšťame (viď reconnectLoop)
          wireConn(c);
          startPing(c);
        });
        wireDiag(c);
        return;
      }
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
      if (resuming) return; // počas obnovy čakáme na joinerov reconnect
      if (handlers.onPeerError) handlers.onPeerError(err && err.type);
    });
    });
  }

  // Pripojí sa na hru s daným kódom.
  function joinPeer(code, h, opts) {
    handlers = h;
    transport = "peer";
    destroyPeer();
    role = "join";
    roomCode = code;
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
      const kind = err && err.type;
      if (resuming) {
        // Počas obnovy chyby rieši reconnect slučka; peer-unavailable = súper
        // je preč (zavrel hru) – po pár pokusoch to vzdaj a ohlás odchod.
        if (kind === "peer-unavailable" && ++resumeUnavail >= 4) giveUpResume();
        return;
      }
      done();
      if (handlers.onPeerError) handlers.onPeerError(kind);
    });
    });
  }

  function sendAction(name, args, round) {
    const msg = { type: "action", name, args, r: round };
    if (transport === "ws" && ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    if (transport === "peer") {
      // Buffer aj pri mŕtvom spojení – akcia sa doručí resendom po obnove.
      msg.q = ++sendSeq;
      sentBuf.push(msg);
      if (conn && conn.open) { try { conn.send(msg); } catch {} }
    }
  }

  function destroyPeer() {
    stopPing();
    resuming = false;
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
