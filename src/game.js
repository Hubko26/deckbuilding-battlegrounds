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
  heroFriend: { sk: "Kamarát", cs: "Kamarád", en: "Friend" },
  netBtn: { sk: "📶 Hraj s kamarátom (sieť)", cs: "📶 Hraj s kamarádem (síť)", en: "📶 Play with a friend (LAN)" },
  netConnecting: { sk: "Pripájam…", cs: "Připojuji…", en: "Connecting…" },
  netWaiting: {
    sk: "Čakám na druhého hráča. Na druhom zariadení otvorte:",
    cs: "Čekám na druhého hráče. Na druhém zařízení otevřete:",
    en: "Waiting for the second player. Open this on the other device:",
  },
  netError: {
    sk: "Server nebeží. Spusti hru cez: node server.mjs",
    cs: "Server neběží. Spusť hru přes: node server.mjs",
    en: "Server is not running. Start the game with: node server.mjs",
  },
  netLeft: { sk: "📴 Súper sa odpojil", cs: "📴 Soupeř se odpojil", en: "📴 Opponent disconnected" },
  cancel: { sk: "✖ Zruš", cs: "✖ Zruš", en: "✖ Cancel" },
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
  pulledCopies: {
    sk: "🃏 Kópia z balíčka do ruky",
    cs: "🃏 Kopie z balíčku do ruky",
    en: "🃏 Copy pulled from deck",
  },
  hiddenEvolve: {
    sk: "Tri kópie z balíčka sa spojili:",
    cs: "Tři kopie z balíčku se spojily:",
    en: "Three copies from your deck merged:",
  },
  ok: { sk: "OK", cs: "OK", en: "OK" },
  begins: { sk: "začína", cs: "začíná", en: "begins" },
  battleDraw: { sk: "Boj skončil remízou.", cs: "Boj skončil remízou.", en: "The fight was a draw." },
  heroDmgMsg: { sk: "dostal", cs: "dostal", en: "took" },
  you: { sk: "Ty", cs: "Ty", en: "You" },
  opp: { sk: "Súper", cs: "Soupeř", en: "Opponent" },
};

let MY = "p1", OPP = "p2"; // v sieťovej hre môže byť lokálny hráč p2
const $ = id => document.getElementById(id);

let state = null;
let mode = "bot";         // "bot" | "net"
let difficulty = localStorage.getItem("arena.diff") || "normal";
let busy = false;         // beží animácia / ťah bota
let drag = null;          // aktívne ťahanie karty

// Lokálna akcia: vykoná sa v engine a v sieťovej hre sa pošle súperovi,
// ktorý ju aplikuje na svojej (identickej, rovnako seedovanej) kópii stavu.
function doAction(name, ...args) {
  const ev = Engine[name](state, MY, ...args);
  if (ev && mode === "net") Net.sendAction(name, args);
  return ev;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("diffTitle").textContent = t(L.diffTitle);
  $("startBtn").textContent = t(L.play);
  $("netBtn").textContent = t(L.netBtn);
  $("netCancel").textContent = t(L.cancel);
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
  mode = "bot";
  MY = "p1"; OPP = "p2";
  state = Engine.newGame(Math.random);
  enterGameScreen();
  act(Engine.startRound(state));
  driveFlow();
}

function enterGameScreen() {
  $("pickScreen").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  $("newGameBtn").classList.remove("hidden");
  $("overOverlay").classList.add("hidden");
  logClear();
}

// ---------- Hra po lokálnej sieti ----------
function startNet() {
  mode = "net";
  $("netOverlay").classList.remove("hidden");
  $("netMsg").textContent = t(L.netConnecting);
  Net.connect({
    onWaiting: msg => {
      $("netMsg").textContent = t(L.netWaiting);
      $("netUrls").textContent = (msg.urls || []).join("  ·  ");
    },
    onStart: msg => {
      MY = msg.you;
      OPP = msg.you === "p1" ? "p2" : "p1";
      state = Engine.newGame(Engine.seededRng(msg.seed));
      enterGameScreen();
      act(Engine.startRound(state));
      driveFlow();
    },
    onAction: msg => { remoteQueue = remoteQueue.then(() => applyRemote(msg)); },
    onPeerLeft: () => {
      if (mode !== "net") return;
      Net.disconnect();
      if (state && state.phase !== "over") {
        $("overOverlay").classList.remove("hidden");
        $("overTitle").textContent = t(L.netLeft);
        $("overMsg").textContent = "";
      } else if (!state) {
        // Spojenie zlyhalo ešte pred hrou (beží len statický server bez
        // WebSocketu) – nechaj overlay otvorený s návodom, nezatváraj ho.
        $("netOverlay").classList.remove("hidden");
        $("netMsg").textContent = t(L.netError);
        $("netUrls").textContent = "";
      }
    },
    onError: () => { $("netMsg").textContent = t(L.netError); },
  });
}

