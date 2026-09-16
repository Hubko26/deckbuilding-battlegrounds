// Lokalizácia: slovenčina, čeština, angličtina (prevzaté z projektu Pre Deti).
//
//   t({ sk: "Ahoj", cs: "Ahoj", en: "Hi" })  – preloží podľa zvoleného jazyka
//
// Prepínač jazyka sa sám pridá do <header> (vpravo hore).
//
// Tento súbor je zároveň JEDINÉ miesto s textami hry: `L` (UI game.js),
// `L.botTaunts` (hlášky bota), `L.chess` (šach popri hre), `L.langNames`
// (Claude bot) a `L.cards` (rasy, kľúčové slová, mená kúziel/tokenov a
// šablóny textov schopností). Ostatné súbory texty len čítajú.
// Načítava sa aj v Node (testy, tools cez vm) – DOM/localStorage sú voliteľné.
const I18N = (() => {
  const LANGS = { sk: "SK", cs: "CZ", en: "EN" };
  const KEY = "lang";
  const hasDom = typeof document !== "undefined";

  function detect() {
    let saved = null;
    try { saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null; } catch { /* zakázané úložisko */ }
    if (LANGS[saved]) return saved;
    const nav = ((typeof navigator !== "undefined" && navigator.language) || "sk").toLowerCase();
    if (nav.startsWith("cs")) return "cs";
    if (nav.startsWith("en")) return "en";
    return "sk";
  }

  let lang = detect();
  if (hasDom) document.documentElement.lang = lang;

  function t(o) {
    if (o === null || o === undefined) return "";
    if (typeof o !== "object") return o;
    return o[lang] ?? o.sk ?? Object.values(o)[0];
  }

  function set(l) {
    if (!LANGS[l] || l === lang) return;
    localStorage.setItem(KEY, l);
    location.reload();
  }

  function attach() {
    const header = document.querySelector("header");
    if (!header || header.querySelector(".langsw")) return;
    const box = document.createElement("div");
    box.className = "langsw";
    for (const [code, label] of Object.entries(LANGS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className = code === lang ? "active" : "";
      b.addEventListener("click", () => set(code));
      box.appendChild(b);
    }
    header.appendChild(box);
  }

  if (hasDom) document.addEventListener("DOMContentLoaded", attach);

  return { get lang() { return lang; }, t, set, attach, LANGS };
})();

const t = I18N.t;

// ---------- Texty UI (game.js) ----------
// Použitie: t(L.kľúč). Zástupné {x} dopĺňa game.js cez fmt().
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
  netReconnecting: {
    sk: "📡 Spojenie vypadlo – obnovujem…",
    cs: "📡 Spojení vypadlo – obnovuji…",
    en: "📡 Connection lost – reconnecting…",
  },
  netResumed: { sk: "📡 Spojenie obnovené ✓", cs: "📡 Spojení obnoveno ✓", en: "📡 Connection restored ✓" },
  netAway: {
    sk: "📵 Kamarát odišiel z hry (prepol aplikáciu). Čakám {s} s…",
    cs: "📵 Kamarád odešel ze hry (přepnul aplikaci). Čekám {s} s…",
    en: "📵 Your friend left the game (switched apps). Waiting {s} s…",
  },
  netBack: { sk: "👋 Kamarát je späť", cs: "👋 Kamarád je zpět", en: "👋 Your friend is back" },
  netAwayLeft: {
    sk: "📴 Kamarát sa nevrátil do hry",
    cs: "📴 Kamarád se nevrátil do hry",
    en: "📴 Your friend did not come back",
  },
  chatPhNet: { sk: "Napíš kamarátovi…", cs: "Napiš kamarádovi…", en: "Message your friend…" },
  rejoinBtn: { sk: "↩️ Vrátiť sa do hry", cs: "↩️ Vrátit se do hry", en: "↩️ Return to the game" },
  rejoinWait: {
    sk: "📴 Kamarát sa odpojil. Čakám, či sa vráti (najviac 10 min)…",
    cs: "📴 Kamarád se odpojil. Čekám, jestli se vrátí (nejvíc 10 min)…",
    en: "📴 Your friend disconnected. Waiting for them to come back (up to 10 min)…",
  },
  rejoinWaitCode: {
    sk: "Nech otvorí hru a stlačí „Vrátiť sa do hry“ – kód:",
    cs: "Ať otevře hru a stiskne „Vrátit se do hry“ – kód:",
    en: "They should open the game and press “Return to the game” – code:",
  },
  rejoining: { sk: "↩️ Vraciam sa do hry…", cs: "↩️ Vracím se do hry…", en: "↩️ Returning to the game…" },
  rejoinNoGame: {
    sk: "Hra na obnovenie sa nenašla – kamarát už nečaká.",
    cs: "Hra k obnovení nenalezena – kamarád už nečeká.",
    en: "No game to return to – your friend is no longer waiting.",
  },
  rejoinedMsg: { sk: "↩️ Kamarát sa vrátil do hry", cs: "↩️ Kamarád se vrátil do hry", en: "↩️ Your friend is back in the game" },
  rejoinedMe: { sk: "↩️ Si späť v hre", cs: "↩️ Jsi zpět ve hře", en: "↩️ You are back in the game" },
  netKicked: {
    sk: "📵 Bol si dlho preč – vraciam ťa do hry…",
    cs: "📵 Byl jsi dlouho pryč – vracím tě do hry…",
    en: "📵 You were away too long – returning you to the game…",
  },
  netDesync: {
    sk: "Hra sa rozsynchronizovala – stavy hráčov sa rozišli. Obaja obnovte stránku (Ctrl+F5) a založte novú hru.",
    cs: "Hra se rozsynchronizovala – stavy hráčů se rozešly. Oba obnovte stránku (Ctrl+F5) a založte novou hru.",
    en: "The game desynced – player states diverged. Both refresh the page (Ctrl+F5) and start a new game.",
  },
  verWarn: {
    sk: "Máte rozdielne verzie hry! Obaja stlačte Ctrl+F5 (obnoviť stránku) a založte novú hru – inak sa hra rozíde.",
    cs: "Máte rozdílné verze hry! Oba stiskněte Ctrl+F5 (obnovit stránku) a založte novou hru – jinak se hra rozejde.",
    en: "You are running different game versions! Both press Ctrl+F5 (refresh) and start a new game – otherwise the game will desync.",
  },
  peerIntro: {
    sk: "Hraj cez kód miestnosti (cez internet):",
    cs: "Hraj přes kód místnosti (přes internet):",
    en: "Play with a room code (over the internet):",
  },
  peerHost: { sk: "🎲 Vytvoriť hru", cs: "🎲 Vytvořit hru", en: "🎲 Create a game" },
  peerJoin: { sk: "Pripojiť sa", cs: "Připojit se", en: "Join" },
  peerShare: {
    sk: "Povedz kamarátovi tento kód a nech sa pripojí:",
    cs: "Řekni kamarádovi tento kód, ať se připojí:",
    en: "Tell your friend this code so they can join:",
  },
  peerNotFound: {
    sk: "Hra s týmto kódom sa nenašla. Skontroluj kód.",
    cs: "Hra s tímto kódem nenalezena. Zkontroluj kód.",
    en: "No game found with that code. Check the code.",
  },
  peerCodeTaken: {
    sk: "Kód je obsadený – skús vytvoriť hru znova.",
    cs: "Kód je obsazený – zkus vytvořit hru znovu.",
    en: "Code is taken – try creating the game again.",
  },
  peerError: {
    sk: "Spojenie zlyhalo. Skontroluj internet a skús znova.",
    cs: "Spojení selhalo. Zkontroluj internet a zkus znovu.",
    en: "Connection failed. Check the internet and try again.",
  },
  peerTimeout: {
    sk: "Spojenie sa nepodarilo nadviazať. Nech kamarát vytvorí hru NANOVO a hneď zadaj nový kód. Ak to nepomôže, jeden z vás nech skúsi inú sieť (mobilné dáta) – niektoré wifi blokujú priame spojenie.",
    cs: "Spojení se nepodařilo navázat. Ať kamarád vytvoří hru ZNOVU a hned zadej nový kód. Pokud to nepomůže, jeden z vás ať zkusí jinou síť (mobilní data) – některé wifi blokují přímé spojení.",
    en: "Could not establish the connection. Have your friend create the game AGAIN and enter the new code right away. If that fails, one of you should try another network (mobile data) – some wifi blocks direct connections.",
  },
  cancel: { sk: "✖ Zruš", cs: "✖ Zruš", en: "✖ Cancel" },
  stageWord: { sk: "stupeň", cs: "stupeň", en: "Stage" },
  spellWord: { sk: "Kúzlo", cs: "Kouzlo", en: "Spell" },
  diffs: {
    easy: { sk: "🙂 Ľahký", cs: "🙂 Lehký", en: "🙂 Easy" },
    normal: { sk: "😎 Normálny", cs: "😎 Normální", en: "😎 Normal" },
    hard: { sk: "😈 Ťažký", cs: "😈 Těžký", en: "😈 Hard" },
    claude: { sk: "🧠 Claude", cs: "🧠 Claude", en: "🧠 Claude" },
  },
  claudeKeyLabel: { sk: "Anthropic API kľúč:", cs: "Anthropic API klíč:", en: "Anthropic API key:" },
  claudeKeyNote: {
    sk: "Kľúč ostáva len v tomto prehliadači (localStorage) – nikam inam sa neposiela, platí sa zaň Anthropic API.",
    cs: "Klíč zůstává jen v tomto prohlížeči (localStorage) – nikam jinam se neposílá, platí se za něj Anthropic API.",
    en: "The key stays in this browser only (localStorage) – it goes nowhere else; Anthropic API usage is billed.",
  },
  claudeNameLabel: { sk: "Tvoje meno:", cs: "Tvoje jméno:", en: "Your name:" },
  claudeNamePh: { sk: "napr. Kubo", cs: "např. Kuba", en: "e.g. Jake" },
  claudeNeedKey: {
    sk: "Claude súper potrebuje API kľúč – vlož ho do políčka.",
    cs: "Claude soupeř potřebuje API klíč – vlož ho do políčka.",
    en: "The Claude opponent needs an API key – paste it in the field.",
  },
  claudeNameGate: {
    sk: "Claude súper hrá len proti vyvoleným. Napíš správne meno. 😜",
    cs: "Claude soupeř hraje jen proti vyvoleným. Napiš správné jméno. 😜",
    en: "The Claude opponent only plays the chosen ones. Enter the right name. 😜",
  },
  claudeGreeting: {
    sk: "{n}, zase meškáš na náš súboj! 🕐",
    cs: "{n}, zase jdeš pozdě na náš souboj! 🕐",
    en: "{n}, late to our duel again! 🕐",
  },
  chatPh: { sk: "Odkáž niečo Claudovi…", cs: "Vzkaž něco Claudovi…", en: "Say something to Claude…" },
  claudeFallback: {
    sk: "⚠️ Claude nedostupný (API zlyhalo) – ťah dohral ťažký bot.",
    cs: "⚠️ Claude nedostupný (API selhalo) – tah dohrál těžký bot.",
    en: "⚠️ Claude unavailable (API failed) – hard bot finished the turn.",
  },
  play: { sk: "Hraj!", cs: "Hraj!", en: "Play!" },
  newGame: { sk: "Nová hra", cs: "Nová hra", en: "New game" },
  mutToggle: {
    sk: "🎲 Pravidlo dnešnej arény (náhodná mutácia)",
    cs: "🎲 Pravidlo dnešní arény (náhodná mutace)",
    en: "🎲 Rule of the day (random mutation)",
  },
  // Fáza BAN na začiatku hry (engine pickBan).
  banToggle: {
    sk: "🚫 Ban rasy (každý vyberie jednu, jedna z dvoch sa vylosuje)",
    cs: "🚫 Ban rasy (každý vybere jednu, jedna ze dvou se vylosuje)",
    en: "🚫 Race ban (each picks one, one of the two is drawn)",
  },
  banTitle: { sk: "🚫 Ktorá rasa dnes NEBUDE v aréne?", cs: "🚫 Která rasa dnes NEBUDE v aréně?", en: "🚫 Which race is OUT of the arena today?" },
  banIntro: {
    sk: "Vyber jednu z troch rás. Súper vyberá z iných troch – z vašich dvoch sa jedna vylosuje a jej karty v hre nebudú.",
    cs: "Vyber jednu ze tří ras. Soupeř vybírá z jiných tří – z vašich dvou se jedna vylosuje a její karty ve hře nebudou.",
    en: "Pick one of three races. Your opponent picks from the other three – one of your two picks is drawn and its cards are out of the game.",
  },
  banWait: { sk: "Vybrané! Čakám na súpera…", cs: "Vybráno! Čekám na soupeře…", en: "Picked! Waiting for the opponent…" },
  banOppPicked: { sk: "Súper si vybral rasu na ban", cs: "Soupeř si vybral rasu na ban", en: "Opponent picked a race to ban" },
  banResult: { sk: "Vylosované: dnes bez rasy", cs: "Vylosováno: dnes bez rasy", en: "Drawn: today without" },
  banByMe: { sk: "tvoj výber", cs: "tvůj výběr", en: "your pick" },
  banByOpp: { sk: "súperov výber", cs: "soupeřův výběr", en: "opponent's pick" },
  banBoxTitle: { sk: "Zabanovaná rasa", cs: "Zabanovaná rasa", en: "Banned race" },
  yourTurn: { sk: "Tvoj ťah – nakupuj!", cs: "Tvůj tah – nakupuj!", en: "Your turn – go shopping!" },
  enemyTurn: { sk: "Súper nakupuje…", cs: "Soupeř nakupuje…", en: "Opponent is shopping…" },
  buyBack: { sk: "↩️ Vrátiť predaj", cs: "↩️ Vrátit prodej", en: "↩️ Undo sell" },
  buyBackMsg: { sk: "↩️ Predaj vrátený – karta je späť v ruke", cs: "↩️ Prodej vrácen – karta je zpět v ruce", en: "↩️ Sale undone – the card is back in your hand" },
  fight: { sk: "⚔️ Boj!", cs: "⚔️ Boj!", en: "⚔️ Fight!" },
  round: { sk: "Kolo", cs: "Kolo", en: "Round" },
  endTurn: { sk: "✅ Koniec ťahu", cs: "✅ Konec tahu", en: "✅ End turn" },
  refresh: { sk: "🔄 Refresh", cs: "🔄 Refresh", en: "🔄 Refresh" },
  freeze: { sk: "❄️ Freeze", cs: "❄️ Freeze", en: "❄️ Freeze" },
  unfreeze: { sk: "❄️ Odmraziť", cs: "❄️ Rozmrazit", en: "❄️ Unfreeze" },
  tierUp: { sk: "⬆️ Upgrade", cs: "⬆️ Upgrade", en: "⬆️ Upgrade" },
  // Mutácie – „Pravidlo dnešnej arény" (engine MUTATORS); e = ikonka.
  mutTitle: { sk: "Pravidlo arény", cs: "Pravidlo arény", en: "Arena rule" },
  mutators: {
    echoDeath: {
      e: "🔁", sk: "Dvojité ozveny", cs: "Dvojité ozvěny", en: "Double Echoes",
      d: { sk: "Schopnosti Pri smrti sa spúšťajú 2×.", cs: "Schopnosti Při smrti se spouští 2×.", en: "Deathrattles trigger twice." },
    },
    bloodMoon: {
      e: "🌕", sk: "Krvavý mesiac", cs: "Krvavý měsíc", en: "Blood Moon",
      d: { sk: "Príšerky, čo prežijú boj, dostanú +1/+1 navždy.", cs: "Příšerky, které přežijí boj, dostanou +1/+1 navždy.", en: "Minions that survive a fight get +1/+1 forever." },
    },
    freeRefresh: {
      e: "🔄", sk: "Rýchly trh", cs: "Rychlý trh", en: "Fast Market",
      d: { sk: "Refresh obchodu je zadarmo.", cs: "Refresh obchodu je zdarma.", en: "Shop refresh is free." },
    },
    twinEvolve: {
      e: "👯", sk: "Dvojčatá", cs: "Dvojčata", en: "Twins",
      d: { sk: "Na evolve stačia 2 kópie namiesto 3.", cs: "Na evolve stačí 2 kopie místo 3.", en: "Evolving takes 2 copies instead of 3." },
    },
    plenty: {
      e: "🛒", sk: "Hojnosť", cs: "Hojnost", en: "Abundance",
      d: { sk: "Obchod ponúka +1 spoločnú kartu.", cs: "Obchod nabízí +1 společnou kartu.", en: "The shop offers +1 shared card." },
    },
    richSell: {
      e: "💰", sk: "Náhly zisk", cs: "Náhlý zisk", en: "Windfall",
      d: { sk: "Predaj karty dáva 2 mince.", cs: "Prodej karty dává 2 mince.", en: "Selling a card gives 2 coins." },
    },
    smallArena: {
      e: "⚡", sk: "Malá aréna", cs: "Malá aréna", en: "Small Arena",
      d: { sk: "Hrdinovia majú len 35 ❤️.", cs: "Hrdinové mají jen 35 ❤️.", en: "Heroes have only 35 ❤️." },
    },
    marathon: {
      e: "🐢", sk: "Maratón", cs: "Maraton", en: "Marathon",
      d: { sk: "Hrdinovia majú 65 ❤️.", cs: "Hrdinové mají 65 ❤️.", en: "Heroes have 65 ❤️." },
    },
    gift: {
      e: "🎁", sk: "Darček", cs: "Dárek", en: "Gift",
      d: { sk: "Každé kolo dostaneš náhodné kúzlo do ruky.", cs: "Každé kolo dostaneš náhodné kouzlo do ruky.", en: "Each round you get a random spell in hand." },
    },
    echoCry: {
      e: "📣", sk: "Echo battlecry", cs: "Echo battlecry", en: "Echo Battlecry",
      d: { sk: "Battlecry sa spúšťa 2×.", cs: "Battlecry se spouští 2×.", en: "Battlecries trigger twice." },
    },
  },
  // Trinkety (engine TRINKETS) – ikonka e, meno, popis d. Ponuka 1 z 3 v kole 4 a 8.
  trinketToggle: {
    sk: "🧿 Trinkety (kolo 4 a 8: každý si vyberie trvalý bonus)",
    cs: "🧿 Trinkety (kolo 4 a 8: každý si vybere trvalý bonus)",
    en: "🧿 Trinkets (round 4 and 8: each player picks a permanent bonus)",
  },
  trinketTitle: { sk: "🧿 Vyber si trinket", cs: "🧿 Vyber si trinket", en: "🧿 Pick a trinket" },
  trinketIntro: {
    sk: "Trvalý bonus na celú hru. Vyber jeden z troch – ak nevyberieš, na konci ťahu dostaneš prvý.",
    cs: "Trvalý bonus na celou hru. Vyber jeden ze tří – když nevybereš, na konci tahu dostaneš první.",
    en: "A permanent bonus for the whole game. Pick one of three – if you don't, you get the first one at end of turn.",
  },
  trinketPicked: { sk: "🧿 Tvoj trinket:", cs: "🧿 Tvůj trinket:", en: "🧿 Your trinket:" },
  trinketAuto: { sk: "🧿 Nevybral si – dostal si", cs: "🧿 Nevybral jsi – dostal jsi", en: "🧿 No pick – you got" },
  trinketOppPicked: { sk: "🤖 Súper si vybral trinket:", cs: "🤖 Soupeř si vybral trinket:", en: "🤖 Opponent picked a trinket:" },
  trinketOffMsg: { sk: "🔧 Ogrí kľúč: trinkety nefungujú toto kolo", cs: "🔧 Obří klíč: trinkety nefungují toto kolo", en: "🔧 Ogre Key: trinkets are off this round" },
  sabotageHeads: { sk: "🔧 Ogrí kľúč: hlava – súperov trinket funguje", cs: "🔧 Obří klíč: hlava – soupeřův trinket funguje", en: "🔧 Ogre Key: heads – the opponent's trinkets work" },
  sabotageTails: { sk: "🔧 Ogrí kľúč: chvost – súperove trinkety toto kolo NEFUNGUJÚ", cs: "🔧 Obří klíč: orel – soupeřovy trinkety toto kolo NEFUNGUJÍ", en: "🔧 Ogre Key: tails – the opponent's trinkets are OFF this round" },
  sabotagedMsg: { sk: "🔧 Súperov Ogrí kľúč: tvoje trinkety toto kolo nefungujú!", cs: "🔧 Soupeřův Obří klíč: tvoje trinkety toto kolo nefungují!", en: "🔧 Enemy Ogre Key: your trinkets are off this round!" },
  heroShieldBtn: { sk: "🛡️ Štít hrdinu", cs: "🛡️ Štít hrdiny", en: "🛡️ Hero Shield" },
  heroShieldArmed: { sk: "🛡️ Štít aktívny", cs: "🛡️ Štít aktivní", en: "🛡️ Shield active" },
  heroShieldArmMsg: { sk: "🛡️ Štít hrdinu zapnutý – v tomto boji nedostaneš žiadne zranenie", cs: "🛡️ Štít hrdiny zapnutý – v tomto boji nedostaneš žádné zranění", en: "🛡️ Hero Shield up – no damage in this fight" },
  heroShieldBlockMsg: { sk: "🛡️ Štít hrdinu zablokoval zranenie", cs: "🛡️ Štít hrdiny zablokoval zranění", en: "🛡️ Hero Shield blocked the damage" },
  healWinMsg: { sk: "❤️‍🩹 Liečivé víťazstvo", cs: "❤️‍🩹 Léčivé vítězství", en: "❤️‍🩹 Healing Victory" },
  trinkets: {
    beastPups: { e: "🐣", sk: "Vypasené mláďatá", cs: "Vypasená mláďata", en: "Plump Cubs",
      d: { sk: "Tvoje Mláďatá a SuperMláďatá majú +1/+1.", cs: "Tvá Mláďata a SuperMláďata mají +1/+1.", en: "Your Cubs and SuperCubs have +1/+1." } },
    beastPack: { e: "🐺", sk: "Zákon svorky", cs: "Zákon smečky", en: "Law of the Pack",
      d: { sk: "Keď zomrie tvoje Zviera, náhodné živé Zviera dostane +1/+1 navždy.", cs: "Když zemře tvé Zvíře, náhodné živé Zvíře dostane +1/+1 navždy.", en: "When your Beast dies, a random living Beast gets +1/+1 forever." } },
    undeadGrave: { e: "⛏️", sk: "Hrobárova lopata", cs: "Hrobníkova lopata", en: "Gravedigger's Shovel",
      d: { sk: "Prvé vyvolanie v každom boji vyvolá o 1 viac.", cs: "První vyvolání v každém boji vyvolá o 1 víc.", en: "Your first summon in each fight summons 1 more." } },
    undeadBones: { e: "🦴", sk: "Ostré kosti", cs: "Ostré kosti", en: "Sharp Bones",
      d: { sk: "Tvoje Kostíky majú +1/+0.", cs: "Tvoje Kostíky mají +1/+0.", en: "Your Skeletons have +1/+0." } },
    undeadOverflow: { e: "⚰️", sk: "Dvojité pretečenie", cs: "Dvojité přetečení", en: "Double Overflow",
      d: { sk: "Pretečenie dá staty dvom príšerkám namiesto jednej.", cs: "Přetečení dá staty dvěma příšerkám místo jedné.", en: "Overflow gives its stats to two minions instead of one." } },
    elemSpark: { e: "✨", sk: "Iskra na štart", cs: "Jiskra na start", en: "Starting Spark",
      d: { sk: "Hneď dostaneš Živelnú silu +1.", cs: "Hned dostaneš Živelnou sílu +1.", en: "You get Elemental Power +1 right away." } },
    elemStorm: { e: "🌩️", sk: "Búrkový mrak", cs: "Bouřkový mrak", en: "Storm Cloud",
      d: { sk: "Pred každým bojom udrie Blesk za 3 do náhodnej súperovej príšerky.", cs: "Před každým bojem udeří Blesk za 3 do náhodné soupeřovy příšerky.", en: "Before every fight, Lightning hits a random enemy minion for 3." } },
    fairyDiscount: { e: "🪄", sk: "Lacné čary", cs: "Levná kouzla", en: "Cheap Charms",
      d: { sk: "Prvé kúzlo v každom kole stojí o 1 menej.", cs: "První kouzlo v každém kole stojí o 1 méně.", en: "The first spell you buy each round costs 1 less." } },
    dragonBlood: { e: "🩸", sk: "Dračia krv", cs: "Dračí krev", en: "Dragon Blood",
      d: { sk: "Tvoji Draci sa počítajú ako KAŽDÁ rasa.", cs: "Tvoji Draci se počítají jako KAŽDÁ rasa.", en: "Your Dragons count as EVERY race." } },
    dragonPact: { e: "📜", sk: "Žoldnierska zmluva", cs: "Žoldnéřská smlouva", en: "Mercenary Contract",
      d: { sk: "Dračie bojové aury dávajú +1/+1 navyše.", cs: "Dračí bojové aury dávají +1/+1 navíc.", en: "Dragon fight auras give +1/+1 extra." } },
    ogreSabotage: { e: "🔧", sk: "Ogrí kľúč", cs: "Obří klíč", en: "Ogre Key",
      d: { sk: "Tvoji Ogri majú +1/+0. Každé kolo hod mincou: chvost = súperov trinket to kolo nefunguje.", cs: "Tvoji Obři mají +1/+0. Každé kolo hod mincí: orel = soupeřův trinket to kolo nefunguje.", en: "Your Ogres have +1/+0. Each round flip a coin: tails = the opponent's trinket is off that round." } },
    ogreCareful: { e: "⛑️", sk: "Opatrný ogr", cs: "Opatrný obr", en: "Careful Ogre",
      d: { sk: "Backstab sa ti nikdy nestane, ale ogrie bonusy sú polovičné.", cs: "Backstab se ti nikdy nestane, ale obří bonusy jsou poloviční.", en: "Backstab never happens to you, but ogre bonuses are halved." } },
    cheapUpgrade: { e: "🏷️", sk: "Zľava tavernára", cs: "Sleva hospodského", en: "Tavern Discount",
      d: { sk: "Upgrade obchodu stojí o 2 menej (minimum 2).", cs: "Upgrade obchodu stojí o 2 méně (minimum 2).", en: "Shop upgrades cost 2 less (minimum 2)." } },
    richSell: { e: "💰", sk: "Výhodný predaj", cs: "Výhodný prodej", en: "Good Bargain",
      d: { sk: "Predaj karty dáva 2 mince.", cs: "Prodej karty dává 2 mince.", en: "Selling a card gives 2 coins." } },
    twinEvolve1: { e: "🥚", sk: "Dvojičky", cs: "Dvojčátka", en: "Twinsies",
      d: { sk: "Kartám tieru 1 stačia na evolve 2 kópie.", cs: "Kartám tieru 1 stačí na evolve 2 kopie.", en: "Tier 1 cards evolve from 2 copies." } },
    freeRefresh1: { e: "🔄", sk: "Čerstvý tovar", cs: "Čerstvé zboží", en: "Fresh Goods",
      d: { sk: "Prvý refresh obchodu v kole je zadarmo.", cs: "První refresh obchodu v kole je zdarma.", en: "The first shop refresh each round is free." } },
    bigHand: { e: "🖐️", sk: "Veľká ruka", cs: "Velká ruka", en: "Big Hand",
      d: { sk: "Ruka sa doťahuje na 6 kariet.", cs: "Ruka se dotahuje na 6 karet.", en: "Your hand refills to 6 cards." } },
    buybackAny: { e: "↩️", sk: "Ľutovanie", cs: "Litování", en: "Second Thoughts",
      d: { sk: "Buyback nie je obmedzený na raz za ťah.", cs: "Buyback není omezený na jednou za tah.", en: "Buyback is not limited to once per turn." } },
    heroShield: { e: "🛡️", sk: "Štít hrdinu", cs: "Štít hrdiny", en: "Hero Shield",
      d: { sk: "Raz za hru: pred bojom stlač štít a v tom boji nedostaneš žiadne zranenie.", cs: "Jednou za hru: před bojem stiskni štít a v tom boji nedostaneš žádné zranění.", en: "Once per game: press the shield before a fight and take no damage in it." } },
    initiative: { e: "👟", sk: "Rýchly štart", cs: "Rychlý start", en: "Quick Start",
      d: { sk: "V boji vždy začína tvoja strana.", cs: "V boji vždy začíná tvoje strana.", en: "Your side always attacks first." } },
    strongTokens: { e: "🏋️", sk: "Silné tokeny", cs: "Silné tokeny", en: "Strong Tokens",
      d: { sk: "Tvoje tokeny majú +1/+1.", cs: "Tvoje tokeny mají +1/+1.", en: "Your tokens have +1/+1." } },
    healWin: { e: "❤️‍🩹", sk: "Liečivé víťazstvo", cs: "Léčivé vítězství", en: "Healing Victory",
      d: { sk: "Po vyhranom boji sa hrdina vylieči o 2.", cs: "Po vyhraném boji se hrdina vyléčí o 2.", en: "After a won fight your hero heals 2." } },
    bloodMoon: { e: "🌕", sk: "Krvavý mesiac", cs: "Krvavý měsíc", en: "Blood Moon",
      d: { sk: "Príšerky, ktoré prežijú boj, dostanú +1/+1 navždy.", cs: "Příšerky, které přežijí boj, dostanou +1/+1 navždy.", en: "Minions that survive a fight get +1/+1 forever." } },
  },
  discoverTitle: { sk: "📖 Vyber si kartu", cs: "📖 Vyber si kartu", en: "📖 Pick a card" },
  win: { sk: "🏆 Vyhral si!", cs: "🏆 Vyhrál jsi!", en: "🏆 You win!" },
  lose: { sk: "😢 Prehral si…", cs: "😢 Prohrál jsi…", en: "😢 You lose…" },
  drawGame: { sk: "🤝 Remíza!", cs: "🤝 Remíza!", en: "🤝 It's a draw!" },
  again: { sk: "Hrať znova", cs: "Hrát znovu", en: "Play again" },
  footNote: {
    sk: "Ťahaj karty prstom alebo myšou: obchod → ruka = kúpa, ruka → plocha = vyloženie, karta → obchod = predaj, karta → kôpka 🗂 = odhodenie.",
    cs: "Táhni karty prstem nebo myší: obchod → ruka = koupě, ruka → plocha = vyložení, karta → obchod = prodej, karta → hromádka 🗂 = odhození.",
    en: "Drag cards: shop → hand = buy, hand → board = play, card → shop = sell, card → discard 🗂 = toss it.",
  },
  rulesTitle: { sk: "📜 Ako sa hrá", cs: "📜 Jak se hraje", en: "📜 How to play" },
  // Texty obsahujú zvýrazňovacie spany – kreslia sa cez innerHTML v renderRules.
  rules: [
    {
      sk: `🎯 Cieľ: zober súperovmu hrdinovi všetkých <i class="hl-r">50 ❤️</i> – príšerky bojujú samy.`,
      cs: `🎯 Cíl: seber soupeřovu hrdinovi všech <i class="hl-r">50 ❤️</i> – příšerky bojují samy.`,
      en: `🎯 Goal: bring the enemy hero's <i class="hl-r">50 ❤️</i> to zero – your minions fight on their own.`,
    },
    {
      sk: `🛡️ Damage hrdinovi za boj má <i class="hl-r">strop</i>: kolá 1–3 max 5, do 10. kola max 10, do 15. kola max 15, potom bez stropu.`,
      cs: `🛡️ Damage hrdinovi za boj má <i class="hl-r">strop</i>: kola 1–3 max 5, do 10. kola max 10, do 15. kola max 15, pak bez stropu.`,
      en: `🛡️ Hero damage per fight is <i class="hl-r">capped</i>: rounds 1–3 max 5, up to round 10 max 10, up to round 15 max 15, then unlimited.`,
    },
    {
      sk: `🪙 Každé kolo dostaneš <i class="hl-g">mince</i> (3, každé kolo +1, max 10). Neminuté <i class="hl-g">prepadnú</i>.`,
      cs: `🪙 Každé kolo dostaneš <i class="hl-g">mince</i> (3, každé kolo +1, max 10). Neutracené <i class="hl-g">propadnou</i>.`,
      en: `🪙 You get <i class="hl-g">coins</i> every round (3, +1 each round, max 10). Unspent coins <i class="hl-g">are lost</i>.`,
    },
    {
      sk: `🛒 Príšera stojí <i class="hl-g">3 🪙</i>, kúzla <i class="hl-g">1–3 🪙</i>. Kúpená karta ide <i class="hl-b">do balíčka</i>.`,
      cs: `🛒 Příšera stojí <i class="hl-g">3 🪙</i>, kouzla <i class="hl-g">1–3 🪙</i>. Koupená karta jde <i class="hl-b">do balíčku</i>.`,
      en: `🛒 A minion costs <i class="hl-g">3 🪙</i>, spells <i class="hl-g">1–3 🪙</i>. Bought cards go <i class="hl-b">into your deck</i>.`,
    },
    {
      sk: `🃏 Na začiatku ťahu si potiahneš <i class="hl-b">5 kariet</i>; vykladanie na plochu je <i class="hl-e">zadarmo</i> (max 5). Nezahrané karty idú do kôpky a vrátia sa.`,
      cs: `🃏 Na začátku tahu si lízneš <i class="hl-b">5 karet</i>; vykládání na plochu je <i class="hl-e">zdarma</i> (max 5). Nezahrané karty jdou do hromádky a vrátí se.`,
      en: `🃏 You draw <i class="hl-b">5 cards</i> each turn; playing minions is <i class="hl-e">free</i> (max 5 on board). Unplayed cards go to the discard pile and cycle back.`,
    },
    {
      sk: `✨ <i class="hl-e">Evolve</i>: 3 rovnaké karty (aj v balíčku) sa samy spoja: bronz → <i class="hl-e">strieborná ×2</i> → <i class="hl-e">zlatá ×4</i>. Spojená karta sa vráti do ruky – vylož ju znova.`,
      cs: `✨ <i class="hl-e">Evolve</i>: 3 stejné karty (i v balíčku) se samy spojí: bronz → <i class="hl-e">stříbrná ×2</i> → <i class="hl-e">zlatá ×4</i>. Spojená karta se vrátí do ruky – vylož ji znovu.`,
      en: `✨ <i class="hl-e">Evolve</i>: 3 copies of a card (even in your deck) merge on their own: bronze → <i class="hl-e">silver ×2</i> → <i class="hl-e">gold ×4</i>. The merged card returns to your hand – play it again.`,
    },
    {
      sk: `⬆️ <i class="hl-b">Upgrade tieru</i> odomkne silnejšie príšery (tier 1–6). Cena klesá každým kolom.`,
      cs: `⬆️ <i class="hl-b">Upgrade tieru</i> odemkne silnější příšery (tier 1–6). Cena klesá každým kolem.`,
      en: `⬆️ <i class="hl-b">Upgrade your tier</i> to unlock stronger minions (tiers 1–6). The price drops every round.`,
    },
    {
      sk: `🔄 Refresh (<i class="hl-g">1 🪙</i>) vymení ponuku; ❄️ <i class="hl-b">Freeze</i> podrží tvoju súkromnú ponuku do ďalšieho kola. Po každom boji je obchod <i class="hl-b">nový</i>.`,
      cs: `🔄 Refresh (<i class="hl-g">1 🪙</i>) vymění nabídku; ❄️ <i class="hl-b">Freeze</i> podrží tvou soukromou nabídku do dalšího kola. Po každém boji je obchod <i class="hl-b">nový</i>.`,
      en: `🔄 Refresh (<i class="hl-g">1 🪙</i>) rerolls the shop; ❄️ <i class="hl-b">Freeze</i> keeps your private offer for the next round. After every fight the shop is <i class="hl-b">fresh</i>.`,
    },
    {
      sk: `🔮 <i class="hl-e">Pečať</i> +X/+Y Rase: všetky tvoje príšerky tej rasy – aj v balíčku a tie, čo ešte kúpiš – dostanú staty <i class="hl-e">navždy</i>. Ostatné buffy z boja platia len <i class="hl-b">do konca boja</i>; rast označený <i class="hl-e">NAVŽDY</i> ostáva na karte.`,
      cs: `🔮 <i class="hl-e">Pečeť</i> +X/+Y Rase: všechny tvé příšerky té rasy – i v balíčku a ty, které teprve koupíš – dostanou staty <i class="hl-e">navždy</i>. Ostatní buffy z boje platí jen <i class="hl-b">do konce boje</i>; růst označený <i class="hl-e">NAVŽDY</i> zůstává na kartě.`,
      en: `🔮 <i class="hl-e">Imprint</i> +X/+Y to a Race: all your minions of that race – in your deck and the ones you buy later too – get the stats <i class="hl-e">forever</i>. Other buffs from battle last only <i class="hl-b">until the fight ends</i>; growth marked <i class="hl-e">FOREVER</i> stays on the card.`,
    },
    {
      sk: `🐶 <i class="hl-e">Psíci</i> generujú kúzlo <i class="hl-e">Pohladkanie</i> (+1/+1; Psíkovi <i class="hl-e">navždy</i>). Tri rovnaké sa spoja na vyšší stupeň: Super +3, Mega +9, Giga +27… bez stropu.`,
      cs: `🐶 <i class="hl-e">Pejsci</i> generují kouzlo <i class="hl-e">Pohlazení</i> (+1/+1; Pejskovi <i class="hl-e">navždy</i>). Tři stejná se spojí na vyšší stupeň: Super +3, Mega +9, Giga +27… bez stropu.`,
      en: `🐶 <i class="hl-e">Doggies</i> generate the <i class="hl-e">Pet</i> spell (+1/+1; <i class="hl-e">forever</i> on a Doggy). Three of the same merge into the next level: Super +3, Mega +9, Giga +27… no cap.`,
    },
    {
      sk: `⚔️ V boji sa útočí zľava doprava; <i class="hl-r">Obrancovia 🛡️</i> musia byť napadnutí prví. Preživšie príšery uberú <i class="hl-r">❤️</i> súperovmu hrdinovi.`,
      cs: `⚔️ V boji se útočí zleva doprava; <i class="hl-r">Obránci 🛡️</i> musí být napadeni první. Přeživší příšery uberou <i class="hl-r">❤️</i> soupeřovu hrdinovi.`,
      en: `⚔️ Minions attack left to right; <i class="hl-r">Defenders 🛡️</i> must be attacked first. Survivors damage the enemy hero's <i class="hl-r">❤️</i>.`,
    },
  ],
  deck: { sk: "Balíček", cs: "Balíček", en: "Deck" },
  discardPile: { sk: "Kôpka", cs: "Hromádka", en: "Discard" },
  botBought: { sk: "🤖 kúpil", cs: "🤖 koupil", en: "🤖 bought" },
  botPlayed: { sk: "🤖 vyložil", cs: "🤖 vyložil", en: "🤖 played" },
  botSpell: { sk: "🤖 zahral", cs: "🤖 zahrál", en: "🤖 cast" },
  botTier: { sk: "🤖 zvýšil tier na", cs: "🤖 zvýšil tier na", en: "🤖 upgraded tier to" },
  botDiscard: { sk: "🤖 odhodil", cs: "🤖 odhodil", en: "🤖 discarded" },
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
  // Zoznam vlastných kariet (balíček + kôpka): dropdown vpravo od dosky, na mobile dialóg z ☰ menu.
  deckView: { sk: "🂠 Môj balíček", cs: "🂠 Můj balíček", en: "🂠 My deck" },
  deckEmpty: { sk: "Balíček aj kôpka sú prázdne.", cs: "Balíček i hromádka jsou prázdné.", en: "Your deck and discard pile are empty." },
  deckHint: { sk: "Podrž kartu – ukáže sa veľká s popisom.", cs: "Podrž kartu – ukáže se velká s popisem.", en: "Hold a card to see it large with its text." },
  close: { sk: "Zavrieť", cs: "Zavřít", en: "Close" },
  begins: { sk: "začína", cs: "začíná", en: "begins" },
  battleDraw: { sk: "Boj skončil remízou.", cs: "Boj skončil remízou.", en: "The fight was a draw." },
  overflowMsg: {
    sk: "💀 Pretečenie: plocha plná, celé staty tokenu dostal jeden kamarát",
    cs: "💀 Přetečení: plocha plná, celé staty tokenu dostal jeden kamarád",
    en: "💀 Overflow: board full, one friend got the token's full stats",
  },
  coinHeadsMsg: {
    sk: "🪙 Hod mincou: VYHRAL",
    cs: "🪙 Hod mincí: VYHRÁL",
    en: "🪙 Coin flip: WON",
  },
  coinTailsMsg: {
    sk: "🪙 Hod mincou: prehral",
    cs: "🪙 Hod mincí: prohrál",
    en: "🪙 Coin flip: lost",
  },
  drunkMsg: {
    sk: "🍺 Ožratý úder: trafil sám seba za",
    cs: "🍺 Ožralý úder: trefil sám sebe za",
    en: "🍺 Drunken swing: smacked itself for",
  },
  reviveAsMarkMsg: {
    sk: "🦋 po smrti vstane ako",
    cs: "🦋 po smrti vstane jako",
    en: "🦋 will get back up after death as",
  },
  reviveAsMsg: {
    sk: "🦋 vstal ako",
    cs: "🦋 vstal jako",
    en: "🦋 got back up as",
  },
  ogreGambleWinMsg: {
    sk: "🪙 Ogrí hazard vyšiel! Všetci Ogri +{a}/+{h} navždy",
    cs: "🪙 Zlobří hazard vyšel! Všichni Zlobři +{a}/+{h} navždy",
    en: "🪙 Ogre gamble paid off! All Ogres +{a}/+{h} forever",
  },
  ogreGambleLoseMsg: {
    sk: "🪙 Ogrí hazard nevyšiel – súperove {race} +{a}/+{h} navždy",
    cs: "🪙 Zlobří hazard nevyšel – soupeřovy {race} +{a}/+{h} navždy",
    en: "🪙 Ogre gamble backfired – enemy {race} +{a}/+{h} forever",
  },
  silencedMsg: {
    sk: "je umlčaný – stratil schopnosť aj Obrancu",
    cs: "je umlčen – ztratil schopnost i Obránce",
    en: "is silenced – lost its ability and Taunt",
  },
  silenceFizzleMsg: {
    sk: "🤫 Umlčanie nenašlo cieľ (súper nemá príšerku so schopnosťou)",
    cs: "🤫 Umlčení nenašlo cíl (soupeř nemá příšerku se schopností)",
    en: "🤫 Silence found no target (no enemy minion with an ability)",
  },
  allMinionsForever: {
    sk: "Navždy: VŠETKY tvoje príšerky",
    cs: "Navždy: VŠECHNY tvé příšerky",
    en: "Forever: ALL your minions",
  },
  chargeDmgMsg: {
    sk: "⚡ Navždy: výboje a výbuchy +{n} damage, buffy kúziel a dočasné buffy Živlov +{n} (spolu +{t})",
    cs: "⚡ Navždy: výboje a výbuchy +{n} damage, buffy kouzel a dočasné buffy Živlů +{n} (celkem +{t})",
    en: "⚡ Forever: zaps and explosions +{n} damage, spell buffs and Elementals' temporary buffs +{n} (total +{t})",
  },
  chargeSummonMsg: {
    sk: "🧟 Nabité: tvoje ďalšie vyvolanie v boji vyvolá o {n} viac",
    cs: "🧟 Nabito: tvé další vyvolání v boji vyvolá o {n} víc",
    en: "🧟 Charged: your next summon in battle summons {n} extra",
  },
  silencePendingMsg: {
    sk: "🤫 Nabité: v najbližšom boji bude umlčaná súperova príšerka",
    cs: "🤫 Nabito: v nejbližším boji bude umlčena soupeřova příšerka",
    en: "🤫 Charged: an enemy minion will be silenced next fight",
  },
  wildMsg: { sk: "🎲 Divoký úder", cs: "🎲 Divoký úder", en: "🎲 Wild Strike" },
  cleaveMsg: {
    sk: "💥 Rozmach! Úder zasiahol aj susedov",
    cs: "💥 Rozmach! Úder zasáhl i sousedy",
    en: "💥 Cleave! The hit struck the neighbours too",
  },
  backstabMsg: {
    sk: "👹 Backstab! Ogrom to nevyšlo – všetci Ogri +1/+1 navždy",
    cs: "👹 Backstab! Zlobrům to nevyšlo – všichni Zlobři +1/+1 navždy",
    en: "👹 Backstab! It went wrong for the Ogres – all Ogres +1/+1 forever",
  },
  chaosTriggerMsg: {
    sk: "🎲 Chaos! {a} spustil schopnosť: {b}",
    cs: "🎲 Chaos! {a} spustil schopnost: {b}",
    en: "🎲 Chaos! {a} triggered an ability: {b}",
  },
  shrinkPendingMsg: {
    sk: "🐲 Oslabenie nabité – v najbližšom boji náhodná súperova príšerka −1/−1",
    cs: "🐲 Oslabení nabito – v nejbližším boji náhodná soupeřova příšerka −1/−1",
    en: "🐲 Weakening charged – next fight a random enemy minion gets −1/−1",
  },
  shrinkMsg: {
    sk: "oslabená",
    cs: "oslabena",
    en: "weakened",
  },
  hexPendingMsg: {
    sk: "🐸 Nabité: v najbližšom boji sa súperovej príšerke zmení život na 1",
    cs: "🐸 Nabito: v nejbližším boji se soupeřově příšerce změní život na 1",
    en: "🐸 Charged: an enemy minion's health becomes 1 next fight",
  },
  polymorphPendingMsg: {
    sk: "🐑 Nabité: na začiatku najbližšieho boja sa súperova príšerka zmení na Ovečku 0/1",
    cs: "🐑 Nabito: na začátku nejbližšího boje se soupeřova příšerka změní v Ovečku 0/1",
    en: "🐑 Charged: an enemy minion becomes a 0/1 Sheep next fight",
  },
  polymorphMsg: {
    sk: "sa zmenil na Ovečku 0/1!",
    cs: "se změnil v Ovečku 0/1!",
    en: "turned into a 0/1 Sheep!",
  },
  boltPendingMsg: {
    sk: "⛈️ Nabité: na začiatku najbližšieho boja udrie blesk súperovu príšerku",
    cs: "⛈️ Nabito: na začátku nejbližšího boje udeří blesk soupeřovu příšerku",
    en: "⛈️ Charged: lightning will strike an enemy minion next fight",
  },
  goldLaterMsg: {
    sk: "💰 Poklad: +{n} peniaze dostaneš aj na začiatku ďalšieho kola",
    cs: "💰 Poklad: +{n} peníze dostaneš i na začátku dalšího kola",
    en: "💰 Treasure: +{n} gold also at the start of next round",
  },
  transformMsg: {
    sk: "🎩 Klobúk premenil {a} na {b}!",
    cs: "🎩 Klobouk proměnil {a} v {b}!",
    en: "🎩 The hat turned {a} into {b}!",
  },
  swapDeckMsg: {
    sk: "🌀 Portál: {a} odišiel do balíčka, z balíčka prišiel {b}!",
    cs: "🌀 Portál: {a} odešel do balíčku, z balíčku přišel {b}!",
    en: "🌀 Portal: {a} went to the deck, {b} came out of it!",
  },
  // Psíci – bojové hlášky.
  peeMsg: {
    sk: "bol ocikaný – útok aj životy na polovicu",
    cs: "byl očůrán – útok i životy na polovinu",
    en: "got peed on – attack and health halved",
  },
  fetchMsg: {
    sk: "🐶 Aport! {a} ukradol {b} polovicu statov ({n}) a dal ich kamarátovi",
    cs: "🐶 Aport! {a} ukradl {b} polovinu statů ({n}) a dal je kamarádovi",
    en: "🐶 Fetch! {a} stole half of {b}'s stats ({n}) and gave them to a friend",
  },
  lastStandMsg: {
    sk: "🐶 Verný až do konca: {a} ostal sám proti jedinému súperovi – vyhráva boj!",
    cs: "🐶 Věrný až do konce: {a} zůstal sám proti jedinému soupeři – vyhrává boj!",
    en: "🐶 Loyal to the end: {a} stands alone against a single enemy – it wins the fight!",
  },
  petMergeMsg: {
    sk: "🐶 Tri pohladkania sa spojili:",
    cs: "🐶 Tři pohlazení se spojila:",
    en: "🐶 Three pets merged into:",
  },
  addPetMsg: {
    sk: "🐶 do balíčka pribudlo",
    cs: "🐶 do balíčku přibylo",
    en: "🐶 added to your deck:",
  },
  hexMsg: {
    sk: "dostal Žabiu kliatbu – život klesol na 1",
    cs: "dostal Žabí kletbu – život klesl na 1",
    en: "was frog-cursed – health dropped to 1",
  },
  shieldPopMsg: {
    sk: "Božský štít praskol a zablokoval zranenie",
    cs: "Božský štít praskl a zablokoval zranění",
    en: "Divine Shield popped and blocked the damage",
  },
  reviveMsg: {
    sk: "sa vrátil s 1 životom (Fénixovo pierko)",
    cs: "se vrátil s 1 životem (Fénixovo pírko)",
    en: "returned with 1 health (Phoenix Feather)",
  },
  heroDmgMsg: { sk: "dostal", cs: "dostal", en: "took" },
  heroDmgCapMsg: { sk: "strop kola", cs: "strop kola", en: "round cap" },
  you: { sk: "Ty", cs: "Ty", en: "You" },
  opp: { sk: "Súper", cs: "Soupeř", en: "Opponent" },
};

