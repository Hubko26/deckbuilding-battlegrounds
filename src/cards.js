// Dáta kariet. Roster = 30 príšer z art sady (assets/cards), 3 rasy × 10,
// každá príšera má vlastné meno a obrázok pre každý evolučný stupeň
// (bronz → striebro → zlato). Texty schopností sa generujú zo šablón.
//
// Príšera: { id, tier, race, stageNames: [meno1, meno2, meno3], atk, hp,
//            taunt?, power? }  – art sa odvodí z id: assets/cards/<ID>_<rank>.webp
// Kúzlo:   { id, tier, emoji, spell: true, fx, name: {sk,cs,en} }
// power = { kw: "battlecry"|"deathrattle"|"startFight"|"endTurn", fx: {...} }
// fx = { type, a?, h?, n?, race?, token?, taunt? } – čísla sa násobia stupňom (×1/×2/×3).
//
// Classy nie sú – každý hráč hrá z rovnakého poolu. Štartovací balíček je
// 10 náhodných kariet tieru 1 (skladá ho engine).

const Cards = (() => {
  const RACES = {
    beast: { sk: "Zviera", cs: "Zvíře", en: "Beast" },
    elemental: { sk: "Živel", cs: "Živel", en: "Elemental" },
    undead: { sk: "Nemŕtvy", cs: "Nemrtvý", en: "Undead" },
  };
  const RACES_PL = { // datív množného čísla („+2/+2 všetkým Zvieratám“)
    beast: { sk: "Zvieratám", cs: "Zvířatům", en: "Beasts" },
    elemental: { sk: "Živlom", cs: "Živlům", en: "Elementals" },
    undead: { sk: "Nemŕtvym", cs: "Nemrtvým", en: "Undead" },
  };
  const RACES_NOM = { // nominatív množného čísla („všetky budúce Zvieratá“)
    beast: { sk: "Zvieratá", cs: "Zvířata", en: "Beasts" },
    elemental: { sk: "Živly", cs: "Živly", en: "Elementals" },
    undead: { sk: "Nemŕtvi", cs: "Nemrtví", en: "Undead" },
  };
  const RACE_ICON = { beast: "🐾", elemental: "✨", undead: "💀" };

  const M = (id, tier, race, stageNames, atk, hp, extra = {}) =>
    ({ id, tier, race, stageNames, atk, hp, ...extra });

  const DEFS = [
    // ---------- Zvieratá (Beast) ----------
    M("B001", 1, "beast", ["Bristlebit", "Quilltail", "Ironwood Ravager"], 2, 2),
    M("B003", 1, "beast", ["Hopple", "Bogbell", "Mirethrone"], 1, 1,
      { power: { kw: "endTurn", fx: { type: "growSelf", a: 1, h: 1 } } }),
    M("B007", 1, "beast", ["Finwhisk", "Rapidsnout", "Riverking"], 1, 1,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "bublina", n: 1 } } }),
    M("B004", 2, "beast", ["Hootnip", "Moongaze", "Nightoracle"], 2, 3,
      { power: { kw: "battlecry", fx: { type: "draw", n: 1 } } }),
    M("B005", 2, "beast", ["Tuftdash", "Thornhorn", "Briarhart"], 3, 2,
      { power: { kw: "onAttack", fx: { type: "buffRace", race: "beast", a: 1, h: 0 } } }),
    M("B002", 3, "beast", ["Honeygruff", "Ambermaw", "Golden Ursarch"], 4, 5,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 0, h: 1 } } }),
    M("B008", 3, "beast", ["Snortlet", "Mossgore", "Elderwood Tusker"], 3, 5,
      { power: { kw: "endTurn", fx: { type: "growSelf", a: 1, h: 1 } } }),
    M("B006", 4, "beast", ["Rumblebean", "Boulderroll", "Fortressback"], 4, 7,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 0, h: 1 } } }),
    M("B009", 4, "beast", ["Prowlpip", "Sabershade", "Moonfang"], 6, 4,
      { power: { kw: "battlecry", fx: { type: "buffRace", race: "beast", a: 2, h: 2 } } }),
    M("B010", 5, "beast", ["Shellop", "Reefram", "Tidemammoth"], 6, 10,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } } }),

    // ---------- Živly (Elemental) ----------
    M("E001", 1, "elemental", ["Cinderglimp", "Cindercrest", "Crownflare"], 1, 1,
      { power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 1 } } }),
    M("E002", 1, "elemental", ["Bubbleskip", "Tideripple", "Abyssalume"], 1, 3, { taunt: true }),
    M("E003", 2, "elemental", ["Pebblit", "Craggleback", "Mountainheart"], 2, 4,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "elemental", a: 0, h: 1 } } }),
    M("E004", 2, "elemental", ["Whifflet", "Galeplume", "Tempestalon"], 3, 2,
      { power: { kw: "onAttack", fx: { type: "buffAllFriends", a: 1, h: 0 } } }),
    M("E005", 3, "elemental", ["Nibblfrost", "Glacihorn", "Wintercrown"], 3, 4,
      { power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 1 } } }),
    M("E006", 3, "elemental", ["Zappip", "Voltclaw", "Stormregent"], 4, 3,
      { power: { kw: "deathrattle", fx: { type: "dmgRandomEnemy", n: 2 } } }),
    M("E007", 4, "elemental", ["Sproutsnout", "Verdantusk", "Worldroot"], 4, 6,
      { power: { kw: "endTurn", fx: { type: "buffRace", race: "elemental", a: 1, h: 1 } } }),
    M("E008", 4, "elemental", ["Prismite", "Shardmane", "Auroraclysm"], 5, 5,
      { power: { kw: "battlecry", fx: { type: "buffRace", race: "elemental", a: 1, h: 1 } } }),
    M("E009", 5, "elemental", ["Gleamwisp", "Dawnwing", "Solarchon"], 7, 6,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: "elemental", a: 1, h: 1 } } }),
    M("E010", 6, "elemental", ["Duskdrop", "Gloamstalker", "Eclipse Sovereign"], 8, 8,
      { power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 4 } } }),

    // ---------- Nemŕtvi (Undead) ----------
    M("U001", 1, "undead", ["Rattlewink", "Bonebound", "Ossuary Hound"], 1, 1,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 1 } } }),
    M("U002", 1, "undead", ["Candlejaw", "Wickgrin", "Hearthhaunt"], 2, 1,
      { power: { kw: "deathrattle", fx: { type: "dmgRandomEnemy", n: 1 } } }),
    M("U003", 2, "undead", ["Gravebloom", "Thornwraith", "Mausoleum Hart"], 2, 4,
      { power: { kw: "deathrattle", fx: { type: "buffRace", race: "undead", a: 1, h: 1 } } }),
    M("U004", 2, "undead", ["Mournmoth", "Veilwing", "Eclipse Mourner"], 2, 3,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: "undead", a: 0, h: 1 } } }),
    M("U005", 3, "undead", ["Cryptcub", "Sarcoclaw", "Tombsphinx"], 4, 5,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 2 } } }),
    M("U006", 3, "undead", ["Bonebell", "Knellhorn", "Cathedral Ram"], 2, 6,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "dmgRandomEnemy", n: 2 } } }),
    M("U007", 4, "undead", ["Shroudling", "Veilprank", "Phantom Duke"], 5, 4,
      { power: { kw: "battlecry", fx: { type: "buffRace", race: "undead", a: 2, h: 2 } } }),
    M("U008", 4, "undead", ["Tombturtle", "Reliquaryback", "Necropolis Tortoise"], 3, 8,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "undead", a: 1, h: 0 } } }),
    M("U009", 5, "undead", ["Hollowhound", "Gravehowl", "Sepulcher Sentinel"], 7, 6,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 3 } } }),
    M("U010", 6, "undead", ["Wispwarden", "Lantern Guard", "Soul Bastion"], 8, 10,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "undead", a: 1, h: 1 } } }),

    // ---------- Kúzla (spoločné pre všetkých) ----------
    { id: "minca", cost: 1, tier: 1, emoji: "🪙", spell: true, fx: { type: "gold", n: 2 },
      name: { sk: "Zlatá minca", cs: "Zlatá mince", en: "Gold Coin" } },
    { id: "jablko", cost: 2, tier: 2, emoji: "🍎", spell: true, fx: { type: "buffTarget", a: 2, h: 2 },
      name: { sk: "Zázračné jablko", cs: "Zázračné jablko", en: "Magic Apple" } },
    { id: "kniha", cost: 2, tier: 3, emoji: "📖", spell: true, fx: { type: "discover" },
      name: { sk: "Kniha prianí", cs: "Kniha přání", en: "Wish Book" } },
    { id: "koren", cost: 2, tier: 3, emoji: "🌱", spell: true, fx: { type: "buffTarget", a: 0, h: 4, taunt: true },
      name: { sk: "Pevný koreň", cs: "Pevný kořen", en: "Sturdy Root" } },
    { id: "vlna", cost: 2, tier: 3, emoji: "🌊", spell: true, fx: { type: "buffAllFriends", a: 1, h: 1 },
      name: { sk: "Veľká vlna", cs: "Velká vlna", en: "Big Wave" } },
    { id: "srdce", cost: 3, tier: 4, emoji: "❤️‍🔥", spell: true, fx: { type: "buffTarget", a: 3, h: 3 },
      name: { sk: "Ohnivé srdce", cs: "Ohnivé srdce", en: "Fiery Heart" } },
  ];

  // Tokeny – vyvolávané príšerky, nie sú v obchode ani v balíčku.
  const TOKENS = [
    { id: "kostik", tier: 1, race: "undead", emoji: "💀", atk: 1, hp: 1, token: true,
      name: { sk: "Kostík", cs: "Kůstka", en: "Bonelet" } },
    { id: "bublina", tier: 1, race: "elemental", emoji: "🫧", atk: 1, hp: 1, token: true,
      name: { sk: "Bublina", cs: "Bublina", en: "Bubble" } },
  ];

  const byId = {};
  for (const d of [...DEFS, ...TOKENS]) byId[d.id] = d;

  // Meno karty pre daný stupeň (mená príšer sú vlastné mená, neprekladajú sa).
  function nameOf(def, rank, lang) {
    if (def.stageNames) return def.stageNames[Math.min(rank, 3) - 1];
    const n = def.name;
    return n[lang] ?? n.sk;
  }

  // Cesta k obrázku pre daný stupeň; kúzla a tokeny majú emoji.
  function artOf(def, rank) {
    if (!def.stageNames) return null;
    return `assets/cards/${def.id}_${Math.min(rank, 3)}.webp`;
  }

  // ---------- Texty schopností ----------
  const KW_LABEL = {
    battlecry: { sk: "Pri vyložení", cs: "Při vyložení", en: "Battlecry" },
    deathrattle: { sk: "Pri smrti", cs: "Při smrti", en: "Deathrattle" },
    startFight: { sk: "Pred bojom", cs: "Před bojem", en: "Start of fight" },
    endTurn: { sk: "Po nákupe", cs: "Po nákupu", en: "End of turn" },
    onAttack: { sk: "Pri útoku", cs: "Při útoku", en: "On attack" },
  };
  const TAUNT_LABEL = { sk: "Obranca", cs: "Obránce", en: "Taunt" };

  // Šablóny textov efektov. `m` je násobič čísel podľa stupňa (1/2/3).
  const FX_TEXT = {
    growSelf: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} pre seba`,
      cs: `+${f.a * m}/+${f.h * m} pro sebe`,
      en: `+${f.a * m}/+${f.h * m} for itself`,
    }),
    buffFriend: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} náhodnému kamarátovi`,
      cs: `+${f.a * m}/+${f.h * m} náhodnému kamarádovi`,
      en: `+${f.a * m}/+${f.h * m} to a random friend`,
    }),
    futureRace: (f, m) => ({
      sk: `VŠETKY tvoje ${RACES_NOM[f.race].sk} (aj v balíčku, navždy) dostanú +${f.a * m}/+${f.h * m}`,
      cs: `VŠECHNA tvá ${RACES_NOM[f.race].cs} (i v balíčku, navždy) dostanou +${f.a * m}/+${f.h * m}`,
      en: `ALL your ${RACES_NOM[f.race].en} (deck too, forever) get +${f.a * m}/+${f.h * m}`,
    }),
    buffRace: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} všetkým ${RACES_PL[f.race].sk}`,
      cs: `+${f.a * m}/+${f.h * m} všem ${RACES_PL[f.race].cs}`,
      en: `+${f.a * m}/+${f.h * m} to all ${RACES_PL[f.race].en}`,
    }),
    buffAllFriends: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} všetkým kamarátom`,
      cs: `+${f.a * m}/+${f.h * m} všem kamarádům`,
      en: `+${f.a * m}/+${f.h * m} to all friends`,
    }),
    buffTarget: (f, m) => ({
      sk: `+${f.a * m}/+${f.h * m} vybranej príšerke` + (f.taunt ? " a Obranca" : ""),
      cs: `+${f.a * m}/+${f.h * m} vybrané příšerce` + (f.taunt ? " a Obránce" : ""),
      en: `+${f.a * m}/+${f.h * m} to a chosen minion` + (f.taunt ? " and Taunt" : ""),
    }),
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
    dmgRandomEnemy: (f, m) => ({
      sk: `${f.n * m} damage náhodnému nepriateľovi`,
      cs: `${f.n * m} damage náhodnému nepříteli`,
      en: `deal ${f.n * m} damage to a random enemy`,
    }),
    summon: (f, m) => {
      const a = byId[f.token].atk * STAT_MULT[m];
      const h = byId[f.token].hp * STAT_MULT[m];
      return {
        sk: `vyvolaj ${f.n}× ${byId[f.token].name.sk} (${a}/${h})`,
        cs: `vyvolej ${f.n}× ${byId[f.token].name.cs} (${a}/${h})`,
        en: `summon ${f.n}× ${byId[f.token].name.en} (${a}/${h})`,
      };
    },
    discover: () => ({
      sk: "vyber si 1 z 3 kariet do ruky",
      cs: "vyber si 1 ze 3 karet do ruky",
      en: "discover: pick 1 of 3 cards",
    }),
  };

  // Popis karty pre daný stupeň (rank 1–3) a jazyk.
  // html=true obalí kľúčové slová (Taunt, Deathrattle…) do <strong>.
  function cardText(def, rank, lang, html) {
    const m = rank; // efekty ×1/×2/×3
    const b = s => (html ? `<strong>${s}</strong>` : s);
    const parts = [];
    if (def.taunt) parts.push(b(TAUNT_LABEL[lang]) + ".");
    if (def.power) {
      parts.push(`${b(KW_LABEL[def.power.kw][lang])}: ${FX_TEXT[def.power.fx.type](def.power.fx, m)[lang]}.`);
    }
    if (def.spell) parts.push(FX_TEXT[def.fx.type](def.fx, 1)[lang][0].toUpperCase() + FX_TEXT[def.fx.type](def.fx, 1)[lang].slice(1) + ".");
    return parts.join(" ");
  }

  // Staty pre stupeň: bronz ×1, striebro ×2, zlato ×4.
  const STAT_MULT = [null, 1, 2, 4];

  return { RACES, RACES_PL, RACES_NOM, RACE_ICON, DEFS, TOKENS, byId, nameOf, artOf, cardText, STAT_MULT, KW_LABEL, TAUNT_LABEL };
})();

if (typeof module !== "undefined") module.exports = Cards;