let remoteQueue = Promise.resolve();
async function applyRemote(msg) {
  if (!state || state.phase === "over" || mode !== "net") return;
  const ev = Engine[msg.name](state, OPP, ...(msg.args || []));
  if (ev) {
    for (const e of ev) { const m = oppEventMsg(e); if (m) log(m); }
    renderAll();
  }
  await driveFlow();
}

function backToPick() {
  Net.disconnect();
  state = null;
  $("gameScreen").classList.add("hidden");
  $("newGameBtn").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("overOverlay").classList.add("hidden");
  $("pickScreen").classList.remove("hidden");
}

// ---------- Herný tok ----------
async function driveFlow() {
  for (;;) {
    if (state.phase === "over") { renderAll(); showOver(); return; }
    if (state.phase === "battle") { await runBattle(); continue; }
    if (state.active === OPP) {
      if (mode === "bot") { await runBotTurn(); continue; }
      busy = false;
      renderAll();
      return; // sieťová hra: čakáme na akcie súpera
    }
    busy = false;
    renderAll();
    return; // čaká sa na hráča
  }
}

async function runBotTurn() {
  busy = true;
  renderAll();
  await sleep(600);
  const events = Bot.botTurn(state, OPP, difficulty);
  for (const ev of events) {
    const msg = oppEventMsg(ev);
    if (msg) { log(msg); renderAll(); await sleep(650); }
  }
}

