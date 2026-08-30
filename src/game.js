// UI hry: vykresľovanie, interakcie, prehrávanie eventov z enginu s animáciami.
// Herná logika je celá v engine.js; tu sa len volá a kreslí.

// ---------- Preklady ----------
const L = {
  pageTitle: { sk: "Zvieracia aréna", cs: "Zvířecí aréna", en: "Animal Arena" },
  title: { sk: "⚔️ Zvieracia aréna", cs: "⚔️ Zvířecí aréna", en: "⚔️ Animal Arena" },
  pickTitle: { sk: "Vyber si svoj tím", cs: "Vyber si svůj tým", en: "Pick your team" },
  diffTitle: { sk: "Ako silný má byť súper?", cs: "Jak silný má být soupeř?", en: "How strong is your opponent?" },
  diffs: {
    easy: { sk: "🙂 Ľahký", cs: "🙂 Lehký", en: "🙂 Easy" },
    normal: { sk: "😎 Normálny", cs: "😎 Normální", en: "😎 Normal" },
    hard: { sk: "😈 Ťažký", cs: "😈 Těžký", en: "😈 Hard" },
  },
  play: { sk: "Hraj!", cs: "Hraj!", en: "Play!" },
  newGame: { sk: "Nová hra", cs: "Nová hra", en: "New game" },
  yourTurn: { sk: "Tvoj ťah – nakupuj!", cs: "Tvůj tah – nakupuj!", en: "Your turn – go shopping!" },
  enemyTurn: { sk: "Súper nakupuje…", cs: "Soupeř nakupuje…", en: "Opponent is shopping…" },
  fight: { sk: "⚔️ Boj!", cs: "⚔️ Boj!", en: "⚔️ Fight!" },
  round: { sk: "Kolo", cs: "Kolo", en: "Round" },
  endTurn: { sk: "✅ Koniec ťahu", cs: "✅ Konec tahu", en: "✅ End turn" },
  refresh: { sk: "🔄 Nové karty", cs: "🔄 Nové karty", en: "🔄 New cards" },
  tierUp: { sk: "⬆️ Tier", cs: "⬆️ Tier", en: "⬆️ Tier" },
  playCard: { sk: "▶ Zahraj", cs: "▶ Zahraj", en: "▶ Play" },
  sellCard: { sk: "💰 Predaj (+1)", cs: "💰 Prodej (+1)", en: "💰 Sell (+1)" },
  cancel: { sk: "✖ Zruš", cs: "✖ Zruš", en: "✖ Cancel" },
  pickTarget: { sk: "Klikni na svoju príšerku!", cs: "Klikni na svou příšerku!", en: "Tap one of your minions!" },
  discoverTitle: { sk: "📖 Vyber si kartu", cs: "📖 Vyber si kartu", en: "📖 Pick a card" },
  win: { sk: "🏆 Vyhral si!", cs: "🏆 Vyhrál jsi!", en: "🏆 You win!" },
  lose: { sk: "😢 Prehral si…", cs: "😢 Prohrál jsi…", en: "😢 You lose…" },
  drawGame: { sk: "🤝 Remíza!", cs: "🤝 Remíza!", en: "🤝 It's a draw!" },
  again: { sk: "Hrať znova", cs: "Hrát znovu", en: "Play again" },
  footNote: {
    sk: "3 rovnaké príšerky sa spoja na silnejšiu! Karty kupuješ do balíčka.",
    cs: "3 stejné příšerky se spojí v silnější! Karty kupuješ do balíčku.",
    en: "3 same minions merge into a stronger one! Bought cards go to your deck.",
  },
  deck: { sk: "Balíček", cs: "Balíček", en: "Deck" },
  discardPile: { sk: "Kôpka", cs: "Hromádka", en: "Discard" },
  botBought: { sk: "🤖 kúpil", cs: "🤖 koupil", en: "🤖 bought" },
  botPlayed: { sk: "🤖 vyložil", cs: "🤖 vyložil", en: "🤖 played" },
  botSpell: { sk: "🤖 zahral", cs: "🤖 zahrál", en: "🤖 cast" },
  botTier: { sk: "🤖 zvýšil tier na", cs: "🤖 zvýšil tier na", en: "🤖 upgraded tier to" },
  botEvolve: { sk: "🤖 evolvol", cs: "🤖 evolvoval", en: "🤖 evolved" },
  youEvolve: { sk: "✨ Evolve!", cs: "✨ Evolve!", en: "✨ Evolve!" },
  begins: { sk: "začína", cs: "začíná", en: "begins" },
  battleDraw: { sk: "Boj skončil remízou.", cs: "Boj skončil remízou.", en: "The fight was a draw." },
  heroDmgMsg: { sk: "dostal", cs: "dostal", en: "took" },
  you: { sk: "Ty", cs: "Ty", en: "You" },
  opp: { sk: "Súper", cs: "Soupeř", en: "Opponent" },
};

