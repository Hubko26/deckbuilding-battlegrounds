// Server pre hru po lokálnej sieti – bez závislostí (čistý Node >= 20).
//   node server.mjs [port]
// Robí dve veci:
//   1. servíruje statické súbory hry (ako python -m http.server)
//   2. WebSocket relay na /ws – spáruje dvoch hráčov a preposiela im akcie
// Hráči otvoria http://<IP-tohto-počítača>:<port> a kliknú "Hra po sieti".

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 5180;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};

// ---------- Statika ----------
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const headers = { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" };
    // HTML sa nesmie cachovať (skripty majú ?v=hash, tie cachovať môžu).
    if (file.endsWith(".html")) headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ---------- Minimálny WebSocket (textové rámce) ----------
function wsAccept(key) {
  return crypto.createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function wsSend(socket, text) {
  const payload = Buffer.from(text, "utf8");
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    throw new Error("správa je príliš veľká");
  }
  socket.write(Buffer.concat([header, payload]));
}

// Parser prichádzajúcich rámcov (klientske sú maskované).
function wsParse(state, chunk, onMessage, onClose) {
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const b = state.buf;
    if (b.length < 2) return;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { onClose(); return; } // obrovské rámce nepodporujeme
    const maskOff = off;
    if (masked) off += 4;
    if (b.length < off + len) return;
    const data = b.subarray(off, off + len);
    if (masked) {
      const mask = b.subarray(maskOff, maskOff + 4);
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    }
    state.buf = b.subarray(off + len);
    if (opcode === 8) { onClose(); return; }        // close
    if (opcode === 9) continue;                     // ping – ignoruj (prehliadače neposielajú)
    if (opcode === 1) onMessage(data.toString("utf8"));
  }
}

// ---------- Párovanie hráčov ----------
let waiting = null; // hráč čakajúci na súpera

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) urls.push(`http://${ni.address}:${PORT}`);
    }
  }
  return urls;
}

server.on("upgrade", (req, socket) => {
  if (!req.url.startsWith("/ws")) { socket.destroy(); return; }
  const key = req.headers["sec-websocket-key"];
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );
  const client = { socket, peer: null, parse: { buf: Buffer.alloc(0) } };

  const close = () => {
    if (client.peer) {
      try { wsSend(client.peer.socket, JSON.stringify({ type: "peerLeft" })); } catch {}
      client.peer.peer = null;
    }
    if (waiting === client) waiting = null;
    socket.destroy();
  };

  socket.on("data", chunk => wsParse(client.parse, chunk, msg => {
    // relay: všetko od hráča preposli súperovi
    if (client.peer) { try { wsSend(client.peer.socket, msg); } catch {} return; }
    // pred spárovaním: "hello" nesie voľbu mutácií (rozhoduje zakladateľ)
    try {
      const m = JSON.parse(msg);
      if (m && m.type === "hello") client.mut = m.mut !== false;
    } catch {}
  }, close));
  socket.on("error", close);
  socket.on("close", close);

  if (waiting && waiting.socket.writable) {
    // druhý hráč – spáruj a odštartuj hru s rovnakým seedom
    const host = waiting;
    waiting = null;
    client.peer = host;
    host.peer = client;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const mut = host.mut !== false; // zakladateľ = prvý čakajúci hráč
    wsSend(host.socket, JSON.stringify({ type: "start", seed, you: "p1", mut }));
    wsSend(client.socket, JSON.stringify({ type: "start", seed, you: "p2", mut }));
    console.log("Hráči spárovaní, seed", seed);
  } else {
    waiting = client;
    wsSend(socket, JSON.stringify({ type: "waiting", urls: lanUrls() }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zvieracia aréna beží:`);
  console.log(`  tento počítač:  http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  v sieti:        ${u}`);
});