function oppEventMsg(ev) {
  if (ev.pid !== OPP) return null;
  const def = ev.defId ? Cards.byId[ev.defId] : null;
  const name = def ? Cards.nameOf(def, ev.rank || 1, I18N.lang) : "";
  const emoji = def && def.emoji ? def.emoji + " " : "";
  let msg;
  switch (ev.type) {
    case "buy": msg = `${t(L.botBought)} ${emoji}${name}`; break;
    case "play": msg = `${t(L.botPlayed)} ${emoji}${name}`; break;
    case "spell": msg = `${t(L.botSpell)} ${emoji}${name}`; break;
    case "tierUp": msg = `${t(L.botTier)} ${ev.tier}`; break;
    case "evolve": msg = `${t(L.botEvolve)} ${emoji}${name}!`; break;
    default: return null;
  }
  // v sieťovej hre je súper človek, nie robot
  return mode === "net" ? msg.replace("🤖", "🧑") : msg;
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
  renderBoardList($("oppBoard"), snap[OPP], false);
  renderBoardList($("myBoard"), snap[MY], false);
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
        log(`${t(L.fight)} ${ev.first === MY ? t(L.you) : t(L.opp)} ${t(L.begins)}.`);
        break;
      case "attack": {
        const a = cardById(ev.aUid), d = cardById(ev.dUid);
        if (a && d) {
          // Útočník priletí pred obrancu a zrazia sa.
          const ra = a.getBoundingClientRect(), rd = d.getBoundingClientRect();
          const dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
          const dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
          a.style.zIndex = "20";
          a.style.transition = "transform .35s ease-in";
          a.style.transform = `translate(${dx * 0.88}px, ${dy * 0.88}px) scale(1.08)`;
          await sleep(370);
          Sfx.hit();
          d.classList.add("hit");
          floatText(d, `-${ev.aDmg}`);
          if (ev.dDmg > 0) floatText(a, `-${ev.dDmg}`);
          await sleep(480);
          a.style.transition = "transform .25s ease-out";
          a.style.transform = "";
          await sleep(300);
          d.classList.remove("hit");
          a.style.zIndex = "";
          a.style.transition = "";
        }
        break;
      }
      case "proc": {
        // Schopnosť sa spúšťa: zlatý záblesk + label kľúčového slova na karte.
        const el = cardById(ev.uid);
        if (el) {
          el.classList.add("proc");
          const badge = document.createElement("div");
          badge.className = "proc-badge";
          badge.textContent = Cards.KW_LABEL[ev.kw][I18N.lang] + "!";
          el.appendChild(badge);
          Sfx.buff();
          await sleep(750);
          el.classList.remove("proc");
          badge.remove();
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
        const fromEl = ev.from ? cardById(ev.from) : null;
        if (el) {
          // Projektil od zdroja k cieľu, potom zásah.
          if (fromEl) await shootProjectile(fromEl, el);
          Sfx.zap();
          el.classList.add("hit");
          floatText(el, `-${ev.n}`);
          await sleep(550);
          el.classList.remove("hit");
        }
        break;
      }
      case "buff": {
        const el = cardById(ev.uid);
        if (el) {
          Sfx.buff();
          floatText(el, `+${ev.a}/+${ev.h}`, true);
          // Prepíš čísla na karte, nech buff reálne vidno.
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a);
          if (hpEl && ev.h) hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h);
          el.classList.add("evolving");
          await sleep(500);
          el.classList.remove("evolving");
        }
        break;
      }
      case "die": {
        const el = cardById(ev.uid);
        Sfx.die();
        if (el) { el.classList.add("dying"); await sleep(500); el.remove(); }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === MY ? $("myBoard") : $("oppBoard");
        const el = cardEl({ uid: ev.uid, defId: ev.defId, rank: 1, atk: def.atk, hp: def.hp, maxHp: def.hp, taunt: !!def.taunt }, {});
        el.style.gridColumn = String((ev.slot ?? 0) + 1);
        el.style.gridRow = "1";
        row.appendChild(el);
        Sfx.summon();
        await sleep(450);
        break;
      }
      case "heroDmg": {
        const chip = ev.pid === MY ? $("myHero") : $("oppHero");
        Sfx.hero();
        floatText(chip, `-${ev.dmg}`);
        log(`${ev.pid === MY ? t(L.you) : t(L.opp)} ${t(L.heroDmgMsg)} 💥 ${ev.dmg}`);
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

// Letiaci projektil zo stredu jednej karty do stredu druhej.
function shootProjectile(fromEl, toEl) {
  return new Promise(resolve => {
    const rf = fromEl.getBoundingClientRect(), rt = toEl.getBoundingClientRect();
    const p = document.createElement("div");
    p.className = "projectile";
    p.style.left = (rf.left + rf.width / 2) + "px";
    p.style.top = (rf.top + rf.height / 2) + "px";
    document.body.appendChild(p);
    // reflow, aby transition zabrala
    p.getBoundingClientRect();
    const dx = (rt.left + rt.width / 2) - (rf.left + rf.width / 2);
    const dy = (rt.top + rt.height / 2) - (rf.top + rf.height / 2);
    p.style.transform = `translate(${dx}px, ${dy}px)`;
    setTimeout(() => { p.remove(); resolve(); }, 420);
  });
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
  renderHero($("oppHero"), state[OPP]);
  renderHero($("myHero"), state[MY]);
  renderCorner($("oppDeckBox"), "🂠", t(L.deck), state[OPP].deck.length);
  renderCorner($("oppDiscardBox"), "🗂", t(L.discardPile), state[OPP].discard.length);
  renderCorner($("myDiscardBox"), "🗂", t(L.discardPile), state[MY].discard.length);
  renderCorner($("myDeckBox"), "🂠", t(L.deck), state[MY].deck.length);
  renderBoardList($("oppBoard"), state[OPP].board, false);
  renderBoardList($("myBoard"), state[MY].board, true);
  renderHand();
  renderShop();
  renderDiscover();
}

function renderCorner(el, icon, label, count) {
  el.innerHTML = `<span class="ic">${icon}</span><span class="lb">${label}</span><span class="ct">${count}</span>`;
}

// Tier hrdinu je veľké číslo na štíte s labkou uprostred bannera.
function renderHero(el, p) {
  const hero = p.id === MY
    ? { emoji: "🙂", name: t(L.heroYou) }
    : mode === "net"
      ? { emoji: "🧑", name: t(L.heroFriend) }
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
  const p = state[MY];
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
  const p = state[MY];
  const myTurn = state.active === MY && !busy;
  $("moneyEl").textContent = `🪙 ${p.money}`;
  // Aktívne permanentné aury („všetky budúce X…“).
  $("auraEl").textContent = Object.entries(p.raceBuffs || {})
    .map(([race, b]) => `${Cards.RACE_ICON[race]}+${b.a}/+${b.h}`)
    .join(" ");
  const banner = $("turnBanner");
  if (state.active === MY) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.yourTurn)}`;
    banner.className = "banner";
  } else if (state.active === OPP) {
    banner.textContent = `${t(L.round)} ${state.round} · ${t(L.enemyTurn)}`;
    banner.className = "banner enemy";
  }

  const commons = $("commonsRow");
  commons.innerHTML = "";
  state.commons.forEach((defId, i) => {
    const card = cardEl(defId, { shop: true, owned: Bot.ownedCount(p, defId) });
    if (myTurn && p.money >= Engine.cardCost(defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "common", idx: i });
    } else card.classList.add("disabled");
    commons.appendChild(card);
  });

  const priv = $("privRow");
  priv.innerHTML = "";
  p.priv.forEach((s, i) => {
    const card = cardEl(s.defId, { shop: true, owned: Bot.ownedCount(p, s.defId) });
    if (s.frozen) card.classList.add("frozen");
    if (myTurn && p.money >= Engine.cardCost(s.defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "priv", idx: i });
    } else card.classList.add("disabled");
    if (myTurn) {
      const fb = document.createElement("button");
      fb.className = "freeze-btn";
      fb.textContent = "❄️";
      fb.addEventListener("pointerdown", e => e.stopPropagation());
      fb.addEventListener("click", e => { e.stopPropagation(); act(doAction("toggleFreeze", i)); });
      card.appendChild(fb);
    }
    priv.appendChild(card);
  });

  $("refreshBtn").textContent = `${t(L.refresh)} (${Engine.REFRESH_COST}🪙)`;
  $("refreshBtn").disabled = !myTurn || p.money < Engine.REFRESH_COST;
  const cost = Engine.upgradeCost(state, MY);
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
  if (opts.shop) inner += `<span class="cost">🪙${Engine.cardCost(defId)}</span>`;
  // Koľko kópií už vlastníš (vrátane balíčka a kôpky) – kúpa tretej evolvne.
  if (opts.owned) inner += `<span class="owned${opts.owned >= 2 ? " hot" : ""}">${Math.min(opts.owned, 2)}/3</span>`;
  inner += art
    ? `<img class="art" src="${art}" alt="" draggable="false">`
    : `<div class="em">${def.emoji}</div>`;
  inner += `<div class="nm">${name}</div>`;
  inner += `<div class="race">${raceLine(def, rank)}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    const atk = isInst ? instOrId.atk : def.atk;
    const hp = isInst ? instOrId.hp : def.hp;
    // Buffnuté staty zelenou – vidno rozdiel oproti základu daného stupňa.
    const baseAtk = def.atk * Cards.STAT_MULT[rank];
    const baseHp = def.hp * Cards.STAT_MULT[rank];
    inner += `<span class="atk${atk > baseAtk ? " buffed" : ""}">${atk}</span>` +
      `<span class="hp${hp > baseHp ? " buffed" : ""}">${hp}</span>`;
  }
  el.innerHTML = inner;
  if (!opts.big) {
    el.title = `${name}${plainText ? " – " + plainText : ""}`;
    attachPreview(el, instOrId, opts);
  }
  return el;
}

