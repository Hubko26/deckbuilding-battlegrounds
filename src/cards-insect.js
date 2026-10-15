// EXPERIMENT: rasa Hmyz (insect) – hra tento súbor NENAČÍTAVA (nie je
// v index.html). Načíta ho simulácia (`npm run ideal -- exp=insect`) po
// cards.js: pridá rasu, karty a texty do existujúcich objektov Cards / L.cards.
// Engine má pre hmyz všeobecné háčiky (noEvolve, swarm, Kukla, fx typy),
// ktoré bez týchto kariet nič nerobia.
//
// Identita: ROJ. Hmyz nemá evolve – kópie sa nespájajú, ale každá ďalšia
// kópia posilní všetky ostatné (swarm = +staty za každú kópiu v balíčku,
// všetky zóny). Druhá os je rast v balíčku: Kukla (6. karta každý ťah,
// nezahraná rastie), Včielka a Mravec zväčšujú karty, čo ležia v balíčku.
//
// Karty bez artu (noArt + emoji), mená zatiaľ len pracovné.
(() => {
  const R = "insect";
  L.cards.races[R] = { sk: "Hmyz", cs: "Hmyz", en: "Insect" };
  L.cards.racesPl[R] = { sk: "Hmyzu", cs: "Hmyzu", en: "Insects" };
  L.cards.racesNom[R] = { sk: "Hmyz", cs: "Hmyz", en: "Insects" };
  Cards.RACE_ICON[R] = "🐛";

  const M = (id, tier, name, emoji, atk, hp, extra = {}) =>
    ({ id, tier, race: R, stageNames: [name, name, name], atk, hp, noArt: true, emoji, noEvolve: true, ...extra });

  const DEFS = [
    // t1 Húsenica: +1/+1 za každú INÚ Húsenicu (5 kópií = 5/5 každá).
    // Pri vyložení: Kukla do balíčka, alebo Kukla +1/+1 navždy.
    M("I001", 1, "Húsenica", "🐛", 1, 1,
      { swarm: { of: "I001", a: 1, h: 1, others: true },
        power: { kw: "battlecry", fx: { type: "cocoon", a: 1, h: 1 } } }),
    // t1 Včielka: Pri smrti náhodný Hmyz v balíčku +1/+1 navždy.
    M("I002", 1, "Včielka", "🐝", 2, 1,
      { power: { kw: "deathrattle", fx: { type: "deckGrow", a: 1, h: 1 } } }),
    // t2 Lienka: Pri vyložení Hmyz v ruke +X/+X navždy, X = Lienky v balíčku.
    M("I003", 2, "Lienka", "🐞", 2, 3,
      { power: { kw: "battlecry", fx: { type: "handGrowSwarm", of: "I003", a: 1, h: 1 } } }),
    // t2 Kobylka: Pred bojom +1/+1 za každý iný Hmyz na ploche.
    M("I004", 2, "Kobylka", "🦗", 3, 2,
      { power: { kw: "startFight", fx: { type: "growPerRace", race: R, a: 1, h: 1 } } }),
    // t3 Svätojánska muška: Pred bojom náhodný iný Hmyz +X/+X, X = Húsenice.
    M("I005", 3, "Svätojánska muška", "✨", 3, 3,
      { power: { kw: "startFight", fx: { type: "buffRandomSwarm", of: "I001", a: 1, h: 1 } } }),
    // t3 Roháč: Obranca, +0/+1 za každý Hmyz v balíčku.
    M("I006", 3, "Roháč", "🪲", 2, 5,
      { taunt: true, swarm: { race: R, a: 0, h: 1, others: true } }),
    // t4 Mravec: Po nákupe náhodný Hmyz v balíčku +X/+X navždy, X = Mravce.
    M("I007", 4, "Mravec", "🐜", 4, 4,
      { power: { kw: "endTurn", fx: { type: "deckGrowSwarm", of: "I007", a: 1, h: 1 } } }),
    // t5 Osa: Pred bojom výboj 2 za každý Hmyz na ploche (aj seba).
    M("I008", 5, "Osa", "🪰", 5, 4,
      { power: { kw: "startFight", fx: { type: "stingSwarm", n: 2 } } }),
    // t5 Modlivka: Pri smrti vyvolá Jedovatú spóru (1/1, Jed – zabije
    // a umlčí, čo zraní: Pri smrti ani Znovuzrodenie sa nespustia). Counter
    // na veľké telá (Zvieratá, ogri, rasy s veľkým rastom) aj deathrattle.
    M("I009", 5, "Modlivka", "🦟", 6, 6,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "spora", n: 1 } } }),
    // t6 Kráľovná: Pri smrti vyloží bojové kópie až 5 náhodných príšer
    // z balíčka (po voľné miesto).
    M("I010", 6, "Kráľovná", "👑", 7, 7,
      { power: { kw: "deathrattle", fx: { type: "summonFromDeck", n: 5 } } }),
  ];
  // Kukla: generovaná (nie je v obchode), jediná na hráča, Obranca.
  // grow = rast nezahranej Kukly v ruke na konci ťahu, growPlayed = rast
  // vyloženej. Sim (targeted, 50 HP): vyložená +0/+0 → hmyz 38 %, +0/+1 →
  // 50 %, +1/+1 → 67 %, +2/+2 → 83 % – citlivý gombík.
  const KUKLA = { id: "kukla", tier: 1, race: R, stageNames: ["Kukla", "Kukla", "Kukla"], atk: 1, hp: 3,
    taunt: true, noArt: true, emoji: "🪺", noEvolve: true, gen: true, grow: { a: 2, h: 2 }, growPlayed: { a: 0, h: 1 } };

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
    name: { sk: "Jedovatá spóra", cs: "Jedovatá spora", en: "Poison Spore" } };
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
  const t = (sk, en) => ({ sk, cs: sk, en: en || sk });
  Object.assign(L.cards.fx, {
    cocoon: f => t(`Kukla do balíčka, alebo Kukla +${f.a}/+${f.h} navždy`, `Cocoon to deck, or Cocoon +${f.a}/+${f.h} forever`),
    handGrowSwarm: () => t("Hmyz v ruke +X/+X navždy (X = Lienky v balíčku)", "Insects in hand +X/+X forever (X = Ladybugs in deck)"),
    deckGrowSwarm: () => t("náhodný Hmyz v balíčku +X/+X navždy (X = Mravce)", "random Insect in deck +X/+X forever (X = Ants)"),
    deckGrow: (f, m) => t(`náhodný Hmyz v balíčku +${f.a * m}/+${f.h * m} navždy`, `random Insect in deck +${f.a * m}/+${f.h * m} forever`),
    growPerRace: (f, m) => t(`+${f.a * m}/+${f.h * m} za každý iný Hmyz na ploche`, `+${f.a * m}/+${f.h * m} per other Insect`),
    buffRandomSwarm: () => t("náhodný iný Hmyz +X/+X (X = Húsenice v balíčku)", "random other Insect +X/+X (X = Caterpillars)"),
    stingSwarm: f => t(`výboj ${f.n} za každý Hmyz na ploche`, `zap ${f.n} per Insect on board`),
    summonKukla: f => t(`${Math.round(f.chance * 100)} % šanca vyvolať tvoju Kuklu`, `${Math.round(f.chance * 100)}% chance to summon your Cocoon`),
    summonFromDeck: f => t(`vyloží až ${f.n} náhodných príšer z balíčka`, `summons up to ${f.n} random minions from your deck`),
  });
})();
