// Herná logika bez DOM. Všetka náhoda ide cez state.rng (injektovaná funkcia),
// takže testy sú deterministické. Funkcie vracajú zoznam eventov pre UI animácie.

const Engine = (() => {
  const HERO_HP = 50;
  const BOARD_MAX = 5;
  const HAND_DRAW = 5;
  const HAND_MAX = 8;
  const CARD_COST = 3;
  const SELL_GAIN = 1;
  const BOLT_DMG = 3; // kúzlo Blesk: základný damage odloženého výboja
  const REFRESH_COST = 1;
  const BACKSTAB_BUFF = 1; // ogr „Backstab": Pečať +1/+1 všetkým ogrom za smolný roll
  const COMMON_COUNT = 3;
  const BAN_OFFER = 3; // fáza BAN: koľko rás dostane každý hráč na výber
  // Max. rás v jednej hre (opts.raceCap). Hra si z celého zoznamu vylosuje
  // RACE_CAP rás; s banom RACE_CAP + 1 (= 2 × BAN_OFFER) a jednu zabanuje.
  // Rás tak môže byť v kartách viac, než sa zmestí do jednej hry.
  const RACE_CAP = 5;
  // Pooly kariet (štýl Battlegrounds, ale per hráč): každý hráč má vlastný
  // pool POOL_PRIVATE kópií každej príšery (súkromná ponuka, štartovací
  // balíček, Kniha, Zrkadlo, Klobúk), spoločná ponuka losuje zo spoločného
  // poolu POOL_COMMON kópií. Karta v obchode je z poolu vybratá; nekúpená
  // (refresh, nové kolo, nevybraný discover) sa vracia; predaj vracia kópie
  // do poolov, z ktorých boli (inst.src = { common: n, p1: n }). Strop
  // zlatej: 6 vlastných + 3 spoločné = 9 = presne zlatá, ak súper nekúpi nič.
  const POOL_PRIVATE = 6;
  const POOL_COMMON = 3;
  // Kúzla majú tiež pool – len súkromný (spell slot je súkromný): 3 kópie
  // do t3, 2 kópie pre t4–t6 (silné kúzla, nech ich nejde spamovať).
  // Iskrička (token) pool nemá. Predaj kúzla kópiu vráti.
  const SPELL_POOL_LOW = 3;
  const SPELL_POOL_HIGH = 2;
  const spellPoolCap = def => def.tier >= 4 ? SPELL_POOL_HIGH : SPELL_POOL_LOW;
  const TIER_MAX = 6;
  // Drahšie než HS Battlegrounds (5/7/8/11/10): trojice tu chodia zadarmo
  // cyklom balíčka (netreba platiť refreshe), takže zlata zvyšuje viac.
  const TIER_BASE_COST = { 2: 5, 3: 8, 4: 9, 5: 11, 6: 12 };
  const TIER_MIN_COST = 2; // zľava za čakanie nikdy nezrazí cenu pod 2
  const BATTLE_CAP = 200; // poistka proti nekonečnému boju
  // Minimálny počet kariet podľa tieru (od 11. 10. 2026): tier 1 = 10,
  // každý tier +1, tier 6 = 15. Rátajú sa VŠETKY vlastné karty (balíček,
  // kôpka, ruka, plocha, zahrané kúzla tohto ťahu) okrem tokenov. Predaj pod
  // limit nejde; evolve (aj spojenie Pohladkaní) čaká, kým je kariet menej
  // než limit – inak sa dalo zostať na 5 uber kartách (evolve, potom predaj).
  const DECK_MIN_BASE = 9;
  const deckMin = tier => DECK_MIN_BASE + tier;
  // state.noDeckMin: len testy/nástroje s umelými mini balíčkami (harness);
  // hra ani replay ho nikdy nenastavujú.
  const deckLow = (state, p) => !state.noDeckMin && cardCount(p) < deckMin(p.tier);
  // Strop damage hrdinovi za jeden boj podľa kola: 1–3 max 5, 4–10 max 10,
  // 11–15 max 15, od 16. kola bez stropu. Skorý snowball nezabije hráča
  // za tri kolá, deti majú čas sa dostať do hry.
  const heroDmgCap = round => round <= 3 ? 5 : round <= 10 ? 10 : round <= 15 ? 15 : Infinity;

  // Mutácie – „Pravidlo dnešnej arény": jedna na hru, platí pre oboch hráčov.
  // Žrebuje sa PRVÝM ťahom z rng v newGame → multiplayer aj replay ju odvodia
  // zo seedu bez extra synchronizácie. Texty a ikonky rieši UI (game.js).
  const MUTATORS = [
    "echoDeath",   // deathrattly sa spúšťajú 2×
    "bloodMoon",   // príšerky, čo prežijú boj, +1/+1 navždy
    "freeRefresh", // refresh obchodu zadarmo
    "twinEvolve",  // na evolve stačia 2 kópie
    "plenty",      // obchod má +1 spoločnú kartu
    "richSell",    // predaj karty dáva 2 mince
    "smallArena",  // hrdinovia 25 HP
    "marathon",    // hrdinovia 45 HP
    "gift",        // každé kolo obaja dostanú náhodné kúzlo do ruky
    "echoCry",     // battlecry sa spúšťa 2×
  ];

  // ---------- Trinkety ----------
  // Trvalé bonusy PER HRÁČ (mutácia je globálna). V kolách TRINKET_ROUNDS
  // dostane každý hráč v startRound ponuku TRINKET_OFFER trinketov (zo
  // state.rng, p1 prvý) a vo VLASTNEJ nákupnej fáze si jeden vyberie
  // (pickTrinket); nevybraný do konca ťahu = prvý z ponuky (hra sa nesmie
  // zaseknúť). `lvl` = sila trinketu 1–3; TRINKET_ROUNDS hovorí, ktoré
  // úrovne sa v danom kole ponúkajú (kolo 4 slabšie, kolo 8 silnejšie).
  // Rasový trinket sa ponúka len pre VÄČŠINOVÚ rasu hráča – rasu, ktorej
  // má najviac kariet (všetky zóny, bez tokenov; remíza = všetky rovnako
  // početné). Hlásenie hráča 14. 10. 2026: pri pravidle „aspoň 3 karty"
  // chodili trinkety vedľajších rás aj ogrov s jedinou kartou. Výnimka:
  // dračie trinkety (TRINKET_FREE_RACES) dostane každý – drak je žoldnier
  // do každého balíčka. Zabanovaná rasa nikdy; trinket s id zhodným
  // s mutáciou hry sa neponúka (nestackujú sa). Ak je v pooli rasový
  // trinket úrovne kola, ponuka má aspoň jeden (neutrálne ho nevytlačia).
  // Ak je na úrovniach kola menej ako TRINKET_OFFER prípustných, doplní sa
  // zo zvyšných úrovní. Texty a ikonky rieši UI (i18n L.trinkets).
  // Ogrí kľúč (ogreSabotage): každé kolo hod mincou – chvost = súperove
  // trinkety to kolo (nákup aj boj) nefungujú (p.trinketOff = kolo).
  const TRINKET_ROUNDS = { 4: [1], 8: [2, 3] };
  const TRINKET_OFFER = 3;
  const TRINKET_FREE_RACES = new Set(["dragon"]); // rasové trinkety pre každého
  const SUPPORT_RACES = new Set(["dragon", "ogre"]); // podporné rasy (aj Bot.SUPPORT_RACES)
  const TRINKETS = [
    { id: "beastPups", race: "beast", lvl: 1 },          // Mláďatá a SuperMláďatá +1/+1
    { id: "beastPack", race: "beast", lvl: 2 },          // smrť Zvieraťa: náhodné Zviera +1/+1 navždy
    { id: "undeadGrave", race: "undead", lvl: 3 },       // prvé vyvolanie v boji +1
    { id: "undeadBones", race: "undead", lvl: 1 },       // Kostíky +1/+0
    { id: "undeadOverflow", race: "undead", lvl: 2 },    // Pretečenie buffne dve príšerky
    { id: "elemSpark", race: "elemental", lvl: 2 },      // pri výbere Živelná sila +1
    { id: "elemStorm", race: "elemental", lvl: 2 },      // pred každým bojom Blesk
    { id: "fairyDiscount", race: "fairy", lvl: 1 },      // prvé kúzlo v kole o 1 lacnejšie
    { id: "dragonBlood", race: "dragon", lvl: 3 },       // draci sú každá rasa
    { id: "dragonPact", race: "dragon", lvl: 2 },        // dračie bojové aury +1/+1 navyše
    { id: "ogreSabotage", race: "ogre", lvl: 2 },        // ogri +1/+0, minca vypína súperov trinket
    { id: "ogreCareful", race: "ogre", lvl: 1 },         // backstab nikdy, bonusy polovičné
    { id: "doggyGlove", race: "doggy", lvl: 1 },         // na začiatku ťahu 1 Pohladkanie do ruky
    { id: "doggyBrush", race: "doggy", lvl: 2 },         // na začiatku ťahu 2 Pohladkania do ruky (s rukavicou 3 = Super)
    { id: "doggyLeash", race: "doggy", lvl: 3 },         // každé generovanie Pohladkania dá o 1 viac (endgame psíkov)
    { id: "doggyDouble", race: "doggy", lvl: 1 },        // prvé Pohladkanie v kole zaúčinkuje 2× (karta sa ťahá 1)
    { id: "dragonBook", race: "dragon", lvl: 1 },        // každé párne kolo jednorazová Kniha prianí do ruky
    { id: "ogreLuck", race: "ogre", lvl: 1 },            // ogri bez schopnosti: Pri vyložení 50 % potiahni kartu, inak Pečať +1/+0 Ogrom
    { id: "beastHunt", race: "beast", lvl: 1 },          // každý ťah Lovecká značka: Zviera +1/+1 za každé padlé Zviera (do konca boja)
    { id: "beastHunt2", race: "beast", lvl: 2 },         // ako beastHunt, ale bonus zo značiek je navždy
    { id: "fairySpark", race: "fairy", lvl: 1 },         // každý ťah Iskrička do ruky
    { id: "undeadReborn", race: "undead", lvl: 2 },      // príšerka úplne vľavo má v boji Znovuzrodenie
    { id: "elemWind", race: "elemental", lvl: 2 },       // príšerka úplne vľavo má v boji Vichor
    { id: "undeadFirstBone", race: "undead", lvl: 1 },   // prvá tvoja príšerka, čo v boji padne, vyvolá Kostíka
    { id: "undeadTauntBones", race: "undead", lvl: 1 },  // Kostíky majú Obrancu
    { id: "elemBubble", race: "elemental", lvl: 1 },     // pred bojom vyvolaj Bublinu
    { id: "elemZap", race: "elemental", lvl: 1 },        // prvý výboj v každom boji +2
    { id: "cheapUpgrade", lvl: 1 },  // upgrade o 2 lacnejší (min. 2)
    { id: "richSell", lvl: 1 },      // predaj dáva 2
    { id: "twinEvolve1", lvl: 1 },   // kartám t1 stačia 2 kópie
    { id: "freeRefresh1", lvl: 1 },  // prvý refresh v kole zadarmo
    { id: "buybackAny", lvl: 1 },    // buyback bez limitu
    { id: "strongTokens", lvl: 1 },  // tokeny +1/+1
    { id: "healWin", lvl: 1 },       // po výhre +2 HP
    { id: "bigHand", lvl: 2 },       // ruka 6
    { id: "heroShield", lvl: 2 },    // raz za hru: v boji 0 damage (useHeroShield)
    { id: "initiative", lvl: 2 },    // v boji začína tvoja strana
    { id: "bloodMoon", lvl: 3 },     // preživšie +1/+1 navždy
  ];
  // ---------- DMG Meter kolo ----------
  // Každé BOSS_EVERY-té kolo sa namiesto PvP boja každý hráč bije so
  // Strážcom arény: BOSS_COUNT Obrancov s „nekonečnými" statmi (BOSS_STAT).
  // Boss sám neútočí, ale každý úder do neho útočníka zabije (štít/pierko
  // pomôžu). Útočí sa zľava doprava, kým hráčovi niečo žije – Pri smrti
  // a vyvolávanie fungujú normálne. Kto spraví viac damage, dostane na
  // začiatku svojho ďalšieho ťahu Discover: 3 príšery tieru o 1 VYŠŠIEHO
  // než jeho vlastný (max TIER_MAX) – hráč na nižšom tieri získa viac,
  // takže sa oplatí zostať v nižšej krčme. Hrdinovia damage nedostanú.
  const BOSS_EVERY = 5;
  const BOSS_COUNT = 5;
  const BOSS_STAT = 1e9;
  const CHEAP_UPGRADE = 2; // Zľava tavernára
  const PACT_BONUS = 1;    // Žoldnierska zmluva
  const HEAL_WIN = 2;      // Liečivé víťazstvo
  const PUP_TOKENS = new Set(["mlada", "supermlada"]); // Vypasené mláďatá

  // ---------- Hmyz (EXPERIMENT, src/cards-insect.js – hra ho nenačíta) ----------
  // Bez hmyzích kariet sú háčiky nižšie nečinné. Hmyz nemá evolve
  // (def.noEvolve) – sila rastie s počtom kópií v celom balíčku (všetky zóny):
  // def.swarm = { of?: defId, race?: rasa, a, h, others?: true } dá v boji
  // +a/+h za každú kópiu karty `of` (alebo kartu rasy `race`); others = bez seba.
  // Kukla (KUKLA_ID): jediná na hráča, na začiatku ťahu sa VŽDY potiahne
  // navyše (6. karta) z balíčka/kôpky; nezahraná v ruke na konci ťahu rastie
  // def.grow navždy (vyložená na ploche def.growPlayed, ak ho má). Húsenica
  // (cocoon) ju vytvorí alebo zväčší; Hmyz pri smrti môže vyvolať jej kópiu
  // (summonKukla).
  const KUKLA_ID = "kukla";

  function hasTrinket(state, pid, id) {
    const p = state[pid];
    return !!p && !!p.trinkets && p.trinkets.includes(id) && p.trinketOff !== state.round;
  }
  const isCareful = (state, pid) => hasTrinket(state, pid, "ogreCareful");
  // Opatrný ogr: hod nikdy nepadne zle, ale bonus je polovičný (min. 1).
  const ogreBonus = (state, pid, n) => isCareful(state, pid) && n > 0 ? Math.max(1, Math.floor(n / 2)) : n;
  // Dračia krv: drak sa počíta ako KAŽDÁ rasa (aury, rasové buffy, mrchožrúti).
  // Cielený efekt „rasa cieľa" na drakovi ostáva len drak (def.race).
  function isRace(state, pid, def, race) {
    return def.race === race || (!!race && def.race === "dragon" && hasTrinket(state, pid, "dragonBlood"));
  }
  // Aura / bojový rasový buff, ktorý kartu zasiahne; drak s Dračou krvou
  // berie súčet všetkých rás. null = nič.
  function sumRaceMap(map, def, all) {
    if (!def.race || !map) return null;
    if (!all) return map[def.race] || null;
    let a = 0, h = 0;
    for (const b of Object.values(map)) { a += b.a; h += b.h; }
    return a || h ? { a, h } : null;
  }
  const allRaces = (state, p, def) => def.race === "dragon" && hasTrinket(state, p.id, "dragonBlood");
  const auraFor = (state, p, def) => sumRaceMap(p.raceBuffs, def, allRaces(state, p, def));
  const fightBuffFor = (state, p, def) => sumRaceMap(p.fightRaceBuffs, def, allRaces(state, p, def));
  const pactBonus = (state, p, self) =>
    self && Cards.byId[self.defId].race === "dragon" && hasTrinket(state, p.id, "dragonPact") ? PACT_BONUS : 0;
  const handDraw = (state, pid) => HAND_DRAW + (hasTrinket(state, pid, "bigHand") ? 1 : 0);
  // Počet kópií karty vo všetkých zónach hráča (Hmyz – roj). Bojové kópie
  // z Kráľovnej (plocha boja) sa nerátajú – rátajú sa originály.
  function copiesOwned(p, defId) {
    let n = 0;
    for (const zone of ["deck", "discard", "hand", "board"]) {
      for (const c of p[zone]) if (c && c.defId === defId) n++;
    }
    return n;
  }
  // Bonus roja pre kartu hráča (0/0 bez def.swarm). Pre bota a UI aj boj.
  // def.swarm môže byť aj pole (viac zdrojov roja sa sčíta); per = 1 bod za
  // každých `per` kópií (zaokrúhlené dole).
  function swarmBonus(p, def) {
    const out = { a: 0, h: 0 };
    for (const s of [].concat(def.swarm || [])) {
      let n = s.of ? copiesOwned(p, s.of) : raceCardCount(p, s.race);
      if (s.others) n = Math.max(0, n - 1);
      n = Math.floor(n / (s.per || 1));
      out.a += s.a * n; out.h += s.h * n;
    }
    return out;
  }
  function withSwarm(p, inst) {
    const b = swarmBonus(p, Cards.byId[inst.defId]);
    if (b.a || b.h) buff(inst, b.a, b.h);
    return inst;
  }
  // Trvalý rast karty v ľubovoľnej zóne: inštancia (ruka/plocha) dostane
  // staty hneď aj pa/ph, referencia v balíčku/kôpke len pa/ph.
  function growCard(c, a, h, isInst) {
    if (isInst) buff(c, a, h);
    c.pa = (c.pa || 0) + a;
    c.ph = (c.ph || 0) + h;
  }
  // Hmyzie karty v balíčku a kôpke (referencie) – cieľ rastu „v balíčku".
  function insectRefs(p) {
    return [...p.deck, ...p.discard].filter(c => Cards.byId[c.defId].race === "insect");
  }
  // Kukla: hľadá ju vo všetkých zónach. Vráti { c, isInst } alebo null.
  function findKukla(p) {
    for (const zone of ["hand", "board"]) {
      const c = p[zone].find(x => x && x.defId === KUKLA_ID);
      if (c) return { c, isInst: true };
    }
    for (const zone of ["deck", "discard"]) {
      const c = p[zone].find(x => x.defId === KUKLA_ID);
      if (c) return { c, isInst: false };
    }
    return null;
  }
  // Začiatok ťahu: Kukla z balíčka/kôpky do ruky NAVYŠE. Vráti 1/0.
  function pullKukla(state, p, events) {
    if (p.hand.length >= HAND_MAX) return 0;
    for (const zone of ["deck", "discard"]) {
      const i = p[zone].findIndex(c => c.defId === KUKLA_ID);
      if (i < 0) continue;
      const [c] = p[zone].splice(i, 1);
      const inst = makeInst(state, c.defId, c.rank, p);
      if (c.src) inst.src = c.src;
      if (c.pa || c.ph) { inst.pa = c.pa || 0; inst.ph = c.ph || 0; buff(inst, inst.pa, inst.ph); }
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: c.defId, kukla: true });
      return 1;
    }
    return 0;
  }

  function evolveNeed(state, p, defId) {
    if (state.mutator === "twinEvolve") return 2;
    if (Cards.byId[defId].tier === 1 && hasTrinket(state, p.id, "twinEvolve1")) return 2;
    return 3;
  }

  const privateCount = tier => Math.min(tier + 1, 6);
  const income = round => Math.min(round + 2, 10);
  // Cena karty: príšery fixne 3, kúzla majú vlastnú cenu (def.cost).
  const cardCost = defId => Cards.byId[defId].cost ?? CARD_COST;
  // Cena refreshu závisí od mutácie („freeRefresh" = zadarmo).
  // Cena refreshu: mutácia „freeRefresh" = zadarmo; trinket Čerstvý tovar =
  // prvý refresh hráča v kole zadarmo (pid voliteľné – bez neho bežná cena).
  function refreshCost(state, pid) {
    if (state.mutator === "freeRefresh") return 0;
    if (pid && hasTrinket(state, pid, "freeRefresh1") && !state[pid].freeRefreshUsed) return 0;
    return REFRESH_COST;
  }
  // Cena kúpy kúzla: Lacné čary = prvé kúzlo v kole o 1 lacnejšie.
  function spellCost(state, pid, defId) {
    const disc = hasTrinket(state, pid, "fairyDiscount") && !state[pid].spellDiscountUsed ? 1 : 0;
    return Math.max(0, cardCost(defId) - disc);
  }

  // ---------- Pomocníci ----------
  // Trvalé pozície: karta si drží slot (v ruke aj na ploche), po minutí
  // susednej karty sa nič nepreskladáva. Najmenší voľný slot.
  function freeSlot(list, max) {
    for (let s = 0; s < max; s++) if (!list.some(x => x && x.slot === s)) return s;
    return list.length;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const randInt = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1)); // celé číslo lo..hi vrátane

  // Deterministický generátor náhody (mulberry32) – multiplayer replikuje
  // akcie a oba klienty musia dostať rovnaké náhodné čísla z rovnakého seedu.
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // p (voliteľné): hráč, ktorému inštancia vzniká – aplikujú sa jeho permanentné
  // rasové aury („všetky budúce X dostanú +a/+h“).
  function makeInst(state, defId, rank, p) {
    const def = Cards.byId[defId];
    // Kúzla nesú stupeň len Pohladkanie (pet, bez stropu); ostatné sú vždy 1.
    if (def.spell) return { uid: ++state.uidSeq, defId, rank: def.pet ? (rank || 1) : 1, spell: true };
    const m = Cards.STAT_MULT[rank];
    const inst = {
      uid: ++state.uidSeq, defId, rank,
      atk: def.atk * m, hp: def.hp * m, maxHp: def.hp * m,
      taunt: !!def.taunt,
    };
    if (def.poison) inst.poison = true; // Jed (Hmyz – Jedovatá spóra)
    if (def.reborn) inst.revive = true; // Znovuzrodenie (U010): ako Fénixovo pierko
    // Permanentné rasové aury dostávajú AJ tokeny – kostíky s aurami
    // škálujú do late game (bez toho undead scaling zaostával).
    const aura = p && def.race && p.raceBuffs && auraFor(state, p, def);
    if (aura) {
      inst.atk += aura.a;
      inst.hp += aura.h;
      inst.maxHp += aura.h;
    }
    // Pečať jednej karty (Hmyz – Kráľovná: všetky Včielky): p.cardBuffs[defId].
    const cb = p && p.cardBuffs && p.cardBuffs[defId];
    if (cb) buff(inst, cb.a, cb.h);
    return inst;
  }

  // Náhodná PRÍŠERA z obchodného poolu (bez tokenov a kúziel), tier <= limit.
  // Kúzla majú vlastný slot (rollSpell) – neberú miesto príšerám.
  // Classy nie sú – všetci hráči ťahajú z rovnakého poolu.
  // Losovanie z poolu poolKey ("p1" | "p2" | "common"): vážené počtom
  // zostávajúcich kópií, vylosovaná karta z poolu ubudne. filter: voliteľné
  // ďalšie obmedzenie (rasa, presný tier). Prázdny pool → záložné losovanie
  // bez limitu (prázdny slot v obchode nechceme).
  // rollBias: { race, weight } na hráčovi – karty danej rasy sa v JEHO
  // súkromnej ponuke losujú weight-krát častejšie (handicap pre bota:
  // keď sa zafixuje na rasu, obchod mu ju ponúka častejšie; spoločná ponuka
  // bez zmeny). Náhoda stále cez state.rng – determinizmus a replay platia.
  function rollCard(state, tierLimit, poolKey, filter) {
    const pool = state.pools[poolKey];
    const defs = Cards.DEFS.filter(d => d.tier <= tierLimit && !d.spell && !d.gen && !isBanned(state, d) && (!filter || filter(d)));
    const bias = poolKey !== "common" && state[poolKey] && state[poolKey].rollBias;
    const weighted = [];
    for (const d of defs) {
      const w = (pool[d.id] || 0) * (bias && d.race === bias.race ? bias.weight : 1);
      for (let i = 0; i < w; i++) weighted.push(d.id);
    }
    if (weighted.length) {
      const id = pick(weighted, state.rng);
      pool[id]--;
      return id;
    }
    return defs.length ? pick(defs, state.rng).id : null;
  }

  // Vrátenie kópií do poolu (strop = základný počet – záložne vylosované
  // karty pool nenafúknu).
  function returnToPool(state, poolKey, defId, n = 1) {
    const pool = state.pools[poolKey];
    pool[defId] = Math.min(poolCap(poolKey, defId), (pool[defId] || 0) + n);
  }

  // Zdroj kópií karty ({ common: 1 } / { p1: 3 }) – evolve zdroje sčíta,
  // predaj ich vráti do správnych poolov. Tokeny a záložne vylosované karty
  // zdroj nemajú.
  function addSrc(target, src) {
    if (!src) return;
    target.src = target.src || {};
    for (const [k, n] of Object.entries(src)) target.src[k] = (target.src[k] || 0) + n;
  }
  function returnSrc(state, defId, src) {
    if (!src) return;
    for (const [k, n] of Object.entries(src)) returnToPool(state, k, defId, n);
  }

  function makePools() {
    const pools = { p1: {}, p2: {}, common: {} };
    for (const d of Cards.DEFS) {
      if (d.token || d.gen) continue; // generované kúzlo (Pohladkanie) pool nemá
      if (d.spell) {
        pools.p1[d.id] = spellPoolCap(d);
        pools.p2[d.id] = spellPoolCap(d);
        continue;
      }
      pools.p1[d.id] = POOL_PRIVATE;
      pools.p2[d.id] = POOL_PRIVATE;
      pools.common[d.id] = POOL_COMMON;
    }
    return pools;
  }

  function poolCap(poolKey, defId) {
    const def = Cards.byId[defId];
    if (def && def.spell) return spellPoolCap(def);
    return poolKey === "common" ? POOL_COMMON : POOL_PRIVATE;
  }

  // Kúzlo do spell slotu: vážené podľa zostávajúcich kópií v súkromnom
  // poole hráča (ako rollCard), vylosované z poolu ubudne. Vypredaný pool
  // pre daný tier → záložné losovanie bez limitu a bez src (prázdny slot
  // nechceme; na t1 je len Štít ×3). Vracia { defId, src? }.
  function rollSpell(state, tierLimit, poolKey) {
    const pool = state.pools[poolKey];
    const defs = Cards.DEFS.filter(d => d.spell && !d.token && !d.gen && d.tier <= tierLimit);
    const weighted = [];
    for (const d of defs) for (let i = 0; i < (pool[d.id] || 0); i++) weighted.push(d.id);
    if (weighted.length) {
      const id = pick(weighted, state.rng);
      pool[id]--;
      return { defId: id, src: { [poolKey]: 1 } };
    }
    return { defId: pick(defs, state.rng).id };
  }

  // Nový (nezmrazený) spell slot hráča.
  function spellSlot(state, tierLimit, pid) {
    return { ...rollSpell(state, tierLimit, pid), frozen: false };
  }

  function other(pid) { return pid === "p1" ? "p2" : "p1"; }

  // ---------- Založenie hry ----------
  // mutatorId: undefined = vyžrebuj z rng (bežná hra), null = bez mutácie
  // (testy, balance sim), string = vynútená konkrétna mutácia.
  // opts.ban: true = hra začína fázou BAN (state.phase === "ban"): každý hráč
  // dostane 3 rasy (rasy zamiešané zo state.rng, prvých 6 rozdelených na dve
  // trojice – pri 7 rasách je jedna náhodne mimo ponuky) a jednu
  // z nich zabanuje (pickBan); z oboch výberov sa jedna vylosuje a jej karty
  // v celej hre nie sú (štartovací balíček, obchod, discover, klobúk…).
  // Štartovacie balíčky a obchod vznikajú až po vylosovaní (setupStart),
  // inak by v nich mohla byť zabanovaná rasa. Bez ban je poradie losovania
  // z rng rovnaké ako doteraz (staré záznamy sa prehrajú rovnako).
  // opts.raceCap: n = do hry ide len n vylosovaných rás (state.races); s banom
  // sa vylosuje n + 1 (prvých 2 × BAN_OFFER zo zamiešania – rovnaké rng ako
  // bez capu) a po bane ostane n. Bez raceCap (staré záznamy, simulácie)
  // hrajú všetky rasy okrem zabanovanej.
  // opts.exp: zapnuté experimentálne rasy (["insect"]) – bez nich ich karty
  // v hre nie sú a zoznam rás (ban, raceCap) je rovnaký ako predtým.
  // opts.hpBonus: { p1?: n, p2?: n } – životy navyše k štartu (po mutácii),
  // napr. handicap hard/Claude bota (Bot.hpBonus). Dvíha aj strop liečenia.
  function newGame(rng, mutatorId, opts) {
    const mutator = mutatorId === null ? null : (mutatorId ?? pick(MUTATORS, rng));
    const state = {
      rng, uidSeq: 0, round: 0, phase: "shop", active: null, first: "p1",
      commons: [], winner: null, pendingDiscover: null, mutator,
      ban: null, // { offers: { p1: [rasy], p2: [rasy] }, picks: { p1, p2 }, by } počas/po fáze BAN
      banned: null, // id zabanovanej rasy (null = žiadna)
      races: null, // rasy v tejto hre (raceCap); null = všetky
      raceCap: (opts && opts.raceCap) || null,
      trinketsOn: !!(opts && opts.trinkets), // ponuka trinketov v kolách TRINKET_ROUNDS
      exp: (opts && opts.exp && opts.exp.length) ? [...opts.exp] : null, // experimentálne rasy (Hmyz)
      bossResult: null, // { round, dmg: { p1, p2 }, winner, claimed } posledného DMG Meter kola
      pools: makePools(),
      p1: makePlayer("p1"),
      p2: makePlayer("p2"),
    };
    if (mutator === "smallArena") { state.p1.hp = 35; state.p2.hp = 35; }
    if (mutator === "marathon") { state.p1.hp = 65; state.p2.hp = 65; }
    const hpBonus = (opts && opts.hpBonus) || {};
    state.p1.hp += hpBonus.p1 || 0; state.p2.hp += hpBonus.p2 || 0;
    state.p1.maxHp = state.p1.hp; state.p2.maxHp = state.p2.hp; // strop liečenia
    if (opts && opts.ban) {
      const races = shuffle(gameRaceIds(state), rng);
      // vylosované rasy = obe trojice v ponuke; po bane ich ostane raceCap
      if (state.raceCap) state.races = races.slice(0, BAN_OFFER * 2);
      state.ban = {
        offers: { p1: races.slice(0, BAN_OFFER), p2: races.slice(BAN_OFFER, BAN_OFFER * 2) },
        picks: { p1: null, p2: null },
        by: null,
      };
      state.phase = "ban";
      return state;
    }
    if (state.raceCap) state.races = shuffle(gameRaceIds(state), rng).slice(0, state.raceCap);
    setupStart(state);
    return state;
  }

  // Experimentálna rasa (Cards.EXP_RACES, napr. Hmyz) je v hre len so
  // state.exp; inak jej karty ani rasa neexistujú.
  const expOff = (state, race) => !!Cards.EXP_RACES && Cards.EXP_RACES.has(race) && !(state.exp && state.exp.includes(race));
  // Rasy, ktoré táto hra pozná (pre ban / raceCap / Pečať všetkým).
  const gameRaceIds = state => Object.keys(Cards.RACES).filter(r => !expOff(state, r));
  // Rasa nie je v hre: zabanovaná, nevylosovaná (raceCap) alebo vypnutý experiment.
  const raceOut = (state, race) => !!race &&
    (race === state.banned || (!!state.races && !state.races.includes(race)) || expOff(state, race));
  const isBanned = (state, def) => raceOut(state, def.race);

  // Výber rasy na ban. Legálne len vo fáze "ban", raz za hráča, z jeho
  // trojice. Keď vyberú obaja, z dvoch rás sa jedna vylosuje (state.rng),
  // založia sa balíčky a obchod a hra pokračuje prvým kolom (startRound) –
  // events nesú aj draw prvého ťahu.
  function pickBan(state, pid, race) {
    const b = state.ban;
    if (state.phase !== "ban" || !b || b.picks[pid] || !b.offers[pid].includes(race)) return null;
    b.picks[pid] = race;
    const events = [{ type: "banPick", pid, race }];
    if (!b.picks.p1 || !b.picks.p2) return events;
    b.by = pick(["p1", "p2"], state.rng);
    state.banned = b.picks[b.by];
    if (state.races) state.races = state.races.filter(r => r !== state.banned);
    events.push({ type: "ban", race: state.banned, by: b.by });
    state.phase = "shop";
    setupStart(state);
    events.push(...startRound(state));
    return events;
  }

  // Štartovací balíček: 10 náhodných príšer tieru 1. Max 2 kópie jednej karty –
  // trojica by sa hneď spojila (evolve) a lámala by early game.
  function setupStart(state) {
    const { rng, mutator } = state;
    const basics = Cards.DEFS.filter(d => d.tier === 1 && !d.spell && !d.gen && !isBanned(state, d));
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      for (let i = 0; i < 10; i++) {
        let id;
        do { id = pick(basics, rng).id; }
        while (p.deck.filter(c => c.defId === id).length >= 2);
        state.pools[pid][id]--; // štartovací balíček ide z vlastného poolu
        p.deck.push({ defId: id, rank: 1, src: { [pid]: 1 } });
      }
    }
    const commonCount = COMMON_COUNT + (mutator === "plenty" ? 1 : 0);
    for (let i = 0; i < commonCount; i++) state.commons.push(rollCard(state, 1, "common"));
    for (const pid of ["p1", "p2"]) {
      fillPrivate(state, pid);
      state[pid].spellShop = spellSlot(state, 1, pid);
    }
  }

  function makePlayer(id) {
    return {
      id, hp: HERO_HP, tier: 1, reachedRound: 1, money: 0,
      deck: [], hand: [], board: [], discard: [], priv: [],
      bought: [], // čo nakúpil v tomto kole
      raceBuffs: {}, // permanentné aury: { beast: {a, h}, ... }
      fightTokenBuffs: {}, // bojové buffy tokenov podľa id (U002: kostík +1/+1) – po boji končia
      fightRaceBuffs: {}, // dočasné rasové buffy „do konca boja" (draci) – platia
      // aj pre neskôr vyložené karty a tokeny vyvolané POČAS boja
      spentSpells: [], // kúzla zahrané v tomto ťahu – do kôpky až na konci ťahu
      dmgBoost: 0, // trvalo: výboje/výbuchy +n damage a „Pri útoku" bonus +n útok (kúzlo Živelná sila)
      summonCharge: 0, // jednorazovo: ďalšie vyvolanie v boji vyvolá +n navyše (U007)
      silences: 0, // nabité Umlčania – spotrebujú sa na začiatku najbližšieho boja
      hexes: 0, // nabité Žabie kliatby – v najbližšom boji zmenia HP cieľa na 1
      polymorphs: 0, // nabité Ovčie premeny – v najbližšom boji zmenia súperovu príšerku na Ovečku 0/1
      shrinks: [], // nabité oslabenia (D001) – v najbližšom boji náhodný súper −a/−h
      bolts: 0, // nabité Blesky – na začiatku najbližšieho boja výboj za 3 (+dmgBoost)
      goldNext: 0, // Poklad škriatka: zlato navyše na začiatku ďalšieho kola
      rollBias: null, // { race, weight } – bot: súkromná ponuka praje jeho rase (rollCard)
      spellsCast: 0, // koľko kúziel hráč zahral za celú hru (spellScale karty)
      racePlayed: {}, // koľko príšer každej rasy hráč vyložil z ruky za celú hru (racePlayedScale)
      petsCast: 0, // koľko Pohladkaní hráč zahral za celú hru (petScale – P008), počet zoslaní bez stupňa
      spellShop: null, // súkromný slot na kúzlo { defId, frozen } – neberie miesto príšerám
      giftRound: 0, // mutácia „gift": v ktorom kole hráč naposledy dostal kúzlo
      maxHp: HERO_HP, // strop liečenia (mutácie menia štartovné HP)
      trinkets: [], // id vybraných trinketov (TRINKETS)
      trinketOffer: null, // ponuka na výber v tomto kole (pickTrinket), inak null
      trinketOff: 0, // kolo, v ktorom trinkety nefungujú (Ogrí kľúč súpera)
      freeRefreshUsed: false, // Čerstvý tovar: prvý refresh v kole zadarmo
      spellDiscountUsed: false, // Lacné čary: prvé kúzlo v kole o 1 lacnejšie
      graveUsed: false, // Hrobárova lopata: prvé vyvolanie v boji +1
      heroShieldUsed: false, // Štít hrdinu: raz za hru
      heroShieldArmed: false, // zapnutý Štít hrdinu – drží, kým nezablokuje prvé zranenie
    };
  }

  function fillPrivate(state, pid) {
    const p = state[pid];
    while (p.priv.length < privateCount(p.tier)) {
      p.priv.push({ defId: rollCard(state, p.tier, pid), frozen: false });
    }
  }

  // ---------- Trinkety: ponuka a výber ----------
  // Počet kariet rasy vo všetkých zónach hráča (bez tokenov a kúziel).
  function raceCardCount(p, race) {
    let n = 0;
    const add = defId => { const d = Cards.byId[defId]; if (d.race === race && !d.token) n++; };
    for (const c of p.deck) add(c.defId);
    for (const c of p.discard) add(c.defId);
    for (const c of p.hand) if (!c.spell) add(c.defId);
    for (const c of p.board) add(c.defId);
    return n;
  }

  const isBossRound = (state, round = state.round) => round > 0 && round % BOSS_EVERY === 0;

  // Väčšinové rasy hráča (najviac kariet; remíza = viac rás). Bez kariet nič.
  function majorityRaces(p) {
    const counts = {};
    for (const r of Object.keys(Cards.RACES)) counts[r] = raceCardCount(p, r);
    const max = Math.max(0, ...Object.values(counts));
    return new Set(max > 0 ? Object.keys(counts).filter(r => counts[r] === max) : []);
  }

  function trinketPool(state, pid) {
    const p = state[pid];
    const major = majorityRaces(p);
    return TRINKETS.filter(t => !p.trinkets.includes(t.id)
      && t.id !== state.mutator
      && !(t.race && (raceOut(state, t.race)
        || (!TRINKET_FREE_RACES.has(t.race) && !major.has(t.race)))));
  }

  // Začiatok kola: Ogrí kľúč hodí mincou za súperove trinkety (p1 prvý –
  // ak p1 vypne p2 kľúč, p2 už nehádže), potom ponuka v kolách TRINKET_ROUNDS.
  function startTrinketRound(state, events) {
    for (const pid of ["p1", "p2"]) {
      if (!hasTrinket(state, pid, "ogreSabotage")) continue;
      const foe = other(pid);
      const heads = state.rng() < 0.5;
      if (!heads) state[foe].trinketOff = state.round;
      events.push({ type: "sabotage", pid, target: foe, heads });
    }
    const lvls = TRINKET_ROUNDS[state.round];
    if (!lvls) return;
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      const pool = trinketPool(state, pid);
      const main = shuffle(pool.filter(t => lvls.includes(t.lvl)).map(t => t.id), state.rng);
      const rest = main.length < TRINKET_OFFER
        ? shuffle(pool.filter(t => !lvls.includes(t.lvl)).map(t => t.id), state.rng) : [];
      const offer = [...main, ...rest].slice(0, TRINKET_OFFER);
      // Aspoň jeden rasový trinket (ak nejaký na úrovni kola je) – nahradí posledný.
      const isRaceT = id => !!TRINKETS.find(t => t.id === id).race;
      const raceT = main.find(isRaceT);
      if (raceT && !offer.some(isRaceT)) offer[offer.length - 1] = raceT;
      p.trinketOffer = offer;
      events.push({ type: "trinketOffer", pid, ids: p.trinketOffer.slice() });
    }
  }

  // Výber trinketu z ponuky – legálne len vo vlastnej nákupnej fáze.
  function pickTrinket(state, pid, id) {
    const p = state[pid];
    if (state.phase !== "shop" || state.active !== pid || !p.trinketOffer || !p.trinketOffer.includes(id)) return null;
    const events = [];
    applyTrinketPick(state, p, id, events, false);
    checkEvolve(state, p, events); // Dvojičky môžu spojiť pár hneď
    return events;
  }

  // Okamžité efekty pri výbere: Iskra na štart (Živelná sila +1), Ogrí kľúč
  // (Pečať +1/+0 Ogrom). Ostatné trinkety sú pasívne (hasTrinket).
  function applyTrinketPick(state, p, id, events, auto) {
    p.trinketOffer = null;
    p.trinkets.push(id);
    events.push({ type: "trinketPick", pid: p.id, id, auto });
    if (id === "elemSpark") SHOP_FX.dmgBoost({ p, fx: { n: 1 }, m: 1, events });
    if (id === "ogreSabotage") grantRaceAura(state, p, "ogre", 1, 0, events);
  }

  // Štít hrdinu: raz za hru, vo vlastnej nákupnej fáze sa zapne a DRŽÍ,
  // kým hrdina neprehrá boj – prvé zranenie zablokuje celé (od 13. 10. 2026;
  // predtým platil len v kole zapnutia). Vypnutý Ogrím kľúčom sa nedá zapnúť
  // a v kole, keď je vypnutý, neblokuje (počká na ďalší boj).
  function useHeroShield(state, pid) {
    const p = state[pid];
    if (state.phase !== "shop" || state.active !== pid || !hasTrinket(state, pid, "heroShield") || p.heroShieldUsed) return null;
    p.heroShieldUsed = true;
    p.heroShieldArmed = true;
    return [{ type: "heroShieldArm", pid }];
  }

  // Spoločná ponuka nesmie hráčovi s nižším tierom ukazovať (ani súperovým
  // refreshom prezradiť) vyššie karty – strop je NIŽŠÍ z tierov oboch hráčov.
  // Vlastný tier platí len v súkromnej ponuke.
  function commonTierLimit(state) {
    return Math.min(state.p1.tier, state.p2.tier);
  }

  // ---------- Kolo a nákupná fáza ----------
  // Po každom boji sa obchod rolluje nanovo: celá spoločná ponuka aj
  // nezmrazené súkromné karty. Zmrazená karta prežije do nového kola
  // a rozmrazí sa – freeze platí jedno kolo (štýl Battlegrounds).
  function startRound(state) {
    state.round++;
    state.first = state.round % 2 === 1 ? "p1" : "p2";
    for (let i = 0; i < state.commons.length; i++) {
      returnToPool(state, "common", state.commons[i]);
      state.commons[i] = rollCard(state, commonTierLimit(state), "common");
    }
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.money = income(state.round) + p.goldNext; // Poklad škriatka z minulého kola
      p.lastSold = null; p.buyBackUsed = false; // buyback platí raz za ťah
      p.goldNext = 0;
      p.bought = [];
      p.freeRefreshUsed = false; p.spellDiscountUsed = false; p.petTwiceUsed = false; p.petDrawUsed = false; // „raz za kolo"
      for (const s of p.priv) if (!s.frozen) returnToPool(state, pid, s.defId);
      p.priv = p.priv.filter(s => s.frozen);
      for (const s of p.priv) s.frozen = false;
      fillPrivate(state, pid);
      if (p.spellShop.frozen) p.spellShop.frozen = false;
      else {
        returnSrc(state, p.spellShop.defId, p.spellShop.src); // nekúpené kúzlo späť do poolu
        p.spellShop = spellSlot(state, p.tier, pid);
      }
    }
    const events = [];
    if (state.trinketsOn) startTrinketRound(state, events);
    state.active = state.first;
    events.push(...beginShopTurn(state, state.active));
    return events;
  }

  function beginShopTurn(state, pid) {
    const p = state[pid];
    const events = [];
    const kukla = pullKukla(state, p, events); // Kukla (Hmyz) je karta NAVYŠE
    drawCards(state, p, handDraw(state, pid) + kukla - p.hand.length, events);
    bossReward(state, p, events);
    // Pohladkania z psích trinketov idú do BALÍČKA až po dotiahnutí (hlásenie
    // hráča 15. 10. 2026: rukavica + Vodítko = začiatok ťahu so 7 kartami).
    petTrinkets(state, p, events);
    giftTrinkets(state, p, events);
    // Mutácia „gift": raz za kolo náhodné kúzlo do ruky NAVYŠE (po dotiahnutí,
    // aby nebralo miesto normálnemu draw).
    if (state.mutator === "gift" && p.giftRound !== state.round && p.hand.length < HAND_MAX) {
      p.giftRound = state.round;
      const r = rollSpell(state, p.tier, p.id); // darované kúzlo ide z poolu (predaj ho vráti)
      const inst = makeInst(state, r.defId);
      if (r.src) inst.src = r.src;
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: inst.defId });
    }
    // Spojenie (evolve trojice, 3 Pohladkania) v ruke zje 3 karty a vráti
    // jednu – ruka by ostala s 3 kartami namiesto 5 (hlásenie hráča, 16. 9.
    // 2026: psíci ťahajú pohladkania často). Po spojení sa dotiahne znova,
    // kým je z čoho a kým ruka nie je plná; ďalšie spojenie sa rieši v cykle.
    for (let guard = 5; guard-- > 0;) {
      const before = p.hand.length;
      checkEvolve(state, p, events);
      if (p.hand.length >= before) break; // nič sa nespojilo z ruky
      const want = handDraw(state, pid) + kukla - p.hand.length;
      if (want <= 0 || (!p.deck.length && !p.discard.length)) break;
      drawCards(state, p, want, events);
    }
    return events;
  }

  // Kópia karty do kôpky/balíčka; permanentný rast (pa/ph – „Po nákupe
  // navždy“ karty) cestuje s konkrétnou kópiou cez celý cyklus balíčka.
  function pileCard(inst) {
    const c = { defId: inst.defId, rank: inst.rank || 1 };
    if (inst.pa || inst.ph) { c.pa = inst.pa || 0; c.ph = inst.ph || 0; }
    if (inst.pets) c.pets = inst.pets; // koľko Pohladkaní karta dostala (súhrn v preview)
    if (inst.src) c.src = inst.src;
    return c;
  }

  function drawCards(state, p, n, events) {
    for (let i = 0; i < n; i++) {
      if (p.hand.length >= HAND_MAX) break;
      if (!p.deck.length) {
        if (!p.discard.length) break;
        p.deck = shuffle(p.discard.splice(0), state.rng);
        events.push({ type: "reshuffle", pid: p.id });
      }
      const c = p.deck.pop();
      const inst = makeInst(state, c.defId, c.rank, p);
      if (c.src) inst.src = c.src;
      if (c.pets) inst.pets = c.pets;
      if (c.pa || c.ph) {
        inst.pa = c.pa || 0;
        inst.ph = c.ph || 0;
        inst.atk += inst.pa;
        inst.hp += inst.ph;
        inst.maxHp += inst.ph;
      }
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "draw", pid: p.id, defId: c.defId });
    }
  }

  // ---------- Evolve ----------
  // 3 rovnaké (karta + stupeň) KDEKOĽVEK – plocha, ruka, balíček aj kôpka –
  // sa automaticky spoja na vyšší stupeň. Kópie sa spotrebujú v poradí
  // plocha → ruka → balíček → kôpka. Výsledok ide VŽDY do ruky (aj keď bola
  // kópia na ploche) – hráč ju vyloží znova a battlecry sa spustí už na
  // vyššom stupni. Pri plnej ruke na uvoľnený slot plochy, inak do balíčka.
  // hidden=true, keď sa použila aspoň jedna neviditeľná kópia (UI to ohlási).
  function checkEvolve(state, p, events) {
    // Mutácia „twinEvolve": na spojenie stačia 2 kópie namiesto 3.
    // Mutácia „twinEvolve" (všetko) / trinket Dvojičky (len tier 1): stačia 2 kópie.
    const needFor = defId => evolveNeed(state, p, defId);
    for (;;) {
      const group = findEvolveGroup(p, needFor);
      if (!group) break;
      // Málo kariet na tier: kópie počkajú, spoja sa po ďalšom nákupe.
      if (deckLow(state, p)) {
        events.push({ type: "evolveWait", pid: p.id, defId: group.defId, count: cardCount(p), min: deckMin(p.tier) });
        return;
      }
      const consumed = consumeEvolveCopies(p, group, needFor(group.defId));
      const bonus = mergeEvolveBonus(consumed.copies);
      const uid = placeEvolved(state, p, group, consumed, bonus);
      events.push({ type: "evolve", pid: p.id, defId: group.defId, rank: group.rank + 1, uid, hidden: consumed.hidden });
    }
    checkPetMerge(state, p, events);
  }

  // ---------- Spájanie Pohladkaní (psíci) ----------
  // 3 Pohladkania rovnakého stupňa v ruke, balíčku alebo kôpke sa spoja na
  // jedno o stupeň vyššie (sila ×2 ako evolve statov – jedno pohladkanie
  // „prepadne", výhra je kompresia balíčka a jedno zoslanie namiesto troch). Bez stropu
  // stupňa. Kúzla zahrané v tomto ťahu (spentSpells) sa NErátajú – inak by
  // zoslané pohladkanie splynulo do Super a jeho hodnota by sa zahrala 2×.
  // Výsledok ide do ruky, ak je hráč práve na ťahu, má miesto a aspoň jedna
  // spojená kópia bola v ruke (dieťa vidí „Super!" a môže ho hneď zahrať;
  // ruka nikdy nenarastie), inak do balíčka. Kópie sa berú v poradí
  // ruka → balíček → kôpka; hidden = použila sa aj neviditeľná kópia.
  function checkPetMerge(state, p, events) {
    for (;;) {
      const group = findPetGroup(p);
      if (!group) return;
      if (deckLow(state, p)) return; // ako evolve: málo kariet na tier
      let need = 3, hidden = false, fromHand = 0;
      for (const inst of group.hand) { if (need <= 0) break; p.hand.splice(p.hand.indexOf(inst), 1); need--; fromHand++; }
      for (const zone of ["deck", "discard"]) {
        for (const idx of group[zone].reverse()) {
          if (need <= 0) break;
          p[zone].splice(idx, 1);
          hidden = true;
          need--;
        }
      }
      const rank = group.rank + 1;
      // Do ruky len vtedy, keď sa spojilo aj pohladkanie z ruky – spojenie
      // samých kópií z balíčka/kôpky by bolo karta navyše (hlásenie 14. 10.
      // 2026: začiatok ťahu so 6 kartami, D010 na P001 „dotiahol" kartu).
      const toHand = fromHand > 0 && state.phase === "shop" && state.active === p.id && p.hand.length < HAND_MAX;
      let uid = null;
      if (toHand) {
        const sp = makeInst(state, "pet", rank);
        sp.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(sp);
        uid = sp.uid;
      } else {
        addToDeckRef(state, p, "pet", rank, 0, 0);
      }
      events.push({ type: "petMerge", pid: p.id, rank, uid, hidden });
    }
  }

  function findPetGroup(p) {
    const groups = {};
    const group = rank => (groups[rank] ||= { rank, hand: [], deck: [], discard: [], total: 0 });
    for (const inst of p.hand) {
      if (inst.spell && Cards.byId[inst.defId].pet) { const g = group(inst.rank || 1); g.hand.push(inst); g.total++; }
    }
    for (const zone of ["deck", "discard"]) {
      p[zone].forEach((c, i) => {
        if (Cards.byId[c.defId].pet) { const g = group(c.rank || 1); g[zone].push(i); g.total++; }
      });
    }
    return Object.values(groups).sort((a, b) => a.rank - b.rank).find(g => g.total >= 3) || null;
  }

  // Do evolve sa počítajú len príšerky pod zlatým stupňom (kúzla a tokeny nie).
  function evolvable(defId, rank) {
    const def = Cards.byId[defId];
    return rank < 3 && !def.spell && !def.token && !def.noEvolve; // Hmyz evolve nemá
  }

  // Zoskupí kópie podľa (karta, stupeň) naprieč zónami a vráti prvú skupinu,
  // ktorá má dosť kópií (poradie skupín = poradie prvého výskytu).
  function findEvolveGroup(p, needFor) {
    const groups = {};
    const group = (defId, rank) =>
      (groups[defId + "|" + rank] ||= { defId, rank, board: [], hand: [], deck: [], discard: [], total: 0 });
    for (const inst of p.board) {
      if (!inst.spell && evolvable(inst.defId, inst.rank)) { const g = group(inst.defId, inst.rank); g.board.push(inst); g.total++; }
    }
    for (const inst of p.hand) {
      if (!inst.spell && evolvable(inst.defId, inst.rank)) { const g = group(inst.defId, inst.rank); g.hand.push(inst); g.total++; }
    }
    p.deck.forEach((c, i) => { if (evolvable(c.defId, c.rank)) { const g = group(c.defId, c.rank); g.deck.push(i); g.total++; } });
    p.discard.forEach((c, i) => { if (evolvable(c.defId, c.rank)) { const g = group(c.defId, c.rank); g.discard.push(i); g.total++; } });
    return Object.values(groups).find(g => g.total >= needFor(g.defId)) || null;
  }

  // Odoberie `need` kópií v poradí plocha → ruka → balíček → kôpka. Pri každej
  // si zapíše LEN permanentný rast (pa/ph) – dočasné buffy (Jablko, hod
  // mincou, dračí buff…) pri evolve prepadnú, rovnako ako pri cykle
  // balíčka. Auru dostane evolvnutá karta znova pri vzniku (makeInst).
  // Vráti { copies, srcAll, boardSlot, hidden }: slot prvej kópie z plochy
  // a hidden=true, ak sa použila aspoň jedna neviditeľná kópia.
  function consumeEvolveCopies(p, group, need) {
    const out = { copies: [], srcAll: {}, boardSlot: null, hidden: false }; // srcAll: zdroje všetkých kópií (predaj striebornej vráti 3 kópie)
    const noteInst = inst => {
      out.copies.push({ pa: inst.pa || 0, ph: inst.ph || 0, pets: inst.pets || 0 });
      addSrc(out.srcAll, inst.src);
    };
    const noteRef = c => {
      out.copies.push({ pa: c.pa || 0, ph: c.ph || 0, pets: c.pets || 0 });
      addSrc(out.srcAll, c.src);
    };
    while (need > 0 && group.board.length) {
      const inst = group.board.shift();
      if (out.boardSlot === null) out.boardSlot = inst.slot;
      noteInst(inst);
      p.board.splice(p.board.indexOf(inst), 1);
      need--;
    }
    while (need > 0 && group.hand.length) {
      const inst = group.hand.shift();
      noteInst(inst);
      p.hand.splice(p.hand.indexOf(inst), 1);
      need--;
    }
    for (const zone of ["deck", "discard"]) {
      for (const idx of group[zone].reverse()) { // od najvyššieho indexu, nech splice nerozhodí ostatné
        if (need <= 0) break;
        noteRef(p[zone][idx]);
        p[zone].splice(idx, 1);
        out.hidden = true;
        need--;
      }
    }
    return out;
  }

  // Evolvnutá karta si nechá permanentný rast DVOCH najsilnejších kópií
  // (podľa celkového rastu) – tretia prepadne, inak by evolve staty len sčítal.
  function mergeEvolveBonus(copies) {
    const sorted = [...copies].sort((x, y) => (y.pa + y.ph) - (x.pa + x.ph));
    return sorted.slice(0, 2).reduce(
      (s, c) => ({ pa: s.pa + c.pa, ph: s.ph + c.ph, pets: s.pets + (c.pets || 0) }),
      { pa: 0, ph: 0, pets: 0 });
  }

  // Nová karta vznikne v ruke (battlecry sa dá zahrať znova, silnejší). Pri
  // plnej ruke ide na slot prvej kópie z plochy; keď ani ten nie je, ako
  // referencia do balíčka. Vráti uid (null pre balíček).
  function placeEvolved(state, p, group, consumed, bonus) {
    const { defId, rank } = group;
    const { boardSlot, srcAll } = consumed;
    const handFull = p.hand.length >= HAND_MAX;
    if (handFull && boardSlot === null) {
      addToDeckRef(state, p, defId, rank + 1, bonus.pa, bonus.ph, srcAll.src, bonus.pets);
      return null;
    }
    const evolved = makeInst(state, defId, rank + 1, p);
    if (bonus.pa || bonus.ph) {
      buff(evolved, bonus.pa, bonus.ph);
      evolved.pa = bonus.pa; evolved.ph = bonus.ph;
    }
    if (bonus.pets) evolved.pets = bonus.pets;
    if (srcAll.src) evolved.src = srcAll.src;
    if (handFull) {
      evolved.slot = boardSlot;
      p.board.push(evolved);
      sortBoard(p);
    } else {
      evolved.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(evolved);
    }
    return evolved.uid;
  }

  // ---------- Obchod ----------
  function buyCommon(state, pid, idx) {
    const p = state[pid];
    if (idx >= state.commons.length) return null;
    const defId = state.commons[idx];
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events, { common: 1 });
    p.bought.push(defId);
    state.commons[idx] = rollCard(state, commonTierLimit(state), "common");
    return events;
  }

  function buyPrivate(state, pid, idx) {
    const p = state[pid];
    if (idx >= p.priv.length) return null;
    const defId = p.priv[idx].defId;
    if (p.money < cardCost(defId)) return null;
    p.money -= cardCost(defId);
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events, { [pid]: 1 });
    p.bought.push(defId);
    p.priv[idx] = { defId: rollCard(state, p.tier, pid), frozen: false };
    return events;
  }

  // Kúpa kúzla zo špeciálneho slotu; slot sa hneď doplní novým kúzlom.
  function buySpell(state, pid) {
    const p = state[pid];
    const defId = p.spellShop.defId;
    const cost = spellCost(state, pid, defId);
    if (p.money < cost) return null;
    p.money -= cost;
    if (hasTrinket(state, pid, "fairyDiscount")) p.spellDiscountUsed = true; // zľava raz za kolo
    const events = [{ type: "buy", pid, defId }];
    acquireCard(state, p, defId, events, p.spellShop.src); // src cestuje s kópiou (predaj vráti do poolu)
    p.bought.push(defId);
    p.spellShop = spellSlot(state, p.tier, pid);
    return events;
  }

  // Kúpená karta ide do balíčka; globálny checkEvolve hneď spojí trojicu,
  // ak kúpou vznikla (aj z kópií schovaných v balíčku/kôpke).
  function acquireCard(state, p, defId, events, src) {
    addToDeck(state, p, defId, src);
    checkEvolve(state, p, events);
  }

  // Kúpená karta sa zamieša do balíčka (na náhodné miesto).
  function addToDeck(state, p, defId, src) {
    addToDeckRef(state, p, defId, 1, 0, 0, src);
  }

  function addToDeckRef(state, p, defId, rank, pa, ph, src, pets) {
    const i = Math.floor(state.rng() * (p.deck.length + 1));
    const c = { defId, rank };
    if (pa || ph) { c.pa = pa || 0; c.ph = ph || 0; }
    if (pets) c.pets = pets;
    if (src) c.src = src;
    p.deck.splice(i, 0, c);
  }

  function refreshShop(state, pid) {
    const p = state[pid];
    const cost = refreshCost(state, pid);
    if (p.money < cost) return null;
    p.money -= cost;
    p.freeRefreshUsed = true; // Čerstvý tovar: zadarmo je len prvý refresh v kole
    for (let i = 0; i < state.commons.length; i++) {
      returnToPool(state, "common", state.commons[i]);
      state.commons[i] = rollCard(state, commonTierLimit(state), "common");
    }
    for (let i = 0; i < p.priv.length; i++) {
      if (p.priv[i].frozen) continue;
      returnToPool(state, pid, p.priv[i].defId);
      p.priv[i] = { defId: rollCard(state, p.tier, pid), frozen: false };
    }
    if (!p.spellShop.frozen) {
      returnSrc(state, p.spellShop.defId, p.spellShop.src);
      p.spellShop = spellSlot(state, p.tier, pid);
    }
    return [{ type: "refresh", pid }];
  }

  // Zmraz / odmraz celú súkromnú ponuku vrátane kúzla (štýl Battlegrounds).
  function toggleFreezeAll(state, pid) {
    const p = state[pid];
    if (!p.priv.length) return null;
    const freeze = p.priv.some(s => !s.frozen) || !p.spellShop.frozen;
    for (const s of p.priv) s.frozen = freeze;
    p.spellShop.frozen = freeze;
    return [{ type: "freezeAll", pid, frozen: freeze }];
  }

  function toggleFreeze(state, pid, idx) {
    const p = state[pid];
    if (idx >= p.priv.length) return null;
    p.priv[idx].frozen = !p.priv[idx].frozen;
    return [{ type: "freeze", pid, idx, frozen: p.priv[idx].frozen }];
  }

  function upgradeCost(state, pid) {
    const p = state[pid];
    if (p.tier >= TIER_MAX) return null;
    const base = TIER_BASE_COST[p.tier + 1];
    const discount = hasTrinket(state, pid, "cheapUpgrade") ? CHEAP_UPGRADE : 0;
    return Math.max(TIER_MIN_COST, base - (state.round - p.reachedRound) - discount);
  }

  function upgradeTier(state, pid) {
    const p = state[pid];
    const cost = upgradeCost(state, pid);
    if (cost === null || p.money < cost) return null;
    p.money -= cost;
    p.tier++;
    p.reachedRound = state.round;
    fillPrivate(state, pid);
    return [{ type: "tierUp", pid, tier: p.tier }];
  }

  // ---------- Hranie kariet ----------
  // targetUid (voliteľné): cieľ pre CIELENÉ battlecry (draci) – príšerka na
  // vlastnej ploche. Bez cieľa si efekt vyberie fallback sám (viď applyShopFx).
  function playMinion(state, pid, handIdx, targetUid) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || inst.spell || p.board.length >= BOARD_MAX) return null;
    const target = targetUid ? p.board.find(x => x.uid === targetUid) : null;
    p.hand.splice(handIdx, 1);
    inst.slot = freeSlot(p.board, BOARD_MAX);
    p.board.push(inst);
    sortBoard(p);
    const events = [{ type: "play", pid, uid: inst.uid, defId: inst.defId }];
    enterBoard(state, p, inst, events, target);
    checkEvolve(state, p, events);
    return events;
  }

  // Príšerka práve vstúpila na plochu (z ruky alebo cez Kúzelný portál):
  // počítadlo rasy, dračí bojový buff a battlecry. Volajúci ju už vložil
  // do p.board so slotom.
  function enterBoard(state, p, inst, events, target) {
    const def = Cards.byId[inst.defId];
    // Trvalé počítadlo vyložených príšer podľa rasy (E009) – rastie PRED
    // battlecry, takže škálovač počíta aj seba. Tokeny sem nejdú.
    if (def.race) {
      if (!p.racePlayed) p.racePlayed = {};
      p.racePlayed[def.race] = (p.racePlayed[def.race] || 0) + 1;
    }
    // Dračí buff „do konca boja" platí aj pre karty vyložené po ňom.
    const fb = def.race && fightBuffFor(state, p, def);
    if (fb && (fb.a || fb.h)) {
      buff(inst, fb.a, fb.h);
      events.push({ type: "buff", pid: p.id, uid: inst.uid, a: fb.a, h: fb.h });
    }
    for (const pw of Cards.powersOf(def)) {
      if (pw.kw !== "battlecry") continue;
      // Mutácia „echoCry": battlecry sa spustí dvakrát.
      const times = state.mutator === "echoCry" ? 2 : 1;
      for (let r = 0; r < times; r++) {
        applyShopFx(state, p, pw.fx, inst.rank, inst, events, target);
      }
    }
    ogreLuck(state, p, inst, def, events);
  }

  // Ogria šťastena (trinket): Ogor bez schopnosti má Pri vyložení hod
  // mincou – hlava: potiahni kartu (×stupeň), chvost: Pečať +1/+0 Ogrom
  // (×stupeň). Mutácia „echoCry" ho spustí dvakrát ako každý battlecry.
  const plainMinion = def => !Cards.powersOf(def).length && !def.wildAtk && !def.fickle && !def.cleave && !def.reborn;
  function ogreLuck(state, p, inst, def, events) {
    if (def.race !== "ogre" || !plainMinion(def) || !hasTrinket(state, p.id, "ogreLuck")) return;
    const times = state.mutator === "echoCry" ? 2 : 1;
    for (let r = 0; r < times; r++) {
      const heads = state.rng() < 0.5;
      events.push({ type: "trinketProc", pid: p.id, id: "ogreLuck", uid: inst.uid, heads });
      if (heads) drawCards(state, p, inst.rank, events);
      else grantRaceAura(state, p, "ogre", inst.rank, 0, events);
    }
  }

  // Po kúzle (víly): každé úspešné zoslanie kúzla spustí schopnosti víl
  // na vlastnej ploche – opakovateľná obdoba battlecry. Zároveň rastie
  // trvalé počítadlo zahraných kúziel (spellScale karty).
  function afterSpellProcs(state, p, events) {
    p.spellsCast++;
    runAfterSpell(state, p, events);
  }
  // Samotné Po kúzle víl na ploche (bez počítadla kúziel) – aj F009 battlecry.
  function runAfterSpell(state, p, events) {
    for (const inst of [...p.board]) {
      for (const pw of instPowers(inst)) {
        if (pw.kw !== "afterSpell") continue;
        events.push({ type: "proc", pid: p.id, uid: inst.uid, kw: "afterSpell" });
        applyShopFx(state, p, pw.fx, inst.rank, inst, events);
      }
    }
  }

  // targetUid: uid príšerky na vlastnej ploche (cielené kúzla). Nelegálny
  // ťah (bez cieľa, plný balíček…) vráti null a nič nezmení.
  // Zahrané kúzlo NEJDE do kôpky hneď, ale do karantény (spentSpells) –
  // do kôpky padne až na konci ťahu. Inak by ho draw (reshuffle kôpky)
  // mohol vrátiť do ruky a draw + víly by točili nekonečný cyklus
  // permanentných buffov zadarmo v jednom ťahu.
  function castSpell(state, pid, handIdx, targetUid) {
    const p = state[pid];
    const inst = p.hand[handIdx];
    if (!inst || !inst.spell) return null;
    const def = Cards.byId[inst.defId];
    const cast = SPELL_CAST[def.fx.type] || castUntargeted;
    const events = cast(state, p, inst, def, targetUid);
    if (!events) return null;
    afterSpellProcs(state, p, events);
    return events;
  }

  // Zahrané kúzlo opustí ruku; jednorazové (token – Iskrička) zmiznú z hry.
  function spendSpell(p, inst, def) {
    p.hand.splice(p.hand.indexOf(inst), 1);
    if (!def.token) p.spentSpells.push(pileCard(inst)); // src ostáva – predaj z ruky ho neskôr vráti
  }

  const ownMinion = (p, uid) => p.board.find(x => x.uid === uid);

  // gold, goldLater, buffAllFriends, dmgBoost, silence, hex, bolt, draw – bez cieľa.
  function castUntargeted(state, p, inst, def) {
    spendSpell(p, inst, def);
    const events = [{ type: "spell", pid: p.id, defId: inst.defId }];
    applyShopFx(state, p, def.fx, 1, null, events);
    return events;
  }

  // Cielené kúzla a discover. Handler najprv overí cieľ (null = nelegálny
  // ťah), až potom kúzlo minie (opustí ruku) a aplikuje efekt – poradie je
  // dôležité pre veľkosť ruky (draw, evolve do ruky).
  const SPELL_CAST = {
    // Pohladkanie (psíci): +v/+v vybranej vlastnej príšerke, v = 2^(stupeň−1).
    // Psíkovi ostáva NAVŽDY (pa/ph cestuje s kartou cez balíček aj evolve),
    // inej príšerke len do konca boja. Živelná sila nezosilňuje. Počítadlo
    // petsCast (P008) rastie o 1 bez ohľadu na stupeň.
    petBuff(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target) return null;
      spendSpell(p, inst, def);
      const v = Cards.petValue(inst.rank || 1);
      const a = def.fx.a * v, h = def.fx.h * v;
      const isDog = x => isRace(state, p.id, Cards.byId[x.defId], "doggy");
      const pat = (x, events) => {
        buff(x, a, h);
        if (isDog(x)) { x.pa = (x.pa || 0) + a; x.ph = (x.ph || 0) + h; x.pets = (x.pets || 0) + 1; }
        if (events) events.push({ type: "buff", pid: p.id, uid: x.uid, a, h });
      };
      // Dvojité pohladkanie (trinket): prvé pohladkanie v kole zaúčinkuje 2×
      // (cieľ aj svorka Vodcu), karta sa ťahá len raz.
      const reps = hasTrinket(state, p.id, "doggyDouble") && !p.petTwiceUsed ? 2 : 1;
      if (reps > 1) p.petTwiceUsed = true;
      for (let r = 0; r < reps; r++) pat(target);
      const perm = isDog(target);
      const events = [{ type: "spell", pid: p.id, defId: inst.defId, rank: inst.rank || 1, targetUid, a: a * reps, h: h * reps, perm }];
      if (reps > 1) events.push({ type: "trinketProc", pid: p.id, id: "doggyDouble", uid: targetUid });
      // Vodca svorky (P009 na ploche): každé pohladkanie objíme celú svorku –
      // každý ďalší Psík na ploche dostane to isté (navždy). Endgame psíkov:
      // rast už nejde len na jedno telo. Je to schopnosť t6 psíka, nie
      // kúzla (hráčovo rozhodnutie 16. 9. 2026).
      // Vodcovia sa sčítajú podľa stupňa: bronz 1×, striebro 2×, zlato 3×
      // – dvaja bronzoví = svorka pohladkaná 2×.
      const leaders = p.board.filter(x => Cards.powersOf(Cards.byId[x.defId]).some(pw => pw.kw === "packLeader"));
      const times = leaders.reduce((sum, x) => sum + x.rank, 0) * reps;
      for (let k = 0; k < times; k++) {
        for (const x of p.board) if (x !== target && isDog(x)) pat(x, events);
      }
      p.petsCast = (p.petsCast || 0) + 1;
      // Pohladkanie dotiahne kartu – len PRVÉ v kole (od 14. 10. 2026).
      // Predtým ťahalo každé: s Vodcom svorky a balíčkom plným pohladkaní
      // sa celá svorka hladkala dokola, kým bolo čo ťahať. Zahrané kúzlo
      // je v karanténe (spentSpells), reshuffle ho nevráti hneď späť.
      if (!p.petDrawUsed) {
        p.petDrawUsed = true;
        drawCards(state, p, 1, events);
      }
      checkEvolve(state, p, events);
      return events;
    },
    buffTarget(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target) return null;
      if (def.fx.echo && !hasEchoPower(target)) return null; // Ozvena len na bojovú schopnosť
      if (def.fx.hunt && !isRace(state, p.id, Cards.byId[target.defId], "beast")) return null; // Lovecká značka len na Zviera
      spendSpell(p, inst, def);
      const fx = def.fx;
      const { a, h } = sparkBonus(fx, 1, p.dmgBoost); // Živelná sila zosilňuje buffy kúziel
      buff(target, a, h);
      if (fx.taunt) target.taunt = true;
      if (fx.shield) target.shield = true; // Božský štít: zablokuje prvé zranenie
      if (fx.revive) target.revive = true; // Fénixovo pierko: po smrti sa raz vráti s 1 HP
      if (fx.windfury) target.windfury = true; // Vichor: útočí dvakrát
      if (fx.echo) target.echo = (target.echo || 0) + 1; // Ozvena: bojová schopnosť navyše
      if (fx.hunt) target.hunt = (target.hunt || 0) + 1; // Lovecká značka: rast za padlé Zvieratá
      return [{ type: "spell", pid: p.id, defId: inst.defId, targetUid, a, h }];
    },
    // Zrkadlo: kópia 1. stupňa vybranej vlastnej príšerky do balíčka –
    // akcelerátor trojíc. Tokeny (kostík, Mláďa) kopírovať nejde.
    copyToDeck(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target || Cards.byId[target.defId].token) return null;
      spendSpell(p, inst, def);
      // Kópia ide z vlastného poolu, kým v ňom je; potom bez zdroja.
      let src;
      if (state.pools[p.id][target.defId] > 0) { state.pools[p.id][target.defId]--; src = { [p.id]: 1 }; }
      addToDeck(state, p, target.defId, src);
      const events = [{ type: "spell", pid: p.id, defId: inst.defId, targetUid }];
      checkEvolve(state, p, events);
      return events;
    },
    // Kúzelný klobúk: vlastná príšerka sa zmení na NÁHODNÚ o tier vyššiu
    // (stupeň 1, aury sa aplikujú). Originál zmizne z hry, slot ostáva.
    transform(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target) return null;
      const newTier = Math.min(Cards.byId[target.defId].tier + 1, TIER_MAX);
      const newId = rollCard(state, newTier, p.id, d => d.tier === newTier); // z vlastného poolu
      if (!newId) return null;
      spendSpell(p, inst, def);
      returnSrc(state, target.defId, target.src); // originál späť do poolu
      const fresh = makeInst(state, newId, 1, p);
      fresh.src = { [p.id]: 1 };
      fresh.slot = target.slot;
      p.board[p.board.indexOf(target)] = fresh;
      const events = [
        { type: "spell", pid: p.id, defId: inst.defId, targetUid },
        { type: "transform", pid: p.id, uid: targetUid, fromDefId: target.defId, toDefId: fresh.defId, newUid: fresh.uid },
      ];
      checkEvolve(state, p, events);
      return events;
    },
    // Kúzelný portál: vlastná príšerka na ploche sa vymení za NÁHODNÚ
    // príšeru z balíčka (rng). Odchádzajúca ide do balíčka ako čistá kópia
    // (pileCard – trvalý rast pa/ph cestuje s ňou, dočasné buffy padnú),
    // prichádzajúca zaberie jej slot a správa sa ako vyložená (battlecry,
    // dračí buff, počítadlo rasy). Prázdny balíček sa dopĺňa z kôpky ako
    // pri ťahaní; bez príšery v balíčku aj kôpke je ťah nelegálny. Tokeny
    // (kostík, Mláďa) vymeniť nejde – v balíčku neexistujú.
    swapDeck(state, p, inst, def, targetUid) {
      const target = ownMinion(p, targetUid);
      if (!target || Cards.byId[target.defId].token) return null;
      const isMinion = c => !Cards.byId[c.defId].spell;
      if (!p.deck.some(isMinion) && !p.discard.some(isMinion)) return null;
      spendSpell(p, inst, def);
      const events = [{ type: "spell", pid: p.id, defId: inst.defId, targetUid }];
      if (!p.deck.some(isMinion)) {
        p.deck = shuffle(p.discard.splice(0), state.rng);
        events.push({ type: "reshuffle", pid: p.id });
      }
      const idxs = p.deck.map((c, i) => isMinion(c) ? i : -1).filter(i => i >= 0);
      const [c] = p.deck.splice(pick(idxs, state.rng), 1);
      const fresh = makeInst(state, c.defId, c.rank, p);
      if (c.src) fresh.src = c.src;
      if (c.pets) fresh.pets = c.pets;
      if (c.pa || c.ph) {
        fresh.pa = c.pa || 0; fresh.ph = c.ph || 0;
        fresh.atk += fresh.pa; fresh.hp += fresh.ph; fresh.maxHp += fresh.ph;
      }
      fresh.slot = target.slot;
      p.board[p.board.indexOf(target)] = fresh;
      const out = pileCard(target);
      addToDeckRef(state, p, out.defId, out.rank, out.pa, out.ph, out.src);
      events.push({ type: "swapDeck", pid: p.id, uid: targetUid, fromDefId: target.defId, toDefId: fresh.defId, newUid: fresh.uid });
      enterBoard(state, p, fresh, events);
      checkEvolve(state, p, events);
      return events;
    },
    // Discover: 3 karty z vlastného poolu (tier <= vlastný), hráč si vyberie
    // jednu (pickDiscover).
    discover(state, p, inst, def) {
      spendSpell(p, inst, def);
      const options = [];
      for (let i = 0; i < 3; i++) options.push(rollCard(state, p.tier, p.id));
      state.pendingDiscover = { pid: p.id, options, poolKey: p.id };
      return [{ type: "discoverStart", pid: p.id, options }];
    },
  };

  // Odmena za DMG Meter: víťaz na začiatku svojho ťahu v ďalšom kole vyberá
  // z 3 príšer tieru presne o 1 vyššieho než jeho tier (strop TIER_MAX),
  // z vlastného poolu; karta ide do ruky (pickDiscover).
  function bossReward(state, p, events) {
    const br = state.bossResult;
    if (!br || br.claimed || br.winner !== p.id || br.round !== state.round - 1 || state.pendingDiscover) return;
    br.claimed = true;
    const tier = Math.min(p.tier + 1, TIER_MAX);
    const options = [];
    for (let i = 0; i < 3; i++) {
      const id = rollCard(state, tier, p.id, d => d.tier === tier);
      if (id) options.push(id);
    }
    if (!options.length) return;
    state.pendingDiscover = { pid: p.id, options, poolKey: p.id, boss: true, tier }; // boss/tier: titulok v UI
    events.push({ type: "discoverStart", pid: p.id, options, boss: true, tier });
  }

  function pickDiscover(state, pid, choiceIdx) {
    const pd = state.pendingDiscover;
    if (!pd || pd.pid !== pid || choiceIdx >= pd.options.length) return null;
    const defId = pd.options[choiceIdx];
    state.pendingDiscover = null;
    const p = state[pid];
    // Nevybrané možnosti späť do poolu, z ktorého boli vylosované.
    pd.options.forEach((id, i) => { if (i !== choiceIdx) returnToPool(state, pd.poolKey, id); });
    const inst = makeInst(state, defId, pd.rank || 1, p); // D004 strieborný/zlatý = karta toho stupňa
    inst.src = { [pd.poolKey]: 1 };
    inst.slot = freeSlot(p.hand, HAND_MAX);
    p.hand.push(inst);
    const events = [{ type: "discoverPick", pid, defId }];
    checkEvolve(state, p, events);
    return events;
  }

  // Poradie útoku = poradie plochy zľava doprava (podľa slotov).
  function sortBoard(p) {
    p.board.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  }

  // Presun vlastnej príšerky na iný slot; obsadený slot = výmena miest.
  function moveOnBoard(state, pid, idx, slot) {
    const p = state[pid];
    const inst = p.board[idx];
    if (!inst || slot < 0 || slot >= BOARD_MAX) return null;
    if (inst.slot === slot) return null;
    const occupant = p.board.find(x => x !== inst && x.slot === slot);
    const old = inst.slot;
    inst.slot = slot;
    if (occupant) occupant.slot = old;
    sortBoard(p);
    return [{ type: "reorder", pid }];
  }

  // Manuálne odhodenie: karta ide z ruky/plochy do kôpky (bez peňazí)
  // a ostáva v cykle balíčka – na rozdiel od predaja. Pre karty hrané len
  // kvôli battlecry, ktoré by v boji zavadzali.
  function discardCard(state, pid, zone, idx) {
    const p = state[pid];
    if (zone !== "hand" && zone !== "board") return null;
    const inst = p[zone][idx];
    if (!inst) return null;
    p[zone].splice(idx, 1);
    // Jednorazové kúzlo (Iskrička) nejde do kôpky – odhodením zmizne.
    if (!Cards.byId[inst.defId].token) p.discard.push(pileCard(inst));
    return [{ type: "discard", pid, defId: inst.defId }];
  }

  // Počet kariet hráča pre limit (deckMin): všetky zóny, tokeny nie.
  function cardCount(p) {
    let n = 0;
    for (const zone of ["deck", "discard", "hand", "board", "spentSpells"]) {
      for (const c of p[zone]) if (!Cards.byId[c.defId].token) n++;
    }
    return n;
  }

  // Predaj by stiahol počet kariet pod limit tieru? (tokeny sa nerátajú)
  function sellBlocked(state, p, inst) {
    return !state.noDeckMin && !Cards.byId[inst.defId].token && cardCount(p) - 1 < deckMin(p.tier);
  }

  function sellCard(state, pid, zone, idx) {
    const p = state[pid];
    if (zone !== "hand" && zone !== "board") return null;
    const inst = p[zone][idx];
    if (!inst) return null;
    if (sellBlocked(state, p, inst)) return null; // pod minimálny počet kariet tieru
    p[zone].splice(idx, 1);
    // Pohladkanie sa predáva za 0 – zbavíš sa ho, ale generátory (P001/P002)
    // nesmú byť zlatý motor (2–3 pohladkania za kolo = 2–3 zlata).
    const gain = Cards.byId[inst.defId].pet ? 0
      : SELL_GAIN + (state.mutator === "richSell" || hasTrinket(state, pid, "richSell") ? 1 : 0);
    p.money += gain;
    returnSrc(state, inst.defId, inst.src); // kópie späť do poolov, z ktorých boli
    // Buyback: posledný predaj v ťahu sa dá raz vrátiť (omyl pri ťahaní).
    p.lastSold = { inst, gain };
    return [{ type: "sell", pid, defId: inst.defId }];
  }

  // Buyback: vráti poslednú predanú kartu tohto ťahu do ruky za to, čo predaj
  // dal (1, pri richSell 2). Raz za ťah; karta sa vracia aj s buffmi (rovnaká
  // inštancia), kópie idú späť z poolu. Plná ruka = nejde.
  function buyBack(state, pid) {
    const p = state[pid];
    if (state.phase !== "shop" || state.active !== pid) return null;
    const ls = p.lastSold;
    if (!ls || (p.buyBackUsed && !hasTrinket(state, pid, "buybackAny")) || p.money < ls.gain || p.hand.length >= HAND_MAX) return null;
    p.money -= ls.gain;
    p.buyBackUsed = true;
    p.lastSold = null;
    const inst = ls.inst;
    if (inst.src) for (const [k, n] of Object.entries(inst.src)) {
      const pool = state.pools[k];
      if (pool) pool[inst.defId] = Math.max(0, (pool[inst.defId] || 0) - n);
    }
    inst.slot = freeSlot(p.hand, HAND_MAX);
    p.hand.push(inst);
    const events = [{ type: "buyBack", pid, uid: inst.uid, defId: inst.defId }];
    checkEvolve(state, p, events);
    return events;
  }

  function applyShopFx(state, p, fx, rank, self, events, target) {
    const handler = SHOP_FX[fx.type];
    if (handler) handler({ state, p, fx, m: rank, self, events, target });
  }

  // Cieľ cieleného battlecry: zadaný cieľ (ak je stále na ploche), inak
  // najsilnejšia vlastná príšerka OKREM seba.
  // Schopnosti konkrétnej príšerky: jej karta + schopnosť skopírovaná cez
  // U004 (inst.cloneOf, do konca boja). Pri vyložení sa nekopíruje.
  function instPowers(inst) {
    const own = Cards.powersOf(Cards.byId[inst.defId]);
    if (!inst.cloneOf) return own;
    return own.concat(Cards.powersOf(Cards.byId[inst.cloneOf]).filter(pw => pw.kw !== "battlecry"));
  }
  const copyablePowers = defId => Cards.powersOf(Cards.byId[defId]).filter(pw => pw.kw !== "battlecry");

  function shopTarget(p, self, target) {
    if (target && p.board.includes(target)) return target;
    const others = p.board.filter(x => x !== self);
    if (!others.length) return null;
    return others.sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
  }

  // Buff + event pre UI (v nákupnej fáze aj v boji).
  function buffWithEvent(inst, pid, a, h, events) {
    buff(inst, a, h);
    events.push({ type: "buff", pid, uid: inst.uid, a, h });
  }

  // Buffne ne-kúzlové karty v daných zónach hráča, ktorých definícia spĺňa filter.
  function buffZones(p, zones, match, a, h, events) {
    for (const zone of zones) {
      for (const f of p[zone]) {
        if (f.spell || !match(Cards.byId[f.defId])) continue;
        buffWithEvent(f, p.id, a, h, events);
      }
    }
  }

  // Dračí buff „do konca boja" pre rasu: príšerky na ploche hneď + zápis do
  // fightRaceBuffs, nech ho dostanú aj tie, čo do boja pribudnú neskôr
  // (vyloženie z ruky, tokeny v boji).
  function buffRaceThisFight(state, p, race, a, h, events) {
    buffZones(p, ["board"], d => isRace(state, p.id, d, race), a, h, events);
    addFightRaceBuff(p, race, a, h);
  }

  function addFightRaceBuff(p, race, a, h) {
    const fb = (p.fightRaceBuffs[race] ||= { a: 0, h: 0 });
    fb.a += a; fb.h += h;
  }

  // Permanentná aura rasy: budúce inštancie (balíček, kôpka, tokeny,
  // vstávajúce) ju dostanú pri vzniku (makeInst, evolve).
  function addRaceAura(p, race, a, h) {
    const cur = p.raceBuffs[race] || { a: 0, h: 0 };
    p.raceBuffs[race] = { a: cur.a + a, h: cur.h + h };
  }

  // Permanentná aura + okamžitý buff príšeriek rasy na ploche a v ruke.
  function grantRaceAura(state, p, race, a, h, events) {
    addRaceAura(p, race, a, h);
    buffZones(p, ["board", "hand"], d => isRace(state, p.id, d, race), a, h, events);
    events.push({ type: "futureBuff", pid: p.id, race, a, h });
  }

  // Ogr „Backstab": smolný roll, ktorý sa obrátil proti vlastníkovi, dá
  // Pečať +1/+1 VŠETKÝM ogrom – permanentná aura, platí aj na budúce kópie.
  // Toto je kmeňový payoff rasy: rozptyl nie je čistý downside, smola platí.
  // Strop 1× za KOLO (nákupná fáza aj nasledujúci boj majú rovnaké
  // state.round) – bez neho by O006 Ožratý úder hádzal pri každom útoku
  // (s Vichrom dvakrát) a rasa by sa rozbila. Pečať je fixne +1/+1 a
  // NEnásobí sa evolve stupňom (inak by bola útecha lepšia než výhra).
  // `sides` = volanie z boja: aura prežije boj a živé príšerky zosilnia hneď.
  // Bez stropu: KAŽDÝ smolný roll dá Pečať (bývalý strop 1/kolo robil
  // z ďalších backstabov v tom istom kole čistý trest).
  function backstab(state, pid, events, sides) {
    const p = state[pid];
    events.push({ type: "backstab", pid });
    if (sides) {
      addRaceAura(p, "ogre", BACKSTAB_BUFF, BACKSTAB_BUFF);
      buffAlive(sides, pid, f => isRace(state, pid, Cards.byId[f.defId], "ogre"),
        BACKSTAB_BUFF, BACKSTAB_BUFF, events);
      events.push({ type: "futureBuff", pid, race: "ogre", a: BACKSTAB_BUFF, h: BACKSTAB_BUFF });
    } else {
      grantRaceAura(state, p, "ogre", BACKSTAB_BUFF, BACKSTAB_BUFF, events);
    }
  }

  // Živelná sila (dmgBoost) zosilňuje dočasné buffy Živlov: +boost na útok,
  // na život len ak buff život dáva.
  function elementalBonus(fx, m, boost) {
    return { a: fx.a * m + boost, h: fx.h * m + (fx.h ? boost : 0) };
  }

  // Živelná sila zosilňuje aj buffy KÚZIEL (Jablko, Koreň, Srdce, Vlna,
  // Iskrička): +boost na každé nenulové číslo. Kúzla bez statov (Štít,
  // Svätožiara, Pierko, Vichor) sa nemenia.
  function sparkBonus(fx, m, boost) {
    return { a: fx.a * m + (fx.a ? boost : 0), h: fx.h * m + (fx.h ? boost : 0) };
  }

  // Odložená kliatba (spotrebuje sa na začiatku najbližšieho boja) – počítadlo
  // na hráčovi + event s celkovým počtom.
  function addPendingCurse(p, key, n, eventType, events) {
    p[key] += n;
    events.push({ type: eventType, pid: p.id, total: p[key] });
  }

  // Efekty nákupnej fázy podľa fx.type. Kontext: state, p (hráč), fx, m (stupeň
  // karty = násobič), self (zdroj efektu, ak je to príšerka), events, target.
  const SHOP_FX = {
    // Cielený buff (E008): +a/+h vybranej príšerke do konca boja; dočasný
    // buff Živla škáluje Živelná sila v oboch číslach.
    buffOne({ state, p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (!t) return;
      const boost = Cards.byId[self.defId].race === "elemental" ? state[p.id].dmgBoost : 0;
      const b = elementalBonus(fx, m, boost);
      buffWithEvent(t, p.id, b.a, b.h, events);
    },
    // Drak: +a/+h všetkým príšerkám RASY cieľa (do konca boja).
    buffRaceOf({ state, p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      const pb = pactBonus(state, p, self); // Žoldnierska zmluva: +1/+1 navyše
      if (t) buffRaceThisFight(state, p, Cards.byId[t.defId].race, fx.a * m + pb, fx.h * m + pb, events);
    },
    // Drak: permanentná aura pre RASU cieľa (rasa za behu).
    futureRaceOf({ state, p, fx, m, self, target, events }) {
      const t = shopTarget(p, self, target);
      if (t) grantRaceAura(state, p, Cards.byId[t.defId].race, fx.a * m, fx.h * m, events);
    },
    // Drak: Discover karta RASY cieľa (1 z 3, tier <= vlastný, z vlastného poolu).
    // Druhé echo (mutácia echoCry) by prepísalo čakajúci discover – preskoč.
    // Stupeň draka = stupeň objavenej karty (strieborný D004 dá striebornú).
    discoverRace({ state, p, m, self, target, events }) {
      if (state.pendingDiscover) return;
      const t = shopTarget(p, self, target);
      if (!t) return;
      const race = Cards.byId[t.defId].race;
      const options = [];
      for (let i = 0; i < 3; i++) {
        const id = rollCard(state, p.tier, p.id, d => d.race === race);
        if (id) options.push(id);
      }
      if (!options.length) return;
      state.pendingDiscover = { pid: p.id, options, poolKey: p.id, rank: m };
      events.push({ type: "discoverStart", pid: p.id, options, rank: m });
    },
    // Drak t6: cieľ evolvne o stupeň (bronz→striebro→zlato); zlatú nezdvihne.
    // Buffy cieľa NAD základ (bez aury) sa prenesú, perma rast tiež.
    // D010: Pri vyložení vybranej vlastnej príšerky (nie seba) sa spustí znova
    // m× (stupeň draka), so stupňom CIEĽA. Iný D010 ako cieľ sa preskočí
    // (žiadna rekurzia). Bez platného cieľa vezme najvyšší tier × stupeň.
    replayBattlecry({ state, p, m, self, target, events }) {
      const bcs = x => Cards.powersOf(Cards.byId[x.defId]).filter(pw => pw.kw === "battlecry" && pw.fx.type !== "replayBattlecry");
      const ok = x => x !== self && bcs(x).length > 0;
      // Vybraný cieľ bez Pri vyložení (napr. Vodca svorky) = zopakuje sa
      // NÁHODNÁ vlastná príšerka s Pri vyložení (state.rng) – t6 drak nesmie
      // byť zahodená karta (rozhodnutie hráča 14. 10. 2026). Bez výberu
      // cieľa najsilnejšia. Nikto s Pri vyložení = replayNone.
      const cands = p.board.filter(ok);
      const picked = target && p.board.includes(target);
      let t = picked && ok(target) ? target : null;
      if (!t && picked && cands.length) t = pick(cands, state.rng);
      if (!t) t = [...cands].sort((a, b) => Cards.byId[b.defId].tier * b.rank - Cards.byId[a.defId].tier * a.rank)[0];
      if (!t) {
        if (picked) events.push({ type: "replayNone", pid: p.id, uid: self.uid, targetUid: target.uid, defId: target.defId });
        return;
      }
      events.push({ type: "replayBattlecry", pid: p.id, uid: self.uid, targetUid: t.uid, defId: t.defId, n: m, random: picked && t !== target });
      for (let i = 0; i < m; i++) {
        for (const pw of bcs(t)) applyShopFx(state, p, pw.fx, t.rank, t, events);
      }
    },
    // F009: Po kúzle všetkých víl na ploche (aj seba) sa spustí m× (stupeň),
    // ako keby si zoslal kúzlo – ale bez kúzla, takže počítadlo kúziel
    // (spellScale) nerastie.
    replayAfterSpell({ state, p, m, self, events }) {
      events.push({ type: "replayAfterSpell", pid: p.id, uid: self.uid, n: m });
      for (let i = 0; i < m; i++) runAfterSpell(state, p, events);
    },
    // Drak: náhodná TVOJA rasa na ploche +a/+h (do konca boja).
    buffRandomRace({ state, p, fx, m, self, events }) {
      const races = [...new Set(p.board.filter(x => !x.spell).map(x => Cards.byId[x.defId].race).filter(Boolean))];
      if (!races.length) return;
      const pb = pactBonus(state, p, self);
      buffRaceThisFight(state, p, pick(races, state.rng), fx.a * m + pb, fx.h * m + pb, events);
    },
    // D001: odložené oslabenie – na začiatku najbližšieho boja náhodná
    // súperova príšerka −a/−h (útok min 0, život min 1). Stackuje sa.
    shrinkEnemy({ p, fx, m, events }) {
      p.shrinks.push({ a: fx.a * m, h: fx.h * m });
      events.push({ type: "shrinkPending", pid: p.id, total: p.shrinks.length });
    },
    // Náhodná kamarátka +a/+h.
    buffFriend({ state, p, fx, m, self, events }) {
      const friends = p.board.filter(x => x !== self);
      if (friends.length) buffWithEvent(pick(friends, state.rng), p.id, fx.a * m, fx.h * m, events);
    },
    // Kúzlo (self = null, Vlna) škáluje Živelnou silou; battlecry príšerky nie.
    buffAllFriends({ p, fx, m, self, events }) {
      const { a, h } = sparkBonus(fx, m, self ? 0 : p.dmgBoost);
      for (const f of p.board) {
        if (f !== self) buffWithEvent(f, p.id, a, h, events);
      }
    },
    // Rasová synergia: všetky vlastné príšerky danej rasy (okrem seba).
    // Dočasné buffy ŽIVLOV (E007 Po nákupe, E008 Pri vyložení) škáluje Živelná sila.
    buffRace({ state, p, fx, m, self, events }) {
      const boost = self && Cards.byId[self.defId].race === "elemental" ? p.dmgBoost : 0;
      const { a, h } = elementalBonus(fx, m, boost);
      for (const f of p.board) {
        if (f === self || !isRace(state, p.id, Cards.byId[f.defId], fx.race)) continue;
        buffWithEvent(f, p.id, a, h, events);
      }
    },
    // +a/+h pre seba za KAŽDÉ kúzlo zahrané v tejto hre – prepočíta sa pri
    // každom vyložení, žiadny trvalý buff (nesnowballuje cez kópie). Bonus sa
    // NEnásobí stupňom (evolve už zdvojnásobuje základné staty).
    spellScale({ p, fx, self, events }) {
      const n = p.spellsCast;
      if (n > 0) buffWithEvent(self, p.id, fx.a * n, fx.h * n, events);
    },
    // +a/+h pre seba za KAŽDÚ príšeru rasy fx.race vyloženú z ruky v tejto
    // hre (E009, počíta aj seba). Rovnaké pravidlá ako spellScale: dočasné,
    // bez stupňa, bez Živelnej sily – počítadlo je motor sám o sebe.
    racePlayedScale({ p, fx, self, events }) {
      const n = (p.racePlayed && p.racePlayed[fx.race]) || 0;
      if (n > 0) buffWithEvent(self, p.id, fx.a * n, fx.h * n, events);
    },
    growSelf({ p, fx, m, self, events }) {
      buffWithEvent(self, p.id, fx.a * m, fx.h * m, events);
      if (fx.perm) { // trvalý rast: uloží sa na kópiu karty a prežije cyklus balíčka
        self.pa = (self.pa || 0) + fx.a * m;
        self.ph = (self.ph || 0) + fx.h * m;
      }
    },
    // U004: skopíruj schopnosť (okrem Pri vyložení) vybraného vlastného
    // príšerky rasy fx.race do konca boja – čísla podľa stupňa U004. Bez
    // platného cieľa vezme najsilnejšiu vhodnú (tier × stupeň).
    copyAbility({ state, p, fx, self, target, events }) {
      const ok = x => x !== self && isRace(state, p.id, Cards.byId[x.defId], fx.race) && copyablePowers(x.defId).length > 0;
      const cands = p.board.filter(ok);
      const t = target && ok(target) && p.board.includes(target) ? target
        : cands.sort((a, b) => Cards.byId[b.defId].tier * b.rank - Cards.byId[a.defId].tier * a.rank)[0];
      if (!t) return;
      self.cloneOf = t.defId;
      events.push({ type: "copyAbility", pid: p.id, uid: self.uid, fromUid: t.uid, defId: self.defId, fromDefId: t.defId });
    },
    // Ogr O001: hod mincou – 50 % veľký buff, 50 % postih (do konca boja).
    // Postih nejde pod 0 útoku / 1 život.
    coinflip({ state, p, fx, m, self, events }) {
      const heads = isCareful(state, p.id) || state.rng() < 0.5; // Opatrný ogr: vždy hlava, bonus polovičný
      const a = Math.max(heads ? ogreBonus(state, p.id, fx.a * m) : -(fx.da * m), -self.atk);
      const h = Math.max(heads ? ogreBonus(state, p.id, fx.h * m) : -(fx.dh * m), 1 - self.hp);
      self.atk += a;
      self.hp += h;
      self.maxHp = Math.max(1, self.maxHp + h);
      events.push({ type: "coinflip", pid: p.id, uid: self.uid, heads });
      events.push({ type: "buff", pid: p.id, uid: self.uid, a, h });
      if (!heads) backstab(state, p.id, events); // chvost = backstab
    },
    draw({ state, p, fx, m, events }) {
      drawCards(state, p, fx.n * m, events);
      checkEvolve(state, p, events);
    },
    gold({ p, fx, m, events }) {
      p.money += fx.n * m;
      events.push({ type: "gold", pid: p.id, n: fx.n * m });
    },
    healHero({ p, fx, m, events }) {
      p.hp = Math.min(p.maxHp || HERO_HP, p.hp + fx.n * m);
      events.push({ type: "heal", pid: p.id, n: fx.n * m });
    },
    // Trvalý bonus: všetky výboje a výbuchy hráča dávajú navždy +n damage.
    // Kúzla sa stackujú – elemental ekvivalent permanentných aur.
    dmgBoost({ p, fx, m, events }) {
      p.dmgBoost += fx.n * m;
      events.push({ type: "dmgBoost", pid: p.id, n: fx.n * m, total: p.dmgBoost });
    },
    // U002: tokeny daného id vyvolané v najbližšom boji dostanú +a/+h.
    // Stackuje sa; po boji sa nuluje (ako fightRaceBuffs).
    fightToken({ p, fx, m, events }) {
      const tb = (p.fightTokenBuffs[fx.token] ||= { a: 0, h: 0 });
      tb.a += fx.a * m; tb.h += fx.h * m;
      events.push({ type: "fightTokenBuff", pid: p.id, token: fx.token, a: fx.a * m, h: fx.h * m });
    },
    // Jednorazová charga: ĎALŠIE vyvolanie v boji vyvolá +n tokenov navyše.
    summonCharge({ p, fx, m, events }) {
      p.summonCharge += fx.n * m;
      events.push({ type: "summonCharge", pid: p.id, n: fx.n * m, total: p.summonCharge });
    },
    // Ticho: náhodná súperova príšerka so schopnosťou stratí efekt aj Obrancu.
    silence({ p, fx, m, events }) { addPendingCurse(p, "silences", fx.n * m, "silencePending", events); },
    // Blesk: výboj za BOLT_DMG (+dmgBoost) na náhodnú súperovu príšerku.
    bolt({ p, fx, m, events }) { addPendingCurse(p, "bolts", fx.n * m, "boltPending", events); },
    // Žabia kliatba: náhodnej súperovej príšerke sa zmení život na 1
    // (nie je to damage – obchádza Božský štít).
    hex({ p, fx, m, events }) { addPendingCurse(p, "hexes", fx.n * m, "hexPending", events); },
    // Ovčia premena: náhodná súperova príšerka sa na začiatku boja zmení na
    // Ovečku 0/1 (stratí schopnosť, Obrancu, štít, pierko, Vichor).
    polymorph({ p, fx, m, events }) { addPendingCurse(p, "polymorphs", fx.n * m, "polymorphPending", events); },
    // Poklad škriatka: polovica hneď, polovica na začiatku ďalšieho kola.
    goldLater({ p, fx, m, events }) {
      p.money += fx.n * m;
      p.goldNext += fx.n * m;
      events.push({ type: "gold", pid: p.id, n: fx.n * m });
      events.push({ type: "goldLater", pid: p.id, n: fx.n * m });
    },
    // Jednorazové kúzlo do ruky (battlecry F006): nejde do balíčka, po zoslaní
    // aj po konci ťahu zmizne. Evolve škáluje počet (1/2/3). Plná ruka = zvyšok prepadne.
    addSpell({ state, p, fx, m, events }) {
      for (let i = 0; i < fx.n * m; i++) {
        if (p.hand.length >= HAND_MAX) break;
        const sp = makeInst(state, fx.spell, 1);
        sp.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(sp);
        events.push({ type: "addSpell", pid: p.id, defId: fx.spell });
      }
    },
    // Permanentná aura: VŠETKY príšerky danej rasy – na ploche a v ruke hneď,
    // budúce inštancie cez auru pri vzniku.
    futureRace({ state, p, fx, m, events }) {
      grantRaceAura(state, p, fx.race, fx.a * m, fx.h * m, events);
    },
    // Psíci: Pohladkanie do balíčka (P001 Pri vyložení; v boji P002 Pri smrti
    // cez BATTLE_FX.addPet). Evolve = počet (1/2/3).
    // Trojica sa hneď spojí (checkPetMerge).
    addPet({ state, p, fx, m, events }) {
      addPets(state, p, fx.n * m, fx.rank || 1, events);
      checkPetMerge(state, p, events);
    },
    // Vyňuchaj (P005): z balíčka vytiahni Pohladkanie (najvyšší stupeň);
    // bez pohladkania v balíčku dotiahni náhodnú kartu. n×stupeň.
    fetchPet({ state, p, fx, m, self, events }) {
      for (let i = 0; i < fx.n * m; i++) {
        if (p.hand.length >= HAND_MAX) break;
        let best = -1;
        p.deck.forEach((c, idx) => {
          if (Cards.byId[c.defId].pet && (best < 0 || (c.rank || 1) > (p.deck[best].rank || 1))) best = idx;
        });
        if (best < 0) { drawCards(state, p, 1, events); continue; }
        const [c] = p.deck.splice(best, 1);
        const sp = makeInst(state, "pet", c.rank || 1);
        sp.slot = freeSlot(p.hand, HAND_MAX);
        p.hand.push(sp);
        events.push({ type: "draw", pid: p.id, defId: "pet", rank: sp.rank, fetched: true });
        // Nájdené Pohladkanie = Snifflecap si navždy prilepší (+grow/+grow).
        if (fx.grow && self) {
          buffWithEvent(self, p.id, fx.grow, fx.grow, events);
          self.pa = (self.pa || 0) + fx.grow;
          self.ph = (self.ph || 0) + fx.grow;
        }
      }
      checkEvolve(state, p, events);
    },
    // P008: +a/+h za každé Pohladkanie zahrané v tejto hre (počet zoslaní,
    // Super = 1). Ako spellScale: dočasné, bez stupňa.
    petScale({ p, fx, self, events }) {
      const n = p.petsCast || 0;
      if (n > 0) buffWithEvent(self, p.id, fx.a * n, fx.h * n, events);
    },
    // F008: permanentná aura pre KAŽDÚ rasu naraz; príšerky na ploche a v ruke
    // dostanú buff hneď (raz).
    futureAll({ state, p, fx, m, events }) {
      for (const race of gameRaceIds(state)) addRaceAura(p, race, fx.a * m, fx.h * m);
      buffZones(p, ["board", "hand"], d => !!d.race, fx.a * m, fx.h * m, events);
      events.push({ type: "futureAllBuff", pid: p.id, a: fx.a * m, h: fx.h * m });
    },
    // Hviezdna moc (t6 kúzlo): Pečať +a/+h každej rase (ako F008) a k tomu
    // Živelná sila +n – obe permanentné, Živelná sila sa nenásobí stupňom.
    starPower(ctx) {
      SHOP_FX.futureAll(ctx);
      SHOP_FX.dmgBoost(ctx);
    },
    // ----- Hmyz (experiment) -----
    // Húsenica: Kukla neexistuje → nová do balíčka; inak Kukla +a/+h navždy.
    cocoon({ state, p, fx, events }) {
      const k = findKukla(p);
      if (!k) {
        addToDeckRef(state, p, KUKLA_ID, 1, 0, 0);
        events.push({ type: "kukla", pid: p.id, created: true });
        return;
      }
      growCard(k.c, fx.a, fx.h, k.isInst);
      if (k.isInst) events.push({ type: "buff", pid: p.id, uid: k.c.uid, a: fx.a, h: fx.h });
      events.push({ type: "kukla", pid: p.id, created: false, a: fx.a, h: fx.h });
    },
    // Lienka: Hmyz v ruke +X·a/+X·h navždy, X = kópie karty fx.of.
    handGrowSwarm({ p, fx, events }) {
      const x = copiesOwned(p, fx.of);
      for (const inst of p.hand) {
        if (inst.spell || Cards.byId[inst.defId].race !== "insect") continue;
        growCard(inst, fx.a * x, fx.h * x, true);
        events.push({ type: "buff", pid: p.id, uid: inst.uid, a: fx.a * x, h: fx.h * x });
      }
    },
    // Mravec (Po nákupe): náhodný Hmyz v balíčku/kôpke +X·a/+X·h navždy,
    // X = kópie karty fx.of.
    deckGrowSwarm({ state, p, fx, events }) {
      const refs = insectRefs(p);
      if (!refs.length) return;
      const x = copiesOwned(p, fx.of);
      const c = pick(refs, state.rng);
      growCard(c, fx.a * x, fx.h * x, false);
      events.push({ type: "deckGrow", pid: p.id, defId: c.defId, a: fx.a * x, h: fx.h * x });
    },
  };

  function buff(inst, a, h) {
    inst.atk += a;
    inst.maxHp += h;
    inst.hp += h;
  }

  // n Pohladkaní daného stupňa na náhodné miesta balíčka (nákup aj boj).
  // Vodítko (trinket psíkov, kolo 8): každé generovanie dá o 1 Pohladkanie viac.
  function addPets(state, p, n, rank, events) {
    if (n > 0 && hasTrinket(state, p.id, "doggyLeash")) {
      n++;
      events.push({ type: "trinketProc", pid: p.id, id: "doggyLeash" });
    }
    for (let i = 0; i < n; i++) addToDeckRef(state, p, "pet", rank, 0, 0);
    if (n > 0) events.push({ type: "addPet", pid: p.id, rank, n });
  }

  // Hladkacia rukavica (+1) a kefa (+2): na začiatku ťahu Pohladkania
  // stupňa 1 na náhodné miesta BALÍČKA (ruku nezväčšujú). Sčítajú sa;
  // Vodítko pridá +1 ako pri každom generovaní. Spojenie troch (aj s kópiami
  // v balíčku/kôpke) rieši cyklus v beginShopTurn – výsledok ostáva v balíčku.
  function petTrinkets(state, p, events) {
    let n = 0;
    for (const [id, k] of [["doggyGlove", 1], ["doggyBrush", 2]]) {
      if (!hasTrinket(state, p.id, id)) continue;
      n += k;
      events.push({ type: "trinketProc", pid: p.id, id });
    }
    if (!n) return;
    if (hasTrinket(state, p.id, "doggyLeash")) {
      n++;
      events.push({ type: "trinketProc", pid: p.id, id: "doggyLeash" });
    }
    for (let i = 0; i < n; i++) addToDeckRef(state, p, "pet", 1, 0, 0);
    events.push({ type: "petGift", pid: p.id, n });
  }

  // Jednorazové kúzla z trinketov na začiatku ťahu (po ťahu zmiznú, do
  // balíčka nejdú): Iskrička (víly), Lovecká značka (zvieratá, každá úroveň
  // jedna) a každé párne kolo Kniha prianí (draci). Plná ruka = prepadne.
  function giftTrinkets(state, p, events) {
    const gifts = [["fairySpark", "iskricka"], ["beastHunt", "znacka"], ["beastHunt2", "znacka"]];
    if (state.round % 2 === 0) gifts.unshift(["dragonBook", "knihaDar"]); // vzácnejšia – prvá
    for (const [id, defId] of gifts) {
      if (!hasTrinket(state, p.id, id) || p.hand.length >= HAND_MAX) continue;
      const inst = makeInst(state, defId, 1);
      inst.slot = freeSlot(p.hand, HAND_MAX);
      p.hand.push(inst);
      events.push({ type: "trinketProc", pid: p.id, id });
      events.push({ type: "draw", pid: p.id, defId });
    }
  }

  // ---------- Koniec nákupnej fázy ----------
  function endShopTurn(state, pid) {
    // Nelegálne ukončenie (nie je nákupná fáza / nie je na ťahu) = null,
    // ako pri každej inej akcii – duplicitná či oneskorená správa v sieti
    // nesmie preskočiť súperovi ťah.
    if (state.phase !== "shop" || state.active !== pid) return null;
    const p = state[pid];
    const events = [];
    // Nevybraný trinket do konca ťahu = prvý z ponuky (hra sa nesmie zaseknúť).
    if (p.trinketOffer) applyTrinketPick(state, p, p.trinketOffer[0], events, true);
    // Nevybraný Discover (odmena za bossa) = prvá možnosť.
    if (state.pendingDiscover && state.pendingDiscover.pid === pid) events.push(...pickDiscover(state, pid, 0));
    // Po nákupe (end of turn) schopnosti príšeriek na ploche.
    for (const inst of [...p.board]) {
      for (const pw of instPowers(inst)) {
        if (pw.kw === "endTurn") applyShopFx(state, p, pw.fx, inst.rank, inst, events);
      }
    }
    // Vyložená Kukla (Hmyz) rastie o def.growPlayed (ak ho má) – pred bojom.
    const gp = Cards.byId[KUKLA_ID] && Cards.byId[KUKLA_ID].growPlayed;
    for (const inst of gp ? p.board : []) {
      if (inst.defId !== KUKLA_ID) continue;
      growCard(inst, gp.a, gp.h, true);
      events.push({ type: "buff", pid, uid: inst.uid, a: gp.a, h: gp.h });
    }
    // Nezahraná Kukla (Hmyz) v ruke rastie navždy.
    for (const inst of p.hand) {
      if (inst.defId !== KUKLA_ID) continue;
      const g = Cards.byId[KUKLA_ID].grow;
      growCard(inst, g.a, g.h, true);
      events.push({ type: "buff", pid, uid: inst.uid, a: g.a, h: g.h });
    }
    // Nezahrané karty z ruky do discard pile (jednorazové kúzla miznú).
    for (const inst of p.hand.splice(0)) {
      if (Cards.byId[inst.defId].token) continue;
      p.discard.push(pileCard(inst));
    }
    // Kúzla zahrané v tomto ťahu sa až teraz vracajú do kôpky.
    p.discard.push(...p.spentSpells.splice(0));
    if (pid === state.first) {
      state.active = other(pid);
      events.push(...beginShopTurn(state, state.active));
      events.push({ type: "shopTurn", pid: state.active });
    } else {
      state.active = null;
      state.phase = "battle";
      events.push({ type: "battlePhase" });
    }
    return events;
  }

  // ---------- Boj ----------
  // Boj sa hrá na KÓPIÁCH kariet z plochy (sides) – originály na state
  // dostanú len trvalé zmeny (pa/ph). Poradie: odložené kliatby z kúziel →
  // Pred bojom → striedavé útoky → vyhodnotenie → upratanie plochy → ďalšie kolo.
  function doBattle(state) {
    if (isBossRound(state)) return doBossBattle(state);
    const events = [];
    const sides = { p1: copyBoard(state.p1), p2: copyBoard(state.p2) };
    const first = pickFirstSide(state, sides);
    events.push({ type: "battleStart", first });
    for (const pid of sideOrder(first)) leftmostTrinkets(state, sides, pid, events);
    chargeStorms(state, first, events);
    applyPendingCurses(state, sides, first, events);
    runStartFightProcs(state, sides, first, events);
    runAttackLoop(state, sides, first, events);
    resolveBattleOutcome(state, sides, events);
    clearBoards(state, sides, events);
    advanceAfterBattle(state, events);
    return events;
  }

  // DMG Meter kolo: najprv bojuje začínajúci hráč, potom druhý – každý so
  // svojím Strážcom arény. Odložené kliatby z kúziel a Búrkový mrak sa
  // nespúšťajú (počkajú na ďalší PvP boj). Eventy každého merania sú medzi
  // bossStart a bossEnd (UI animuje len svoje). Remíza v damage = minca.
  // Odmenu (Discover vyššieho tieru) dostane víťaz v ďalšom kole (bossReward).
  function doBossBattle(state) {
    const events = [{ type: "bossRound" }];
    const dmg = {}, fought = {};
    for (const pid of sideOrder(state.first)) {
      const boss = bossBoard(state);
      const sides = { [pid]: copyBoard(state[pid]), [other(pid)]: boss };
      events.push({ type: "bossStart", pid, boss: boss.map(x => ({ ...x })) });
      leftmostTrinkets(state, sides, pid, events);
      runStartFightProcs(state, sides, pid, events);
      runBossAttackLoop(state, sides, pid, events);
      dmg[pid] = boss.reduce((sum, x) => sum + x.taken, 0);
      fought[pid] = sides[pid];
      events.push({ type: "bossEnd", pid, dmg: dmg[pid] });
    }
    const tie = dmg.p1 === dmg.p2;
    const winner = tie ? (state.rng() < 0.5 ? "p1" : "p2") : dmg.p1 > dmg.p2 ? "p1" : "p2";
    state.bossResult = { round: state.round, dmg: { ...dmg }, winner, claimed: false };
    events.push({ type: "bossResult", dmg: { ...dmg }, winner, tie });
    clearBoards(state, fought, events);
    advanceAfterBattle(state, events);
    return events;
  }

  function bossBoard(state) {
    const boss = [];
    for (let i = 0; i < BOSS_COUNT; i++) {
      const inst = makeInst(state, "straz", 1);
      Object.assign(inst, { atk: BOSS_STAT, hp: BOSS_STAT, maxHp: BOSS_STAT, slot: i, boss: true, taken: 0 });
      boss.push(inst);
    }
    return boss;
  }

  // Útočí len hráč (zľava doprava, cyklicky), kým mu niečo žije. Boss
  // vracia „nekonečný" úder – útočník padne, ak ho nekryje štít.
  function runBossAttackLoop(state, sides, pid, events) {
    const ptr = { [pid]: 0 };
    let guard = BATTLE_CAP;
    while (aliveOn(sides, pid).length && guard-- > 0) {
      const a = nextAttacker(sides[pid], ptr, pid);
      if (!a) break;
      const swings = a.windfury ? 2 : 1;
      for (let s = 0; s < swings && a.hp > 0; s++) {
        const ok = performAttack(state, sides, pid, a, events);
        runRushAttacks(state, sides, events);
        if (!ok) break;
      }
    }
  }

  // Včielky už vyvolané v danom boji (summonDeckCopy) – kľúč = objekt sides.
  const summonedRefs = new WeakMap();
  const copyBoard = p => p.board.map(x => withSwarm(p, { ...x })); // roj (Hmyz) len na bojovú kópiu

  // Večný strážca / Zadný vietor (trinkety): príšerka úplne vľavo (najnižší
  // slot) dostane na boj Znovuzrodenie / Vichor. Na kópii – originál nič.
  function leftmostTrinkets(state, sides, pid, events) {
    const left = [...sides[pid]].sort((a, b) => a.slot - b.slot)[0];
    for (const [id, key] of [["undeadReborn", "revive"], ["elemWind", "windfury"]]) {
      if (!left || !hasTrinket(state, pid, id)) continue;
      left[key] = true;
      events.push({ type: "trinketProc", pid, id, uid: left.uid });
    }
    // Bublinková zásoba: pred bojom Bublina na najpravejší voľný slot.
    if (hasTrinket(state, pid, "elemBubble")) {
      events.push({ type: "trinketProc", pid, id: "elemBubble" });
      trinketSummon(state, sides, pid, "bublina", BOARD_MAX - 1, events);
    }
  }
  const aliveOn = (sides, pid) => sides[pid].filter(x => x.hp > 0);
  // Poradie strán pri spúšťaní efektov: začínajúca strana prvá.
  const sideOrder = first => [first, other(first)];

  // Začína strana s väčším počtom príšeriek (remíza → náhodne).
  function pickFirstSide(state, sides) {
    // Rýchly štart: tá strana začína vždy (obaja = bežné pravidlo).
    const i1 = hasTrinket(state, "p1", "initiative"), i2 = hasTrinket(state, "p2", "initiative");
    if (i1 !== i2) return i1 ? "p1" : "p2";
    if (sides.p1.length > sides.p2.length) return "p1";
    if (sides.p2.length > sides.p1.length) return "p2";
    return state.rng() < 0.5 ? "p1" : "p2";
  }

  function pushHp(events, pid, inst) {
    events.push({ type: "hp", pid, uid: inst.uid, hp: inst.hp });
  }

  // Zásah schopnosťou (výboj, Blesk, lovec tokenov): damage cez štít + eventy.
  // Smrť rieši volajúci (handleDeaths) – niektoré efekty ju odkladajú za sériu zásahov.
  function powerHit(state, sides, target, targetPid, dmg, from, events) {
    dmg = dealDmg(state, sides, target, dmg, targetPid, events);
    events.push({ type: "powerDmg", pid: targetPid, uid: target.uid, n: dmg, from });
    pushHp(events, targetPid, target);
  }

  // Damage schopnosti škáluje so stupňom (×1/×2/×3) + Živelná sila hráča.
  function scaledPowerDmg(state, pid, fx, m) {
    return fx.n * m + state[pid].dmgBoost;
  }

  // Trvalý rast z boja: bojuje kópia, tak pa/ph zapíš na originál na ploche –
  // ten ide po boji do kôpky (pileCard) a rast cestuje s kartou.
  function growPermanently(state, pid, uid, a, h) {
    const orig = state[pid].board.find(x => x.uid === uid);
    if (!orig) return;
    orig.pa = (orig.pa || 0) + a;
    orig.ph = (orig.ph || 0) + h;
  }

  // Buffne živé príšerky strany, ktoré spĺňajú filter.
  function buffAlive(sides, pid, match, a, h, events) {
    for (const f of sides[pid]) {
      if (f.hp <= 0 || !match(f)) continue;
      buffWithEvent(f, pid, a, h, events);
    }
  }

  // Spustí schopnosť príšerky, ak má daný keyword a nie je umlčaná.
  // Vráti true, ak sa spustila.
  // Spustí VŠETKY schopnosti karty s daným kw (B006 má dve – Pred bojom
  // a Pri smrti). Vráti true, ak sa aspoň jedna spustila.
  function triggerPower(state, sides, pid, inst, kw, events) {
    if (inst.silenced) return false;
    let fired = false;
    for (const pw of instPowers(inst)) {
      if (pw.kw !== kw) continue;
      events.push({ type: "proc", pid, uid: inst.uid, kw });
      applyBattleFx(state, sides, pid, inst, pw.fx, inst.rank, events, kw);
      fired = true;
    }
    return fired;
  }

  // ----- Odložené kliatby z kúziel -----
  // Poradie: Ticho → Ovčia premena → Žabia kliatba → Oslabenie → Blesk; každý
  // typ pre obe strany (začínajúca prvá), až potom ďalší typ.
  function applyPendingCurses(state, sides, first, events) {
    for (const step of [applySilences, applyPolymorphs, applyHexes, applyShrinks, applyBolts]) {
      for (const pid of sideOrder(first)) step(state, sides, pid, events);
    }
  }

  // Ovčia premena: náhodná živá súperova príšerka (nie už Ovečka) sa na tento
  // boj zmení na Ovečku 0/1 – prepíše sa inštancia v bojovej kópii plochy,
  // uid ostáva (UI vymení kartu na mieste). Nie je to damage: štít nepomôže,
  // deathrattle sa nespustí; všetky bojové značky (štít, pierko, Vichor,
  // Obranca, umlčanie) zmiznú spolu s pôvodnou kartou.
  function applyPolymorphs(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.polymorphs > 0) {
      p.polymorphs--;
      const targets = aliveOn(sides, foe).filter(x => x.defId !== "ovecka");
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      const sheep = Cards.byId.ovecka;
      const fromDefId = t.defId, fromRank = t.rank;
      Object.assign(t, {
        defId: "ovecka", rank: 1, atk: sheep.atk, hp: sheep.hp, maxHp: sheep.hp,
        taunt: false, shield: false, revive: false, windfury: false, silenced: false, echo: 0, cloneOf: null,
      });
      events.push({ type: "polymorph", pid: foe, uid: t.uid, fromDefId, fromRank, defId: "ovecka", atk: t.atk, hp: t.hp });
      pushHp(events, foe, t);
    }
  }

  // Ticho: náhodná súperova príšerka SO SCHOPNOSŤOU stratí efekt aj Obrancu.
  function applySilences(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.silences > 0) {
      p.silences--;
      const targets = sides[foe].filter(x =>
        x.hp > 0 && !x.silenced && (Cards.byId[x.defId].power || x.cloneOf || Cards.byId[x.defId].wildAtk || Cards.byId[x.defId].fickle || x.taunt));
      if (!targets.length) {
        events.push({ type: "silenceFizzle", pid });
        continue;
      }
      const t = pick(targets, state.rng);
      t.silenced = true;
      t.taunt = false;
      events.push({ type: "silence", pid: foe, uid: t.uid, defId: t.defId, rank: t.rank });
    }
  }

  // Žabia kliatba: náhodnej súperovej príšerke sa zmení život na 1
  // (nie je to damage, Božský štít nepomôže).
  function applyHexes(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.hexes > 0) {
      p.hexes--;
      const targets = sides[foe].filter(x => x.hp > 1);
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      t.hp = 1;
      events.push({ type: "hex", pid: foe, uid: t.uid, defId: t.defId });
      pushHp(events, foe, t);
    }
  }

  // Oslabenie (D001): náhodná súperova príšerka −a/−h (nie je to damage:
  // Božský štít nepomôže, deathrattle sa nespustí – život min 1).
  function applyShrinks(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.shrinks.length) {
      const sh = p.shrinks.shift();
      const targets = aliveOn(sides, foe);
      if (!targets.length) continue;
      const t = pick(targets, state.rng);
      const da = Math.min(sh.a, t.atk);
      const dh = Math.min(sh.h, t.hp - 1);
      t.atk -= da;
      t.hp -= dh; t.maxHp = Math.max(1, t.maxHp - dh);
      events.push({ type: "shrink", pid: foe, uid: t.uid, defId: t.defId, a: 0 - da, h: 0 - dh });
      pushHp(events, foe, t);
    }
  }

  // Blesk: výboj za BOLT_DMG (+dmgBoost, je to výboj) na náhodnú živú
  // súperovu príšerku; každý nabitý Blesk = samostatný zásah.
  function applyBolts(state, sides, pid, events) {
    const p = state[pid], foe = other(pid);
    while (p.bolts > 0) {
      p.bolts--;
      const targets = aliveOn(sides, foe);
      if (!targets.length) continue;
      powerHit(state, sides, pick(targets, state.rng), foe, BOLT_DMG + p.dmgBoost + firstZapBonus(state, pid, events), undefined, events);
      handleDeaths(state, sides, events);
    }
  }

  // ----- Priebeh boja -----
  // Pred bojom – začínajúca strana prvá, v poradí plochy.
  function runStartFightProcs(state, sides, first, events) {
    for (const pid of sideOrder(first)) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0) triggerPower(state, sides, pid, inst, "startFight", events);
      }
    }
    runEchoProcs(state, sides, first, events);
  }

  // Ozvena (kúzlo): na začiatku boja (po Pred bojom) spustí bojové schopnosti
  // označenej príšerky raz navyše za každé zoslanie – Pri smrti bez smrti,
  // Pred bojom druhýkrát, Pri útoku bez útoku (ako chaos O002, ale vlastná
  // a vybraná). Umlčaná / premenená (Ovečka) nič nespustí. Značka žije na
  // príšerke na ploche do boja; do kôpky sa neprenáša (pileCard).
  const ECHO_KW = ["deathrattle", "startFight", "onAttack", "raceDeath"];
  function echoKws(inst) {
    return [...new Set(instPowers(inst).map(pw => pw.kw).filter(kw => ECHO_KW.includes(kw)))];
  }
  function hasEchoPower(inst) {
    return echoKws(inst).length > 0;
  }
  function runEchoProcs(state, sides, first, events) {
    for (const pid of sideOrder(first)) {
      for (const inst of [...sides[pid]]) {
        for (let i = 0; i < (inst.echo || 0); i++) {
          if (inst.hp <= 0 || inst.silenced) break;
          const kws = echoKws(inst);
          if (!kws.length) break;
          events.push({ type: "echoProc", pid, uid: inst.uid, defId: inst.defId });
          for (const kw of kws) triggerPower(state, sides, pid, inst, kw, events);
          handleDeaths(state, sides, events);
        }
      }
    }
  }

  // Strany sa striedajú v útokoch, kým jedna nemá živé príšerky.
  function runAttackLoop(state, sides, first, events) {
    const ptr = { p1: 0, p2: 0 };
    let attacker = first;
    let guard = BATTLE_CAP; // poistka proti nekonečnému boju (→ remíza)
    runRushAttacks(state, sides, events); // Včielky vyvolané už pred útokmi (Pred bojom)
    while (aliveOn(sides, "p1").length && aliveOn(sides, "p2").length && guard-- > 0) {
      const a = nextAttacker(sides[attacker], ptr, attacker);
      if (!a) break;
      // Vichor (windfury): dva útoky za ťah – druhý len ak prežila prvý.
      const swings = a.windfury ? 2 : 1;
      for (let s = 0; s < swings && a.hp > 0; s++) {
        const ok = performAttack(state, sides, attacker, a, events);
        runRushAttacks(state, sides, events);
        if (!ok) break;
      }
      attacker = other(attacker);
    }
  }

  // Roj (Hmyz – Včielka): vyvolaná Včielka zaútočí HNEĎ, mimo poradia.
  // Jej smrť vyvolá ďalšiu, tá tiež hneď útočí – reťaz celého roja.
  const rushQueue = new WeakMap(); // sides → [{ pid, inst }]
  function queueRush(sides, pid, inst) {
    if (!rushQueue.has(sides)) rushQueue.set(sides, []);
    rushQueue.get(sides).push({ pid, inst });
  }
  function runRushAttacks(state, sides, events) {
    const q = rushQueue.get(sides);
    let guard = BATTLE_CAP;
    while (q && q.length && guard-- > 0) {
      const { pid, inst } = q.shift();
      if (inst.hp <= 0 || !aliveOn(sides, other(pid)).length) continue;
      performAttack(state, sides, pid, inst, events);
    }
  }

  // Ďalší živý útočník v poradí plochy (cyklicky); ukazovateľ sa posunie za neho.
  function nextAttacker(mine, ptr, pid) {
    for (let i = 0; i < mine.length; i++) {
      const cand = mine[(ptr[pid] + i) % mine.length];
      if (cand.hp > 0) {
        ptr[pid] = (mine.indexOf(cand) + 1) % mine.length;
        return cand;
      }
    }
    return null;
  }

  // Jeden útok: „Pri útoku" (dočasný boost; každý útok Vichoru ho spúšťa
  // znova – synergia), výber cieľa (Obrancovia majú prednosť), obojstranný
  // damage. Vráti false, ak útok neprebehol: útočníka zložil vlastný efekt
  // (Ožratý úder) alebo súper nemá živé príšerky.
  function performAttack(state, sides, attacker, a, events) {
    const defender = other(attacker);
    triggerPower(state, sides, attacker, a, "onAttack", events);
    if (a.hp <= 0) return false;
    const enemies = aliveOn(sides, defender);
    if (!enemies.length) return false;
    const taunts = enemies.filter(x => x.taunt);
    const d = pick(taunts.length ? taunts : enemies, state.rng);
    const aDmg = hitDmg(state, a), dDmg = hitDmg(state, d);
    const atkEv = { type: "attack", aPid: attacker, aUid: a.uid, dPid: defender, dUid: d.uid, aDmg, dDmg, aWild: aDmg !== a.atk, dWild: dDmg !== d.atk };
    events.push(atkEv);
    // Vrtkavá koža zmení číslo zásahu – UI ukáže skutočný damage (+ príznak).
    const fk = (inst, dmg) => {
      const n0 = events.length;
      const out = dealDmg(state, sides, inst, dmg, inst === a ? attacker : defender, events);
      const ev = events.slice(n0).find(e => e.type === "fickle");
      return ev ? { n: out, lucky: ev.lucky } : null;
    };
    const aHp0 = a.hp, dHp0 = d.hp;
    const fa = fk(a, dDmg), fd = fk(d, aDmg);
    // Jed (Hmyz – Jedovatá spóra): úder, ktorý prešiel (nie štít), zabije.
    poisonHit(d, dHp0, a, defender, events);
    poisonHit(a, aHp0, d, attacker, events);
    thornsHit(state, sides, d, dHp0, a, attacker, events);
    if (fa) { atkEv.dDmg = fa.n; atkEv.aFickle = fa.lucky ? "lucky" : "bad"; }
    if (fd) { atkEv.aDmg = fd.n; atkEv.dFickle = fd.lucky ? "lucky" : "bad"; }
    pushHp(events, attacker, a);
    pushHp(events, defender, d);
    cleaveSplash(state, sides, attacker, a, d, aDmg, events);
    // Po údere (psík P004 Aport): obaja žijú → polovica zvyšných statov
    // obrancu ide kamarátovi útočníka. Pred handleDeaths – smrti zo zásahu sa
    // riešia až po ňom (obranca, čo padol, už nemá čo ukradnúť: hp <= 0).
    if (d.hp > 0) runAfterAttack(state, sides, attacker, a, d, events);
    // Žihadlo (Hmyz – Včielka, def.diesOnAttack): po vlastnom útoku vždy padne.
    if (a.hp > 0 && !a.silenced && Cards.byId[a.defId].diesOnAttack) {
      a.hp = 0;
      events.push({ type: "sting", pid: attacker, uid: a.uid });
      pushHp(events, attacker, a);
    }
    handleDeaths(state, sides, events);
    return true;
  }

  // Jed: zranený cieľ (hp kleslo) padne a je umlčaný – Pri smrti sa
  // nespustí, Znovuzrodenie / Fénixovo pierko prepadne. Aj cieľ, ktorý by
  // padol zo samotného úderu, je umlčaný. Strážca arény nie.
  function poisonHit(target, hp0, from, pid, events) {
    if (!from.poison || from.silenced || target.boss || target.hp >= hp0) return;
    target.silenced = true;
    target.taunt = false;
    target.revive = false;
    target.hp = Math.min(target.hp, 0);
    events.push({ type: "poison", pid, uid: target.uid, from: from.uid });
  }

  // Tŕne (Hmyz – Roháč, def.thorns = podiel): napadnutý vráti útočníkovi
  // navyše def.thorns × zranenie, ktoré mu útok spôsobil (hore; štít = 0).
  // Len pri obrane, nie keď Roháč útočí sám. Umlčaný nie.
  function thornsHit(state, sides, d, hp0, a, aPid, events) {
    const k = Cards.byId[d.defId].thorns;
    if (!k || d.silenced || a.hp <= 0) return;
    const taken = Math.max(0, hp0 - d.hp);
    const n = Math.ceil(taken * k);
    if (!n) return;
    const dealt = dealDmg(state, sides, a, n, aPid, events);
    events.push({ type: "thorns", pid: aPid, uid: a.uid, from: d.uid, n: dealt });
  }

  // „Po údere" schopnosti útočníka (kw afterAttack) – zatiaľ len Aport.
  function runAfterAttack(state, sides, pid, a, d, events) {
    if (a.silenced) return;
    for (const pw of instPowers(a)) {
      if (pw.kw !== "afterAttack") continue;
      events.push({ type: "proc", pid, uid: a.uid, kw: "afterAttack" });
      applyBattleFx(state, sides, pid, a, pw.fx, a.rank, events, "afterAttack");
    }
  }

  // Číslo zásahu príšerky: útok, alebo pri Divokom údere (O009, def.wildAtk)
  // náhodné číslo z rozsahu okolo útoku (Cards.wildRange: atk−6·m … atk+7·m,
  // bronz 7 → 1–14). Buffy a Pečať rozsah posúvajú. Umlčaná bije napevno.
  // Losuje sa cez state.rng – replay a multiplayer sedia.
  function hitDmg(state, inst) {
    if (!Cards.byId[inst.defId].wildAtk || inst.silenced) return inst.atk;
    const [lo, hi] = Cards.wildRange(inst.atk, inst.rank);
    return randInt(lo, hi, state.rng);
  }

  // Rozmach (cleave, `def.cleave` = šanca 0–1): útok môže zasiahnuť aj
  // SUSEDOV cieľa (podľa slotov na ploche) rovnakým číslom ako hlavný úder.
  // Ogrí endgame – rasa mala dovtedy pomalý záver; damage rastie so statmi
  // útočníka, šanca je fixná a NEnásobí sa evolve stupňom. Bez suseda sa
  // nehádže vôbec (nemíňa sa roll, boj ostáva deterministický rovnako
  // na oboch klientoch). Umlčaná príšerka Rozmach stráca.
  function cleaveSplash(state, sides, attacker, a, d, dmg, events) {
    const chance = Cards.byId[a.defId].cleave;
    if (!chance || a.silenced) return;
    const defender = other(attacker);
    const hit = aliveOn(sides, defender).filter(x => x !== d && Math.abs(x.slot - d.slot) === 1);
    if (!hit.length) return;
    if (state.rng() >= chance) return;
    events.push({ type: "cleave", pid: attacker, uid: a.uid, targetPid: defender, uids: hit.map(x => x.uid), n: dmg });
    for (const x of hit) {
      dealDmg(state, sides, x, dmg, defender, events);
      pushHp(events, defender, x);
    }
  }

  // ----- Vyhodnotenie a upratanie -----
  function battleWinner(sides) {
    const alive1 = aliveOn(sides, "p1").length, alive2 = aliveOn(sides, "p2").length;
    if (alive1 && !alive2) return "p1";
    if (alive2 && !alive1) return "p2";
    return null;
  }

  // Hrdina porazeného dostane damage = súčet TIEROV preživších príšeriek
  // víťaza (evolve stupeň nehrá rolu), zhora orezaný stropom kola
  // (heroDmgCap). Obe strany prázdne alebo limit ťahov = remíza bez damage.
  function resolveBattleOutcome(state, sides, events) {
    const winner = battleWinner(sides);
    if (!winner) {
      events.push({ type: "battleDraw" });
      return;
    }
    const raw = aliveOn(sides, winner).reduce((sum, x) => sum + Cards.byId[x.defId].tier, 0);
    const cap = heroDmgCap(state.round);
    const loser = other(winner);
    // Štít hrdinu: zapnutý štít zablokuje celé zranenie a spotrebuje sa.
    const shielded = !!state[loser].heroShieldArmed && hasTrinket(state, loser, "heroShield");
    if (shielded) state[loser].heroShieldArmed = false;
    const dmg = shielded ? 0 : Math.min(raw, cap);
    state[loser].hp -= dmg;
    events.push({ type: "heroDmg", pid: loser, dmg, hp: state[loser].hp, raw, capped: !shielded && raw > dmg ? cap : null, shielded });
    // Liečivé víťazstvo: víťaz +HEAL_WIN HP (po strop).
    if (hasTrinket(state, winner, "healWin")) {
      const w = state[winner];
      const heal = Math.min(HEAL_WIN, (w.maxHp || HERO_HP) - w.hp);
      if (heal > 0) { w.hp += heal; events.push({ type: "heal", pid: winner, n: heal }); }
    }
  }

  // Po boji ide VŠETKO (padlé aj preživšie karty) do discard pile a plocha
  // sa vyprázdni – každé kolo sa bojisko stavia nanovo. Tokeny miznú z hry.
  // Jednorazové bojové chargy a buffy končia; dmgBoost (Živelná sila) je trvalý.
  function clearBoards(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      const p = state[pid];
      p.summonCharge = 0; // nabitá summon charga (U007) platí len tento boj
      p.fightRaceBuffs = {}; // dračie buffy „do konca boja"
      p.fightTokenBuffs = {}; // bojové buffy tokenov (U002)
      p.graveUsed = false; // Hrobárova lopata platí raz za boj
      p.firstBoneUsed = false; p.zapUsed = false; // Kostená odplata, Prvý výboj – raz za boj
      p.kuklaSummoned = false; // Hmyz: Kukla zo šance pri smrti – raz za boj
      if (state.mutator === "bloodMoon" || hasTrinket(state, pid, "bloodMoon")) applyBloodMoon(p, sides[pid], events);
      for (const inst of p.board) {
        if (Cards.byId[inst.defId].token) continue;
        p.discard.push(pileCard(inst));
        events.push({ type: "toDiscard", pid, defId: inst.defId });
      }
      p.board = [];
    }
  }

  // Mutácia „bloodMoon": preživšie príšerky +1/+1 NAVŽDY (permanentný rast
  // pa/ph cestuje s kópiou karty cez balíček; tokeny aj tak miznú).
  function applyBloodMoon(p, side, events) {
    for (const f of side) {
      if (f.hp <= 0) continue;
      const inst = p.board.find(x => x.uid === f.uid);
      if (!inst || Cards.byId[inst.defId].token) continue;
      inst.pa = (inst.pa || 0) + 1;
      inst.ph = (inst.ph || 0) + 1;
      events.push({ type: "bloodMoon", pid: p.id, uid: inst.uid, defId: inst.defId });
    }
  }

  // Koniec hry, keď niekto klesol na 0 (obaja = remíza); inak nové kolo.
  function advanceAfterBattle(state, events) {
    const dead1 = state.p1.hp <= 0, dead2 = state.p2.hp <= 0;
    if (dead1 || dead2) {
      state.phase = "over";
      state.winner = dead1 && dead2 ? "draw" : dead1 ? "p2" : "p1";
      events.push({ type: "gameOver", winner: state.winner });
      return;
    }
    state.phase = "shop";
    events.push(...startRound(state));
    events.push({ type: "shopTurn", pid: state.active });
  }

  // ----- Efekty v boji (Pred bojom / Pri smrti / Pri útoku) -----
  // kw: keyword, ktorý efekt spustil – Živelná sila (dmgBoost) zosilňuje
  // okrem výbojov a výbuchov aj útočný bonus „Pri útoku" (E004).
  function applyBattleFx(state, sides, pid, self, fx, rank, events, kw) {
    const handler = BATTLE_FX[fx.type];
    if (handler) handler({ state, sides, pid, self, fx, m: rank, events, kw });
  }

  // Výbuch: jedna vlna zasiahne všetkých živých na strane NARAZ (jeden event
  // pre UI – žiadne projektily po jednom). Štít vlnu zruší.
  function aoeWave(state, sides, side, dmg, from, events) {
    const hits = [];
    for (const t of aliveOn(sides, side)) {
      if (t.shield) {
        t.shield = false;
        events.push({ type: "shieldPop", pid: side, uid: t.uid });
        continue;
      }
      t.hp -= fickleDmg(state, sides, t, dmg, side, events);
      hits.push({ uid: t.uid, hp: t.hp });
    }
    if (hits.length) events.push({ type: "aoeDmg", pid: side, n: dmg, from, hits });
  }

  // Token vyvolaný v boji: stupeň rodiča (staty ×2/×4), aury z makeInst,
  // dračí buff „do konca boja" (fightRaceBuffs) a bojový buff tokenu (U002).
  function makeFightToken(state, p, tokenId, rank) {
    const tok = makeInst(state, tokenId, rank, p);
    const race = Cards.byId[tokenId].race;
    for (const b of [race && p.fightRaceBuffs[race], p.fightTokenBuffs[tokenId]]) {
      if (b && (b.a || b.h)) buff(tok, b.a, b.h);
    }
    // Trinkety: Silné tokeny +1/+1, Vypasené mláďatá +1/+1, Ostré kosti +1/+0.
    if (hasTrinket(state, p.id, "strongTokens")) buff(tok, 1, 1);
    if (PUP_TOKENS.has(tokenId) && hasTrinket(state, p.id, "beastPups")) buff(tok, 1, 1);
    if (tokenId === "kostik" && hasTrinket(state, p.id, "undeadBones")) buff(tok, 1, 0);
    if (tokenId === "kostik" && hasTrinket(state, p.id, "undeadTauntBones")) tok.taunt = true; // Kostená stráž
    return tok;
  }

  // Búrkový mrak: pred každým bojom jeden Blesk navyše (cez p.bolts – ide
  // v poradí kliatieb ako kúpený Blesk, Živelná sila ho zosilňuje).
  function chargeStorms(state, first, events) {
    for (const pid of sideOrder(first)) {
      if (!hasTrinket(state, pid, "elemStorm")) continue;
      state[pid].bolts++;
      events.push({ type: "trinketProc", pid, id: "elemStorm" });
    }
  }

  // Zákon svorky: keď padne vlastné Zviera, náhodné živé (ne-tokenové) Zviera
  // dostane +1/+1 NAVŽDY (pa/ph na origináli ako B004).
  function runPackBonus(state, sides, pid, dead, events) {
    if (!hasTrinket(state, pid, "beastPack") || !isRace(state, pid, Cards.byId[dead.defId], "beast")) return;
    const cands = sides[pid].filter(f => f !== dead && f.hp > 0 && !Cards.byId[f.defId].token
      && isRace(state, pid, Cards.byId[f.defId], "beast"));
    if (!cands.length) return;
    const f = pick(cands, state.rng);
    events.push({ type: "trinketProc", pid, id: "beastPack", uid: f.uid });
    buffWithEvent(f, pid, 1, 1, events);
    growPermanently(state, pid, f.uid, 1, 1);
  }

  // Token z trinketu (Bublina, Kostík) – bez summon chargí a Hrobárovej
  // lopaty (tie patria kartám); plná plocha = nič. `want` = želaný slot
  // (obsadený → najbližší voľný smerom doľava, potom doprava); do poľa
  // ide podľa slotu, aby poradie útokov sedelo s plochou.
  function trinketSummon(state, sides, pid, tokenId, want, events) {
    const alive = aliveOn(sides, pid);
    if (alive.length >= BOARD_MAX) return;
    const taken = new Set(alive.map(x => x.slot));
    let slot = -1;
    for (let d = 0; d < BOARD_MAX && slot < 0; d++) {
      for (const c of [want - d, want + d]) if (c >= 0 && c < BOARD_MAX && !taken.has(c)) { slot = c; break; }
    }
    const tok = makeFightToken(state, state[pid], tokenId, 1);
    tok.slot = slot;
    const board = sides[pid];
    const at = board.findIndex(x => x.hp > 0 && x.slot > slot);
    board.splice(at < 0 ? board.length : at, 0, tok);
    events.push({ type: "summon", pid, uid: tok.uid, defId: tokenId, slot: tok.slot, rank: tok.rank, atk: tok.atk, hp: tok.hp });
    huntToken(state, sides, pid, tok, events);
  }

  // Prvý výboj (trinket Živlov): prvý cielený výboj strany v boji (výboj
  // karty, Blesk, lovec tokenov) +2. AoE výbuchy sa nerátajú.
  function firstZapBonus(state, pid, events) {
    const p = state[pid];
    if (!hasTrinket(state, pid, "elemZap") || p.zapUsed) return 0;
    p.zapUsed = true;
    events.push({ type: "trinketProc", pid, id: "elemZap" });
    return 2;
  }

  // Lovecká značka: keď padne vlastné Zviera (aj token), každé živé označené
  // Zviera dostane +1/+1 za každú značku – do konca boja, s Majstrom lovu
  // (beastHunt2) navždy (pa/ph na origináli).
  function runHuntMarks(state, sides, pid, dead, events) {
    if (!isRace(state, pid, Cards.byId[dead.defId], "beast")) return;
    const perm = hasTrinket(state, pid, "beastHunt2");
    for (const f of sides[pid]) {
      if (f === dead || f.hp <= 0 || !f.hunt) continue;
      events.push({ type: "trinketProc", pid, id: perm ? "beastHunt2" : "beastHunt", uid: f.uid });
      buffWithEvent(f, pid, f.hunt, f.hunt, events);
      if (perm) growPermanently(state, pid, f.uid, f.hunt, f.hunt);
    }
  }

  // Efekty boja podľa fx.type. Kontext: state, sides (kópie plôch), pid
  // (strana zdroja), self (zdroj), fx, m (stupeň = násobič), events, kw.
  const BATTLE_FX = {
    // Výboj mieri na NÁHODNÉHO živého nepriateľa. Evolve škáluje POČET
    // zásahov (1/2/3), nie silu.
    dmgWeakEnemy({ state, sides, pid, self, fx, m, events }) {
      const foe = other(pid);
      const hitDmg = fx.n + state[pid].dmgBoost;
      // Počet zásahov = stupeň (1/2/3); fx.hits ho prebije (Bublina: vždy 1 –
      // strieborná E002 vyvoláva tokeny stupňa 2, no každý má strieľať raz).
      for (let i = 0; i < (fx.hits || m); i++) {
        const enemies = aliveOn(sides, foe);
        if (!enemies.length) break;
        powerHit(state, sides, pick(enemies, state.rng), foe, hitDmg + firstZapBonus(state, pid, events), self.uid, events);
        handleDeaths(state, sides, events);
      }
    },
    // Výbuch na všetkých nepriateľov. Damage škáluje so stupňom (×1/×2/×3) –
    // držať base nízko, nech nevypne swarm úplne.
    dmgAllEnemies({ state, sides, pid, self, fx, m, events }) {
      aoeWave(state, sides, other(pid), scaledPowerDmg(state, pid, fx, m), self.uid, events);
      handleDeaths(state, sides, events);
    },
    // Ogr O003: chaos výbuch – VŠETKY živé príšerky na OBOCH stranách vrátane
    // seba (friendly fire je súčasť zábavy).
    dmgAllBoth({ state, sides, pid, self, fx, m, events }) {
      const dmg = scaledPowerDmg(state, pid, fx, m);
      for (const side of ["p1", "p2"]) aoeWave(state, sides, side, dmg, self.uid, events);
      handleDeaths(state, sides, events);
    },
    // O002 (Pred bojom): n× vyber náhodnú živú príšerku z OBOCH strán s bojovou
    // schopnosťou a spusti ju hneď – deathrattle bez smrti, Pred bojom
    // druhýkrát, Pri útoku… Chaos: súperov deathrattle mu dá tokeny zadarmo.
    // Iné chaos spúšťače (a seba) preskočí – žiadna rekurzia.
    triggerRandom({ state, sides, pid, self, fx, m, events }) {
      const BATTLE_KW = ["deathrattle", "startFight", "onAttack", "raceDeath"];
      for (let i = 0; i < fx.n * m; i++) {
        const pool = [];
        for (const sp of isCareful(state, pid) ? [pid] : ["p1", "p2"]) { // Opatrný ogr: len vlastné
          for (const x of sides[sp]) {
            if (x === self || x.hp <= 0 || x.silenced) continue;
            for (const pw of instPowers(x)) {
              if (!BATTLE_KW.includes(pw.kw) || pw.fx.type === "triggerRandom") continue;
              pool.push({ x, sp, pw });
            }
          }
        }
        if (!pool.length) break;
        const { x, sp, pw } = pick(pool, state.rng);
        events.push({ type: "chaosTrigger", pid, uid: self.uid, targetPid: sp, targetUid: x.uid, targetDefId: x.defId, kw: pw.kw });
        if (sp !== pid) backstab(state, pid, events, sides); // spustil súperovu = backstab
        triggerPower(state, sides, sp, x, pw.kw, events);
        handleDeaths(state, sides, events); // Ožratý úder / výboje mohli niekoho zložiť
      }
    },
    // Ogr O006 (Pri útoku): 50 % šanca, že sa trafí sám za ½ svojho útoku.
    // Šanca 50 %; zásah do seba klesá so stupňom: ½ / ¼ / ⅛ útoku
    // (evolvnutý ogor sa trafí slabšie – menej backstab Pečatí, nerf ogrov).
    drunkStrike({ state, sides, pid, self, m, events }) {
      if (isCareful(state, pid) || state.rng() >= 0.5) return; // Opatrný ogr sa netrafí
      const dmg = Math.floor(self.atk / 2 ** Math.min(m || 1, 3));
      if (dmg <= 0) return;
      dealDmg(state, sides, self, dmg, pid, events);
      events.push({ type: "drunkHit", pid, uid: self.uid, n: dmg });
      pushHp(events, pid, self);
      handleDeaths(state, sides, events);
      backstab(state, pid, events, sides); // trafil sám seba = backstab
    },
    // Ogr O007 (Pri smrti): veľký zásah ÚPLNE náhodnej živej príšerke –
    // hocijakej na ploche, aj vlastnej (ruská ruleta).
    dmgRandomAny({ state, sides, pid, self, fx, m, events }) {
      // Strana sa losuje ČISTÝM hodom mincou 50/50, nie rovnomerne
      // cez všetky príšerky – inak by šanca na vlastný zásah závisela od počtu
      // tiel na plochách a backstab by bol nespoľahlivý. Prázdna strana =
      // zásah ide na druhú (efekt nikdy neprepadne naprázdno).
      let side = isCareful(state, pid) ? other(pid) : state.rng() < 0.5 ? pid : other(pid); // Opatrný ogr: vždy súper, polovičný zásah
      if (!aliveOn(sides, side).length) side = other(side);
      const targets = aliveOn(sides, side);
      if (!targets.length) return;
      const t = pick(targets, state.rng);
      powerHit(state, sides, t, side, ogreBonus(state, pid, fx.n * m) + state[pid].dmgBoost, self.uid, events);
      handleDeaths(state, sides, events);
      if (side === pid) backstab(state, pid, events, sides); // trafil vlastnú = backstab
    },
    // Ogr O010 Ogrí hazard (Pred bojom): hod mincou. Hlava: Pečať +oa/+oh
    // VŠETKÝM Ogrom (permanentná aura, živé ogry hneď). Chvost: Pečať +a/+h
    // rase NÁHODNEJ súperovej príšerky – súper dostane trvalú auru; je to
    // backstab (pomohol som súperovi), takže Ogri dostanú aj +1/+1. Bez
    // súperovej príšerky s rasou nie je komu dať – hod padá vždy na hlavu.
    // Evolve násobí obe Pečate (m). Losuje sa cez state.rng (replay sedí).
    ogreGamble({ state, sides, pid, self, fx, m, events }) {
      const foe = other(pid);
      const foes = aliveOn(sides, foe).filter(f => !!Cards.byId[f.defId].race);
      const heads = isCareful(state, pid) || state.rng() < 0.5; // Opatrný ogr: vždy hlava, Pečať polovičná
      if (!heads && foes.length) {
        const target = foes[Math.floor(state.rng() * foes.length)];
        const race = Cards.byId[target.defId].race;
        const a = fx.a * m, h = fx.h * m;
        addRaceAura(state[foe], race, a, h);
        buffAlive(sides, foe, f => isRace(state, foe, Cards.byId[f.defId], race), a, h, events);
        events.push({ type: "ogreGamble", pid, uid: self.uid, heads: false, race, a, h });
        events.push({ type: "futureBuff", pid: foe, race, a, h });
        backstab(state, pid, events, sides); // Pečať súperovi = backstab
      } else {
        const a = ogreBonus(state, pid, fx.oa * m), h = ogreBonus(state, pid, fx.oh * m);
        addRaceAura(state[pid], "ogre", a, h);
        buffAlive(sides, pid, f => isRace(state, pid, Cards.byId[f.defId], "ogre"), a, h, events);
        events.push({ type: "ogreGamble", pid, uid: self.uid, heads: true, race: "ogre", a, h });
        events.push({ type: "futureBuff", pid, race: "ogre", a, h });
      }
    },
    // ----- Psíci -----
    // P002 Pri smrti: Pohladkanie do balíčka (spojí sa na začiatku ďalšieho
    // ťahu – checkEvolve v beginShopTurn).
    addPet({ state, pid, fx, m, events }) {
      addPets(state, state[pid], fx.n * m, fx.rank || 1, events);
    },
    // P004 (Po údere): súper prežil → n×stupeň Pohladkaní do balíčka.
    petIfSurvive({ state, pid, fx, m, events }) {
      addPets(state, state[pid], fx.n * m, 1, events);
    },
    // P003 Ocikaj: m náhodných živých súperov (každý raz za boj – flag
    // `peed`) má útok aj životy na polovicu, zaokrúhlené HORE (1 ostane 1).
    // Nie je to damage: štít nepomôže, Pri smrti sa nespustí.
    halveEnemy({ state, sides, pid, self, m, events }) {
      const foe = other(pid);
      for (let i = 0; i < m; i++) {
        const targets = aliveOn(sides, foe).filter(x => !x.peed && !x.boss); // ∞ / 2 = ∞
        if (!targets.length) break;
        const t = pick(targets, state.rng);
        t.peed = true;
        const na = Math.ceil(t.atk / 2), nh = Math.ceil(t.hp / 2);
        const da = t.atk - na, dh = t.hp - nh;
        t.atk = na; t.hp = nh; t.maxHp = Math.max(nh, t.maxHp - dh);
        events.push({ type: "pee", pid: foe, uid: t.uid, defId: t.defId, rank: t.rank, from: self.uid, a: 0 - da, h: 0 - dh });
        pushHp(events, foe, t);
      }
    },
    // P006 Zavýjanie: všetci živí Psíci (aj sám) +a·m/+h·m za KAŽDÉHO živého
    // Psíka na ploche – 5 psov = +5/+5 každému. Dočasné.
    howl({ state, sides, pid, fx, m, events }) {
      const dogs = aliveOn(sides, pid).filter(f => isRace(state, pid, Cards.byId[f.defId], "doggy"));
      const n = dogs.length;
      if (!n) return;
      for (const f of dogs) buffWithEvent(f, pid, fx.a * m * n, fx.h * m * n, events);
    },
    // Rast seba; perm (B004) = rast NAVŽDY aj z boja (na originál na ploche).
    growSelf({ state, pid, self, fx, m, events }) {
      buffWithEvent(self, pid, fx.a * m, fx.h * m, events);
      if (fx.perm) growPermanently(state, pid, self.uid, fx.a * m, fx.h * m);
    },
    // Dočasný buff kamarátok. Živel „Pri útoku" (E004) škáluje so Živelnou
    // silou – bonus sa nenásobí stupňom a ide len na stat, ktorý buff dáva.
    buffAllFriends({ state, sides, pid, self, fx, m, events, kw }) {
      const boost = kw === "onAttack" && Cards.byId[self.defId].race === "elemental" ? state[pid].dmgBoost : 0;
      const a = fx.a * m + (fx.a ? boost : 0);
      const h = fx.h * m + (fx.h ? boost : 0);
      buffAlive(sides, pid, f => f !== self, a, h, events);
    },
    // Permanentná aura položená uprostred boja (U010, Pri smrti): živé
    // príšerky rasy na ploche hneď, budúce inštancie cez raceBuffs pri vzniku.
    // Prežije boj – je to aura.
    futureRace({ state, sides, pid, fx, m, events }) {
      const a = fx.a * m, h = fx.h * m;
      addRaceAura(state[pid], fx.race, a, h);
      buffAlive(sides, pid, f => isRace(state, pid, Cards.byId[f.defId], fx.race), a, h, events);
      events.push({ type: "futureBuff", pid, race: fx.race, a, h });
    },
    // Drak (Pred bojom): tvoja NAJPOČETNEJŠIA rasa na ploche +a/+h. Ako všetky
    // dračie ne-aura buffy platí na CELÉ kolo: zapíše sa do fightRaceBuffs,
    // takže ho dostanú aj tokeny vyvolané neskôr v boji.
    buffTopRace({ state, sides, pid, self, fx, m, events }) {
      const counts = {};
      for (const f of aliveOn(sides, pid)) {
        const r = Cards.byId[f.defId].race;
        if (r) counts[r] = (counts[r] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top) return;
      const pb = pactBonus(state, state[pid], self);
      const race = top[0], a = fx.a * m + pb, h = fx.h * m + pb;
      buffAlive(sides, pid, f => isRace(state, pid, Cards.byId[f.defId], race), a, h, events);
      addFightRaceBuff(state[pid], race, a, h);
    },
    // Rasová synergia v boji – živé príšerky rovnakej rasy (okrem seba).
    // Dočasné buffy Živlov škáluje Živelná sila (ako v nákupnej fáze).
    // fx.lasting (B001 Pri smrti): buff platí do konca boja aj pre príšerky
    // rasy, ktoré prídu neskôr (Mláďatá z B007/B005) – cez fightRaceBuffs,
    // rovnako ako dračí buffTopRace.
    buffRace({ state, sides, pid, self, fx, m, events }) {
      const boost = Cards.byId[self.defId].race === "elemental" ? state[pid].dmgBoost : 0;
      const { a, h } = elementalBonus(fx, m, boost);
      buffAlive(sides, pid, f => f !== self && isRace(state, pid, Cards.byId[f.defId], fx.race), a, h, events);
      if (fx.lasting) addFightRaceBuff(state[pid], fx.race, a, h);
    },
    // Vyvolanie tokenov vedľa zdroja. Evolvnutá karta vyvoláva VIAC tokenov
    // (+1 za každý stupeň: striebro n+1, zlato n+2), tokeny majú vždy
    // základné staty (stupeň 1) – horda namiesto veľkých tokenov. summonCharge
    // (U007) jednorazovo pridá +n tokenov, potom sa minie. Pretečenie
    // (undead): token, čo sa nezmestí na plnú plochu, dá celé staty jednej
    // náhodnej živej vlastnej príšerke; iné rasy pri plnej ploche končia.
    summon({ state, sides, pid, self, fx, m, events }) {
      const board = sides[pid];
      const idx = board.indexOf(self);
      const p = state[pid];
      let count = fx.n + (m - 1) + p.summonCharge;
      p.summonCharge = 0;
      // Hrobárova lopata: prvé vyvolanie v boji vyvolá o 1 viac.
      if (hasTrinket(state, pid, "undeadGrave") && !p.graveUsed) {
        p.graveUsed = true;
        count++;
        events.push({ type: "trinketProc", pid, id: "undeadGrave" });
      }
      const overflows = Cards.byId[fx.token].race === "undead";
      for (let i = 0; i < count; i++) {
        const alive = aliveOn(sides, pid);
        const full = alive.length >= BOARD_MAX;
        if (full && !overflows) break;
        const tok = makeFightToken(state, p, fx.token, 1);
        if (full) {
          overflowStats(state, alive, tok, pid, events);
          continue;
        }
        tok.slot = freeSlot(alive, BOARD_MAX);
        board.splice(idx + 1 + i, 0, tok);
        events.push({ type: "summon", pid, uid: tok.uid, defId: fx.token, slot: tok.slot, rank: tok.rank, atk: tok.atk, hp: tok.hp });
        huntToken(state, sides, pid, tok, events);
      }
    },
    // ----- Hmyz (experiment) -----
    // Včielka (Pri smrti): náhodný Hmyz v balíčku/kôpke +a/+h navždy.
    deckGrow({ state, pid, fx, m, events }) {
      const p = state[pid];
      const refs = insectRefs(p);
      if (!refs.length) return;
      const c = pick(refs, state.rng);
      growCard(c, fx.a * m, fx.h * m, false);
      events.push({ type: "deckGrow", pid, defId: c.defId, a: fx.a * m, h: fx.h * m });
    },
    // Kobylka (Pred bojom): +a/+h za každého iného živého kamaráta rasy.
    growPerRace({ state, sides, pid, self, fx, m, events }) {
      const n = aliveOn(sides, pid).filter(f => f !== self && isRace(state, pid, Cards.byId[f.defId], fx.race)).length;
      if (n) buffWithEvent(self, pid, fx.a * m * n, fx.h * m * n, events);
    },
    // Svätojánska muška (Pred bojom): náhodný iný živý Hmyz +X·a/+X·h,
    // X = kópie karty fx.of (Húsenice) v balíčku.
    buffRandomSwarm({ state, sides, pid, self, fx, events }) {
      const cands = aliveOn(sides, pid).filter(f => f !== self && Cards.byId[f.defId].race === "insect");
      const x = copiesOwned(state[pid], fx.of);
      if (!cands.length || !x) return;
      buffWithEvent(pick(cands, state.rng), pid, fx.a * x, fx.h * x, events);
    },
    // Hmyz (Pri smrti, pravidlo rasy): so šancou fx.chance vyvolá bojovú
    // kópiu hráčovej Kukly (aktuálne staty s rastom); bez Kukly základnú.
    // Raz za boj (p.kuklaSummoned, nuluje clearBoards) – po vyvolaní už šanca nepadá.
    summonKukla({ state, sides, pid, self, fx, events }) {
      const p = state[pid];
      if (p.kuklaSummoned) return;
      if (state.rng() >= fx.chance) return;
      const alive = aliveOn(sides, pid);
      if (alive.length >= BOARD_MAX) return;
      p.kuklaSummoned = true;
      const k = findKukla(p);
      const inst = makeInst(state, KUKLA_ID, 1, p);
      if (k) buff(inst, k.c.pa || 0, k.c.ph || 0);
      const fb = fightBuffFor(state, p, Cards.byId[KUKLA_ID]);
      if (fb && (fb.a || fb.h)) buff(inst, fb.a, fb.h);
      inst.slot = freeSlot(alive, BOARD_MAX);
      sides[pid].splice(sides[pid].indexOf(self) + 1, 0, inst);
      events.push({ type: "summon", pid, uid: inst.uid, defId: KUKLA_ID, slot: inst.slot, rank: 1, atk: inst.atk, hp: inst.hp });
    },
    // Včielka (Pri smrti): bojová kópia ĎALŠEJ karty fx.of z balíčka/kôpky,
    // ktorá v tomto boji ešte nebola (každá kópia raz). Zaútočí HNEĎ
    // (runRushAttacks) a po útoku padne → ďalšia – celý roj naraz.
    // Kópia nesie svoj rast (pa/ph), Pečate a roj.
    summonDeckCopy({ state, sides, pid, self, fx, events }) {
      const p = state[pid];
      const alive = aliveOn(sides, pid);
      if (alive.length >= BOARD_MAX) return;
      let used = summonedRefs.get(sides);
      if (!used) summonedRefs.set(sides, used = new Set());
      const c = [...p.deck, ...p.discard].find(x => x.defId === fx.of && !used.has(x));
      if (!c) return;
      used.add(c);
      const inst = makeInst(state, c.defId, c.rank, p);
      if (c.pa || c.ph) buff(inst, c.pa || 0, c.ph || 0);
      withSwarm(p, inst);
      const fb = fightBuffFor(state, p, Cards.byId[c.defId]);
      if (fb && (fb.a || fb.h)) buff(inst, fb.a, fb.h);
      inst.slot = freeSlot(alive, BOARD_MAX);
      sides[pid].splice(sides[pid].indexOf(self) + 1, 0, inst);
      events.push({ type: "summon", pid, uid: inst.uid, defId: c.defId, slot: inst.slot, rank: inst.rank, atk: inst.atk, hp: inst.hp });
      queueRush(sides, pid, inst); // zaútočí hneď (roj)
    },
    // Kráľovná (Pri smrti): Pečať +a/+h všetkým kartám fx.of (Včielkam) –
    // aj budúcim (p.cardBuffs v makeInst); živé v boji hneď.
    imprintCard({ state, sides, pid, fx, events }) {
      const p = state[pid];
      p.cardBuffs = p.cardBuffs || {};
      const cb = p.cardBuffs[fx.of] || (p.cardBuffs[fx.of] = { a: 0, h: 0 });
      cb.a += fx.a; cb.h += fx.h;
      buffAlive(sides, pid, f => f.defId === fx.of, fx.a, fx.h, events);
      events.push({ type: "cardImprint", pid, defId: fx.of, a: fx.a, h: fx.h });
    },
  };

  // Lovci tokenov (onEnemySummon, E005): súperove živé príšerky s týmto
  // keywordom zasiahnu čerstvo vyvolaný token výbojom (n×stupeň + Živelná
  // sila); ak token padne, lovec rastie NAVŽDY (pa/ph na origináli, ako
  // B004). Každý lovec strieľa LEN RAZ ZA BOJ – na prvý vyvolaný token
  // (flag `hunted` na bojovej kópii); rast bez stropu za každý kostík
  // snowballoval proti undead. Pretečenie sem nejde – token, čo sa
  // nezmestil, nie je na ploche.
  function huntToken(state, sides, tokPid, tok, events) {
    const hunterPid = other(tokPid);
    let hit = false;
    for (const h of sides[hunterPid]) {
      if (tok.hp <= 0) break;
      if (h.hp <= 0 || h.silenced || h.hunted) continue;
      const pw = Cards.byId[h.defId].power;
      if (!pw || pw.kw !== "onEnemySummon") continue;
      const fx = pw.fx, m = h.rank;
      h.hunted = true;
      events.push({ type: "proc", pid: hunterPid, uid: h.uid, kw: "onEnemySummon" });
      powerHit(state, sides, tok, tokPid, scaledPowerDmg(state, hunterPid, fx, m) + firstZapBonus(state, hunterPid, events), h.uid, events);
      hit = true;
      if (tok.hp <= 0) {
        buffWithEvent(h, hunterPid, fx.a * m, fx.h * m, events);
        growPermanently(state, hunterPid, h.uid, fx.a * m, fx.h * m);
      }
    }
    if (hit) handleDeaths(state, sides, events);
  }

  // Pretečenie: celé staty nezmestivšieho sa tokenu dostane JEDNA náhodná
  // živá vlastná príšerka (výber z rng, aby bol multiplayer deterministický).
  // Dočasné ako všetky bojové buffy.
  function overflowStats(state, aliveList, tok, pid, events) {
    if (!aliveList.length) return;
    const f = pick(aliveList, state.rng);
    events.push({ type: "overflow", pid, defId: tok.defId, atk: tok.atk, hp: tok.hp });
    if (!tok.atk && !tok.hp) return;
    buffWithEvent(f, pid, tok.atk, tok.hp, events);
    // Dvojité pretečenie: staty dostane aj druhá (iná) náhodná príšerka.
    if (hasTrinket(state, pid, "undeadOverflow")) {
      const rest = aliveList.filter(x => x !== f);
      if (rest.length) buffWithEvent(pick(rest, state.rng), pid, tok.atk, tok.hp, events);
    }
  }

  // Božský štít: prvé zranenie sa úplne zruší (štít praskne, staty ostávajú).
  // Vráti skutočne udelený damage (Vrtkavá koža ho mení, štít = 0).
  function dealDmg(state, sides, target, dmg, pid, events) {
    if (dmg <= 0) return 0;
    if (target.shield) {
      target.shield = false;
      events.push({ type: "shieldPop", pid, uid: target.uid });
      return 0;
    }
    dmg = fickleDmg(state, sides, target, dmg, pid, events);
    target.hp -= dmg;
    if (target.boss) target.taken += dmg; // DMG Meter: všetok damage do Strážcu
    return dmg;
  }

  // Vrtkavá koža (O008, def.fickle): každé zranenie v boji 50 % ×0,5 (dole,
  // min. 1), inak ×1,5 (hore) – smolných ×1,5 = backstab (Pečať +1/+1
  // Ogrom). Opatrný ogr (trinket) 1,5× nikdy, bonus polovičný: ×0,75 alebo
  // ×1. Umlčaná príšerka berie damage normálne. Roll cez state.rng.
  function fickleDmg(state, sides, target, dmg, pid, events) {
    if (dmg <= 0 || target.silenced || !Cards.byId[target.defId].fickle) return dmg;
    const lucky = state.rng() < 0.5;
    const careful = isCareful(state, pid);
    const out = lucky
      ? (careful ? Math.ceil(dmg * 0.75) : Math.max(1, Math.floor(dmg / 2)))
      : (careful ? dmg : Math.ceil(dmg * 1.5));
    events.push({ type: "fickle", pid, uid: target.uid, from: dmg, dmg: out, lucky });
    if (!lucky && !careful) backstab(state, pid, events, sides);
    return out;
  }

  // ----- Smrť -----
  // Po každom zásahu prejde obe strany. Poradie pre UI: proc badge + efekt,
  // kým je karta ešte vidno, potom smrť.
  function handleDeaths(state, sides, events) {
    for (const pid of ["p1", "p2"]) {
      for (const inst of [...sides[pid]]) {
        if (inst.hp > 0 || inst.dead) continue;
        if (tryPhoenixRevive(state, sides, inst, pid, events)) continue;
        inst.dead = true;
        runDeathrattle(state, sides, pid, inst, events);
        runScavengers(state, sides, pid, inst, events);
        events.push({ type: "die", pid, uid: inst.uid, defId: inst.defId });
        // Kostená odplata: prvá vlastná príšerka, ktorá v boji padne, vyvolá Kostíka.
        if (!inst.boss && hasTrinket(state, pid, "undeadFirstBone") && !state[pid].firstBoneUsed) {
          state[pid].firstBoneUsed = true;
          events.push({ type: "trinketProc", pid, id: "undeadFirstBone" });
          trinketSummon(state, sides, pid, "kostik", inst.slot, events);
        }
      }
    }
  }

  // Fénixovo pierko: smrť sa POČÍTA – Pri smrti aj scavengery (B004/B009)
  // prebehnú – a potom sa príšerka raz vráti s 1 životom (nejde do kôpky,
  // ostáva vo svojom slote). HP sa nastaví ešte PRED Pri smrti, aby tokeny
  // z neho (Mláďa z B007) nezabrali jej slot – freeSlot počíta len živé.
  function tryPhoenixRevive(state, sides, inst, pid, events) {
    if (!inst.revive) return false;
    inst.revive = false;
    inst.hp = 1;
    runDeathrattle(state, sides, pid, inst, events);
    runScavengers(state, sides, pid, inst, events);
    events.push({ type: "revive", pid, uid: inst.uid, defId: inst.defId });
    pushHp(events, pid, inst);
    return true;
  }

  // Pri smrti (deathrattle); mutácia „echoDeath" ho spustí dvakrát.
  function runDeathrattle(state, sides, pid, inst, events) {
    const times = state.mutator === "echoDeath" ? 2 : 1;
    for (let r = 0; r < times; r++) triggerPower(state, sides, pid, inst, "deathrattle", events);
  }

  // Pozorovatelia smrti: Scavenger (raceDeath) rastie, keď padne VLASTNÝ
  // kamarát jeho rasy – B009 „Keď zomrie tvoje Zviera: +2/+2" (dočasne),
  // B004 to isté +1/+1 NAVŽDY (perm). Tokeny majú rasu, Mláďa teda kŕmi oboch.
  function runScavengers(state, sides, pid, dead, events) {
    const ddef = Cards.byId[dead.defId];
    runObservers(state, sides, pid, dead, "raceDeath", fx => isRace(state, pid, ddef, fx.race), events);
    runPackBonus(state, sides, pid, dead, events);
    runHuntMarks(state, sides, pid, dead, events);
    runAbsorbers(state, sides, pid, dead, events);
  }

  // D009 (allyDeath/absorbStats): keď zomrie VLASTNÁ príšerka (nie token),
  // živý D009 dostane jej útok a max. život do konca boja – bronz ¼,
  // striebro ½, zlato celé (zaokrúhlené dole). Nie je to trvalé. 2× na zlate
  // by bolo v endgame prisilné.
  const ABSORB_MULT = [0.25, 0.5, 1];
  function runAbsorbers(state, sides, pid, dead, events) {
    if (Cards.byId[dead.defId].token) return; // tokeny (kostíky, mláďatá…) D009 nekŕmia
    for (const f of sides[pid]) {
      if (f === dead || f.hp <= 0 || f.silenced) continue;
      if (!instPowers(f).some(pw => pw.kw === "allyDeath")) continue;
      const k = ABSORB_MULT[Math.min(f.rank, 3) - 1];
      const a = Math.floor(Math.max(0, dead.atk) * k), h = Math.floor(Math.max(0, dead.maxHp) * k);
      if (!a && !h) continue;
      events.push({ type: "proc", pid, uid: f.uid, kw: "allyDeath" });
      buffWithEvent(f, pid, a, h, events);
    }
  }

  function runObservers(state, sides, pid, dead, kw, matches, events) {
    for (const f of sides[pid]) {
      if (f === dead || f.hp <= 0 || f.silenced) continue;
      if (!instPowers(f).some(pw => pw.kw === kw && matches(pw.fx))) continue;
      triggerPower(state, sides, pid, f, kw, events);
    }
  }

  return {
    HERO_HP, BOARD_MAX, HAND_DRAW, HAND_MAX, CARD_COST, SELL_GAIN, REFRESH_COST, POOL_PRIVATE, POOL_COMMON,
    TIER_MAX, RACE_CAP, MUTATORS, TRINKETS, TRINKET_ROUNDS, TRINKET_FREE_RACES, SUPPORT_RACES, majorityRaces, BOSS_EVERY, BOSS_COUNT, BOSS_STAT, isBossRound, trinketPool, privateCount, income, seededRng, cardCost, refreshCost, spellCost,
    handDraw, heroDmgCap, deckMin, cardCount, swarmBonus, copiesOwned, KUKLA_ID, sellBlocked, hasTrinket, pickTrinket, useHeroShield,
    newGame, pickBan, raceOut, startRound, beginShopTurn, buyCommon, buyPrivate, buySpell, refreshShop,
    toggleFreeze, toggleFreezeAll, upgradeCost, upgradeTier, playMinion, castSpell, pickDiscover,
    sellCard, buyBack, discardCard, moveOnBoard, endShopTurn, doBattle, checkEvolve, checkPetMerge, makeInst, commonTierLimit,
    pileCard, drawCards, rollCard, returnToPool, // pre testy a nástroje (cyklus balíčka, pooly, rollBias)
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