const HUMAN = "p1", BOT = "p2";
const $ = id => document.getElementById(id);

let state = null;
let difficulty = localStorage.getItem("arena.diff") || "normal";
let chosenClass = localStorage.getItem("arena.class") || null;
let selected = null;      // { zone: "hand"|"board", idx }
let targeting = null;     // handIdx kúzla čakajúceho na cieľ
let busy = false;         // beží animácia / ťah bota

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("pickTitle").textContent = t(L.pickTitle);
  $("diffTitle").textContent = t(L.diffTitle);
  $("startBtn").textContent = t(L.play);
  $("newGameBtn").textContent = t(L.newGame);
  $("playBtn").textContent = t(L.playCard);
  $("sellBtn").textContent = t(L.sellCard);
  $("cancelBtn").textContent = t(L.cancel);
  $("discoverTitle").textContent = t(L.discoverTitle);
  $("overAgain").textContent = t(L.again);
  $("footNote").textContent = t(L.footNote);
}

// ---------- Výber classy ----------
function renderPick() {
  const box = $("classPick");
  box.innerHTML = "";
  for (const [id, c] of Object.entries(Cards.CLASSES)) {
    const el = document.createElement("div");
    el.className = "class-card" + (chosenClass === id ? " active" : "");
    el.innerHTML = `<div class="ico">${c.emoji}${c.hero.emoji}</div>` +
      `<div class="nm">${t(c.name)}</div><div class="hero">${t(c.hero.name)}</div>`;
    el.addEventListener("click", () => { chosenClass = id; localStorage.setItem("arena.class", id); renderPick(); });
    box.appendChild(el);
  }
  const dbox = $("diffPick");
  dbox.innerHTML = "";
  for (const d of ["easy", "normal", "hard"]) {
    const b = document.createElement("button");
    b.textContent = t(L.diffs[d]);
    b.className = difficulty === d ? "active" : "";
    b.addEventListener("click", () => { difficulty = d; localStorage.setItem("arena.diff", d); renderPick(); });
    dbox.appendChild(b);
  }
  $("startBtn").disabled = !chosenClass;
}