// Rasa úplne dole medzi útokom a životom. Stupeň sa nepíše –
// vidno ho podľa farby kryštálu na ráme karty.
function raceLine(def, rank) {
  if (def.spell) return t(L.spellWord);
  return t(Cards.RACES[def.race]);
}

// ---------- Hover preview – zväčšená čitateľná karta ----------
let previewEl = null;

function attachPreview(card, instOrId, opts) {
  card._previewData = { instOrId, opts }; // pre long-press (mobil)
  card.addEventListener("mouseenter", () => { if (!press) showPreview(card, instOrId, opts); });
  card.addEventListener("mouseleave", () => { if (!press) hidePreview(); });
  // Karty bez drag & dropu (súperov board, vypnutý obchod): podržanie = preview.
  card.addEventListener("pointerdown", e => {
    if (card._hasDrag) return; // rieši startDrag/press
    hidePreview();
    const timer = setTimeout(() => showPreview(card, instOrId, opts), 420);
    const up = () => { clearTimeout(timer); hidePreview(); };
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  });
}

function showPreview(card, instOrId, opts) {
  if (drag || busy) return;
  hidePreview();
  const big = cardEl(instOrId, { ...opts, big: true });
  big.classList.add("preview-card");
  document.body.appendChild(big);
  const r = card.getBoundingClientRect();
  const pw = big.offsetWidth, ph = big.offsetHeight;
  let x, y;
  if (window.innerWidth < 700) {
    // Mobil: preview na stred obrazovky, nech nikdy neutečie mimo.
    x = (window.innerWidth - pw) / 2;
    y = (window.innerHeight - ph) / 2;
  } else {
    // Desktop: napravo od karty; keď sa nezmestí, naľavo. Zvislo pri karte.
    x = r.right + 12;
    if (x + pw > window.innerWidth - 8) x = r.left - pw - 12;
    y = r.top + r.height / 2 - ph / 2;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
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
  card._hasDrag = true;
  card.addEventListener("pointerdown", e => startDrag(e, card, src));
}

// Ťahanie začína až po pohybe > 8 px. Podržanie prsta bez pohybu ukáže
// zväčšenú kartu (mobilná náhrada za hover preview).
let press = null; // { card, src, x0, y0, canDrag, longTimer }

function startDrag(e, card, src) {
  if (drag || press) return;
  hidePreview();
  e.preventDefault();
  const canDrag = !busy && state && state.active === MY && !state.pendingDiscover;
  press = { card, src, x0: e.clientX, y0: e.clientY, canDrag };
  press.longTimer = setTimeout(() => {
    if (press && !drag && card._previewData) {
      showPreview(card, card._previewData.instOrId, card._previewData.opts);
    }
  }, 420);
  window.addEventListener("pointermove", onPressMove);
  window.addEventListener("pointerup", onPressUp, { once: true });
}

function onPressMove(e) {
  if (drag) { moveGhost(e); return; }
  if (!press) return;
  if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 8) {
    clearTimeout(press.longTimer);
    hidePreview();
    if (press.canDrag) beginDrag(e, press.card, press.src);
    press = null;
  }
}

