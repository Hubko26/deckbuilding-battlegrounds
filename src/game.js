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
  netReconnecting: {
    sk: "📡 Spojenie vypadlo – obnovujem…",
    cs: "📡 Spojení vypadlo – obnovuji…",
    en: "📡 Connection lost – reconnecting…",
  },
  netResumed: { sk: "📡 Spojenie obnovené ✓", cs: "📡 Spojení obnoveno ✓", en: "📡 Connection restored ✓" },
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
      sk: `✨ <i class="hl-e">Evolve</i>: 3 rovnaké karty (aj v balíčku) sa samy spoja: bronz → <i class="hl-e">strieborná ×2</i> → <i class="hl-e">zlatá ×4</i>.`,
      cs: `✨ <i class="hl-e">Evolve</i>: 3 stejné karty (i v balíčku) se samy spojí: bronz → <i class="hl-e">stříbrná ×2</i> → <i class="hl-e">zlatá ×4</i>.`,
      en: `✨ <i class="hl-e">Evolve</i>: 3 copies of a card (even in your deck) merge on their own: bronze → <i class="hl-e">silver ×2</i> → <i class="hl-e">gold ×4</i>.`,
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
  confusedOwnMsg: {
    sk: "🎲 vstal s 1 životom na vlastnej strane",
    cs: "🎲 vstal s 1 životem na vlastní straně",
    en: "🎲 got up with 1 health on its own side",
  },
  confusedSwapMsg: {
    sk: "🎲 vstal s 1 životom NA STRANE SÚPERA!",
    cs: "🎲 vstal s 1 životem NA STRANĚ SOUPEŘE!",
    en: "🎲 got up with 1 health ON THE ENEMY SIDE!",
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

// ---------- Záznam hry (replay log) ----------
// Engine je deterministický: seed + sekvencia akcií = presný replay celej hry
// (tools/replay.mjs). Ukladá sa posledných 10 hier do localStorage.
// Pri hlásení chyby: otvor konzolu, zavolaj arenaLogSave() a pošli súbor.
const GameLog = (() => {
  const KEY = "arena.games";
  let cur = null;
  function start(seed, meta) {
    cur = { id: Date.now(), date: new Date().toISOString(), seed, ...meta, actions: [] };
    persist();
  }
  function push(actor, name, args) {
    if (!cur) return;
    cur.actions.push([actor, name, ...(args || [])]);
    persist();
  }
  function persist() {
    if (!cur) return;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || "[]").filter(g => g.id !== cur.id);
      all.push(cur);
      while (all.length > 10) all.shift();
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* plné/vypnuté úložisko – hra beží ďalej bez záznamu */ }
  }
  function dump() { try { return localStorage.getItem(KEY) || "[]"; } catch { return "[]"; } }
  return { start, push, dump };
})();
window.arenaLog = () => GameLog.dump();

// Voľba „hrať bez mutácií" – checkbox na úvodnej obrazovke, pamätá sa
// v localStorage. V hre po sieti rozhoduje zakladateľ (flag ide v "start").
function mutsOn() { return $("mutToggle").checked; }
// Default VYPNUTÉ – mutácia je opt-in („1" v localStorage = hráč si ju zapol).
try { $("mutToggle").checked = localStorage.getItem("arena.muts") === "1"; } catch { $("mutToggle").checked = false; }
$("mutToggle").addEventListener("change", () => {
  try { localStorage.setItem("arena.muts", mutsOn() ? "1" : "0"); } catch {}
});

// Verzia klienta = ?v= hashe skriptov z index.html. Keď sa hráčom líšia
// (zastaraná keš), determinizmus je stratený a hra by sa ticho rozišla.
const APP_V = [...document.querySelectorAll('script[src^="src/"]')]
  .map(el => (el.src.split("?v=")[1] || "")).join(".");

// Tvrdá chyba siete (desync / rozdielne verzie): oznám a ukonči hru,
// tiché pokračovanie by len prehlbovalo rozídený stav.
let fatalShown = false;
function showFatal(text, detail) {
  console.error("[arena] FATAL:", text, detail || "");
  if (fatalShown) return;
  fatalShown = true;
  Net.disconnect();
  $("overOverlay").classList.remove("hidden");
  $("overTitle").textContent = "⚠️";
  $("overMsg").textContent = text;
}
window.arenaLogSave = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([GameLog.dump()], { type: "application/json" }));
  a.download = "arena-games.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

// Lokálna akcia: vykoná sa v engine a v sieťovej hre sa pošle súperovi,
// ktorý ju aplikuje na svojej (identickej, rovnako seedovanej) kópii stavu.
// Čitateľný popis hráčovej akcie PRED vykonaním (stav ešte nezmenený) –
// Claude z toho v ďalšom ťahu komentuje hráčove rozhodnutia. Len verejné
// info: nákupy a predaje súper legálne vidí, board vidí v boji.
function actionDesc(name, args) {
  const p = state[MY];
  try {
    switch (name) {
      case "buyCommon": return `bought ${state.commons[args[0]]}`;
      case "buyPrivate": return `bought ${p.priv[args[0]].defId}`;
      case "buySpell": return `bought spell ${p.spellShop.defId}`;
      case "playMinion": return `played ${p.hand[args[0]].defId}`;
      case "castSpell": return `cast ${p.hand[args[0]].defId}`;
      case "sellCard": return `sold ${p[args[0]][args[1]].defId} (zone ${args[0]})`;
      case "discardCard": return `discarded ${p[args[0]][args[1]].defId}`;
      case "refreshShop": return "refreshed the shop";
      case "upgradeTier": return `upgraded to tier ${p.tier + 1}`;
      default: return null;
    }
  } catch { return null; }
}

// Akcie hráča v tomto kole – po boji sa stanú "minulým kolom" pre Clauda.
let playerRoundActions = [];
let lastPlayerRound = [];

function doAction(name, ...args) {
  const desc = actionDesc(name, args);
  const round = state.round; // kolo PRED akciou – súper ju aplikuje v rovnakom
  const ev = Engine[name](state, MY, ...args);
  if (ev) GameLog.push(MY, name, args);
  if (ev && mode === "net") {
    Net.sendAction(name, args, round);
    console.info("[arena] →", name, "r" + round);
  }
  if (ev && desc && playerRoundActions.length < 40) playerRoundActions.push(desc);
  // Trash-talk bota na hráčove rozhodnutia (len proti botovi).
  if (ev && name === "sellCard") botTaunt("sell", 0.5);
  if (ev && name === "refreshShop") botTaunt("refresh", 0.5);
  return ev;
}

// Rýchlosť animácií. Pri prefers-reduced-motion sa všetky pauzy skrátia a
// partikle / otrasy obrazu sa vypnú (citlivosť na pohyb, slabé mobily).
const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const ANIM = REDUCED ? 0.5 : 1;
const sleep = ms => new Promise(r => setTimeout(r, ms * ANIM));

// ---------- Statické texty ----------
function applyI18n() {
  document.title = t(L.pageTitle);
  $("title").textContent = t(L.title);
  $("diffTitle").textContent = t(L.diffTitle);
  $("startBtn").textContent = t(L.play);
  $("netBtn").textContent = t(L.netBtn);
  $("netCancel").textContent = t(L.cancel);
  $("peerHostBtn").textContent = t(L.peerHost);
  $("mutToggleLbl").textContent = t(L.mutToggle);
  $("peerJoinBtn").textContent = t(L.peerJoin);
  $("newGameBtn").textContent = t(L.newGame);
  $("discoverTitle").textContent = t(L.discoverTitle);
  $("overAgain").textContent = t(L.again);
  $("footNote").textContent = t(L.footNote);
}

// ---------- Pravidlá na úvodnej obrazovke ----------
function renderRules() {
  $("rulesBox").innerHTML =
    `<h3>${t(L.rulesTitle)}</h3><ul>` +
    L.rules.map(r => `<li>${t(r)}</li>`).join("") +
    `</ul>`;
}