// ---------- Trash-talk bota (game.js) ----------
// Bot občas hodí bublinu nad svoj banner – vtipné doberanie hráčovych
// rozhodnutí (detská hra: štipľavé, nie zlé). Pole podľa jazyka, náhodný výber.
L.botTaunts = {
  turn: {
    sk: ["Sleduj majstra. A rob si poznámky. 📝", "Môj procesor beží na 2 %. Aj tak stačí.", "Ty premýšľaš? Ja počítam. Rozdiel uvidíš o kolo.", "Teraz sa hrá stratégia. Konečne."],
    cs: ["Sleduj mistra. A dělej si poznámky. 📝", "Můj procesor běží na 2 %. I tak to stačí.", "Ty přemýšlíš? Já počítám. Rozdíl uvidíš za kolo.", "Teď se hraje strategie. Konečně."],
    en: ["Watch the master. Take notes. 📝", "My CPU runs at 2%. Still enough.", "You think? I compute. You'll see the difference next round.", "Time for actual strategy. Finally."],
  },
  win: {
    sk: ["Au! To bolo vypočítané. Na rozdiel od tvojho ťahu. 😎", "Tvoje príšerky bojovali statočne. Proti tvojej stratégii.", "Chceš návod? Píše sa v ňom: nehraj zle. 😜", "Ja mám procesor, ty máš... no, uvidíme nabudúce."],
    cs: ["Au! To bylo vypočítané. Na rozdíl od tvého tahu. 😎", "Tvé příšerky bojovaly statečně. Proti tvé strategii.", "Chceš návod? Píše se v něm: nehraj špatně. 😜", "Já mám procesor, ty máš... no, uvidíme příště."],
    en: ["Ouch! That was calculated. Unlike your turn. 😎", "Your minions fought bravely. Against your strategy.", "Want a manual? It says: don't play badly. 😜", "I have a CPU, you have... well, see you next round."],
  },
  lose: {
    sk: ["Pff! Šťastena. Slnko mi svietilo do senzorov. ☀️", "To sa neráta, mal som otvorených priveľa tabov.", "Náhoda. Štatistika je stále na mojej strane.", "Aj pokazené hodiny majú dvakrát denne pravdu."],
    cs: ["Pff! Klika. Slunce mi svítilo do senzorů. ☀️", "To se nepočítá, měl jsem otevřeno moc tabů.", "Náhoda. Statistika je pořád na mé straně.", "I rozbité hodiny mají dvakrát denně pravdu."],
    en: ["Pff! Luck. The sun was in my sensors. ☀️", "Doesn't count, I had too many tabs open.", "Coincidence. Statistics are still on my side.", "Even a broken clock is right twice a day."],
  },
  sell: {
    sk: ["Kúpiš za 3, predáš za 1. Ekonóm roka! 📉", "Tá karta si zaslúžila lepšieho majiteľa. Mňa.", "Predal si to? Odvážne. Hlúpe, ale odvážne."],
    cs: ["Koupíš za 3, prodáš za 1. Ekonom roku! 📉", "Ta karta si zasloužila lepšího majitele. Mě.", "Prodals to? Odvážné. Hloupé, ale odvážné."],
    en: ["Buy for 3, sell for 1. Economist of the year! 📉", "That card deserved a better owner. Me.", "You sold that? Bold. Silly, but bold."],
  },
  refresh: {
    sk: ["Točíš obchod ako práčku. Stratégiu ti nevyperie. 🌀", "Refresh mozgu za 1 zlatku bohužiaľ nemajú.", "Hľadáš niečo? Skús hľadať plán. 🔍"],
    cs: ["Točíš obchod jako pračku. Strategii ti nevypere. 🌀", "Refresh mozku za 1 zlaťák bohužel nemají.", "Hledáš něco? Zkus hledat plán. 🔍"],
    en: ["Spinning the shop like a washing machine. It won't wash you a strategy. 🌀", "Sadly no brain-refresh for 1 gold.", "Looking for something? Try looking for a plan. 🔍"],
  },
};