function onPressUp(e) {
  window.removeEventListener("pointermove", onPressMove);
  if (press) { clearTimeout(press.longTimer); hidePreview(); press = null; }
  if (drag) endDrag(e);
}

function beginDrag(e, card, src) {
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
  const inst = state[MY].hand[src.idx];
  if (!inst) return;
  set($("shopPanel"), "drop-sell");
  if (inst.spell && Cards.byId[inst.defId].fx.type === "buffTarget") {
    $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
  } else {
    set($("myBoard"), "drop-ok");
  }
}

function endDrag(e) {
  const d = drag;
  drag = null;
  if (!d) return;
  d.ghost.remove();
  d.card.classList.remove("drag-src");
  markZones(d.src, false);
  const src = d.src;
  const p = state[MY];

  if (src.type === "common" || src.type === "priv") {
    if (inRect(e, $("handEl")) || inRect(e, $("myBoard"))) {
      act(src.type === "common"
        ? doAction("buyCommon", src.idx)
        : doAction("buyPrivate", src.idx));
    }
    return;
  }

  if (src.type === "board") {
    if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "board", src.idx)); return; }
    if (inRect(e, $("myBoard"))) {
      // Presun na slot podľa miesta dropu (poradie útoku = zľava doprava).
      const r = $("myBoard").getBoundingClientRect();
      const cols = getComputedStyle($("myBoard")).gridTemplateColumns.split(" ").length;
      let slot = Math.floor((e.clientX - r.left) / (r.width / cols));
      slot = Math.max(0, Math.min(Engine.BOARD_MAX - 1, slot));
      act(doAction("moveOnBoard", src.idx, slot));
    }
    return;
  }

  // src.type === "hand"
  const inst = p.hand[src.idx];
  if (!inst) { renderAll(); return; }
  if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "hand", src.idx)); return; }
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (fx.type === "buffTarget") {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) act(doAction("castSpell", src.idx, Number(targetEl.dataset.uid)));
      return;
    }
    if (inRect(e, $("myBoard"))) act(doAction("castSpell", src.idx));
    return;
  }
  if (inRect(e, $("myBoard"))) act(doAction("playMinion", src.idx));
}