// ---------- Výber obtiažnosti ----------
function renderPick() {
  const dbox = $("diffPick");
  dbox.innerHTML = "";
  for (const d of ["easy", "normal", "hard", "claude"]) {
    const b = document.createElement("button");
    b.textContent = t(L.diffs[d]);
    b.className = difficulty === d ? "active" : "";
    b.addEventListener("click", () => { difficulty = d; localStorage.setItem("arena.diff", d); renderPick(); });
    dbox.appendChild(b);
  }
  // Claude súper: API kľúč (BYO key – len localStorage) + profil hráča.
  const cs = $("claudeSetup");
  cs.classList.toggle("hidden", difficulty !== "claude");
  if (difficulty === "claude" && !cs.dataset.ready) {
    cs.dataset.ready = "1";
    $("claudeKey").value = localStorage.getItem("arena.apiKey") || "";
    $("claudeName").value = localStorage.getItem("arena.playerName") || "";
    $("claudeKey").addEventListener("input", e => localStorage.setItem("arena.apiKey", e.target.value.trim()));
    $("claudeName").addEventListener("input", e => localStorage.setItem("arena.playerName", e.target.value));
  }
  if (difficulty === "claude") {
    $("claudeKeyLabel").textContent = t(L.claudeKeyLabel);
    $("claudeNameLabel").textContent = t(L.claudeNameLabel);
    $("claudeName").placeholder = t(L.claudeNamePh);
    $("claudeKeyNote").textContent = t(L.claudeKeyNote);
  }
}

function startGame() {
  if (difficulty === "claude" && !(localStorage.getItem("arena.apiKey") || "").trim()) {
    alert(t(L.claudeNeedKey));
    $("claudeKey").focus();
    return;
  }
  if (difficulty === "claude" && !ClaudeBot.isAllowed(localStorage.getItem("arena.playerName"))) {
    alert(t(L.claudeNameGate));
    $("claudeName").focus();
    return;
  }
  mode = "bot";
  MY = "p1"; OPP = "p2";
  lastBattleNote = null;
  chatHistory = [];
  playerRoundActions = [];
  lastPlayerRound = [];
  // Chat políčko + uvítacia bublina („zase meškáš“) len v Claude móde.
  $("chatRow").classList.toggle("hidden", difficulty !== "claude");
  if (difficulty === "claude") {
    $("chatInput").placeholder = t(L.chatPh);
    const nm = (localStorage.getItem("arena.playerName") || "").trim();
    // Jazyk pozdravu per hráč (Adam vždy po slovensky), inak podľa UI.
    const gl = ClaudeBot.langFor(nm, I18N.lang);
    setTimeout(() => showTauntBubble((L.claudeGreeting[gl] || L.claudeGreeting.sk).replace("{n}", nm), 6000), 900);
  }
  // Seedovaný rng aj proti botovi – hra je plne deterministická a dá sa
  // replaynúť zo záznamu (GameLog + tools/replay.mjs).
  const seed = Math.floor(Math.random() * 2 ** 31);
  state = Engine.newGame(Engine.seededRng(seed), mutsOn() ? undefined : null);
  GameLog.start(seed, { mode: "bot", difficulty, mut: mutsOn() });
  enterGameScreen();
  act(Engine.startRound(state));
  driveFlow();
}

function enterGameScreen() {
  $("pickScreen").classList.add("hidden");
  $("netOverlay").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  // body.playing: na mobile sa hlavička zbalí do ☰ menu, doska berie celú výšku.
  document.body.classList.add("playing");
  document.querySelector("header").classList.remove("open");
  $("newGameBtn").classList.remove("hidden");
  $("overOverlay").classList.add("hidden");
  logClear();
  renderMutator();
}

// „Pravidlo dnešnej arény" – ikonka vľavo medzi súperovým balíčkom a kôpkou.
// Ťuk = pripomenutie pravidla v logu (mobil nemá hover na title).
function renderMutator() {
  const box = $("mutatorBox");
  const m = state && state.mutator && L.mutators[state.mutator];
  if (!m) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = `<div class="ic">${m.e}</div><div class="lb">${t(m)}</div>`;
  box.title = `${t(L.mutTitle)}: ${t(m)} – ${t(m.d)}`;
  box.onclick = () => log(`${m.e} ${t(m)}: ${t(m.d)}`);
  log(`${m.e} ${t(L.mutTitle)}: ${t(m)} – ${t(m.d)}`);
}

// ---------- Hra po sieti ----------
// Najprv skúsi lokálny WS server (LAN, automatické párovanie). Keď nebeží
// (napr. GitHub Pages), prepne na PeerJS s kódom miestnosti.
function netHandlers() {
  return {
    onWaiting: msg => {
      if (msg.code) {
        $("netMsg").textContent = t(L.peerShare);
        $("peerCode").textContent = msg.code;
      } else {
        $("netMsg").textContent = t(L.netWaiting);
        $("netUrls").textContent = (msg.urls || []).join("  ·  ");
      }
    },
    onStart: msg => {
      fatalShown = false;
      MY = msg.you;
      OPP = msg.you === "p1" ? "p2" : "p1";
      state = Engine.newGame(Engine.seededRng(msg.seed), msg.mut === false ? null : undefined);
      GameLog.start(msg.seed, { mode: "net", you: msg.you, mut: msg.mut !== false });
      enterGameScreen();
      act(Engine.startRound(state));
      driveFlow();
      // msg.v = verzia druhej strany (od hostiteľa/servera); rozdiel = istý desync
      if (msg.v !== APP_V) showFatal(t(L.verWarn), `${msg.v} vs ${APP_V}`);
    },
    // catch drží frontu živú – jedna chybná akcia nesmie umlčať všetky ďalšie
    onAction: msg => {
      remoteQueue = remoteQueue.then(() => applyRemote(msg))
        .catch(err => showFatal(t(L.netDesync), err));
    },
    onPeerLeft: () => {
      if (mode !== "net") return;
      if (state && state.phase !== "over") {
        Net.disconnect();
        $("overOverlay").classList.remove("hidden");
        $("overTitle").textContent = t(L.netLeft);
        $("overMsg").textContent = "";
      }
    },
    // Výpadok spojenia: hra beží ďalej (akcie sa bufferujú), len o tom vieš.
    onReconnecting: () => { if (mode === "net") log(t(L.netReconnecting)); },
    onResumed: () => { if (mode === "net") log(t(L.netResumed)); },
    onPeerMode: showPeerSetup,
    onPeerError: kind => {
      console.warn("[arena] peer error:", kind); // typ chyby na diagnostiku
      if (kind === "peer-unavailable" || kind === "timeout") {
        $("netMsg").textContent = t(kind === "timeout" ? L.peerTimeout : L.peerNotFound);
      } else if (kind === "unavailable-id") {
        $("netMsg").textContent = t(L.peerCodeTaken);
      } else {
        $("netMsg").textContent = `${t(L.peerError)} (${kind || "?"})`;
      }
    },
    onError: () => { $("netMsg").textContent = t(L.netError); },
  };
}

function startNet() {
  mode = "net";
  $("netOverlay").classList.remove("hidden");
  $("peerSetup").classList.add("hidden");
  $("netUrls").textContent = "";
  $("peerCode").textContent = "";
  $("netMsg").textContent = t(L.netConnecting);
  Net.connect(netHandlers(), { mut: mutsOn(), v: APP_V });
}

// Lokálny server nebeží – hraj cez kód miestnosti (P2P, funguje aj z webu).
function showPeerSetup() {
  if (!Net.peerAvailable()) {
    $("netMsg").textContent = t(L.netError);
    return;
  }
  $("netMsg").textContent = t(L.peerIntro);
  $("peerSetup").classList.remove("hidden");
}

function peerHost() {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  $("peerCode").textContent = "…";
  Net.hostPeer(code, netHandlers(), { mut: mutsOn(), v: APP_V });
}

function peerJoin() {
  const code = $("peerCodeInput").value.trim();
  if (!code) return;
  $("netMsg").textContent = t(L.netConnecting);
  Net.joinPeer(code, netHandlers(), { v: APP_V });
}

let remoteQueue = Promise.resolve();
async function applyRemote(msg) {
  if (!state || state.phase === "over" || mode !== "net" || fatalShown) return;
  console.info("[arena] ←", msg.name, "r" + msg.r, "(moje r" + state.round + ", fáza " + state.phase + ")");
  // Akcia súpera nesie číslo kola odosielateľa – nesúlad = stavy sa rozišli.
  if (msg.r != null && msg.r !== state.round) {
    showFatal(t(L.netDesync), `kolo súpera ${msg.r}, moje ${state.round}`);
    return;
  }
  const ev = Engine[msg.name](state, OPP, ...(msg.args || []));
  if (!ev) {
    // V zosynchronizovanej hre je každá akcia súpera legálna – null = desync.
    showFatal(t(L.netDesync), `nelegálna akcia súpera: ${msg.name}`);
    return;
  }
  GameLog.push(OPP, msg.name, msg.args || []);
  for (const e of ev) { const m = oppEventMsg(e); if (m) log(m); }
  renderAll();
  await driveFlow();
}