function startGame() {
  const others = Object.keys(Cards.CLASSES).filter(c => c !== chosenClass);
  const botClass = others[Math.floor(Math.random() * others.length)];
  state = Engine.newGame(chosenClass, botClass, Math.random);
  selected = null; targeting = null;
  $("pickScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  $("newGameBtn").classList.remove("hidden");
  $("overOverlay").classList.add("hidden");
  logClear();
  Engine.startRound(state);
  driveFlow();
}

// ---------- Herný tok ----------
async function driveFlow() {
  for (;;) {
    if (state.phase === "over") { renderAll(); showOver(); return; }
    if (state.phase === "battle") { await runBattle(); continue; }
    if (state.active === BOT) { await runBotTurn(); continue; }
    busy = false;
    renderAll();
    return; // čaká sa na hráča
  }
}

async function runBotTurn() {
  busy = true;
  renderAll();
  await sleep(600);
  const events = Bot.botTurn(state, BOT, difficulty);
  for (const ev of events) {
    const msg = botEventMsg(ev);
    if (msg) { log(msg); renderAll(); await sleep(650); }
  }
}

function botEventMsg(ev) {
  if (ev.pid !== BOT) return null;
  const name = ev.defId ? t(Cards.byId[ev.defId].name) : "";
  const emoji = ev.defId ? Cards.byId[ev.defId].emoji : "";
  switch (ev.type) {
    case "buy": return `${t(L.botBought)} ${emoji} ${name}`;
    case "play": return `${t(L.botPlayed)} ${emoji} ${name}`;
    case "spell": return `${t(L.botSpell)} ${emoji} ${name}`;
    case "tierUp": return `${t(L.botTier)} ${ev.tier}`;
    case "evolve": return `${t(L.botEvolve)} ${emoji} ${name}!`;
    default: return null;
  }
}

// ---------- Boj ----------
async function runBattle() {
  busy = true;
  selected = null; targeting = null;
  // Snímka plôch pred bojom – doBattle stav zmení, animuje sa nad snímkou.
  const snap = {
    p1: state.p1.board.map(x => ({ ...x })),
    p2: state.p2.board.map(x => ({ ...x })),
  };
  const events = Engine.doBattle(state);
  renderAll();
  renderBoardsFrom(snap);
  $("turnBanner").textContent = `${t(L.fight)}`;
  $("turnBanner").className = "banner enemy";
  await sleep(500);

  for (const ev of events) {
    switch (ev.type) {
      case "battleStart":
        log(`${t(L.fight)} ${ev.first === HUMAN ? t(L.you) : t(L.opp)} ${t(L.begins)}.`);
        break;
      case "attack": {
        const a = cardById(ev.aUid), d = cardById(ev.dUid);
        if (a) { a.style.setProperty("--lunge", ev.aPid === HUMAN ? "-16px" : "16px"); a.classList.add("attacking"); }
        await sleep(280);
        if (d) d.classList.add("hit");
        await sleep(280);
        if (a) a.classList.remove("attacking");
        if (d) d.classList.remove("hit");
        break;
      }
      case "hp": {
        const el = cardById(ev.uid);
        if (el) {
          const hpEl = el.querySelector(".hp");
          if (hpEl) hpEl.textContent = `❤️${Math.max(0, ev.hp)}`;
        }
        break;
      }
      case "powerDmg": {
        const el = cardById(ev.uid);
        if (el) { floatText(el, `-${ev.n}`); await sleep(400); }
        break;
      }
      case "buff": {
        const el = cardById(ev.uid);
        if (el) { floatText(el, `+${ev.a}/+${ev.h}`, true); await sleep(300); }
        break;
      }
      case "die": {
        const el = cardById(ev.uid);
        if (el) { el.classList.add("dying"); await sleep(380); el.remove(); }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === HUMAN ? $("myBoard") : $("oppBoard");
        const el = cardEl({ uid: ev.uid, defId: ev.defId, rank: 1, atk: def.atk, hp: def.hp, maxHp: def.hp, taunt: !!def.taunt }, {});
        row.appendChild(el);
        await sleep(300);
        break;
      }
      case "heroDmg": {
        const chip = ev.pid === HUMAN ? $("myHero") : $("oppHero");
        floatText(chip, `-${ev.dmg}`);
        log(`${ev.pid === HUMAN ? t(L.you) : t(L.opp)} ${t(L.heroDmgMsg)} 💥 ${ev.dmg}`);
        await sleep(700);
        break;
      }
      case "battleDraw":
        log(t(L.battleDraw));
        await sleep(500);
        break;
      case "gameOver":
        return; // driveFlow ukáže výsledok
    }
  }
  await sleep(400);
}

function cardById(uid) {
  return document.querySelector(`.card[data-uid="${uid}"]`);
}

function floatText(el, text, heal) {
  const f = document.createElement("div");
  f.className = "dmg-float" + (heal ? " heal" : "");
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

// ---------- Vykresľovanie ----------
function renderAll() {
  if (!state) return;
  renderHero($("oppHero"), state[BOT], true);
  renderHero($("myHero"), state[HUMAN], false);
  $("oppCounters").textContent = counters(state[BOT]);
  $("myCounters").textContent = counters(state[HUMAN]);
  renderBoard($("oppBoard"), state[BOT], false);
  renderBoard($("myBoard"), state[HUMAN], true);
  renderHand();
  renderShop();
  renderActionBar();
  renderDiscover();
}

function counters(p) {
  return `🂠 ${t(L.deck)}: ${p.deck.length} · 🗂 ${t(L.discardPile)}: ${p.discard.length}`;
}

function renderHero(el, p, enemy) {
  const c = Cards.CLASSES[p.cls];
  el.innerHTML = `<span class="he">${c.hero.emoji}</span>` +
    `<span>${t(c.hero.name)}</span>` +
    `<span class="hp">❤️ ${Math.max(0, p.hp)}</span>` +
    `<span class="tier">⭐ ${p.tier}</span>`;
}

function renderBoardsFrom(snap) {
  renderBoardList($("oppBoard"), snap[BOT], false);
  renderBoardList($("myBoard"), snap[HUMAN], true);
}

function renderBoard(el, p, mine) {
  renderBoardList(el, p.board, mine);
}

function renderBoardList(el, list, mine) {
  el.innerHTML = "";
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    const card = cardEl(inst, {});
    if (mine) {
      card.addEventListener("click", () => onBoardClick(i, inst));
      if (selected && selected.zone === "board" && selected.idx === i) card.classList.add("selected");
    }
    el.appendChild(card);
  }
  for (let i = list.length; i < Engine.BOARD_MAX; i++) {
    const s = document.createElement("div");
    s.className = "slot-empty";
    el.appendChild(s);
  }
}

function renderHand() {
  const el = $("handEl");
  el.innerHTML = "";
  const p = state[HUMAN];
  p.hand.forEach((inst, i) => {
    const card = cardEl(inst, {});
    card.addEventListener("click", () => onHandClick(i));
    if (selected && selected.zone === "hand" && selected.idx === i) card.classList.add("selected");
    el.appendChild(card);
  });
}

function renderShop() {
  const p = state[HUMAN];
  const myTurn = state.active === HUMAN && !busy;
  $("moneyEl").textContent = `🪙 ${p.money}`;
  const banner = $("turnBanner");
  if (state.active === HUMAN) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.yourTurn)}`;
    banner.className = "banner";
  } else if (state.active === BOT) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.enemyTurn)}`;
    banner.className = "banner enemy";
  }

  const commons = $("commonsRow");
  commons.innerHTML = "";
  state.commons.forEach((defId, i) => {
    const card = cardEl(defId, { shop: true });
    if (myTurn && p.money >= Engine.CARD_COST) {
      card.classList.add("buyable");
      card.addEventListener("click", () => { act(Engine.buyCommon(state, HUMAN, i)); });
    } else card.classList.add("disabled");
    commons.appendChild(card);
  });

  const priv = $("privRow");
  priv.innerHTML = "";
  p.priv.forEach((s, i) => {
    const card = cardEl(s.defId, { shop: true });
    if (s.frozen) card.classList.add("frozen");
    if (myTurn && p.money >= Engine.CARD_COST) {
      card.classList.add("buyable");
      card.addEventListener("click", () => { act(Engine.buyPrivate(state, HUMAN, i)); });
    } else card.classList.add("disabled");
    if (myTurn) {
      const fb = document.createElement("button");
      fb.className = "freeze-btn";
      fb.textContent = "❄️";
      fb.addEventListener("click", e => { e.stopPropagation(); act(Engine.toggleFreeze(state, HUMAN, i)); });
      card.appendChild(fb);
    }
    priv.appendChild(card);
  });

  $("refreshBtn").textContent = `${t(L.refresh)} (${Engine.REFRESH_COST}🪙)`;
  $("refreshBtn").disabled = !myTurn || p.money < Engine.REFRESH_COST;
  const cost = Engine.upgradeCost(state, HUMAN);
  $("tierBtn").textContent = cost === null ? `⭐ MAX` : `${t(L.tierUp)} ${p.tier + 1} (${cost}🪙)`;
  $("tierBtn").disabled = !myTurn || cost === null || p.money < cost;
  $("endTurnBtn").textContent = t(L.endTurn);
  $("endTurnBtn").disabled = !myTurn || !!state.pendingDiscover;
}