// ---------- Interakcie hráča ----------
function act(events) {
  if (!events) { renderAll(); return; }
  const hiddenEvolves = [];
  for (const ev of events) {
    if (ev.type === "evolve" && ev.pid === MY) {
      Sfx.evolve();
      log(`${t(L.youEvolve)} ${Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang)}`);
      if (ev.hidden) hiddenEvolves.push(Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang));
    }
    if ((ev.type === "buy" || ev.type === "sell") && ev.pid === MY) Sfx.coin();
    if (ev.type === "toHand" && ev.pid === MY) log(t(L.pulledCopies));
    if (ev.type === "futureBuff" && ev.pid === MY) {
      Sfx.evolve();
      log(`${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]} +${ev.a}/+${ev.h}!`);
    }
  }
  renderAll();
  // Evolve animácia po prerenderi.
  for (const ev of events) {
    if (ev.type === "evolve" && ev.uid) {
      const el = cardById(ev.uid);
      if (el) el.classList.add("evolving");
    }
  }
  // Trojica zo skrytých kópií (balíček/kôpka) – ohlás popupom.
  if (hiddenEvolves.length) {
    $("evolveMsg").textContent = `${t(L.hiddenEvolve)} ${hiddenEvolves.join(", ")}!`;
    $("evolveOverlay").classList.remove("hidden");
  }
}

function renderDiscover() {
  const ov = $("discoverOverlay");
  const pd = state.pendingDiscover;
  if (!pd || pd.pid !== MY) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  const row = $("discoverRow");
  row.innerHTML = "";
  pd.options.forEach((defId, i) => {
    const card = cardEl(defId, {});
    card.classList.add("buyable");
    card.addEventListener("click", () => act(doAction("pickDiscover", i)));
    row.appendChild(card);
  });
}

async function onEndTurn() {
  if (busy || state.active !== MY || state.pendingDiscover) return;
  act(doAction("endShopTurn"));
  await driveFlow();
}

function showOver() {
  const ov = $("overOverlay");
  ov.classList.remove("hidden");
  const w = state.winner;
  if (w === MY) Sfx.win(); else if (w === OPP) Sfx.lose();
  $("overTitle").textContent = w === "draw" ? t(L.drawGame) : w === MY ? t(L.win) : t(L.lose);
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
$("netBtn").addEventListener("click", startNet);
$("netCancel").addEventListener("click", backToPick);
$("newGameBtn").addEventListener("click", backToPick);
$("endTurnBtn").addEventListener("click", onEndTurn);
$("evolveOk").addEventListener("click", () => $("evolveOverlay").classList.add("hidden"));
$("refreshBtn").addEventListener("click", () => act(doAction("refreshShop")));
$("tierBtn").addEventListener("click", () => act(doAction("upgradeTier")));
$("overAgain").addEventListener("click", () => {
  $("overOverlay").classList.add("hidden");
  if (mode === "net") backToPick();
  else startGame();
});
$("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
$("muteBtn").addEventListener("click", () => {
  $("muteBtn").textContent = Sfx.toggleMute() ? "🔇" : "🔊";
});

// Dlhé podržanie na karte nesmie otvoriť natívne menu prehliadača
// („stiahnuť obrázok“) – long-press ukazuje preview karty.
document.addEventListener("contextmenu", e => {
  if (e.target.closest && e.target.closest(".card")) e.preventDefault();
});

applyI18n();
renderPick();