function backToPick() {
  document.body.classList.remove("playing");
  document.querySelector("header").classList.remove("open");
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

// ---------- Trash-talk bota ----------
// Bot občas hodí bublinu nad svoj banner – vtipné doberanie hráčovych
// rozhodnutí (detská hra: štipľavé, nie zlé). Náhoda tu NEjde cez state.rng –
// je to čisto UI, determinizmus enginu a replay ostávajú nedotknuté.
const TAUNTS = {
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
let lastTauntAt = 0;
function showTauntBubble(text, ms) {
  document.querySelectorAll(".taunt-bubble").forEach(b => b.remove());
  const el = document.createElement("div");
  el.className = "taunt-bubble";
  el.textContent = text;
  $("stage").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 450); }, ms || 3800);
}
function botTaunt(kind, chance) {
  if (mode !== "bot" || !state || state.phase === "over") return;
  if (difficulty === "claude") return; // Claude trash-talkuje vlastnými hláškami
  const now = Date.now();
  if (now - lastTauntAt < 6000) return; // nespamuj
  if (Math.random() > chance) return;
  const pool = TAUNTS[kind][I18N.lang] || TAUNTS[kind].sk;
  lastTauntAt = now;
  showTauntBubble(pool[Math.floor(Math.random() * pool.length)]);
}

// Výsledok posledného boja z pohľadu bota – kontext pre Claudov trash-talk.
let lastBattleNote = null;

// ---------- Chat s Claudom (len Claude mód) ----------
// Hráč odpíše do políčka pod doskou, Claude reaguje bublinou – samostatný
// lacný request mimo ťahu. História ide aj do ťahových promptov (banter drží niť).
let chatHistory = []; // { who: "player" | "claude", text }
let chatBusy = false;
async function sendChat() {
  const inp = $("chatInput");
  const text = inp.value.trim();
  if (!text || chatBusy || difficulty !== "claude" || mode !== "bot" || !state) return;
  chatBusy = true;
  inp.value = "";
  $("chatSend").disabled = true;
  chatHistory.push({ who: "player", text });
  try {
    const reply = await ClaudeBot.chat({
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      text,
      history: chatHistory.slice(-6),
      gameSummary: `round ${state.round}; your HP ${state[OPP].hp}, player's HP ${state[MY].hp}; ` +
        `${lastBattleNote || "no battle yet"}; player's last round: ${lastPlayerRound.join(", ") || "-"}`,
    });
    if (reply) { chatHistory.push({ who: "claude", text: reply }); showTauntBubble(reply, 7000); }
  } catch (e) {
    console.warn("Chat s Claudom zlyhal:", e);
  }
  chatBusy = false;
  $("chatSend").disabled = false;
}

async function runBotTurn() {
  busy = true;
  renderAll();
  if (difficulty === "claude") { await runClaudeTurn(); return; }
  botTaunt("turn", 0.3);
  await sleep(600);
  GameLog.push(OPP, "botTurn", [difficulty]);
  const events = Bot.botTurn(state, OPP, difficulty);
  await playOppEvents(events);
}

async function playOppEvents(events) {
  for (const ev of events) {
    const msg = oppEventMsg(ev);
    if (msg) { log(msg); renderAll(); await sleep(650); }
  }
}

