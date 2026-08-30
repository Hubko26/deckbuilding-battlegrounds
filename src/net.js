// Sieťová vrstva pre hru po lokálnej sieti. Klienti replikujú akcie:
// oba behy majú rovnaký seed a aplikujú rovnaké Engine volania, takže
// stav hry je identický bez posielania celého stavu.

const Net = (() => {
  let ws = null;
  let handlers = {};

  function connect(h) {
    handlers = h;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.addEventListener("message", e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "waiting" && handlers.onWaiting) handlers.onWaiting(msg);
      if (msg.type === "start" && handlers.onStart) handlers.onStart(msg);
      if (msg.type === "action" && handlers.onAction) handlers.onAction(msg);
      if (msg.type === "peerLeft" && handlers.onPeerLeft) handlers.onPeerLeft(msg);
    });
    ws.addEventListener("close", () => { if (handlers.onPeerLeft) handlers.onPeerLeft({}); });
    ws.addEventListener("error", () => { if (handlers.onError) handlers.onError(); });
  }

  function sendAction(name, args) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "action", name, args }));
  }

  function disconnect() {
    handlers = {};
    if (ws) { try { ws.close(); } catch {} ws = null; }
  }

  return { connect, sendAction, disconnect, get connected() { return !!ws && ws.readyState === 1; } };
})();

if (typeof module !== "undefined") module.exports = Net;
