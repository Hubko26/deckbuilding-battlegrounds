// UI hry: vykresľovanie, drag & drop, prehrávanie eventov z enginu s animáciami.
// Herná logika je celá v engine.js; tu sa len volá a kreslí.
//
// Ovládanie je čisto drag & drop:
//   obchod → ruka/plocha  = kúpa (karta ide do balíčka)
//   ruka → plocha         = vyloženie príšerky / zoslanie kúzla
//   kúzlo s cieľom        = drop priamo na vlastnú príšerku
//   ruka/plocha → obchod  = predaj (+1 peniaz)

// ---------- Preklady ----------
const L = {
  pageTitle: { sk: "Zvieracia aréna", cs: "Zvířecí aréna", en: "Animal Arena" },
  title: { sk: "⚔️ Zvieracia aréna", cs: "⚔️ Zvířecí aréna", en: "⚔️ Animal Arena" },
  diffTitle: { sk: "Ako silný má byť súper?", cs: "Jak silný má být soupeř?", en: "How strong is your opponent?" },
  heroYou: { sk: "Ty", cs: "Ty", en: "You" },
  heroBot: { sk: "Robo", cs: "Robo", en: "Robo" },
  stageWord: { sk: "stupeň", cs: "stupeň", en: "Stage" },
  spellWord: { sk: "Kúzlo", cs: "Kouzlo", en: "Spell" },
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
  refresh: { sk: "🔄 Refresh", cs: "🔄 Refresh", en: "🔄 Refresh" },
  tierUp: { sk: "⬆️ Upgrade", cs: "⬆️ Upgrade", en: "⬆️ Upgrade" },
  discoverTitle: { sk: "📖 Vyber si kartu", cs: "📖 Vyber si kartu", en: "📖 Pick a card" },
  win: { sk: "🏆 Vyhral si!", cs: "🏆 Vyhrál jsi!", en: "🏆 You win!" },
  lose: { sk: "😢 Prehral si…", cs: "😢 Prohrál jsi…", en: "😢 You lose…" },
  drawGame: { sk: "🤝 Remíza!", cs: "🤝 Remíza!", en: "🤝 It's a draw!" },
  again: { sk: "Hrať znova", cs: "Hrát znovu", en: "Play again" },
  footNote: {
    sk: "Ťahaj karty prstom alebo myšou: obchod → ruka = kúpa, ruka → plocha = vyloženie, karta → obchod = predaj.",
    cs: "Táhni karty prstem nebo myší: obchod → ruka = koupě, ruka → plocha = vyložení, karta → obchod = prodej.",
    en: "Drag cards: shop → hand = buy, hand → board = play, card → shop = sell.",
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
let busy = false;         // beží animácia / ťah bota
let drag = null;          // aktívne ťahanie karty

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("diffTitle").textContent = t(L.diffTitle);
  $("startBtn").textContent = t(L.play);
  $("newGameBtn").textContent = t(L.newGame);
  $("discoverTitle").textContent = t(L.discoverTitle);
  $("overAgain").textContent = t(L.again);
  $("footNote").textContent = t(L.footNote);
}

// ---------- Výber obtiažnosti ----------
function renderPick() {
  const dbox = $("diffPick");
  dbox.innerHTML = "";
  for (const d of ["easy", "normal", "hard"]) {
    const b = document.createElement("button");
    b.textContent = t(L.diffs[d]);
    b.className = difficulty === d ? "active" : "";
    b.addEventListener("click", () => { difficulty = d; localStorage.setItem("arena.diff", d); renderPick(); });
    dbox.appendChild(b);
  }
}

function startGame() {
  state = Engine.newGame(Math.random);
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
  const def = ev.defId ? Cards.byId[ev.defId] : null;
  const name = def ? Cards.nameOf(def, ev.rank || 1, I18N.lang) : "";
  const emoji = def && def.emoji ? def.emoji + " " : "";
  switch (ev.type) {
    case "buy": return `${t(L.botBought)} ${emoji}${name}`;
    case "play": return `${t(L.botPlayed)} ${emoji}${name}`;
    case "spell": return `${t(L.botSpell)} ${emoji}${name}`;
    case "tierUp": return `${t(L.botTier)} ${ev.tier}`;
    case "evolve": return `${t(L.botEvolve)} ${emoji}${name}!`;
    default: return null;
  }
}

// ---------- Boj ----------
async function runBattle() {
  busy = true;
  // Snímka plôch pred bojom – doBattle stav zmení, animuje sa nad snímkou.
  const snap = {
    p1: state.p1.board.map(x => ({ ...x })),
    p2: state.p2.board.map(x => ({ ...x })),
  };
  const events = Engine.doBattle(state);
  renderAll();
  renderBoardList($("oppBoard"), snap[BOT], false);
  renderBoardList($("myBoard"), snap[HUMAN], false);
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
        log(`${t(L.fight)} ${ev.first === HUMAN ? t(L.you) : t(L.opp)} ${t(L.begins)}.`);
        break;
      case "attack": {
        const a = cardById(ev.aUid), d = cardById(ev.dUid);
        if (a && d) {
          // Útočník priletí pred obrancu a zrazia sa.
          const ra = a.getBoundingClientRect(), rd = d.getBoundingClientRect();
          const dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
          const dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
          a.style.zIndex = "20";
          a.style.transition = "transform .24s ease-in";
          a.style.transform = `translate(${dx * 0.88}px, ${dy * 0.88}px) scale(1.08)`;
          await sleep(250);
          Sfx.hit();
          d.classList.add("hit");
          floatText(d, `-${ev.aDmg}`);
          if (ev.dDmg > 0) floatText(a, `-${ev.dDmg}`);
          a.style.transition = "transform .2s ease-out";
          a.style.transform = "";
          await sleep(300);
          d.classList.remove("hit");
          a.style.zIndex = "";
          a.style.transition = "";
        }
        break;
      }
      case "hp": {
        const el = cardById(ev.uid);
        if (el) {
          const hpEl = el.querySelector(".hp");
          if (hpEl) hpEl.textContent = String(Math.max(0, ev.hp));
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
        if (el) { Sfx.buff(); floatText(el, `+${ev.a}/+${ev.h}`, true); await sleep(300); }
        break;
      }
      case "die": {
        const el = cardById(ev.uid);
        Sfx.die();
        if (el) { el.classList.add("dying"); await sleep(380); el.remove(); }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === HUMAN ? $("myBoard") : $("oppBoard");
        const el = cardEl({ uid: ev.uid, defId: ev.defId, rank: 1, atk: def.atk, hp: def.hp, maxHp: def.hp, taunt: !!def.taunt }, {});
        el.style.gridColumn = String((ev.slot ?? 0) + 1);
        el.style.gridRow = "1";
        row.appendChild(el);
        Sfx.summon();
        await sleep(300);
        break;
      }
      case "heroDmg": {
        const chip = ev.pid === HUMAN ? $("myHero") : $("oppHero");
        Sfx.hero();
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
  hidePreview();
  renderHero($("oppHero"), state[BOT]);
  renderHero($("myHero"), state[HUMAN]);
  renderCorner($("oppDeckBox"), "🂠", t(L.deck), state[BOT].deck.length);
  renderCorner($("oppDiscardBox"), "🗂", t(L.discardPile), state[BOT].discard.length);
  renderCorner($("myDiscardBox"), "🗂", t(L.discardPile), state[HUMAN].discard.length);
  renderCorner($("myDeckBox"), "🂠", t(L.deck), state[HUMAN].deck.length);
  renderBoardList($("oppBoard"), state[BOT].board, false);
  renderBoardList($("myBoard"), state[HUMAN].board, true);
  renderHand();
  renderShop();
  renderDiscover();
}

function renderCorner(el, icon, label, count) {
  el.innerHTML = `<span class="ic">${icon}</span><span class="lb">${label}</span><span class="ct">${count}</span>`;
}

// Tier hrdinu je veľké číslo na štíte s labkou uprostred bannera.
function renderHero(el, p) {
  const hero = p.id === HUMAN
    ? { emoji: "🙂", name: t(L.heroYou) }
    : { emoji: "🤖", name: t(L.heroBot) };
  el.innerHTML = `<span class="who">${hero.emoji} ${hero.name}</span>` +
    `<span class="tier-shield">${p.tier}</span>` +
    `<span class="nums">❤️ ${Math.max(0, p.hp)}</span>`;
}

function renderBoardList(el, list, mine) {
  el.innerHTML = "";
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    const card = cardEl(inst, {});
    // Karta drží svoj slot v šablóne – po smrti suseda sa nič neposúva.
    card.style.gridColumn = String((inst.slot ?? i) + 1);
    card.style.gridRow = "1";
    if (mine) attachDrag(card, { type: "board", idx: i });
    el.appendChild(card);
  }
}

function renderHand() {
  const el = $("handEl");
  el.innerHTML = "";
  const p = state[HUMAN];
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
      attachDrag(card, { type: "common", idx: i });
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
      attachDrag(card, { type: "priv", idx: i });
    } else card.classList.add("disabled");
    if (myTurn) {
      const fb = document.createElement("button");
      fb.className = "freeze-btn";
      fb.textContent = "❄️";
      fb.addEventListener("pointerdown", e => e.stopPropagation());
      fb.addEventListener("click", e => { e.stopPropagation(); act(Engine.toggleFreeze(state, HUMAN, i)); });
      card.appendChild(fb);
    }
    priv.appendChild(card);
  });

  $("refreshBtn").textContent = `${t(L.refresh)} (${Engine.REFRESH_COST}🪙)`;
  $("refreshBtn").disabled = !myTurn || p.money < Engine.REFRESH_COST;
  const cost = Engine.upgradeCost(state, HUMAN);
  $("tierBtn").textContent = cost === null ? `⭐ MAX` : `${t(L.tierUp)} (${cost}🪙)`;
  $("tierBtn").disabled = !myTurn || cost === null || p.money < cost;
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
  if (isInst) el.dataset.uid = instOrId.uid;
  const text = Cards.cardText(def, rank, I18N.lang, true);
  const plainText = Cards.cardText(def, rank, I18N.lang);
  const name = Cards.nameOf(def, rank, I18N.lang);
  const art = Cards.artOf(def, rank);
  let inner = `<span class="tier-tag">⭐${def.tier}</span>`;
  if (opts.shop) inner += `<span class="cost">🪙${Engine.CARD_COST}</span>`;
  inner += art
    ? `<img class="art" src="${art}" alt="" draggable="false">`
    : `<div class="em">${def.emoji}</div>`;
  inner += `<div class="nm">${name}</div>`;
  inner += `<div class="race">${raceLine(def, rank)}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    const atk = isInst ? instOrId.atk : def.atk;
    const hp = isInst ? instOrId.hp : def.hp;
    inner += `<span class="atk">${atk}</span><span class="hp">${hp}</span>`;
  }
  el.innerHTML = inner;
  if (!opts.big) {
    el.title = `${name}${plainText ? " – " + plainText : ""}`;
    attachPreview(el, instOrId, opts);
  }
  return el;
}

// Riadok pod menom: "UNDEAD · 1. STUPEŇ" / kúzlo.
function raceLine(def, rank) {
  if (def.spell) return t(L.spellWord);
  const race = t(Cards.RACES[def.race]);
  const stage = I18N.lang === "en" ? `${t(L.stageWord)} ${rank}` : `${rank}. ${t(L.stageWord)}`;
  return `${race} · ${stage}`;
}

// ---------- Hover preview – zväčšená čitateľná karta ----------
let previewEl = null;

function attachPreview(card, instOrId, opts) {
  card.addEventListener("mouseenter", () => showPreview(card, instOrId, opts));
  card.addEventListener("mouseleave", hidePreview);
  card.addEventListener("pointerdown", hidePreview);
}

function showPreview(card, instOrId, opts) {
  if (drag || busy) return;
  hidePreview();
  const big = cardEl(instOrId, { ...opts, big: true });
  big.classList.add("preview-card");
  document.body.appendChild(big);
  const r = card.getBoundingClientRect();
  const pw = big.offsetWidth, ph = big.offsetHeight;
  // Napravo od karty; keď sa nezmestí, naľavo. Zvislo pri karte, v okne.
  let x = r.right + 12;
  if (x + pw > window.innerWidth - 8) x = r.left - pw - 12;
  let y = r.top + r.height / 2 - ph / 2;
  y = Math.max(8, Math.min(y, window.innerHeight - ph - 8));
  big.style.left = x + "px";
  big.style.top = y + "px";
  previewEl = big;
}

function hidePreview() {
  if (previewEl) { previewEl.remove(); previewEl = null; }
}

// ---------- Drag & drop ----------
function attachDrag(card, src) {
  card.addEventListener("pointerdown", e => startDrag(e, card, src));
}

function startDrag(e, card, src) {
  if (busy || !state || state.active !== HUMAN || state.pendingDiscover || drag) return;
  hidePreview();
  e.preventDefault();
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
  window.addEventListener("pointermove", moveGhost);
  window.addEventListener("pointerup", endDrag, { once: true });
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
  if (src.type === "common" || src.type === "priv") {
    set($("handEl"), "drop-ok");
    set($("myBoard"), "drop-ok");
    return;
  }
  if (src.type === "board") {
    set($("shopPanel"), "drop-sell");
    set($("myBoard"), "drop-ok"); // presun na iný slot
    return;
  }
  const inst = state[HUMAN].hand[src.idx];
  if (!inst) return;
  set($("shopPanel"), "drop-sell");
  if (inst.spell && Cards.byId[inst.defId].fx.type === "buffTarget") {
    $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
  } else {
    set($("myBoard"), "drop-ok");
  }
}

function endDrag(e) {
  window.removeEventListener("pointermove", moveGhost);
  const d = drag;
  drag = null;
  if (!d) return;
  d.ghost.remove();
  d.card.classList.remove("drag-src");
  markZones(d.src, false);
  const src = d.src;
  const p = state[HUMAN];

  if (src.type === "common" || src.type === "priv") {
    if (inRect(e, $("handEl")) || inRect(e, $("myBoard"))) {
      act(src.type === "common"
        ? Engine.buyCommon(state, HUMAN, src.idx)
        : Engine.buyPrivate(state, HUMAN, src.idx));
    }
    return;
  }

  if (src.type === "board") {
    if (inRect(e, $("shopPanel"))) { act(Engine.sellCard(state, HUMAN, "board", src.idx)); return; }
    if (inRect(e, $("myBoard"))) {
      // Presun na slot podľa miesta dropu (poradie útoku = zľava doprava).
      const r = $("myBoard").getBoundingClientRect();
      const cols = getComputedStyle($("myBoard")).gridTemplateColumns.split(" ").length;
      let slot = Math.floor((e.clientX - r.left) / (r.width / cols));
      slot = Math.max(0, Math.min(Engine.BOARD_MAX - 1, slot));
      act(Engine.moveOnBoard(state, HUMAN, src.idx, slot));
    }
    return;
  }

  // src.type === "hand"
  const inst = p.hand[src.idx];
  if (!inst) { renderAll(); return; }
  if (inRect(e, $("shopPanel"))) { act(Engine.sellCard(state, HUMAN, "hand", src.idx)); return; }
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (fx.type === "buffTarget") {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) act(Engine.castSpell(state, HUMAN, src.idx, Number(targetEl.dataset.uid)));
      return;
    }
    if (inRect(e, $("myBoard"))) act(Engine.castSpell(state, HUMAN, src.idx));
    return;
  }
  if (inRect(e, $("myBoard"))) act(Engine.playMinion(state, HUMAN, src.idx));
}

// ---------- Interakcie hráča ----------
function act(events) {
  if (!events) { renderAll(); return; }
  for (const ev of events) {
    if (ev.type === "evolve" && ev.pid === HUMAN) {
      Sfx.evolve();
      log(`${t(L.youEvolve)} ${Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang)}`);
    }
    if ((ev.type === "buy" || ev.type === "sell") && ev.pid === HUMAN) Sfx.coin();
  }
  renderAll();
  // Evolve animácia po prerenderi.
  for (const ev of events) {
    if (ev.type === "evolve") {
      const el = cardById(ev.uid);
      if (el) el.classList.add("evolving");
    }
  }
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
  act(Engine.endShopTurn(state, HUMAN));
  await driveFlow();
}

function showOver() {
  const ov = $("overOverlay");
  ov.classList.remove("hidden");
  const w = state.winner;
  if (w === HUMAN) Sfx.win(); else if (w === BOT) Sfx.lose();
  $("overTitle").textContent = w === "draw" ? t(L.drawGame) : w === HUMAN ? t(L.win) : t(L.lose);
  $("overMsg").textContent = `${t(L.round)}: ${state.round}`;
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
$("newGameBtn").addEventListener("click", () => {
  $("gameScreen").classList.add("hidden");
  $("newGameBtn").classList.add("hidden");
  $("pickScreen").classList.remove("hidden");
  state = null;
});
$("endTurnBtn").addEventListener("click", onEndTurn);
$("refreshBtn").addEventListener("click", () => act(Engine.refreshShop(state, HUMAN)));
$("tierBtn").addEventListener("click", () => act(Engine.upgradeTier(state, HUMAN)));
$("overAgain").addEventListener("click", () => { $("overOverlay").classList.add("hidden"); startGame(); });
$("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
$("muteBtn").addEventListener("click", () => {
  $("muteBtn").textContent = Sfx.toggleMute() ? "🔇" : "🔊";
});

applyI18n();
renderPick();