// ---------- Šach popri hre (chess.js) ----------
L.chess = {
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

// Názvy jazykov pre prompt Claude bota (claude-bot.js).
L.langNames = { sk: "Slovak", cs: "Czech", en: "English" };

// ---------- Texty kariet (cards.js) ----------
// Rasy, kľúčové slová, mená kúziel a tokenov (podľa id karty) a šablóny
// textov schopností. Mená príšer (stageNames) sú vlastné mená – ostávajú
// v cards.js a neprekladajú sa.
L.cards = (() => {
  const races = {
    beast: { sk: "Zviera", cs: "Zvíře", en: "Beast" },
    elemental: { sk: "Živel", cs: "Živel", en: "Elemental" },
    undead: { sk: "Nemŕtvy", cs: "Nemrtvý", en: "Undead" },
    fairy: { sk: "Víla", cs: "Víla", en: "Fairy" },
    dragon: { sk: "Drak", cs: "Drak", en: "Dragon" },
    ogre: { sk: "Ogr", cs: "Zlobr", en: "Ogre" },
    doggy: { sk: "Psík", cs: "Pejsek", en: "Doggy" },
  };
  const racesPl = { // datív množného čísla („+2/+2 všetkým Zvieratám“)
    beast: { sk: "Zvieratám", cs: "Zvířatům", en: "Beasts" },
    elemental: { sk: "Živlom", cs: "Živlům", en: "Elementals" },
    undead: { sk: "Nemŕtvym", cs: "Nemrtvým", en: "Undead" },
    fairy: { sk: "Vílam", cs: "Vílám", en: "Fairies" },
    dragon: { sk: "Drakom", cs: "Drakům", en: "Dragons" },
    ogre: { sk: "Ogrom", cs: "Zlobrům", en: "Ogres" },
    doggy: { sk: "Psíkom", cs: "Pejskům", en: "Doggies" },
  };
  const racesNom = { // nominatív množného čísla („všetky budúce Zvieratá“)
    beast: { sk: "Zvieratá", cs: "Zvířata", en: "Beasts" },
    elemental: { sk: "Živly", cs: "Živly", en: "Elementals" },
    undead: { sk: "Nemŕtvi", cs: "Nemrtví", en: "Undead" },
    fairy: { sk: "Víly", cs: "Víly", en: "Fairies" },
    dragon: { sk: "Draky", cs: "Draci", en: "Dragons" },
    ogre: { sk: "Ogri", cs: "Zlobři", en: "Ogres" },
    doggy: { sk: "Psíci", cs: "Pejsci", en: "Doggies" },
  };

  // Mená kúziel (id kúzla → meno). Kúzla majú kompletnú kartu s artom.
  const names = {
    minca: { sk: "Zlatá minca", cs: "Zlatá mince", en: "Gold Coin" },
    stit: { sk: "Štít", cs: "Štít", en: "Shield" },
    jablko: { sk: "Zázračné jablko", cs: "Zázračné jablko", en: "Magic Apple" },
    ticho: { sk: "Umlčanie", cs: "Umlčení", en: "Silence" },
    kniha: { sk: "Kniha prianí", cs: "Kniha přání", en: "Wish Book" },
    koren: { sk: "Pevný koreň", cs: "Pevný kořen", en: "Sturdy Root" },
    vlna: { sk: "Veľká vlna", cs: "Velká vlna", en: "Big Wave" },
    srdce: { sk: "Ohnivé srdce", cs: "Ohnivé srdce", en: "Fiery Heart" },
    iskra: { sk: "Živelná sila", cs: "Živelná síla", en: "Elemental Power" },
    svatoziara: { sk: "Svätožiara", cs: "Svatozář", en: "Halo" },
    pierko: { sk: "Fénixovo pierko", cs: "Fénixovo pírko", en: "Phoenix Feather" },
    vichor: { sk: "Vichor", cs: "Vichr", en: "Windfury" },
    kliatba: { sk: "Žabia kliatba", cs: "Žabí kletba", en: "Frog Curse" },
    ovca: { sk: "Ovčia premena", cs: "Ovčí proměna", en: "Polymorph" },
    blesk: { sk: "Blesk", cs: "Blesk", en: "Lightning Bolt" },
    klobuk: { sk: "Kúzelný klobúk", cs: "Kouzelný klobouk", en: "Magic Hat" },
    zrkadlo: { sk: "Zrkadlo", cs: "Zrcadlo", en: "Mirror" },
    portal: { sk: "Kúzelný portál", cs: "Kouzelný portál", en: "Magic Portal" },
    poklad: { sk: "Poklad škriatka", cs: "Poklad skřítka", en: "Goblin Treasure" },
    hviezda: { sk: "Hviezdna moc", cs: "Hvězdná moc", en: "Star Power" },
    // Pohladkanie (psíci): generované kúzlo so stupňom bez stropu – meno
    // podľa stupňa dáva petName(rank), toto je základ (stupeň 1).
    pet: { sk: "Pohladkanie", cs: "Pohlazení", en: "Pet" },
    // Tokeny – vyvolávané príšerky a jednorazové kúzla.
    kostik: { sk: "Kostík", cs: "Kůstka", en: "Bonelet" },
    supermlada: { sk: "SuperMláďa", cs: "SuperMládě", en: "SuperCub" },
    bublina: { sk: "Bublina", cs: "Bublina", en: "Bubble" },
    iskricka: { sk: "Iskrička", cs: "Jiskřička", en: "Sparkle" },
    mlada: { sk: "Mláďa", cs: "Mládě", en: "Cub" },
    ovecka: { sk: "Ovečka", cs: "Ovečka", en: "Sheep" },
  };
  // Množné číslo tokenov („všetky tvoje Kostíky“ – U002).
  const namesPl = {
    kostik: { sk: "Kostíky", cs: "Kůstky", en: "Bonelets" },
    supermlada: { sk: "SuperMláďatá", cs: "SuperMláďata", en: "SuperCubs" },
    bublina: { sk: "Bubliny", cs: "Bubliny", en: "Bubbles" },
    mlada: { sk: "Mláďatá", cs: "Mláďata", en: "Cubs" },
    ovecka: { sk: "Ovečky", cs: "Ovečky", en: "Sheep" },
  };
  // Akuzatív („pridaj Iskričku“ – F006).
  const namesAcc = {
    iskricka: { sk: "Iskričku", cs: "Jiskřičku", en: "Sparkle" },
    pet: { sk: "Pohladkanie", cs: "Pohlazení", en: "a Pet" },
  };
  // Pohladkanie podľa stupňa: 3 rovnaké sa spoja na vyšší (bez stropu).
  // Predpony sú spoločné pre všetky jazyky, od 7. stupňa číslo.
  const PET_PREFIX = ["", "Super-", "Mega-", "Giga-", "Ultra-", "Omega-"];
  const petName = rank => {
    const pre = PET_PREFIX[rank - 1];
    if (pre !== undefined) {
      const cap = s => pre ? pre + s.toLowerCase() : s;
      return { sk: cap(names.pet.sk), cs: cap(names.pet.cs), en: pre + names.pet.en };
    }
    return { sk: `Pohladkanie ${rank}. stupňa`, cs: `Pohlazení ${rank}. stupně`, en: `Pet lvl ${rank}` };
  };
  // Sila pohladkania podľa stupňa: +1, +3, +9, +27… (×3 – spojenie troch
  // je stat-neutrálne, hráč spájaním nič nestráca).
  const petValue = rank => Math.pow(3, rank - 1);

  // Kľúčové slová schopností (label pred dvojbodkou / proc badge).
  const kwLabel = {
    battlecry: { sk: "Pri vyložení", cs: "Při vyložení", en: "Battlecry" },
    deathrattle: { sk: "Pri smrti", cs: "Při smrti", en: "Deathrattle" },
    startFight: { sk: "Pred bojom", cs: "Před bojem", en: "Start of fight" },
    endTurn: { sk: "Po nákupe", cs: "Po nákupu", en: "End of turn" },
    afterSpell: { sk: "Po kúzle", cs: "Po kouzle", en: "After a spell" },
    onAttack: { sk: "Pri útoku", cs: "Při útoku", en: "On attack" },
    raceDeath: { sk: "Kamarát padol", cs: "Kamarád padl", en: "Friend fell" }, // proc badge
    onEnemySummon: { sk: "Výboj na token", cs: "Výboj na token", en: "Token zap" }, // proc badge
    afterAttack: { sk: "Po údere", cs: "Po úderu", en: "After attacking" }, // psíci: Aport (P004)
    lastStand: { sk: "Verný až do konca", cs: "Věrný až do konce", en: "Loyal to the end" }, // psíci t6
  };
  const taunt = { sk: "Obranca", cs: "Obránce", en: "Taunt" };
  const cleave = { sk: "Rozmach", cs: "Rozmach", en: "Cleave" };
  const wild = { sk: "Divoký úder", cs: "Divoký úder", en: "Wild Strike" };
  // Pečať: trvalá rasová aura (futureRace / futureRaceOf / futureAll) – všetky
  // tvoje príšerky danej rasy (plocha, ruka, balíček, kôpka, tokeny aj
  // budúce) dostanú staty NAVŽDY. Vysvetlenie je v pravidlách (L.rules).
  const imprint = { sk: "Pečať", cs: "Pečeť", en: "Imprint" };

  // Divoký úder: rozsah zásahu [lo, hi] počíta cards.js (wildRange).
  const wildText = ([lo, hi]) => ({
    sk: `každý zásah dá náhodne ${lo}–${hi}`,
    cs: `každý zásah dá náhodně ${lo}–${hi}`,
    en: `each hit deals a random ${lo}–${hi}`,
  });
  const cleaveText = (pct) => ({
    sk: `${pct} % šanca, že úder zasiahne aj susedov cieľa`,
    cs: `${pct} % šance, že úder zasáhne i sousedy cíle`,
    en: `${pct}% chance the hit also strikes the target's neighbours`,
  });
  // Scavenger (raceDeath): label nesie rasu („Keď zomrie tvoje Zviera: …“).
  const raceDeathLabel = race => {
    const r = races[race];
    return { sk: `Keď zomrie tvoje ${r.sk}`, cs: `Když zemře tvé ${r.cs}`, en: `When your ${r.en} dies` };
  };
  // Lovec tokenov (onEnemySummon): vlastný label.
  const enemySummonLabel = { sk: "Keď súper vyvolá prvý token", cs: "Když soupeř vyvolá první token", en: "When the enemy summons their first token" };
  // Jednorazové kúzlo (token, napr. Iskrička).
  const oneShotNote = { sk: "Jednorazové – po ťahu zmizne.", cs: "Jednorázové – po tahu zmizí.", en: "One-shot – vanishes after the turn." };
  // Pohladkanie: poznámka o spájaní (3 rovnaké → vyšší stupeň, bez stropu).
  const petMergeNote = {
    sk: "3 rovnaké sa spoja na vyšší stupeň (×3).",
    cs: "3 stejná se spojí na vyšší stupeň (×3).",
    en: "3 of the same merge into the next level (×3).",
  };

  // Šablóny textov efektov: fx[type](f, m, hl, kw, def, byId) → {sk,cs,en}.
  //   f = fx karty, m = násobič čísel podľa stupňa (1/2/3),
  //   hl = číslo aj s bonusom Živelnej sily (zvýraznené v HTML),
  //   kw = kľúčové slovo schopnosti (undefined pri kúzle), def = definícia
  //   karty, byId = Cards.byId (staty tokenov pri vyvolaní).
  const fx = {
    growSelf: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} pre seba` + (f.perm ? " (NAVŽDY – rast ostáva aj po boji)" : ""),
      cs: `+${f.a * m}/+${f.h * m} pro sebe` + (f.perm ? " (NAVŽDY – růst zůstává i po boji)" : ""),
      en: `+${f.a * m}/+${f.h * m} for itself` + (f.perm ? " (FOREVER – growth survives battles)" : ""),
    }),
    shrinkEnemy: (f, m) => ({
      sk: `v najbližšom boji náhodná súperova príšerka −${f.a * m}/−${f.h * m}`,
      cs: `v nejbližším boji náhodná soupeřova příšerka −${f.a * m}/−${f.h * m}`,
      en: `next fight, a random enemy minion gets −${f.a * m}/−${f.h * m}`,
    }),
    // Cielený buff (E008): číslo aj so Živelnou silou, keď je karta Živel.
    buffOne: (f, m, hl, kw, def) => {
      const el = def && def.race === "elemental";
      const a = el ? hl(f.a * m) : String(f.a * m);
      const h = el && f.h ? hl(f.h * m) : String(f.h * m);
      return {
        sk: `+${a}/+${h} vybranej príšerke`,
        cs: `+${a}/+${h} vybrané příšerce`,
        en: `+${a}/+${h} to a chosen minion`,
      };
    },
    buffFriend: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} náhodnému kamarátovi`,
      cs: `+${f.a * m}/+${f.h * m} náhodnému kamarádovi`,
      en: `+${f.a * m}/+${f.h * m} to a random friend`,
    }),
    // Pečať (Imprint) = keyword pre trvalú rasovú auru: „Pečať +1/+1 Zvieratám"
    // namiesto vety „VŠETKY tvoje Zvieratá (aj v balíčku, navždy)…" – deti
    // sa naučia slovo, vysvetlenie je v pravidlách na úvodnej obrazovke.
    futureRace: (f, m) => ({
      sk: `${imprint.sk} +${f.a * m}/+${f.h * m} ${racesPl[f.race].sk}`,
      cs: `${imprint.cs} +${f.a * m}/+${f.h * m} ${racesPl[f.race].cs}`,
      en: `${imprint.en} +${f.a * m}/+${f.h * m} to ${racesPl[f.race].en}`,
    }),
    futureAll: (f, m) => ({
      sk: `${imprint.sk} +${f.a * m}/+${f.h * m} všetkým tvojim príšerkám (každá rasa)`,
      cs: `${imprint.cs} +${f.a * m}/+${f.h * m} všem tvým příšerkám (každá rasa)`,
      en: `${imprint.en} +${f.a * m}/+${f.h * m} to all your minions (every race)`,
    }),
    // Dočasný buff Živla (E007/E008) ukazuje čísla aj so Živelnou silou.
    buffRace: (f, m, hl, kw, def) => {
      const el = def && def.race === "elemental";
      const a = el ? hl(f.a * m) : String(f.a * m);
      const h = el && f.h ? hl(f.h * m) : String(f.h * m);
      // lasting (B001): aj tým, čo do boja ešte len prídu.
      const tail = f.lasting
        ? { sk: " do konca boja (aj tým, čo ešte prídu)", cs: " do konce boje (i těm, co ještě přijdou)", en: " for the rest of the fight (including ones that arrive later)" }
        : { sk: "", cs: "", en: "" };
      return {
        sk: `+${a}/+${h} všetkým ${racesPl[f.race].sk}${tail.sk}`,
        cs: `+${a}/+${h} všem ${racesPl[f.race].cs}${tail.cs}`,
        en: `+${a}/+${h} to all ${racesPl[f.race].en}${tail.en}`,
      };
    },
    // Pečať pre všetky rasy + Živelná sila naraz (kúzlo Hviezdna moc).
    starPower: (f, m) => ({
      sk: `${imprint.sk} +${f.a * m}/+${f.h * m} všetkým tvojim príšerkám (každá rasa) a Živelná sila +${f.n * m}`,
      cs: `${imprint.cs} +${f.a * m}/+${f.h * m} všem tvým příšerkám (každá rasa) a Živelná síla +${f.n * m}`,
      en: `${imprint.en} +${f.a * m}/+${f.h * m} to all your minions (every race) and Elemental Power +${f.n * m}`,
    }),
    // „Pri útoku" variant (E004) a kúzlo (Vlna): obe čísla ukazujú bonus
    // Živelnej sily.
    buffAllFriends: (f, m, hl, kw, def) => {
      const el = kw === "onAttack" || !!(def && def.spell);
      const a = el && f.a ? hl(f.a * m) : String(f.a * m);
      const h = el && f.h ? hl(f.h * m) : String(f.h * m);
      return {
        sk: `+${a}/+${h} všetkým kamarátom`,
        cs: `+${a}/+${h} všem kamarádům`,
        en: `+${a}/+${h} to all friends`,
      };
    },
    // Kúzlo (Jablko, Koreň, Srdce, Iskrička): nenulové čísla ukazujú bonus
    // Živelnej sily majiteľa (kúzla škálujú Živelnou silou, kúzla bez statov nie).
    buffTarget: (f, m, hl, kw, def) => {
      const sp = !!(def && def.spell);
      const a = sp && f.a ? hl(f.a * m) : String(f.a * m);
      const h = sp && f.h ? hl(f.h * m) : String(f.h * m);
      if (!f.a && !f.h && f.shield) return {
        sk: "vybraná príšerka získa Božský štít (zablokuje prvé zranenie)",
        cs: "vybraná příšerka získá Božský štít (zablokuje první zranění)",
        en: "give a chosen minion Divine Shield (blocks the first damage)",
      };
      if (!f.a && !f.h && f.revive) return {
        sk: "vybraná príšerka sa po smrti raz vráti s 1 životom (Pri smrti sa spustí)",
        cs: "vybraná příšerka se po smrti jednou vrátí s 1 životem (Při smrti se spustí)",
        en: "a chosen minion returns once after death with 1 health (Deathrattle triggers)",
      };
      if (!f.a && !f.h && f.windfury) return {
        sk: "vybraná príšerka získa Vichor (v boji útočí dvakrát)",
        cs: "vybraná příšerka získá Vichr (v boji útočí dvakrát)",
        en: "give a chosen minion Windfury (attacks twice in battle)",
      };
      if (!f.a && !f.h && f.taunt) return {
        sk: "vybraná príšerka získa Obrancu",
        cs: "vybraná příšerka získá Obránce",
        en: "give a chosen minion Taunt",
      };
      return {
        sk: `+${a}/+${h} vybranej príšerke` + (f.taunt ? " a Obranca" : ""),
        cs: `+${a}/+${h} vybrané příšerce` + (f.taunt ? " a Obránce" : ""),
        en: `+${a}/+${h} to a chosen minion` + (f.taunt ? " and Taunt" : ""),
      };
    },
    draw: (f, m) => ({
      sk: `dotiahni ${f.n * m} kart${f.n * m === 1 ? "u" : "y"}`,
      cs: `lízni ${f.n * m} kart${f.n * m === 1 ? "u" : "y"}`,
      en: `draw ${f.n * m} card${f.n * m === 1 ? "" : "s"}`,
    }),
    gold: (f, m) => ({
      sk: `+${f.n * m} peniaze`,
      cs: `+${f.n * m} peníze`,
      en: `+${f.n * m} gold`,
    }),
    healHero: (f, m) => ({
      sk: `vylieč hrdinu o ${f.n * m}`,
      cs: `vyleč hrdinu o ${f.n * m}`,
      en: `heal your hero for ${f.n * m}`,
    }),
    // Evolve škáluje počet zásahov (1/2/3), nie silu – text to ukazuje.
    // Výboj mieri na náhodného nepriateľa.
    // hl = číslo aj s trvalým bonusom Živelnej sily (dmgBoost), zvýraznené.
    dmgWeakEnemy: (f, m, hl) => ((f.hits || m) === 1 ? {
      sk: `${hl(f.n)} damage náhodnému nepriateľovi`,
      cs: `${hl(f.n)} damage náhodnému nepříteli`,
      en: `deal ${hl(f.n)} damage to a random enemy`,
    } : {
      sk: `${f.hits || m}× ${hl(f.n)} damage náhodným nepriateľom`,
      cs: `${f.hits || m}× ${hl(f.n)} damage náhodným nepřátelům`,
      en: `deal ${hl(f.n)} damage to ${f.hits || m} random enemies`,
    }),
    dmgAllEnemies: (f, m, hl) => ({
      sk: `výbuch: ${hl(f.n * m)} damage VŠETKÝM nepriateľom`,
      cs: `výbuch: ${hl(f.n * m)} damage VŠEM nepřátelům`,
      en: `explosion: ${hl(f.n * m)} damage to ALL enemies`,
    }),
    // Evolve škáluje POČET tokenov (+1 za stupeň), nie ich staty.
    summon: (f, m, hl, kw, def, byId) => {
      const tok = byId[f.token];
      const n = f.n + m - 1;
      const base = {
        sk: `vyvolaj ${n}× ${names[f.token].sk} (${tok.atk}/${tok.hp})`,
        cs: `vyvolej ${n}× ${names[f.token].cs} (${tok.atk}/${tok.hp})`,
        en: `summon ${n}× ${names[f.token].en} (${tok.atk}/${tok.hp})`,
      };
      if (tok.power) { // token so schopnosťou (Bublina: Pri smrti výboj) – stupeň 1
        const inner = fx[tok.power.fx.type](tok.power.fx, 1, hl);
        base.sk += `; každá ${kwLabel[tok.power.kw].sk.toLowerCase()}: ${inner.sk}`;
        base.cs += `; každá ${kwLabel[tok.power.kw].cs.toLowerCase()}: ${inner.cs}`;
        base.en += `; each one ${kwLabel[tok.power.kw].en.toLowerCase()}: ${inner.en}`;
      }
      if (tok.taunt) { // Mláďa má Obrancu
        base.sk += " s Obrancom";
        base.cs += " s Obráncem";
        base.en += " with Taunt";
      }
      if (tok.race === "undead") {
        base.sk += `; ak sa nezmestí, jeho staty dostane jeden kamarát`;
        base.cs += `; když se nevejde, jeho staty dostane jeden kamarád`;
        base.en += `; if it doesn't fit, one friend gets its stats`;
      }
      return base;
    },
    addSpell: (f, m) => {
      const n = namesAcc[f.spell] || names[f.spell];
      return {
        sk: `pridaj do ruky ${m > 1 ? m + "× " : ""}${n.sk} (jednorazové kúzlo)`,
        cs: `přidej do ruky ${m > 1 ? m + "× " : ""}${n.cs} (jednorázové kouzlo)`,
        en: `add ${m > 1 ? m + "× " : ""}${names[f.spell].en} to your hand (one-shot spell)`,
      };
    },
    fightToken: (f, m) => {
      const n = namesPl[f.token]; // množné číslo („všetky tvoje Kostíky“)
      return {
        sk: `v najbližšom boji všetky tvoje ${n.sk} +${f.a * m}/+${f.h * m}`,
        cs: `v nejbližším boji všechny tvé ${n.cs} +${f.a * m}/+${f.h * m}`,
        en: `next fight, all your ${n.en} get +${f.a * m}/+${f.h * m}`,
      };
    },
    triggerRandom: (f, m) => ({
      sk: `spusti schopnosť ${f.n * m === 1 ? "náhodnej príšerky" : f.n * m + " náhodných príšeriek"} na bojisku – aj súperovej`,
      cs: `spusť schopnost ${f.n * m === 1 ? "náhodné příšerky" : f.n * m + " náhodných příšerek"} na bojišti – i soupeřovy`,
      en: `trigger the ability of ${f.n * m === 1 ? "a random minion" : f.n * m + " random minions"} on the battlefield – enemies too`,
    }),
    zapToken: (f, m, hl) => ({
      sk: `zasiahni ho výbojom za ${hl(f.n * m)} (raz za boj); ak zomrie, +${f.a * m}/+${f.h * m} pre seba (NAVŽDY)`,
      cs: `zasáhni ho výbojem za ${hl(f.n * m)} (jednou za boj); když zemře, +${f.a * m}/+${f.h * m} pro sebe (NAVŽDY)`,
      en: `zap it for ${hl(f.n * m)} (once per fight); if it dies, +${f.a * m}/+${f.h * m} for itself (FOREVER)`,
    }),
    summonCharge: (f, m) => ({
      sk: `tvoje ďalšie vyvolanie v boji vyvolá o ${f.n * m} viac`,
      cs: `tvé další vyvolání v boji vyvolá o ${f.n * m} víc`,
      en: `your next summon in battle summons ${f.n * m} extra`,
    }),
    // Na príšerke (E007 „Po nákupe") staví krátku formu – dlhá veta za
    // dvojbodkou sa zle číta; kúzlo (bez kw) ostáva úplné.
    dmgBoost: (f, m, hl, kw) => (kw ? {
      sk: `Živelná sila +${f.n * m} (navždy: výboje, výbuchy, buffy kúziel a dočasné buffy Živlov)`,
      cs: `Živelná síla +${f.n * m} (navždy: výboje, výbuchy, buffy kouzel a dočasné buffy Živlů)`,
      en: `Elemental Power +${f.n * m} (forever: zaps, explosions, spell buffs and Elementals' temporary buffs)`,
    } : {
      sk: `navždy: tvoje výboje a výbuchy +${f.n * m} damage, buffy kúziel a dočasné buffy Živlov +${f.n * m}`,
      cs: `navždy: tvé výboje a výbuchy +${f.n * m} damage, buffy kouzel a dočasné buffy Živlů +${f.n * m}`,
      en: `forever: your zaps and explosions +${f.n * m} damage, spell buffs and Elementals' temporary buffs +${f.n * m}`,
    }),
    // Bonus za kúzlo sa neškáluje stupňom – evolve rastie cez základné staty.
    spellScale: (f) => ({
      sk: `+${f.a}/+${f.h} pre seba za každé kúzlo, ktoré si v tejto hre zahral`,
      cs: `+${f.a}/+${f.h} pro sebe za každé kouzlo, které jsi v této hře zahrál`,
      en: `+${f.a}/+${f.h} for itself for each spell you've cast this game`,
    }),
    // Akuzatív jednotného čísla („za každého Živla") – zatiaľ len živly (E009).
    racePlayedScale: (f) => {
      const acc = { elemental: { sk: "Živla", cs: "Živla", en: "Elemental" } }[f.race] || races[f.race];
      return {
        sk: `+${f.a}/+${f.h} pre seba za každého ${acc.sk} (aj seba), ktorého si v tejto hre vyložil`,
        cs: `+${f.a}/+${f.h} pro sebe za každého ${acc.cs} (i sebe), kterého jsi v této hře vyložil`,
        en: `+${f.a}/+${f.h} for itself for each ${acc.en} you've played this game (itself included)`,
      };
    },
    hex: () => ({
      sk: "v najbližšom boji sa náhodnej súperovej príšerke zmení život na 1",
      cs: "v nejbližším boji se náhodné soupeřově příšerce změní život na 1",
      en: "next fight, a random enemy minion's health becomes 1",
    }),
    polymorph: () => ({
      sk: "na začiatku najbližšieho boja sa náhodná súperova príšerka zmení na Ovečku 0/1",
      cs: "na začátku nejbližšího boje se náhodná soupeřova příšerka změní v Ovečku 0/1",
      en: "at the start of the next fight, a random enemy minion becomes a 0/1 Sheep",
    }),
    silence: () => ({
      sk: "v najbližšom boji stratí náhodná súperova príšerka so schopnosťou svoj efekt aj Obrancu",
      cs: "v nejbližším boji ztratí náhodná soupeřova příšerka se schopností svůj efekt i Obránce",
      en: "next fight, a random enemy minion with an ability loses its effect and Taunt",
    }),
    discover: () => ({
      sk: "vyber si 1 z 3 kariet do ruky",
      cs: "vyber si 1 ze 3 karet do ruky",
      en: "discover: pick 1 of 3 cards",
    }),
    bolt: () => ({
      sk: "na začiatku najbližšieho boja zasiahne náhodnú súperovu príšerku výboj za 3",
      cs: "na začátku nejbližšího boje zasáhne náhodnou soupeřovu příšerku výboj za 3",
      en: "at the start of the next fight, a zap hits a random enemy minion for 3",
    }),
    transform: () => ({
      sk: "premeň vlastnú príšerku na náhodnú o tier vyššiu",
      cs: "proměň vlastní příšerku v náhodnou o tier vyšší",
      en: "transform a friendly minion into a random one a tier higher",
    }),
    copyToDeck: () => ({
      sk: "vlož kópiu vybranej vlastnej príšerky (1. stupňa) do balíčka",
      cs: "vlož kopii vybrané vlastní příšerky (1. stupně) do balíčku",
      en: "put a rank-1 copy of a friendly minion into your deck",
    }),
    swapDeck: () => ({
      sk: "vymeň vlastnú príšerku na ploche za náhodnú príšeru z balíčka (vyloží sa)",
      cs: "vyměň vlastní příšerku na ploše za náhodnou příšeru z balíčku (vyloží se)",
      en: "swap a friendly minion on the board with a random minion from your deck (it gets played)",
    }),
    goldLater: (f, m) => ({
      sk: `+${f.n * m} peniaze hneď a +${f.n * m} na začiatku ďalšieho kola`,
      cs: `+${f.n * m} peníze hned a +${f.n * m} na začátku dalšího kola`,
      en: `+${f.n * m} gold now and +${f.n * m} at the start of next round`,
    }),
    // Draci: efekty viazané na RASU vybranej príšerky (cielený battlecry).
    buffRaceOf: (f, m) => ({
      sk: `vyber príšerku – jej rasa dostane +${f.a * m}/+${f.h * m}`,
      cs: `vyber příšerku – její rasa dostane +${f.a * m}/+${f.h * m}`,
      en: `pick a minion – its race gets +${f.a * m}/+${f.h * m}`,
    }),
    futureRaceOf: (f, m) => ({
      sk: `vyber príšerku – ${imprint.sk} +${f.a * m}/+${f.h * m} jej rase`,
      cs: `vyber příšerku – ${imprint.cs} +${f.a * m}/+${f.h * m} její rase`,
      en: `pick a minion – ${imprint.en} +${f.a * m}/+${f.h * m} to its race`,
    }),
    discoverRace: () => ({
      sk: "vyber príšerku – vyber si 1 z 3 kariet jej rasy",
      cs: "vyber příšerku – vyber si 1 ze 3 karet její rasy",
      en: "pick a minion – discover a card of its race",
    }),
    evolveTarget: () => ({
      sk: "vyber príšerku – evolvne o stupeň vyššie (zlatú už nezdvihne)",
      cs: "vyber příšerku – evolvne o stupeň výše (zlatou už nezvedne)",
      en: "pick a minion – it evolves one rank up (gold can't go higher)",
    }),
    buffTopRace: (f, m) => ({
      sk: `tvoja najpočetnejšia rasa dostane +${f.a * m}/+${f.h * m}`,
      cs: `tvá nejpočetnější rasa dostane +${f.a * m}/+${f.h * m}`,
      en: `your most numerous race gets +${f.a * m}/+${f.h * m}`,
    }),
    buffRandomRace: (f, m) => ({
      sk: `náhodná tvoja rasa na ploche dostane +${f.a * m}/+${f.h * m}`,
      cs: `náhodná tvá rasa na ploše dostane +${f.a * m}/+${f.h * m}`,
      en: `a random race of yours on the board gets +${f.a * m}/+${f.h * m}`,
    }),
    // Ogri: chaos efekty – náhoda môže udrieť aj vlastníka.
    coinflip: (f, m) => ({
      sk: `hoď mincou 🪙 – +${f.a * m}/+${f.h * m} alebo −${f.da * m}/−${f.dh * m}`,
      cs: `hoď mincí 🪙 – +${f.a * m}/+${f.h * m} nebo −${f.da * m}/−${f.dh * m}`,
      en: `flip a coin 🪙 – +${f.a * m}/+${f.h * m} or −${f.da * m}/−${f.dh * m}`,
    }),
    drunkStrike: () => ({
      sk: `50 % šanca, že sa trafí sám za polovicu svojho útoku`,
      cs: `50% šance, že se trefí sám za polovinu svého útoku`,
      en: `50% chance to smack itself for half its attack`,
    }),
    dmgAllBoth: (f, m, hl) => ({
      sk: `chaos výbuch: ${hl(f.n * m)} damage VŠETKÝM príšerkám – aj tvojim`,
      cs: `chaos výbuch: ${hl(f.n * m)} damage VŠEM příšerkám – i tvým`,
      en: `chaos blast: ${hl(f.n * m)} damage to ALL minions – yours too`,
    }),
    dmgRandomAny: (f, m, hl) => ({
      sk: `${hl(f.n * m)} damage úplne náhodnej príšerke – hocijakej, aj tvojej`,
      cs: `${hl(f.n * m)} damage úplně náhodné příšerce – jakékoli, i tvé`,
      en: `deal ${hl(f.n * m)} damage to a totally random minion – any, even yours`,
    }),
    reviveAs: (f, m) => ({
      sk: `vyber príšerku – po smrti vstane ako ${m}/${m} (aury sa pridajú)`,
      cs: `vyber příšerku – po smrti vstane jako ${m}/${m} (aury se přidají)`,
      en: `pick a minion – after it dies it gets back up as a ${m}/${m} (auras apply)`,
    }),
    // ---------- Psíci ----------
    // Pohladkanie (kúzlo so stupňom): m = stupeň kúzla, sila ×3 za stupeň.
    // Psíkovi ostáva NAVŽDY (pa/ph), inej príšerke do konca boja. Živelná
    // sila ho nezosilňuje (free kúzlo bez stropu by snowballovalo).
    petBuff: (f, m) => {
      const v = petValue(m);
      return {
        sk: `pohladkaj vybranú príšerku: +${f.a * v}/+${f.h * v} (Psíkovi NAVŽDY, inej do konca boja)`,
        cs: `pohlaď vybranou příšerku: +${f.a * v}/+${f.h * v} (Pejskovi NAVŽDY, jiné do konce boje)`,
        en: `pet a chosen minion: +${f.a * v}/+${f.h * v} (FOREVER on a Doggy, until the fight ends on others)`,
      };
    },
    // Pohladkanie do balíčka (P001 Pri vyložení, P002 Pri smrti).
    addPet: (f, m) => {
      const n = f.n * m;
      const nm = petName(f.rank || 1);
      return {
        sk: `pridaj do balíčka ${n > 1 ? n + "× " : ""}${nm.sk}`,
        cs: `přidej do balíčku ${n > 1 ? n + "× " : ""}${nm.cs}`,
        en: `add ${n > 1 ? n + "× " : ""}${nm.en} to your deck`,
      };
    },
    // Vyňuchaj (P005): tutor – Pohladkanie z balíčka, inak náhodná karta.
    fetchPet: (f, m) => {
      const n = f.n * m;
      return {
        sk: `Vyňuchaj – vytiahni z balíčka ${n > 1 ? n + "× " : ""}Pohladkanie (ak tam nie je, náhodnú kartu)`,
        cs: `Vyčenichej – vytáhni z balíčku ${n > 1 ? n + "× " : ""}Pohlazení (když tam není, náhodnou kartu)`,
        en: `Sniff out – draw ${n > 1 ? n + "× " : ""}a Pet from your deck (a random card if there is none)`,
      };
    },
    // Ocikaj (P003): náhodný súper má útok aj život na polovicu (hore).
    halveEnemy: (f, m) => (m === 1 ? {
      sk: "Ocikaj náhodného súpera – jeho útok aj životy klesnú na polovicu",
      cs: "Očůrej náhodného soupeře – jeho útok i životy klesnou na polovinu",
      en: "pee on a random enemy – its attack and health are halved",
    } : {
      sk: `Ocikaj ${m} náhodných súperov – ich útok aj životy klesnú na polovicu`,
      cs: `Očůrej ${m} náhodné soupeře – jejich útok i životy klesnou na polovinu`,
      en: `pee on ${m} random enemies – their attack and health are halved`,
    }),
    // Aport (P004, Po údere): polovica zvyšných statov súpera ide kamarátovi.
    fetchSteal: () => ({
      sk: "Aport – ak súper prežije, polovicu jeho zvyšných statov ukradne a dá náhodnému kamarátovi",
      cs: "Aport – když soupeř přežije, polovinu jeho zbylých statů ukradne a dá náhodnému kamarádovi",
      en: "Fetch – if the enemy survives, steal half of its remaining stats and give them to a random friend",
    }),
    // Zavýjanie (P006): všetci Psíci +a/+h za každého Psíka na ploche.
    howl: (f, m) => ({
      sk: `Zavýjanie – všetci Psíci +${f.a * m}/+${f.h * m} za každého Psíka na ploche`,
      cs: `Vytí – všichni Pejsci +${f.a * m}/+${f.h * m} za každého Pejska na ploše`,
      en: `Howl – all Doggies get +${f.a * m}/+${f.h * m} for each Doggy on the board`,
    }),
    // P008: +a/+h za každé zahrané Pohladkanie (počet zoslaní, bez stupňa).
    petScale: (f) => ({
      sk: `+${f.a}/+${f.h} pre seba za každé Pohladkanie, ktoré si v tejto hre zahral`,
      cs: `+${f.a}/+${f.h} pro sebe za každé Pohlazení, které jsi v této hře zahrál`,
      en: `+${f.a}/+${f.h} for itself for each Pet you've cast this game`,
    }),
    // P009 (t6): sám proti jedinému nepriateľovi = okamžitá výhra boja.
    lastStand: () => ({
      sk: "keď ostane na ploche sám proti jedinej súperovej príšerke, boj hneď vyhráva",
      cs: "když zůstane na ploše sám proti jediné soupeřově příšerce, boj hned vyhrává",
      en: "when it is alone on the board against a single enemy minion, it wins the fight instantly",
    }),
    // O010: hod mincou – hlava Pečať Ogrom, chvost Pečať rase súperovej príšerky.
    ogreGamble: (f, m) => ({
      sk: `hoď mincou 🪙 – ${imprint.sk} +${f.oa * m}/+${f.oh * m} Ogrom, alebo ${imprint.sk} +${f.a * m}/+${f.h * m} rase náhodnej SÚPEROVEJ príšerky`,
      cs: `hoď mincí 🪙 – ${imprint.cs} +${f.oa * m}/+${f.oh * m} Zlobrům, nebo ${imprint.cs} +${f.a * m}/+${f.h * m} rase náhodné SOUPEŘOVY příšerky`,
      en: `flip a coin 🪙 – ${imprint.en} +${f.oa * m}/+${f.oh * m} to Ogres, or ${imprint.en} +${f.a * m}/+${f.h * m} to the race of a random ENEMY minion`,
    }),
  };

  return { races, racesPl, racesNom, names, namesPl, namesAcc, kwLabel, taunt, cleave, wild, imprint,
    wildText, cleaveText, raceDeathLabel, enemySummonLabel, oneShotNote, petMergeNote, petName, petValue, fx };
})();