// inst: inštancia karty ALEBO defId (obchod).
function cardEl(instOrId, opts) {
  const isInst = typeof instOrId === "object";
  const defId = isInst ? instOrId.defId : instOrId;
  const def = Cards.byId[defId];
  const rank = isInst ? instOrId.rank : 1;
  const el = document.createElement("div");
  el.className = "card" + ((isInst ? instOrId.taunt : def.taunt) ? " taunt" : "");
  el.dataset.rank = rank;
  if (isInst) el.dataset.uid = instOrId.uid;
  const text = Cards.cardText(def, rank, I18N.lang);
  let inner = `<span class="tier-tag">⭐${def.tier}</span>`;
  if (opts.shop) inner += `<span class="cost">🪙${Engine.CARD_COST}</span>`;
  inner += `<div class="em">${def.emoji}</div><div class="nm">${t(def.name)}</div>`;
  if (def.race) inner += `<div class="race">${t(Cards.RACES[def.race])}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    const atk = isInst ? instOrId.atk : def.atk;
    const hp = isInst ? instOrId.hp : def.hp;
    inner += `<div class="stats"><span class="atk">⚔️${atk}</span><span class="hp">❤️${hp}</span></div>`;
  } else {
    inner += `<div class="stats"><span>✨</span></div>`;
  }
  el.innerHTML = inner;
  el.title = `${t(def.name)}${text ? " – " + text : ""}`;
  return el;
}

// ---------- Interakcie hráča ----------
function act(events) {
  if (!events) return;
  for (const ev of events) {
    if (ev.type === "evolve" && ev.pid === HUMAN) log(`${t(L.youEvolve)} ${Cards.byId[ev.defId].emoji} ${t(Cards.byId[ev.defId].name)}`);
  }
  selected = null;
  renderAll();
  // Evolve animácia po prerenderi.
  for (const ev of events) {
    if (ev.type === "evolve") {
      const el = cardById(ev.uid);
      if (el) el.classList.add("evolving");
    }
  }
}

function onHandClick(i) {
  if (busy || state.active !== HUMAN) return;
  targeting = null;
  selected = (selected && selected.zone === "hand" && selected.idx === i) ? null : { zone: "hand", idx: i };
  renderAll();
}

function onBoardClick(i, inst) {
  if (busy || state.active !== HUMAN) return;
  if (targeting !== null) {
    const handIdx = targeting;
    targeting = null;
    act(Engine.castSpell(state, HUMAN, handIdx, inst.uid));
    return;
  }
  selected = (selected && selected.zone === "board" && selected.idx === i) ? null : { zone: "board", idx: i };
  renderAll();
}

function renderActionBar() {
  const bar = $("actionBar");
  if (targeting !== null) {
    bar.classList.remove("hidden");
    $("playBtn").classList.add("hidden");
    $("sellBtn").classList.add("hidden");
    $("cancelBtn").textContent = `${t(L.pickTarget)} ${t(L.cancel)}`;
    return;
  }
  $("playBtn").classList.remove("hidden");
  $("sellBtn").classList.remove("hidden");
  $("cancelBtn").textContent = t(L.cancel);
  if (!selected || busy || state.active !== HUMAN) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const p = state[HUMAN];
  if (selected.zone === "hand") {
    const inst = p.hand[selected.idx];
    const canPlay = inst && (inst.spell
      ? spellPlayable(inst)
      : p.board.length < Engine.BOARD_MAX);
    $("playBtn").disabled = !canPlay;
  } else {
    $("playBtn").disabled = true;
  }
}

function spellPlayable(inst) {
  const fx = Cards.byId[inst.defId].fx;
  if (fx.type === "buffTarget") return state[HUMAN].board.length > 0;
  return true;
}

function onPlay() {
  if (!selected || selected.zone !== "hand") return;
  const p = state[HUMAN];
  const inst = p.hand[selected.idx];
  if (!inst) return;
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (fx.type === "buffTarget") {
      targeting = selected.idx;
      selected = null;
      renderAll();
      return;
    }
    act(Engine.castSpell(state, HUMAN, selected.idx));
  } else {
    act(Engine.playMinion(state, HUMAN, selected.idx));
  }
}

function onSell() {
  if (!selected) return;
  act(Engine.sellCard(state, HUMAN, selected.zone, selected.idx));
}

function renderDiscover() {
  const ov = $("discoverOverlay");
  const pd = state.pendingDiscover;
  if (!pd || pd.pid !== HUMAN) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  const row = $("discoverRow");
  row.innerHTML = "";
  pd.options.forEach((defId, i) => {
    const card = cardEl(defId, {});
    card.classList.add("buyable");
    card.addEventListener("click", () => act(Engine.pickDiscover(state, HUMAN, i)));
    row.appendChild(card);
  });
}

async function onEndTurn() {
  if (busy || state.active !== HUMAN || state.pendingDiscover) return;
  selected = null; targeting = null;
  act(Engine.endShopTurn(state, HUMAN));
  await driveFlow();
}

function showOver() {
  const ov = $("overOverlay");
  ov.classList.remove("hidden");
  const w = state.winner;
  $("overTitle").textContent = w === "draw" ? t(L.drawGame) : w === HUMAN ? t(L.win) : t(L.lose);
  $("overMsg").textContent = `${t(L.round)}: ${state.round}`;
}

// ---------- Log ----------
function log(msg) {
  const el = $("logEl");
  const d = document.createElement("div");
  d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 4) el.removeChild(el.firstChild);
}
function logClear() { $("logEl").innerHTML = ""; }

// ---------- Štart ----------
$("startBtn").addEventListener("click", startGame);
$("newGameBtn").addEventListener("click", () => {
  $("gameScreen").classList.add("hidden");
  $("newGameBtn").classList.add("hidden");
  $("pickScreen").classList.remove("hidden");
  state = null;
});
$("endTurnBtn").addEventListener("click", onEndTurn);
$("refreshBtn").addEventListener("click", () => act(Engine.refreshShop(state, HUMAN)));
$("tierBtn").addEventListener("click", () => act(Engine.upgradeTier(state, HUMAN)));
$("playBtn").addEventListener("click", onPlay);
$("sellBtn").addEventListener("click", onSell);
$("cancelBtn").addEventListener("click", () => { selected = null; targeting = null; renderAll(); });
$("overAgain").addEventListener("click", () => { $("overOverlay").classList.add("hidden"); startGame(); });

applyI18n();
renderPick();