// Ťah Clauda: reálny model cez API (kľúč hráča). Pri zlyhaní dohrá ťažký
// heuristický bot, nech hra nikdy nezamrzne; replay log sedí v oboch vetvách.
async function runClaudeTurn() {
  let res = null;
  try {
    res = await ClaudeBot.turn(state, OPP, {
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      lastBattle: lastBattleNote,
      humanLastRound: lastPlayerRound,
      recentChat: chatHistory.slice(-6),
      onAction: (name, args) => GameLog.push(OPP, name, args),
    });
  } catch (e) {
    console.warn("ClaudeBot zlyhal:", e);
  }
  if (!res) {
    log(t(L.claudeFallback));
    GameLog.push(OPP, "botTurn", ["hard"]);
    await playOppEvents(Bot.botTurn(state, OPP, "hard"));
    return;
  }
  if (res.taunt) showTauntBubble(res.taunt, 6000);
  await playOppEvents(res.events);
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
    case "discard": msg = `${t(L.botDiscard)} ${emoji}${name}`; break;
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
  // Kolo hráča skončilo – jeho akcie sa stávajú materiálom pre Clauda.
  lastPlayerRound = playerRoundActions.splice(0);
  // Snímka plôch a počítadiel pred bojom – doBattle stav zmení naraz
  // (kôpky, nové kolo, dotiahnutá ruka), animácia beží nad snímkou,
  // inak by čísla skákali dopredu už na začiatku boja.
  const snap = {
    p1: state.p1.board.map(x => ({ ...x })),
    p2: state.p2.board.map(x => ({ ...x })),
  };
  const pre = {
    p1: { deck: state.p1.deck.length, discard: state.p1.discard.length, hp: state.p1.hp },
    p2: { deck: state.p2.deck.length, discard: state.p2.discard.length, hp: state.p2.hp },
  };
  GameLog.push("_", "doBattle", []);
  const events = Engine.doBattle(state);
  renderAll();
  renderBoardList($("oppBoard"), snap[OPP], false, OPP);
  renderBoardList($("myBoard"), snap[MY], false, MY);
  renderHero($("oppHero"), { ...state[OPP], hp: pre[OPP].hp });
  renderHero($("myHero"), { ...state[MY], hp: pre[MY].hp });
  renderCorner($("oppDeckBox"), "🂠", t(L.deck), pre[OPP].deck);
  renderCorner($("oppDiscardBox"), "🗂", t(L.discardPile), pre[OPP].discard);
  renderCorner($("myDiscardBox"), "🗂", t(L.discardPile), pre[MY].discard);
  renderCorner($("myDeckBox"), "🂠", t(L.deck), pre[MY].deck);
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
          impactRing(d, "#ff6b6b");
          spawnParticles(d, { n: 6, color: "#ff6b6b", spread: 40 });
          if (ev.aDmg >= 6) screenShake(0.5);
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
          if (hpEl) {
            hpEl.textContent = String(Math.max(0, ev.hp));
            hpEl.classList.toggle("hurt", ev.hp < Number(el.dataset.maxhp || Infinity));
          }
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
      case "chaosTrigger": {
        // O002: kocka nad ogrom + log, koho schopnosť spustil (aj súperovu).
        const a = Cards.nameOf(Cards.byId["O002"], 1, I18N.lang);
        const b = Cards.nameOf(Cards.byId[ev.targetDefId], 1, I18N.lang);
        log(t(L.chaosTriggerMsg).replace("{a}", a).replace("{b}", `${b} (${Cards.KW_LABEL[ev.kw][I18N.lang]})`));
        const el = cardById(ev.uid);
        if (el) { floatText(el, "🎲", true); await sleep(400); }
        break;
      }
      case "shrink": {
        // Oslabenie (D001): −a/−h floatuje červeno, čísla na karte klesnú.
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🐲 ${name} ${t(L.shrinkMsg)} ${fmtBuff(ev.a, ev.h)}`);
        if (el) {
          floatText(el, fmtBuff(ev.a, ev.h), false);
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a);
          if (hpEl && ev.h) hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h);
          if (ev.h) el.dataset.maxhp = String(Math.max(1, Number(el.dataset.maxhp || 0) + ev.h));
          Sfx.zap();
          await sleep(500);
        }
        break;
      }
      case "polymorph": {
        // Ovčia premena: karta sa na mieste vymení za Ovečku 0/1 (uid ostáva).
        const el = cardById(ev.uid);
        const name = Cards.nameOf(Cards.byId[ev.fromDefId], ev.fromRank || 1, I18N.lang);
        log(`🐑 ${name} ${t(L.polymorphMsg)}`);
        if (el) {
          if (previewEl && previewEl._srcCard === el) hidePreview();
          Sfx.spell("polymorph");
          impactRing(el, "#e599f7");
          spawnParticles(el, { n: 10, color: "#e599f7", emoji: "☁️", spread: 55 });
          el.classList.add("proc");
          await sleep(350);
          const sheep = cardEl({
            uid: ev.uid, defId: ev.defId, rank: 1, atk: ev.atk, hp: ev.hp, maxHp: ev.hp, taunt: false,
          }, { owner: ev.pid });
          sheep.style.order = el.style.order;
          el.replaceWith(sheep);
          floatText(sheep, "🐑");
          sheep.classList.add("evolving");
          await sleep(500);
          sheep.classList.remove("evolving");
        }
        break;
      }
      case "hex": {
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🐸 ${name} ${t(L.hexMsg)}`);
        if (el) {
          floatText(el, "🐸");
          Sfx.hex();
          impactRing(el, "#be4bdb");
          spawnParticles(el, { n: 8, color: "#be4bdb", emoji: "🐸", spread: 55 });
          await sleep(700);
        }
        break;
      }
      case "shieldPop": {
        const el = cardById(ev.uid);
        log(`😇 ${t(L.shieldPopMsg)}`);
        if (el) {
          el.querySelector(".shield-badge")?.remove();
          floatText(el, "😇💥");
          Sfx.shieldPop();
          impactRing(el, "#ffd147");
          spawnParticles(el, { n: 10, color: "#ffd147", spread: 60 });
          await sleep(500);
        }
        break;
      }
      case "revive": {
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🪶 ${name} ${t(L.reviveMsg)}`);
        if (el) {
          const hpEl = el.querySelector(".hp");
          if (hpEl) hpEl.textContent = "1";
          floatText(el, "🪶✨", true);
          Sfx.revive();
          impactRing(el, "#ff922b");
          spawnParticles(el, { n: 10, color: "#ff922b", emoji: "🪶", spread: 60 });
          await sleep(800);
        }
        break;
      }
      case "silence": {
        // Umlčaná príšerka: trvalý 🤫 badge + preškrtnutý text + log s menom.
        const el = cardById(ev.uid);
        const name = ev.defId ? Cards.nameOf(Cards.byId[ev.defId], ev.rank || 1, I18N.lang) : "?";
        log(`🤫 ${name} ${t(L.silencedMsg)}`);
        if (el) {
          el.classList.add("silenced");
          const badge = document.createElement("div");
          badge.className = "silence-badge";
          badge.textContent = "🤫";
          el.appendChild(badge);
          floatText(el, "🤫");
          Sfx.silence();
          impactRing(el, "#868e96");
          el.classList.add("proc");
          await sleep(900);
          el.classList.remove("proc");
        }
        break;
      }
      case "silenceFizzle": {
        log(t(L.silenceFizzleMsg));
        break;
      }
      case "aoeDmg": {
        // Veľká vlna: zasiahne všetkých nepriateľov NARAZ – žiadne projektily.
        const els = ev.hits.map(h => cardById(h.uid)).filter(Boolean);
        Sfx.spell("bolt");
        if (els[0]) boardWave(els[0].closest(".board"), "#ff7a1a");
        screenShake(1);
        els.forEach((el, i) => {
          el.classList.add("hit");
          // Zásahy rozfázované zľava doprava – vlna, nie jeden blik.
          floatText(el, `-${ev.n}`, false, i * 60 * ANIM);
          setTimeout(() => { impactRing(el, "#ff7a1a"); spawnParticles(el, { n: 5, color: "#ff7a1a", spread: 40 }); }, i * 60 * ANIM);
        });
        for (const h of ev.hits) {
          const el = cardById(h.uid);
          const hpEl = el && el.querySelector(".hp");
          if (hpEl) {
            hpEl.textContent = String(Math.max(0, h.hp));
            hpEl.classList.toggle("hurt", h.hp < Number(el.dataset.maxhp || Infinity));
          }
        }
        await sleep(650);
        for (const el of els) el.classList.remove("hit");
        break;
      }
      case "futureBuff": {
        // Permanentná aura položená uprostred boja (U010 Pri smrti).
        Sfx.evolve();
        log(`${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]} +${ev.a}/+${ev.h}!`);
        break;
      }
      case "buff": {
        const el = cardById(ev.uid);
        if (el) {
          Sfx.buff();
          floatText(el, fmtBuff(ev.a, ev.h), true);
          // Prepíš čísla na karte, nech buff reálne vidno.
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl && ev.a) { atkEl.textContent = String((parseInt(atkEl.textContent, 10) || 0) + ev.a); atkEl.classList.add("buffed"); }
          if (hpEl && ev.h) { hpEl.textContent = String((parseInt(hpEl.textContent, 10) || 0) + ev.h); hpEl.classList.add("buffed"); }
          // Buff dvíha aj maxHp – zranenie (červená) sa nezamaskuje.
          if (ev.h) el.dataset.maxhp = String(Number(el.dataset.maxhp || 0) + ev.h);
          el.classList.add("evolving");
          await sleep(500);
          el.classList.remove("evolving");
        }
        break;
      }
      case "die": {
        const el = cardById(ev.uid);
        Sfx.die();
        if (el) {
          // mouseleave po remove() nepríde – zatvor preview padlej karty ručne.
          if (previewEl && previewEl._srcCard === el) hidePreview();
          spawnParticles(el, { n: 10, color: "#868e96", emoji: "💨", spread: 55 });
          el.classList.add("dying"); await sleep(500); el.remove();
        }
        break;
      }
      case "summon": {
        const def = Cards.byId[ev.defId];
        const row = ev.pid === MY ? $("myBoard") : $("oppBoard");
        const el = cardEl({
          uid: ev.uid, defId: ev.defId, rank: ev.rank || 1,
          atk: ev.atk ?? def.atk, hp: ev.hp ?? def.hp, maxHp: ev.hp ?? def.hp,
          taunt: !!def.taunt,
        }, { owner: ev.pid });
        el.style.order = String(ev.slot ?? 0);
        row.appendChild(el);
        Sfx.summon();
        impactRing(el, "#4dabf7");
        spawnParticles(el, { n: 8, color: "#4dabf7", emoji: "✨", spread: 50 });
        await sleep(450);
        break;
      }
      case "overflow": {
        // Token sa nezmestil – buff eventy hneď za ním ukážu, kto čo dostal.
        log(`${t(L.overflowMsg)} (+${ev.atk}/+${ev.hp})`);
        break;
      }
      case "reviveAs": {
        // U004: príšerka vstala ako n/n – prepíš staty na karte.
        const el = cardById(ev.uid);
        const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
        log(`${name} ${t(L.reviveAsMsg)} ${ev.atk}/${ev.hp}`);
        if (el) {
          const atkEl = el.querySelector(".atk"), hpEl = el.querySelector(".hp");
          if (atkEl) atkEl.textContent = String(ev.atk);
          if (hpEl) { hpEl.textContent = String(ev.hp); hpEl.classList.remove("hurt"); }
          el.dataset.maxhp = String(ev.hp);
          floatText(el, "🦋✨", true);
          Sfx.evolve();
          await sleep(800);
        }
        break;
      }
      case "drunkHit": {
        // Ogr sa ožratým úderom trafil sám – nápadný chaos moment.
        const el = cardById(ev.uid);
        log(`${t(L.drunkMsg)} ${ev.n} 💥`);
        if (el) {
          floatText(el, `🍺 -${ev.n}`);
          Sfx.drunk();
          el.classList.add("hit");
          setTimeout(() => el.classList.remove("hit"), 400);
          await sleep(600);
        }
        break;
      }
      case "confusedRevive": {
        // Zmätený obranca vstal – summon event hneď za tým kartu vykreslí.
        const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
        log(`${name} ${t(ev.swapped ? L.confusedSwapMsg : L.confusedOwnMsg)}`);
        await sleep(400);
        break;
      }
      case "toDiscard": {
        // Karty z plochy padajú do kôpky – priebežne dvíhaj počítadlo.
        const box = ev.pid === MY ? $("myDiscardBox") : $("oppDiscardBox");
        const ct = box.querySelector(".ct");
        if (ct) ct.textContent = String((parseInt(ct.textContent, 10) || 0) + 1);
        break;
      }
      case "heroDmg": {
        const chip = ev.pid === MY ? $("myHero") : $("oppHero");
        Sfx.hero();
        screenShake(1.3);
        impactRing(chip, "#e03131");
        spawnParticles(chip, { n: 12, color: "#e03131", emoji: "💥", spread: 70 });
        floatText(chip, `-${ev.dmg}`);
        renderHero(chip, { ...state[ev.pid], hp: ev.hp });
        log(`${ev.pid === MY ? t(L.you) : t(L.opp)} ${t(L.heroDmgMsg)} 💥 ${ev.dmg}`);
        botTaunt(ev.pid === MY ? "win" : "lose", 0.8);
        lastBattleNote = ev.pid === MY
          ? `you WON the last battle, the human's hero took ${ev.dmg} damage (their HP: ${ev.hp})`
          : `you LOST the last battle, your hero took ${ev.dmg} damage (your HP: ${ev.hp})`;
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

// ---------- Vizuálne efekty ----------
// Všetky efekty sú dočasné <div>y pripnuté na <body> (position: fixed),
// animované cez Web Animations API – nezávislé od prerenderu kariet.

