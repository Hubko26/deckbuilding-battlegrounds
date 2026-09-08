// Šachovnica popri aréne (len desktop): prepínač ♟️ v hlavičke presunie
// hraciu dosku doľava a vpravo otvorí jednoduché šachy bez hodín.
//   - proti človeku v sieti: ťahy idú cez Net.sendAction("chess", [san]) –
//     rovnaký kanál ako herné akcie (resend po výpadku funguje aj pre šach),
//     prijímajú sa obalením globálneho applyRemote (game.js sa nemení);
//   - proti botovi: jednoduchý šachový bot (mat > najcennejšia figúra >
//     promócia > náhodný legálny ťah).
// Pravidlá rieši vendor/chess.min.js (chess.js 0.10.3, MIT, globál `Chess`).
// Šach nie je súčasťou deterministického engine (žiadny replay/log).
const ArenaChess = (() => {
  const KEY = "arena.chess";
  const PIECES = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const T = {
    title: { sk: "♟️ Šach popri hre", cs: "♟️ Šachy při hře", en: "♟️ Side chess" },
    newGame: { sk: "Nová partia", cs: "Nová partie", en: "New game" },
    white: { sk: "Biely", cs: "Bílý", en: "White" },
    black: { sk: "Čierny", cs: "Černý", en: "Black" },
    turn: { sk: "na ťahu", cs: "na tahu", en: "to move" },
    you: { sk: "(ty)", cs: "(ty)", en: "(you)" },
    check: { sk: "Šach!", cs: "Šach!", en: "Check!" },
    mate: { sk: "Mat – vyhral", cs: "Mat – vyhrál", en: "Checkmate – winner:" },
    draw: { sk: "Remíza", cs: "Remíza", en: "Draw" },
    wait: { sk: "čaká sa na súpera…", cs: "čeká se na soupeře…", en: "waiting for opponent…" },
    toggle: { sk: "Šach popri hre", cs: "Šachy při hře", en: "Side chess" },
  };

  let game = null;      // inštancia chess.js
  let myColor = "w";    // "w" | "b" – farba lokálneho hráča
  let selected = null;  // vybrané políčko ("e2")
  let panel = null, boardEl = null, statusEl = null, btn = null;
  let botTimer = null;
  let dragging = false; // prebieha ťahanie figúry (pointer alebo mouse záloha)

  const tt = o => (typeof t === "function" ? t(o) : o.sk);

  // Farba: proti botovi hráš bielymi; v sieti biely = p1 (hostiteľ).
  function localColor() {
    try { return (typeof mode !== "undefined" && mode === "net" && typeof MY !== "undefined" && MY === "p2") ? "b" : "w"; }
    catch { return "w"; }
  }
  const isNet = () => { try { return typeof mode !== "undefined" && mode === "net"; } catch { return false; } };
  const roundNow = () => { try { return (typeof state !== "undefined" && state) ? state.round : 0; } catch { return 0; } };

  function build() {
    if (panel || typeof Chess !== "function") return;
    const header = document.querySelector("header .controls");
    const screen = document.getElementById("gameScreen");
    if (!header || !screen) return;

    btn = document.createElement("button");
    btn.id = "chessBtn";
    btn.type = "button";
    btn.textContent = "♟️";
    btn.title = tt(T.toggle);
    btn.setAttribute("aria-label", tt(T.toggle));
    btn.addEventListener("click", () => setOpen(!document.body.classList.contains("chess")));
    header.insertBefore(btn, header.firstChild);

    panel = document.createElement("aside");
    panel.id = "chessPanel";
    panel.innerHTML = `
      <div class="chess-head">
        <span class="chess-title">${tt(T.title)}</span>
        <button type="button" id="chessNew">${tt(T.newGame)}</button>
      </div>
      <div class="chess-board" id="chessBoard"></div>
      <div class="chess-status" id="chessStatus"></div>`;
    screen.appendChild(panel);
    boardEl = panel.querySelector("#chessBoard");
    statusEl = panel.querySelector("#chessStatus");
    panel.querySelector("#chessNew").addEventListener("click", () => {
      reset();
      if (isNet()) Net.sendAction("chess", ["__new"], roundNow());
    });

    // Príjem ťahov súpera: obal globálneho applyRemote (funkčná deklarácia
    // v game.js = vlastnosť window; netHandlers ju volajú menom, takže
    // obalenie platí). Šachový ťah sa netýka engine ani kontroly kola.
    const orig = window.applyRemote;
    if (typeof orig === "function" && !orig.__chessWrapped) {
      const wrapped = async function (msg) {
        if (msg && msg.name === "chess") { onRemote(msg.args && msg.args[0]); return; }
        return orig(msg);
      };
      wrapped.__chessWrapped = true;
      window.applyRemote = wrapped;
    }

    let open = false;
    try { open = localStorage.getItem(KEY) === "1"; } catch {}
    reset();
    setOpen(open);
  }

  function setOpen(open) {
    document.body.classList.toggle("chess", open);
    if (btn) btn.classList.toggle("active", open);
    try { localStorage.setItem(KEY, open ? "1" : "0"); } catch {}
    if (open) render();
  }

  function reset() {
    game = new Chess();
    myColor = localColor();
    selected = null;
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    render();
  }

  // Nová partia začína s farbou podľa aktuálneho módu (sieť: p2 = čierny).
  function onGameStart() { if (panel) reset(); }

  function render() {
    if (!boardEl || !game) return;
    boardEl.innerHTML = "";
    const files = "abcdefgh".split("");
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const rows = myColor === "w" ? ranks : [...ranks].reverse();
    const cols = myColor === "w" ? files : [...files].reverse();
    const targets = selected ? new Set(game.moves({ square: selected, verbose: true }).map(m => m.to)) : new Set();
    const last = game.history({ verbose: true }).slice(-1)[0];
    for (const r of rows) {
      for (const f of cols) {
        const sq = f + r;
        const cell = document.createElement("div");
        const dark = (files.indexOf(f) + r) % 2 === 0;
        cell.className = "sq " + (dark ? "dark" : "light");
        if (selected === sq) cell.classList.add("sel");
        if (targets.has(sq)) cell.classList.add("target");
        if (last && (last.from === sq || last.to === sq)) cell.classList.add("last");
        const pc = game.get(sq);
        if (pc) {
          cell.textContent = PIECES[pc.color][pc.type];
          cell.classList.add(pc.color === "w" ? "pw" : "pb");
          if (pc.type === "k" && game.in_check() && pc.color === game.turn()) cell.classList.add("check");
        }
        cell.dataset.sq = sq;
        cell.addEventListener("click", () => onSquare(sq));
        if (pc && pc.color === myColor) {
          // Pointer events (myš/dotyk/pero); preventDefault v startDrag potlačí
          // kompatibilné mouse eventy, takže mousedown je len záloha pre
          // prostredia, ktoré posielajú iba MouseEvent (staré webview, automatizácia).
          cell.addEventListener("pointerdown", e => startDrag(e, sq, cell, "pointer"));
          cell.addEventListener("mousedown", e => startDrag(e, sq, cell, "mouse"));
        }
        boardEl.appendChild(cell);
      }
    }
    renderStatus();
  }

  function renderStatus() {
    if (!statusEl || !game) return;
    const turn = game.turn();
    const who = turn === "w" ? tt(T.white) : tt(T.black);
    let txt;
    if (game.in_checkmate()) txt = `${tt(T.mate)} ${turn === "w" ? tt(T.black) : tt(T.white)}`;
    else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) txt = tt(T.draw);
    else {
      txt = `${who} ${tt(T.turn)} ${turn === myColor ? tt(T.you) : ""}`;
      if (game.in_check()) txt += ` – ${tt(T.check)}`;
      if (isNet() && turn !== myColor) txt += ` – ${tt(T.wait)}`;
    }
    statusEl.textContent = txt;
  }

  function myTurn() {
    return game && !game.game_over() && game.turn() === myColor;
  }

  function onSquare(sq) {
    if (!myTurn()) return;
    const pc = game.get(sq);
    if (selected && selected !== sq) {
      const mv = game.moves({ square: selected, verbose: true }).find(m => m.to === sq);
      if (mv) {
        const done = game.move({ from: selected, to: sq, promotion: "q" });
        selected = null;
        render();
        if (done) afterLocalMove(done.san);
        return;
      }
    }
    // výber vlastnej figúry (klik na inú vlastnú figúru = presun výberu)
    selected = pc && pc.color === myColor ? sq : null;
    render();
  }

  // Drag & drop: pointerdown na vlastnej figúre → klon letí pod kurzorom,
  // pustenie nad legálnym cieľom = ťah (klik-klik ostáva funkčný).
  function startDrag(e, from, cell, kind) {
    if (!myTurn() || e.button !== 0 || dragging) return;
    e.preventDefault();
    dragging = true;
    const EV_MOVE = kind === "pointer" ? "pointermove" : "mousemove";
    const EV_UP = kind === "pointer" ? "pointerup" : "mouseup";
    const legal = new Set(game.moves({ square: from, verbose: true }).map(m => m.to));
    selected = from;
    render();
    const src = boardEl.querySelector(`.sq[data-sq="${from}"]`) || cell;
    const ghost = document.createElement("div");
    ghost.className = "chess-ghost " + (myColor === "w" ? "pw" : "pb");
    ghost.textContent = src.textContent;
    ghost.style.fontSize = getComputedStyle(src).fontSize;
    document.body.appendChild(ghost);
    src.classList.add("dragging");
    let over = null, moved = false;
    const at = ev => { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; };
    at(e);
    const squareAt = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const c = el && el.closest ? el.closest("#chessBoard .sq") : null;
      return c ? c.dataset.sq : null;
    };
    const onMove = ev => {
      moved = true;
      at(ev);
      const sq = squareAt(ev);
      if (over && over !== sq) boardEl.querySelector(`.sq[data-sq="${over}"]`)?.classList.remove("over");
      over = sq;
      if (sq && legal.has(sq)) boardEl.querySelector(`.sq[data-sq="${sq}"]`)?.classList.add("over");
    };
    const finish = ev => {
      window.removeEventListener(EV_MOVE, onMove);
      window.removeEventListener(EV_UP, finish);
      window.removeEventListener("pointercancel", finish);
      ghost.remove();
      dragging = false;
      const to = ev.type === EV_UP ? squareAt(ev) : null;
      if (to && to !== from && legal.has(to)) {
        const done = game.move({ from, to, promotion: "q" });
        selected = null;
        render();
        if (done) afterLocalMove(done.san);
        return;
      }
      // pustené mimo cieľa: figúra ostáva vybraná (klik-klik dokončí ťah)
      if (moved && to !== from) selected = from;
      render();
    };
    window.addEventListener(EV_MOVE, onMove);
    window.addEventListener(EV_UP, finish);
    window.addEventListener("pointercancel", finish);
  }

  function afterLocalMove(san) {
    if (isNet()) {
      Net.sendAction("chess", [san], roundNow());
    } else if (!game.game_over()) {
      botTimer = setTimeout(botMove, 650);
    }
  }

  // Prijatý ťah súpera (sieť): SAN alebo "__new" = súper začal novú partiu.
  function onRemote(san) {
    if (!game) return;
    if (san === "__new") { reset(); return; }
    if (game.turn() === myColor) return; // desync/duplikát – ignoruj
    game.move(san);
    selected = null;
    render();
  }

  // Jednoduchý šachový bot: mat > najcennejšia branie > promócia > náhoda.
  function botMove() {
    botTimer = null;
    if (!game || game.game_over() || game.turn() === myColor) return;
    const moves = game.moves({ verbose: true });
    if (!moves.length) return;
    let best = [], bestScore = -Infinity;
    for (const m of moves) {
      let score = 0;
      if (m.captured) score += VALUE[m.captured] * 10;
      if (m.promotion) score += 80;
      game.move(m);
      if (game.in_checkmate()) score += 1000;
      else if (game.in_check()) score += 3;
      // nechoď s cennou figúrou pod branie zadarmo (hrubý odhad)
      const replies = game.moves({ verbose: true });
      if (replies.some(r => r.to === m.to)) score -= VALUE[m.piece] * 8;
      game.undo();
      if (score > bestScore) { bestScore = score; best = [m]; }
      else if (score === bestScore) best.push(m);
    }
    const pick = best[Math.floor(Math.random() * best.length)];
    game.move({ from: pick.from, to: pick.to, promotion: "q" });
    render();
  }

  // Nová partia pri každom štarte arény: game.js pri vstupe do hry pridá
  // body.playing (a v sieti už pozná MY) – sledujeme to observerom, nech sa
  // game.js nemusí meniť.
  document.addEventListener("DOMContentLoaded", () => {
    build();
    let was = document.body.classList.contains("playing");
    new MutationObserver(() => {
      const now = document.body.classList.contains("playing");
      if (now && !was) onGameStart();
      was = now;
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });
  return { onRemote, reset, onGameStart, setOpen, get game() { return game; }, botMove };
})();
