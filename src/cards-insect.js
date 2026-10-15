// EXPERIMENTÁLNA rasa Hmyz (insect). Načíta sa vždy po cards.js (index.html,
// testy, nástroje) a pridá rasu, karty a texty do Cards / L.cards. V hre je
// LEN keď ju zapne voľba „Hmyz" (Engine.newGame opts.exp = ["insect"]);
// inak engine jej rasu aj karty vynechá (Cards.EXP_RACES → raceOut) a zoznam
// rás pre ban / raceCap je rovnaký ako bez nej (staré záznamy sedia).
//
// Identita: ROJ. Hmyz nemá evolve – kópie sa nespájajú, ale každá ďalšia
// kópia posilní všetky ostatné (swarm = +staty za každú kópiu v balíčku,
// všetky zóny). Druhá os je rast v balíčku: Kukla (6. karta každý ťah,
// nezahraná rastie), Včielka a Mravec zväčšujú karty, čo ležia v balíčku.
//
// Art: assets/cards/<ID>_1.webp (sada gemini_insect; hmyz nemá stupne).
(() => {
  const R = "insect";
  Cards.EXP_RACES = new Set([...(Cards.EXP_RACES || []), R]);
  L.cards.races[R] = { sk: "Hmyz", cs: "Hmyz", en: "Insect" };
  L.cards.racesPl[R] = { sk: "Hmyzu", cs: "Hmyzu", en: "Insects" };
  L.cards.racesNom[R] = { sk: "Hmyz", cs: "Hmyz", en: "Insects" };
  Cards.RACE_ICON[R] = "🐛";

  // Mená hmyzu sa PREKLADAJÚ (iné rasy majú vlastné mená zo sady artu):
  // def.names { sk, cs, en } – Cards.nameOf ich berie prednostne (nižšie).
  // stageNames = SK meno (art, nástroje, staré výpisy).
  const M = (id, tier, names, emoji, atk, hp, extra = {}) =>
    ({ id, tier, race: R, stageNames: [names.sk, names.sk, names.sk], names, atk, hp, emoji, noEvolve: true, ...extra });
  const N = (sk, cs, en) => ({ sk, cs, en });

  const DEFS = [
    // t1 Húsenica: +1/+1 za každú INÚ Húsenicu (5 kópií = 5/5 každá).
    // Pri vyložení: Kukla do balíčka, alebo Kukla +1/+1 navždy.
    M("I001", 1, N("Húsenica", "Housenka", "Caterpillar"), "🐛", 1, 1,
      { swarm: { of: "I001", a: 1, h: 1, others: true },
        power: { kw: "battlecry", fx: { type: "cocoon", a: 1, h: 1 } } }),
    // t1 Včielka: Žihadlo – po vlastnom útoku vždy padne. Pri smrti vyvolá
    // ďalšiu Včielku z balíčka (každú raz za boj), ktorá HNEĎ zaútočí →
    // celý roj zaútočí naraz.
    // fastAnim: UI animuje útok, smrť a vyvolanie zrýchlene (roj 10 Včielok).
    M("I002", 1, N("Včielka", "Včelka", "Bee"), "🐝", 2, 1,
      { diesOnAttack: true, fastAnim: true, power: { kw: "deathrattle", fx: { type: "summonDeckCopy", of: "I002" } } }),
    // t2 Lienka: Pri vyložení Hmyz v ruke +X/+X navždy, X = Lienky v balíčku.
    M("I003", 2, N("Lienka", "Beruška", "Ladybug"), "🐞", 2, 3,
      { power: { kw: "battlecry", fx: { type: "handGrowSwarm", of: "I003", a: 1, h: 1 } } }),
    // t2 Kobylka: Pred bojom +1/+1 za každý iný Hmyz na ploche.
    M("I004", 2, N("Kobylka", "Kobylka", "Grasshopper"), "🦗", 3, 2,
      { power: { kw: "startFight", fx: { type: "growPerRace", race: R, a: 1, h: 1 } } }),
    // t3 Svätojánska muška: Pred bojom náhodný iný Hmyz +X/+X, X = Húsenice.
    M("I005", 3, N("Svätojánska muška", "Světluška", "Firefly"), "✨", 3, 3,
      { power: { kw: "startFight", fx: { type: "buffRandomSwarm", of: "I001", a: 1, h: 1 } } }),
    // t3 Roháč: Obranca, +0/+1 za každý Hmyz v balíčku.
    M("I006", 3, N("Roháč", "Roháč", "Stag Beetle"), "🪲", 2, 5,
      { taunt: true, swarm: { race: R, a: 0, h: 1, others: true } }),
    // t4 Mravec: Po nákupe náhodný Hmyz v balíčku +X/+X navždy, X = Mravce.
    M("I007", 4, N("Mravec", "Mravenec", "Ant"), "🐜", 4, 4,
      { power: { kw: "endTurn", fx: { type: "deckGrowSwarm", of: "I007", a: 1, h: 1 } } }),
    // t5 Osa: Pri vyložení Pečať +1/+1 Hmyzu (fixný damage v neskorej hre
    // nemal význam). Bez evolve – každé vyloženie Pečať zopakuje.
    M("I008", 5, N("Osa", "Vosa", "Wasp"), "🪰", 5, 4,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: R, a: 1, h: 1 } } }),
    // t5 Modlivka: Pri smrti vyvolá Jedovatú spóru (1/1, Jed – zabije
    // a umlčí, čo zraní: Pri smrti ani Znovuzrodenie sa nespustia). Counter
    // na veľké telá (Zvieratá, ogri, rasy s veľkým rastom) aj deathrattle.
    M("I009", 5, N("Modlivka", "Kudlanka", "Mantis"), "🦟", 6, 6,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "spora", n: 1 } } }),
    // t6 Kráľovná: Pri smrti Pečať +1/+1 všetkým Včielkam (aj budúcim).
    M("I010", 6, N("Kráľovná", "Královna", "Queen"), "👑", 7, 7,
      { power: { kw: "deathrattle", fx: { type: "imprintCard", of: "I002", a: 1, h: 1 } } }),
  ];
  // Kukla: generovaná (nie je v obchode), jediná na hráča, Obranca.
  // grow = rast nezahranej Kukly v ruke na konci ťahu, growPlayed = rast
  // vyloženej. Sim (targeted, 50 HP): vyložená +0/+0 → hmyz 38 %, +0/+1 →
  // 50 %, +1/+1 → 67 %, +2/+2 → 83 % – citlivý gombík.
  const KUKLA = { id: "kukla", tier: 1, race: R, stageNames: ["Kukla", "Kukla", "Kukla"], names: N("Kukla", "Kukla", "Cocoon"), atk: 1, hp: 3,
    taunt: true, emoji: "🪺", noEvolve: true, gen: true, grow: { a: 2, h: 2 }, growPlayed: { a: 0, h: 1 } };

  // Roj (pravidlo rasy): KAŽDÝ Hmyz +1/+1 za každú inú svoju kópiu
  // v balíčku (všetky zóny). Húsenica to má priamo v definícii.
  // Varianty pre simuláciu (ideal-sim variant=…, čiarkou):
  //   tier – namiesto +1/+1 je to +T/+T za kópiu (T = tier karty)
  //   race – Húsenica rastie z celého roja: +1/+1 za každé 2 iné Hmyzy
  //   hold4 – nezahraná Kukla +4/+4 (namiesto +2/+2)
  //   always – vyložená Kukla rastie +2/+2 každý ťah (always1: +1/+1, still: +0/+0)
  //   noCocoon – bez 25 % šance na Kuklu pri smrti (porovnanie)
  const V = (typeof EXP_VARIANT === "string" ? EXP_VARIANT : "").split(",");
  for (const d of DEFS) {
    if (d.id === "I001") continue;
    const k = V.includes("tier") ? d.tier : 1;
    d.swarm = [].concat(d.swarm || [], { of: d.id, a: k, h: k, others: true });
  }
  // Jedovatá spóra: token Modlivky – Jed (úder, ktorý zraní, zabije a umlčí).
  L.cards.names.spora = { sk: "Jedovatú spóru", cs: "Jedovatou sporu", en: "Poison Spore" };
  const SPORA = { id: "spora", tier: 1, race: R, emoji: "🍄", atk: 1, hp: 1, token: true, poison: true,
    stageNames: ["Jedovatá spóra", "Jedovatá spóra", "Jedovatá spóra"], // stageNames = art (spora_1.webp)
    names: N("Jedovatá spóra", "Jedovatá spora", "Poison Spore"),
    name: N("Jedovatá spóra", "Jedovatá spora", "Poison Spore") };
  if (V.includes("hold4")) KUKLA.grow = { a: 4, h: 4 };
  if (V.includes("always")) KUKLA.growPlayed = { a: 2, h: 2 };
  if (V.includes("always1")) KUKLA.growPlayed = { a: 1, h: 1 };
  if (V.includes("still")) delete KUKLA.growPlayed;
  // Pravidlo rasy: každý Hmyz (okrem Kukly) má Pri smrti 1/4 šancu vyvolať
  // bojovú kópiu tvojej Kukly – druhá schopnosť (power2) vedľa vlastnej.
  if (!V.includes("noCocoon")) {
    for (const d of DEFS) {
      const pw = { kw: "deathrattle", fx: { type: "summonKukla", chance: 0.25 } };
      if (d.power) d.power2 = pw; else d.power = pw;
    }
  }
  if (V.includes("sporeTaunt")) SPORA.taunt = true;            // varianty spóry
  if (V.includes("spore2")) DEFS.find(d => d.id === "I009").power.fx.n = 2;
  Cards.TOKENS.push(SPORA);
  Cards.byId.spora = SPORA;
  if (V.includes("race")) DEFS[0].swarm = { race: R, a: 1, h: 1, others: true, per: 2 };

  for (const d of [...DEFS, KUKLA]) { Cards.DEFS.push(d); Cards.byId[d.id] = d; }

  // Texty schopností (pracovné, SK = CS = EN tam, kde sa nechce prekladať).
  const t = (sk, cs, en) => ({ sk, cs, en });
  Object.assign(L.cards.fx, {
    cocoon: f => t(`Kukla do balíčka, alebo Kukla +${f.a}/+${f.h} navždy`,
      `Kukla do balíčku, nebo Kukla +${f.a}/+${f.h} navždy`,
      `Cocoon into your deck, or Cocoon +${f.a}/+${f.h} forever`),
    handGrowSwarm: () => t("Hmyz v ruke +X/+X navždy (X = Lienky v balíčku)",
      "Hmyz v ruce +X/+X navždy (X = Berušky v balíčku)",
      "Insects in hand +X/+X forever (X = Ladybugs in deck)"),
    deckGrowSwarm: () => t("náhodný Hmyz v balíčku +X/+X navždy (X = Mravce)",
      "náhodný Hmyz v balíčku +X/+X navždy (X = Mravenci)",
      "random Insect in deck +X/+X forever (X = Ants)"),
    growPerRace: (f, m) => t(`+${f.a * m}/+${f.h * m} za každý iný Hmyz na ploche`,
      `+${f.a * m}/+${f.h * m} za každý další Hmyz na ploše`,
      `+${f.a * m}/+${f.h * m} per other Insect on board`),
    buffRandomSwarm: () => t("náhodný iný Hmyz +X/+X (X = Húsenice v balíčku)",
      "náhodný další Hmyz +X/+X (X = Housenky v balíčku)",
      "random other Insect +X/+X (X = Caterpillars in deck)"),
    summonDeckCopy: () => t("vyvolá ďalšiu Včielku z balíčka, ktorá hneď zaútočí",
      "vyvolá další Včelku z balíčku, která hned zaútočí",
      "summons the next Bee from your deck, it attacks at once"),
    imprintCard: f => t(`Pečať +${f.a}/+${f.h} všetkým Včielkam`,
      `Pečeť +${f.a}/+${f.h} všem Včelkám`,
      `Imprint +${f.a}/+${f.h} to all Bees`),
    summonKukla: f => t(`${Math.round(f.chance * 100)} % šanca vyvolať tvoju Kuklu (raz za boj)`,
      `${Math.round(f.chance * 100)} % šance vyvolat tvou Kuklu (jednou za boj)`,
      `${Math.round(f.chance * 100)}% chance to summon your Cocoon (once per fight)`),
  });

  // Preložené meno (def.names) má prednosť pred stageNames.
  const baseName = Cards.nameOf;
  Cards.nameOf = (def, rank, lang) => def.names ? (def.names[lang] ?? def.names.sk) : baseName(def, rank, lang);

  // Pravidlá hmyzu na karte (pred schopnosťami): Roj, Žihadlo, Jed, Kukla.
  // opts.swarm = aktuálny bonus roja majiteľa (game.js) – ukáže „teraz +X/+Y".
  const X = {
    swarm: { sk: "Roj", cs: "Roj", en: "Swarm" },
    copy: { sk: "za každú inú svoju kópiu", cs: "za každou další svou kopii", en: "per other copy you own" },
    race: { sk: "za každý iný Hmyz", cs: "za každý další Hmyz", en: "per other Insect you own" },
    now: { sk: "teraz", cs: "teď", en: "now" },
    sting: { sk: "Žihadlo", cs: "Žihadlo", en: "Sting" },
    stingText: { sk: "po svojom útoku padne", cs: "po svém útoku padne", en: "dies after it attacks" },
    poison: { sk: "Jed", cs: "Jed", en: "Poison" },
    poisonText: { sk: "koho zraní, ten padne a je umlčaný", cs: "koho zraní, ten padne a je umlčen", en: "kills and silences whatever it damages" },
    kukla: { sk: "Každý ťah ide do ruky navyše. Nezahraná +{g}, vyložená +{p} navždy",
      cs: "Každé kolo jde do ruky navíc. Nezahraná +{g}, vyložená +{p} navždy",
      en: "Drawn as an extra card every turn. Unplayed +{g}, played +{p} forever" },
  };
  const st = g => g ? `${g.a}/+${g.h}` : "0/+0";
  const baseText = Cards.cardText;
  Cards.cardText = (def, rank, lang, html, boost, opts) => {
    const out = baseText(def, rank, lang, html, boost, opts);
    if (def.race !== R) return out;
    const b = x => (html ? `<strong>${x}</strong>` : x);
    const parts = [];
    for (const sw of [].concat(def.swarm || [])) {
      parts.push(`${b(X.swarm[lang])}: +${sw.a}/+${sw.h} ${(sw.of ? X.copy : X.race)[lang]}`);
    }
    if (def.swarm && opts && opts.swarm && (opts.swarm.a || opts.swarm.h)) {
      parts[parts.length - 1] += ` (${X.now[lang]} +${opts.swarm.a}/+${opts.swarm.h})`;
    }
    if (def.diesOnAttack) parts.push(`${b(X.sting[lang])}: ${X.stingText[lang]}`);
    if (def.poison) parts.push(`${b(X.poison[lang])}: ${X.poisonText[lang]}`);
    if (def.id === "kukla") parts.push(X.kukla[lang].replace("{g}", st(def.grow)).replace("{p}", st(def.growPlayed)));
    return [...parts.map(x => x + "."), out].filter(Boolean).join(" ");
  };
})();