const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// Farba + emoji + režim každého kúzla (fx.type). target = letí na vybranú
// príšerku, board = vlna cez celú vlastnú plochu, self = k hrdinovi/peniazom.
const SPELL_FX = {
  buffTarget:     { color: "#40c057", emoji: "✨", mode: "target" },
  copyToDeck:     { color: "#4dabf7", emoji: "🪞", mode: "target" },
  transform:      { color: "#9775fa", emoji: "🎩", mode: "target" },
  buffAllFriends: { color: "#22b8cf", emoji: "🌊", mode: "board" },
  bolt:           { color: "#fcc419", emoji: "⚡", mode: "board", shake: 0.8 },
  hex:            { color: "#be4bdb", emoji: "🐸", mode: "board" },
  polymorph:      { color: "#e599f7", emoji: "🐑", mode: "board" },
  starPower:      { color: "#ffd147", emoji: "🌟", mode: "board", shake: 0.5 },
  silence:        { color: "#868e96", emoji: "🤫", mode: "board" },
  dmgBoost:       { color: "#ff922b", emoji: "⚡", mode: "self" },
  discover:       { color: "#4dabf7", emoji: "📖", mode: "self" },
  gold:           { color: "#ffd147", emoji: "🪙", mode: "money" },
  goldLater:      { color: "#ffd147", emoji: "💰", mode: "money" },
};

// Letiaci projektil zo stredu jednej karty do stredu druhej; farba podľa
// zdroja (výboj, bublina…), na dopade prstenec + iskry.
function shootProjectile(fromEl, toEl, color = "#ff7a1a") {
  return new Promise(resolve => {
    const a = center(fromEl.getBoundingClientRect()), b = center(toEl.getBoundingClientRect());
    const p = document.createElement("div");
    p.className = "projectile";
    p.style.left = a.x + "px";
    p.style.top = a.y + "px";
    p.style.setProperty("--fx", color);
    document.body.appendChild(p);
    const ms = 400 * ANIM;
    if (p.animate) {
      p.animate([
        { transform: "translate(0,0) scale(.6)", opacity: 0.6 },
        { transform: `translate(${(b.x - a.x) / 2}px, ${(b.y - a.y) / 2 - 30}px) scale(1.3)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(1)`, opacity: 1 },
      ], { duration: ms, easing: "cubic-bezier(.3,.1,.7,1)", fill: "forwards" });
    }
    setTimeout(() => {
      p.remove();
      impactRing(toEl, color);
      spawnParticles(toEl, { n: 7, color, spread: 50 });
      resolve();
    }, ms);
  });
}

// Emoji kúzla letí oblúkom z ruky na cieľ, cestou sa zväčší a rozžiari.
function flyEmoji(from, to, emoji, color, ms = 480) {
  ms *= ANIM;
  const a = center(from), b = center(to);
  const el = document.createElement("div");
  el.className = "cast-fx";
  el.textContent = emoji;
  el.style.left = a.x + "px";
  el.style.top = a.y + "px";
  el.style.setProperty("--fx", color);
  document.body.appendChild(el);
  const dx = b.x - a.x, dy = b.y - a.y;
  const lift = Math.max(70, Math.abs(dx) * 0.3);
  if (el.animate) {
    el.animate([
      { transform: "translate(-50%,-50%) scale(.4) rotate(-25deg)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - lift}px)) scale(1.7) rotate(8deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 },
    ], { duration: ms, easing: "cubic-bezier(.35,.1,.35,1)", fill: "forwards" });
  }
  return sleep(ms / ANIM).then(() => el.remove());
}

// Expandujúci prstenec na mieste zásahu.
function impactRing(el, color = "#ffd147") {
  if (REDUCED || !el) return;
  const r = el.getBoundingClientRect(), c = center(r);
  const d = document.createElement("div");
  d.className = "fx-ring";
  d.style.left = c.x + "px";
  d.style.top = c.y + "px";
  d.style.setProperty("--fx", color);
  d.style.setProperty("--sz", Math.max(r.width, r.height) * 0.9 + "px");
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 520 * ANIM);
}

// Iskry / emoji rozletené z karty do všetkých strán, padajú dole.
function spawnParticles(el, opts = {}) {
  if (REDUCED || !el) return;
  const { n = 8, color = "#ffd147", emoji = null, spread = 70 } = opts;
  const c = center(el.getBoundingClientRect());
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "fx-particle" + (emoji ? " emoji" : "");
    if (emoji) p.textContent = emoji;
    p.style.left = c.x + "px";
    p.style.top = c.y + "px";
    p.style.setProperty("--fx", color);
    document.body.appendChild(p);
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const dist = spread * (0.6 + Math.random() * 0.8);
    const dur = (450 + Math.random() * 250) * ANIM;
    if (p.animate) {
      p.animate([
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 24}px)) scale(.15) rotate(${Math.random() * 180 - 90}deg)`, opacity: 0 },
      ], { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" });
    }
    setTimeout(() => p.remove(), dur + 60);
  }
}

// Krátky otras celej dosky (blesk, plošný útok, zásah hrdinu).
function screenShake(strength = 1) {
  if (REDUCED) return;
  const st = $("stage");
  if (!st || !st.animate) return;
  const m = 6 * strength;
  st.animate([
    { transform: "translate(0,0)" },
    { transform: `translate(${m}px, ${-m * 0.6}px)` },
    { transform: `translate(${-m}px, ${m * 0.5}px)` },
    { transform: `translate(${m * 0.5}px, ${m * 0.3}px)` },
    { transform: "translate(0,0)" },
  ], { duration: 280 * ANIM, easing: "ease-out" });
}

// Farebná vlna prebehne cez celú plochu (plošné kúzla, AoE výbuch).
function boardWave(boardEl, color) {
  if (REDUCED || !boardEl) return;
  const r = boardEl.getBoundingClientRect();
  const w = document.createElement("div");
  w.className = "fx-wave";
  w.style.left = r.left + "px";
  w.style.top = r.top + "px";
  w.style.width = r.width + "px";
  w.style.height = r.height + "px";
  w.style.setProperty("--fx", color);
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 650 * ANIM);
}

// Zoslanie kúzla v nákupnej fáze: emoji letí z ruky na cieľ, tam praskne.
// fromRect = pozícia karty v ruke ZACHYTENÁ pred prerenderom (karta zmizne).
async function playSpellCast(ev, fromRect) {
  const def = Cards.byId[ev.defId];
  if (!def || !def.fx) return;
  const fx = SPELL_FX[def.fx.type] || { color: "#ffd147", mode: "self" };
  const emoji = fx.emoji || def.emoji;
  const targetEl = ev.targetUid ? cardById(ev.targetUid) : null;
  const dest = targetEl
    || (fx.mode === "board" ? $("myBoard") : fx.mode === "money" ? $("moneyEl") : $("myHero"));
  Sfx.cast();
  await flyEmoji(fromRect || $("handEl").getBoundingClientRect(), dest.getBoundingClientRect(), emoji, fx.color);
  Sfx.spell(def.fx.type);
  if (fx.mode === "board") {
    boardWave(dest, fx.color);
    if (fx.shake) screenShake(fx.shake);
    const cards = [...dest.querySelectorAll(".card")];
    cards.forEach((c, i) => setTimeout(() => {
      impactRing(c, fx.color);
      spawnParticles(c, { n: 5, color: fx.color, emoji, spread: 45 });
    }, i * 60 * ANIM));
  } else {
    impactRing(dest, fx.color);
    spawnParticles(dest, { n: 10, color: fx.color, emoji, spread: 65 });
    if (targetEl) {
      targetEl.classList.add("evolving");
      setTimeout(() => targetEl.classList.remove("evolving"), 600 * ANIM);
      // Cielený buff nevracia „buff“ event – ukáž, čo príšerka dostala
      // (ev.a/ev.h už aj so Živelnou silou).
      const f = def.fx;
      const a = ev.a ?? f.a, h = ev.h ?? f.h;
      const tags = [f.taunt && "🛡️", f.shield && "😇", f.revive && "🪶", f.windfury && "🌪️"].filter(Boolean);
      if (a || h) tags.unshift(fmtBuff(a, h));
      if (tags.length) floatText(targetEl, tags.join(" "), true);
    }
  }
}

// Formát buff čísel so znamienkom – ogrí hod mincou môže byť aj záporný.
function fmtBuff(a, h) {
  const s = n => (n >= 0 ? `+${n}` : String(n));
  return `${s(a)}/${s(h)}`;
}

// Číslo/emoji vyskočí nad kartou; delay (ms) na rozfázovanie AoE zásahov.
function floatText(el, text, heal, delay = 0) {
  const f = document.createElement("div");
  f.className = "dmg-float" + (heal ? " heal" : "");
  f.textContent = text;
  f.style.setProperty("--tilt", (Math.random() * 16 - 8).toFixed(1) + "deg");
  if (delay) f.style.animationDelay = delay + "ms";
  el.appendChild(f);
  setTimeout(() => f.remove(), 800 * ANIM + delay);
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
  // Počas animácie boja active už ukazuje na nové kolo – peniaze ešte neukazuj.
  const gold = p.id === MY && state.active === MY && !busy ? ` · 🪙 ${p.money}` : "";
  el.innerHTML = `<span class="who">${hero.emoji} ${hero.name}</span>` +
    `<span class="tier-shield">${p.tier}</span>` +
    `<span class="nums">❤️ ${Math.max(0, p.hp)}${gold}</span>`;
}

// mine = drag&drop; ownerPid (voliteľné) = koho boost/aury popisok ukáže.
// V boji je mine=false aj pre vlastnú plochu – owner treba poslať explicitne,
// inak by moje karty ukazovali súperov dmgBoost (Živelná sila) zeleno.
function renderBoardList(el, list, mine, ownerPid) {
  el.innerHTML = "";
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    const card = cardEl(inst, { owner: ownerPid || (mine ? MY : OPP) });
    // Rad je vycentrovaný (flex); poradie útoku zľava doprava drží CSS order.
    const slot = inst.slot ?? i;
    card.style.order = String(slot);
    card.dataset.slot = String(slot);
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
  // Aktívne permanentné aury („všetky budúce X…“). Spoločný základ všetkých
  // rás (F008 futureAll) sa ukáže raz ako ⭐, rasy len zvyšok nad ním.
  const rb = p.raceBuffs || {};
  const allRaces = Object.keys(Cards.RACES);
  const common = allRaces.every(r => rb[r])
    ? { a: Math.min(...allRaces.map(r => rb[r].a)), h: Math.min(...allRaces.map(r => rb[r].h)) }
    : { a: 0, h: 0 };
  const auraParts = [];
  if (common.a || common.h) auraParts.push(`⭐+${common.a}/+${common.h}`);
  for (const [race, b] of Object.entries(rb)) {
    const a = b.a - common.a, h = b.h - common.h;
    if (a || h) auraParts.push(`${Cards.RACE_ICON[race]}+${a}/+${h}`);
  }
  $("auraEl").textContent = auraParts.join(" ") + (p.dmgBoost ? ` ⚡+${p.dmgBoost}` : "") +
    (p.summonCharge ? ` 🧟+${p.summonCharge}` : "");
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
    priv.appendChild(card);
  });
  // Špeciálny slot na kúzlo – neberie miesto príšerám.
  if (p.spellShop) {
    const s = p.spellShop;
    const card = cardEl(s.defId, { shop: true });
    card.classList.add("spell-slot");
    if (s.frozen) card.classList.add("frozen");
    if (myTurn && p.money >= Engine.cardCost(s.defId)) {
      card.classList.add("buyable");
      attachDrag(card, { type: "spell", idx: 0 });
    } else card.classList.add("disabled");
    priv.appendChild(card);
  }

  $("refreshBtn").textContent = `${t(L.refresh)} (${Engine.refreshCost(state)}🪙)`;
  $("refreshBtn").disabled = !myTurn || p.money < Engine.refreshCost(state);
  const allFrozen = p.priv.length > 0 && p.priv.every(s => s.frozen) &&
    (!p.spellShop || p.spellShop.frozen);
  $("freezeBtn").textContent = allFrozen ? t(L.unfreeze) : t(L.freeze);
  $("freezeBtn").classList.toggle("frozen-on", allFrozen);
  $("freezeBtn").disabled = !myTurn;
  const cost = Engine.upgradeCost(state, MY);
  $("tierBtn").textContent = cost === null ? `⭐ MAX` : `${t(L.tierUp)} (${cost}🪙)`;
  $("tierBtn").disabled = !myTurn || cost === null || p.money < cost;
  // Buyback: raz za ťah vráti poslednú predanú kartu (omyl pri ťahaní).
  const ls = p.lastSold;
  $("buyBackBtn").textContent = `${t(L.buyBack)}${ls ? ` (${ls.gain}🪙)` : ""}`;
  $("buyBackBtn").disabled = !myTurn || !ls || p.buyBackUsed || p.money < ls.gain;
  $("buyBackBtn").classList.toggle("hidden", !ls && !!p.buyBackUsed);
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
  el.dataset.defid = defId;
  if (isInst) el.dataset.uid = instOrId.uid;
  // Trvalý bonus Živelnej sily majiteľa (opts.owner, default ja) – výboje,
  // výbuchy a „Pri útoku" bonus ukážu v popisku navýšené číslo (zeleno).
  const owner = state ? state[opts.owner || MY] : null;
  const boost = (owner && owner.dmgBoost) || 0;
  const text = Cards.cardText(def, rank, I18N.lang, true, boost);
  const plainText = Cards.cardText(def, rank, I18N.lang, false, boost);
  const name = Cards.nameOf(def, rank, I18N.lang);
  const art = Cards.artOf(def, rank);
  // Príšery majú kompletnú kartu ako obrázok (rám + art); tier číslo sa
  // kreslí do modrého kryštálu vľavo hore. Kúzla/tokeny majú generický rám.
  let inner = `<span class="tier-tag">${art ? def.tier : "⭐" + def.tier}</span>`;
  if (opts.shop) inner += `<span class="cost">🪙${Engine.cardCost(defId)}</span>`;
  // Koľko kópií už vlastníš (vrátane balíčka a kôpky) – kúpa tretej evolvne.
  // Kúzla sa neevolvujú, počítadlo by na nich zavádzalo.
  if (opts.owned && !def.spell) inner += `<span class="owned${opts.owned >= 2 ? " hot" : ""}">${Math.min(opts.owned, 2)}/3</span>`;
  if (art) {
    el.classList.add("full-art");
    el.style.backgroundImage = `url("${art}")`;
  } else {
    inner += `<div class="em">${def.emoji}</div>`;
  }
  // Božský štít / Fénixovo pierko – trvalé badge, kým efekt drží.
  if (isInst && instOrId.shield) inner += `<span class="shield-badge">😇</span>`;
  if (isInst && instOrId.revive) inner += `<span class="revive-badge">🪶</span>`;
  if (isInst && instOrId.windfury) inner += `<span class="windfury-badge">🌪️</span>`;
  // Obranca ako badge 🛡️ – aj keď ho dal Štít/Koreň (na karte to inak nie je
  // napísané) a aj na Mláďati; modrý rám sám o sebe deťom nestačil.
  if (isInst ? instOrId.taunt : def.taunt) inner += `<span class="taunt-badge">🛡️</span>`;
  inner += `<div class="nm">${name}</div>`;
  inner += `<div class="race">${raceLine(def, rank)}</div>`;
  if (text) inner += `<div class="tx">${text}</div>`;
  if (!def.spell) {
    const atk = isInst ? instOrId.atk : def.atk;
    const hp = isInst ? instOrId.hp : def.hp;
    // Buffnuté staty zelenou – vidno rozdiel oproti základu daného stupňa.
    // Zranená príšerka (hp < maxHp) má život červený; červená vyhráva.
    const baseAtk = def.atk * Cards.STAT_MULT[rank];
    const baseHp = def.hp * Cards.STAT_MULT[rank];
    const maxHp = isInst ? (instOrId.maxHp ?? hp) : def.hp;
    const hurt = isInst && hp < maxHp;
    el.dataset.maxhp = String(maxHp);
    inner += `<span class="atk${atk > baseAtk ? " buffed" : ""}">${atk}</span>` +
      `<span class="hp${hurt ? " hurt" : hp > baseHp ? " buffed" : ""}">${hp}</span>`;
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
  // Ikona rasy pred menom – rasu vidno na prvý pohľad aj na malej karte.
  return `${Cards.RACE_ICON[def.race] || ""} ${t(Cards.RACES[def.race])}`;
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

// Funguje aj počas boja a ťahu súpera (busy) – hráč si chce prezrieť
// súperove príšery; blokuje ho len aktívne ťahanie karty.
function showPreview(card, instOrId, opts) {
  if (drag) return;
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
  big._srcCard = card;
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

// Zruš rozbehnuté ťahanie bez vykonania akcie (druhý prst = pinch zoom).
function cancelDrag() {
  window.removeEventListener("pointermove", onPressMove);
  if (press) { clearTimeout(press.longTimer); press = null; }
  hidePreview();
  if (drag) {
    drag.ghost.remove();
    drag.card.classList.remove("drag-src");
    markZones(drag.src, false);
    drag = null;
  }
}

// ---------- Pinch zoom: 2 prsty zväčšia a posúvajú dosku ----------
// Jeden prst ďalej normálne ťahá karty; položenie druhého prsta ťahanie
// zruší a začne zoom. Stiahnutie prstov späť pod 1× zoom celý resetne.
const zoomSt = { s: 1, tx: 0, ty: 0 };
const zoomPts = new Map(); // pointerId -> posledná poloha prsta
let pinch = null; // { d0, s0, c0x, c0y, ux, uy } – stred štipca drží miesto

function applyZoom() {
  const st = $("stage");
  if (zoomSt.s <= 1.02) {
    zoomSt.s = 1; zoomSt.tx = 0; zoomSt.ty = 0;
    st.style.transform = "";
  } else {
    st.style.transform = `translate(${zoomSt.tx}px, ${zoomSt.ty}px) scale(${zoomSt.s})`;
  }
}

$("gameScreen").addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  zoomPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (zoomPts.size !== 2) return;
  cancelDrag();
  const [a, b] = [...zoomPts.values()];
  const r = $("stage").getBoundingClientRect();
  // Stred dosky bez transformu (translate posúva aj stred rectu).
  const c0x = (r.left + r.right) / 2 - zoomSt.tx;
  const c0y = (r.top + r.bottom) / 2 - zoomSt.ty;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  pinch = {
    d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    s0: zoomSt.s, c0x, c0y,
    ux: (mx - c0x - zoomSt.tx) / zoomSt.s,
    uy: (my - c0y - zoomSt.ty) / zoomSt.s,
  };
});
window.addEventListener("pointermove", e => {
  if (!zoomPts.has(e.pointerId)) return;
  zoomPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinch || zoomPts.size < 2) return;
  const [a, b] = [...zoomPts.values()];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  zoomSt.s = Math.min(3, Math.max(1, pinch.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0)));
  zoomSt.tx = mx - pinch.c0x - zoomSt.s * pinch.ux;
  zoomSt.ty = my - pinch.c0y - zoomSt.s * pinch.uy;
  applyZoom();
});
function zoomPtUp(e) {
  zoomPts.delete(e.pointerId);
  if (zoomPts.size < 2) pinch = null;
}
window.addEventListener("pointerup", zoomPtUp);
window.addEventListener("pointercancel", zoomPtUp);

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
  if (src.type === "common" || src.type === "priv" || src.type === "spell") {
    set($("handEl"), "drop-ok");
    set($("myBoard"), "drop-ok");
    return;
  }
  if (src.type === "board") {
    set($("shopPanel"), "drop-sell");
    set($("myDiscardBox"), "drop-ok"); // odhodenie do kôpky
    set($("myBoard"), "drop-ok"); // presun na iný slot
    return;
  }
  const inst = state[MY].hand[src.idx];
  if (!inst) return;
  set($("shopPanel"), "drop-sell");
  set($("myDiscardBox"), "drop-ok"); // odhodenie do kôpky
  const def = Cards.byId[inst.defId];
  if (inst.spell && TARGETED_SPELL.has(def.fx.type)) {
    $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
  } else {
    set($("myBoard"), "drop-ok");
    // Cielený battlecry (draci): karty na ploche svietia ako ciele –
    // drop na konkrétnu príšerku vyberie jej rasu, drop vedľa = fallback.
    if (!inst.spell && TARGETED_BATTLECRY.has(def.power?.fx?.type)) {
      $("myBoard").querySelectorAll(".card").forEach(c => set(c, "target-ok"));
    }
  }
}

// Battlecry efekty, ktoré berú cieľ (draci) – drop na vlastnú príšerku.
const TARGETED_BATTLECRY = new Set(["buffRaceOf", "futureRaceOf", "discoverRace", "evolveTarget", "reviveAs", "buffOne"]);
// Kúzla, ktoré sa hádžu na konkrétnu vlastnú príšerku.
const TARGETED_SPELL = new Set(["buffTarget", "copyToDeck", "transform"]);

function endDrag(e) {
  const d = drag;
  drag = null;
  if (!d) return;
  d.ghost.remove();
  d.card.classList.remove("drag-src");
  markZones(d.src, false);
  const src = d.src;
  const p = state[MY];

  if (src.type === "common" || src.type === "priv" || src.type === "spell") {
    if (inRect(e, $("handEl")) || inRect(e, $("myBoard"))) {
      act(src.type === "common" ? doAction("buyCommon", src.idx)
        : src.type === "priv" ? doAction("buyPrivate", src.idx)
        : doAction("buySpell"));
    }
    return;
  }

  if (src.type === "board") {
    // Kôpka pred obchodom – jej menší rect sa prekrýva s rectom obchodu,
    // špecifickejší cieľ musí vyhrať (inak drop na kôpku omylom predá).
    if (inRect(e, $("myDiscardBox"))) { act(doAction("discardCard", "board", src.idx)); return; }
    if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "board", src.idx)); return; }
    if (inRect(e, $("myBoard"))) {
      // Presun podľa miesta dropu: rad je vycentrovaný, tak sa slot určí
      // z pozícií vykreslených kariet (na kartu = výmena, vedľa = posun na kraj).
      const others = [...$("myBoard").querySelectorAll(".card")]
        .filter(c => !c.classList.contains("drag-src"))
        .map(c => {
          const r = c.getBoundingClientRect();
          return { x: r.left + r.width / 2, slot: Number(c.dataset.slot) };
        })
        .sort((a, b) => a.x - b.x);
      let slot;
      if (!others.length) slot = 0;
      else if (e.clientX < others[0].x - 40) slot = Math.max(0, others[0].slot - 1);
      else if (e.clientX > others[others.length - 1].x + 40) {
        slot = Math.min(Engine.BOARD_MAX - 1, others[others.length - 1].slot + 1);
      } else {
        // najbližšia karta pod kurzorom = výmena miest
        slot = others.reduce((best, o) =>
          Math.abs(o.x - e.clientX) < Math.abs(best.x - e.clientX) ? o : best).slot;
      }
      act(doAction("moveOnBoard", src.idx, slot));
    }
    return;
  }

  // src.type === "hand"
  const inst = p.hand[src.idx];
  if (!inst) { renderAll(); return; }
  if (inRect(e, $("myDiscardBox"))) { act(doAction("discardCard", "hand", src.idx)); return; }
  if (inRect(e, $("shopPanel"))) { act(doAction("sellCard", "hand", src.idx)); return; }
  if (inst.spell) {
    const fx = Cards.byId[inst.defId].fx;
    if (TARGETED_SPELL.has(fx.type)) {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) act(doAction("castSpell", src.idx, Number(targetEl.dataset.uid)));
      return;
    }
    if (inRect(e, $("myBoard"))) act(doAction("castSpell", src.idx));
    return;
  }
  if (inRect(e, $("myBoard"))) {
    // Cielený battlecry (draci): drop priamo na vlastnú príšerku = cieľ.
    const def = Cards.byId[inst.defId];
    if (TARGETED_BATTLECRY.has(def.power?.fx?.type)) {
      const targetEl = [...$("myBoard").querySelectorAll(".card")].find(c => inRect(e, c));
      if (targetEl) { act(doAction("playMinion", src.idx, Number(targetEl.dataset.uid))); return; }
    }
    act(doAction("playMinion", src.idx));
  }
}

// ---------- Interakcie hráča ----------
function act(events) {
  if (!events) { renderAll(); return; }
  const hiddenEvolves = [];
  // Zoslané kúzlo: zapamätaj si, kde v ruke karta bola – renderAll ju
  // odstráni a animácia potrebuje štart letu.
  // Kniha (discover) nevracia „spell“ event, ale discoverStart – bez „play“
  // v tej istej dávke (draci majú discover ako battlecry) je to kúzlo.
  let spellEv = events.find(e => e.type === "spell" && e.pid === MY);
  if (!spellEv && events.some(e => e.type === "discoverStart" && e.pid === MY) && !events.some(e => e.type === "play")) {
    spellEv = { type: "spell", pid: MY, defId: "kniha" };
  }
  let castFrom = null;
  if (spellEv) {
    const src = [...$("handEl").querySelectorAll(".card")].find(c => c.dataset.defid === spellEv.defId);
    castFrom = (src || $("handEl")).getBoundingClientRect();
  }
  for (const ev of events) {
    if (ev.type === "evolve" && ev.pid === MY) {
      Sfx.evolve();
      log(`${t(L.youEvolve)} ${Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang)}`);
      if (ev.hidden) hiddenEvolves.push(Cards.nameOf(Cards.byId[ev.defId], ev.rank, I18N.lang));
    }
    if ((ev.type === "buy" || ev.type === "sell") && ev.pid === MY) Sfx.coin();
    if (ev.type === "buyBack" && ev.pid === MY) { Sfx.coin(); log(t(L.buyBackMsg)); }
    if (ev.type === "toHand" && ev.pid === MY) log(t(L.pulledCopies));
    if (ev.type === "futureBuff" && ev.pid === MY) {
      Sfx.evolve();
      log(`${Cards.RACE_ICON[ev.race]} ${Cards.RACES_NOM[ev.race][I18N.lang]} +${ev.a}/+${ev.h}!`);
    }
    if (ev.type === "futureAllBuff" && ev.pid === MY) {
      Sfx.evolve();
      log(`⭐ ${t(L.allMinionsForever)} +${ev.a}/+${ev.h}!`);
    }
  }
  renderAll();
  // Evolve animácia po prerenderi.
  for (const ev of events) {
    if (ev.type === "evolve" && ev.uid) {
      const el = cardById(ev.uid);
      if (el) { el.classList.add("evolving"); spawnParticles(el, { n: 12, color: "#ffd147", emoji: "⭐", spread: 80 }); }
    }
  }
  if (spellEv) playSpellCast(spellEv, castFrom);
  // Efekty schopností v nákupnej fáze (battlecry, Po nákupe, kúzla) – nech
  // hráč VIDÍ, že sa niečo stalo: proc badge, +a/+h nad kartou, log chárg.
  for (const ev of events) {
    if (ev.pid !== MY) continue;
    if (ev.type === "play" || (ev.type === "proc" && ev.kw === "afterSpell")) {
      const kw = ev.type === "play" ? "battlecry" : "afterSpell";
      const def = ev.type === "play" ? Cards.byId[ev.defId] : null;
      if (ev.type === "proc" || (def.power && def.power.kw === "battlecry")) {
        const el = cardById(ev.uid);
        if (el) {
          el.classList.add("proc");
          const badge = document.createElement("div");
          badge.className = "proc-badge";
          badge.textContent = Cards.KW_LABEL[kw][I18N.lang] + "!";
          el.appendChild(badge);
          Sfx.buff();
          setTimeout(() => { el.classList.remove("proc"); badge.remove(); }, 900);
        }
      }
    }
    if (ev.type === "buff" && ev.uid) {
      const el = cardById(ev.uid);
      if (el) {
        floatText(el, fmtBuff(ev.a, ev.h), true);
        spawnParticles(el, { n: 6, color: "#40c057", spread: 45 });
        el.classList.add("evolving");
        setTimeout(() => el.classList.remove("evolving"), 600);
      }
    }
    if (ev.type === "reviveAsMark") {
      const name = Cards.nameOf(Cards.byId[ev.defId], 1, I18N.lang);
      log(`${name} ${t(L.reviveAsMarkMsg)} ${ev.n}/${ev.n}`);
      const el = cardById(ev.uid);
      if (el) floatText(el, "🦋", true);
    }
    // Ogrie chaos momenty – nápadne do logu (🪙/👹), nech je derp vidno.
    if (ev.type === "coinflip") {
      log(t(ev.heads ? L.coinHeadsMsg : L.coinTailsMsg));
      const el = cardById(ev.uid);
      if (el) floatText(el, "🪙", true);
    }
    if (ev.type === "gold") floatText($("moneyEl"), `+${ev.n} 🪙`, true);
    if (ev.type === "heal") floatText($("myHero"), `+${ev.n} ❤️`, true);
    if (ev.type === "dmgBoost") log(t(L.chargeDmgMsg).replaceAll("{n}", ev.n).replace("{t}", ev.total));
    if (ev.type === "summonCharge") log(t(L.chargeSummonMsg).replace("{n}", ev.n));
    if (ev.type === "silencePending") log(t(L.silencePendingMsg));
    if (ev.type === "hexPending") log(t(L.hexPendingMsg));
    if (ev.type === "polymorphPending") log(t(L.polymorphPendingMsg));
    if (ev.type === "shrinkPending") log(t(L.shrinkPendingMsg));
    if (ev.type === "boltPending") log(t(L.boltPendingMsg));
    if (ev.type === "goldLater") log(t(L.goldLaterMsg).replace("{n}", ev.n));
    if (ev.type === "transform") {
      const a = Cards.nameOf(Cards.byId[ev.fromDefId], 1, I18N.lang);
      const b = Cards.nameOf(Cards.byId[ev.toDefId], 1, I18N.lang);
      log(t(L.transformMsg).replace("{a}", a).replace("{b}", b));
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
  // Claude mód: prehra hráča = záverečný výsmech priamo v okne výsledku.
  if (mode === "bot" && difficulty === "claude" && w === OPP) {
    ClaudeBot.chat({
      apiKey: (localStorage.getItem("arena.apiKey") || "").trim(),
      lang: I18N.lang,
      playerName: localStorage.getItem("arena.playerName") || "",
      text: "(system: the player just LOST the whole game to you – deliver your final victory gloat, rub it in)",
      history: chatHistory.slice(-6),
      gameSummary: `GAME OVER after round ${state.round}: YOU WON, the player's hero is at 0 HP (your HP: ${state[OPP].hp})`,
    }).then(roast => {
      if (roast && !$("overOverlay").classList.contains("hidden")) {
        const d = document.createElement("div");
        d.className = "over-roast";
        d.textContent = `🤖 ${roast}`;
        $("overMsg").appendChild(d);
      }
    }).catch(e => console.warn("Záverečný výsmech zlyhal:", e));
  }
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
$("peerHostBtn").addEventListener("click", peerHost);
$("peerJoinBtn").addEventListener("click", peerJoin);
$("peerCodeInput").addEventListener("keydown", e => { if (e.key === "Enter") peerJoin(); });
$("newGameBtn").addEventListener("click", backToPick);
// ☰ menu (mobil v hre): hlavička je fixný overlay, ☰ ju otvára/zatvára;
// ťuk na hociktoré tlačidlo v nej alebo na tmavé pozadie ju zavrie.
$("menuBtn").addEventListener("click", () => document.querySelector("header").classList.toggle("open"));
document.querySelector("header").addEventListener("click", e => {
  if (e.target.tagName === "BUTTON" || e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});
$("endTurnBtn").addEventListener("click", onEndTurn);
$("evolveOk").addEventListener("click", () => $("evolveOverlay").classList.add("hidden"));
$("refreshBtn").addEventListener("click", () => act(doAction("refreshShop")));
$("chatSend").addEventListener("click", sendChat);
$("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });
$("freezeBtn").addEventListener("click", () => { Sfx.freeze(); act(doAction("toggleFreezeAll")); });
$("tierBtn").addEventListener("click", () => act(doAction("upgradeTier")));
$("buyBackBtn").addEventListener("click", () => act(doAction("buyBack")));
$("overAgain").addEventListener("click", () => {
  $("overOverlay").classList.add("hidden");
  if (mode === "net") backToPick();
  else startGame();
});
$("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
$("muteBtn").addEventListener("click", () => {
  $("muteBtn").textContent = Sfx.toggleMute() ? "🔇" : "🔊";
});

// ---------- Celá obrazovka (⛶) ----------
// Desktop + Android: Fullscreen API. iOS Safari API nemá – tlačidlo schováme
// a fullscreen tam rieši PWA („Pridať na plochu“, viď manifest.json).
// body.fs → CSS dá doske takmer celú výšku obrazovky.
const fsRoot = document.documentElement;
function fsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFsUi() {
  const standalone = navigator.standalone === true ||
    matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  document.body.classList.toggle("fs", fsActive() || standalone);
  $("fsBtn").textContent = fsActive() ? "🗗" : "⛶";
}
async function toggleFullscreen() {
  try {
    if (fsActive()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen).call(fsRoot);
    }
  } catch { /* prehliadač fullscreen odmietol – ostávame ako sme */ }
  updateFsUi();
}
if (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen) {
  $("fsBtn").addEventListener("click", toggleFullscreen);
} else {
  $("fsBtn").classList.add("hidden");
}
document.addEventListener("fullscreenchange", updateFsUi);
document.addEventListener("webkitfullscreenchange", updateFsUi);
updateFsUi();

// Dlhé podržanie na karte nesmie otvoriť natívne menu prehliadača
// („stiahnuť obrázok“) – long-press ukazuje preview karty.
document.addEventListener("contextmenu", e => {
  if (e.target.closest && e.target.closest(".card")) e.preventDefault();
});

applyI18n();
renderRules();
renderPick();
