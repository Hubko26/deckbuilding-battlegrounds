// Dáta kariet. Texty schopností sa generujú zo šablón (pozri Cards.cardText),
// aby čísla sedeli so stupňom karty (bronz/striebro/zlato).
//
// Karta (minion): { id, tier, cls, race, emoji, atk, hp, taunt?, power? }
// Karta (spell):  { id, tier, cls, emoji, spell: true, fx }
// power = { kw: "battlecry"|"deathrattle"|"startFight"|"endTurn", fx: {...} }
// fx = { type, a?, h?, n?, race?, token?, taunt? } – čísla sa násobia stupňom (×1/×2/×3).
//
// Rasy (v1 štyri; Undead/Human/Ogre pridáme s väčším poolom kariet):
//   beast, dragon, elemental, fairy

const Cards = (() => {
  const RACES = {
    beast: { sk: "Zviera", cs: "Zvíře", en: "Beast" },
    dragon: { sk: "Drak", cs: "Drak", en: "Dragon" },
    elemental: { sk: "Živel", cs: "Živel", en: "Elemental" },
    fairy: { sk: "Víla", cs: "Víla", en: "Fairy" },
  };
  const RACES_PL = { // množné číslo do textov schopností
    beast: { sk: "Zvieratám", cs: "Zvířatům", en: "Beasts" },
    dragon: { sk: "Drakom", cs: "Drakům", en: "Dragons" },
    elemental: { sk: "Živlom", cs: "Živlům", en: "Elementals" },
    fairy: { sk: "Vílam", cs: "Vílám", en: "Fairies" },
  };

  const CLASSES = {
    les: {
      name: { sk: "Les", cs: "Les", en: "Forest" },
      emoji: "🌲",
      hero: { name: { sk: "Ježko Pichliač", cs: "Ježek Bodlinka", en: "Prickle the Hedgehog" }, emoji: "🦔" },
    },
    more: {
      name: { sk: "More", cs: "Moře", en: "Ocean" },
      emoji: "🌊",
      hero: { name: { sk: "Chobotnička Ela", cs: "Chobotnička Ela", en: "Ela the Octopus" }, emoji: "🐙" },
    },
    ohen: {
      name: { sk: "Sopka", cs: "Sopka", en: "Volcano" },
      emoji: "🔥",
      hero: { name: { sk: "Dráčik Iskra", cs: "Dráček Jiskra", en: "Spark the Dragon" }, emoji: "🐲" },
    },
  };

  // n(name) skracuje zápis trojjazyčných mien.
  const DEFS = [
    // ---------- Neutrálne príšerky ----------
    { id: "myska", tier: 1, cls: null, race: "beast", emoji: "🐭", atk: 1, hp: 2,
      name: { sk: "Myška", cs: "Myška", en: "Mouse" } },
    { id: "kohut", tier: 1, cls: null, race: "beast", emoji: "🐔", atk: 2, hp: 1,
      name: { sk: "Kohútik", cs: "Kohoutek", en: "Rooster" } },
    { id: "zajac", tier: 1, cls: null, race: "beast", emoji: "🐰", atk: 1, hp: 1,
      power: { kw: "endTurn", fx: { type: "growSelf", a: 1, h: 1 } },
      name: { sk: "Zajko", cs: "Zajíček", en: "Bunny" } },
    { id: "macka", tier: 2, cls: null, race: "beast", emoji: "🐱", atk: 3, hp: 2,
      name: { sk: "Mačka", cs: "Kočka", en: "Cat" } },
    { id: "pes", tier: 2, cls: null, race: "beast", emoji: "🐶", atk: 2, hp: 3, taunt: true,
      name: { sk: "Psík strážca", cs: "Pejsek hlídač", en: "Guard Dog" } },
    { id: "ovca", tier: 2, cls: null, race: "beast", emoji: "🐑", atk: 1, hp: 4,
      power: { kw: "deathrattle", fx: { type: "summon", token: "jahniatko", n: 1 } },
      name: { sk: "Ovečka", cs: "Ovečka", en: "Sheep" } },
    { id: "koza", tier: 3, cls: null, race: "beast", emoji: "🐐", atk: 4, hp: 3,
      power: { kw: "battlecry", fx: { type: "buffFriend", a: 1, h: 1 } },
      name: { sk: "Koza rohatá", cs: "Koza rohatá", en: "Horned Goat" } },
    { id: "prasa", tier: 3, cls: null, race: "beast", emoji: "🐷", atk: 3, hp: 5,
      name: { sk: "Prasiatko", cs: "Prasátko", en: "Piglet" } },
    { id: "kon", tier: 3, cls: null, race: "beast", emoji: "🐴", atk: 5, hp: 3,
      name: { sk: "Koník", cs: "Koník", en: "Pony" } },
    { id: "orol", tier: 4, cls: null, race: "beast", emoji: "🦅", atk: 6, hp: 4,
      power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 2 } },
      name: { sk: "Orol bystrý", cs: "Orel bystrý", en: "Sharp Eagle" } },
    { id: "gorila", tier: 4, cls: null, race: "beast", emoji: "🦍", atk: 5, hp: 6, taunt: true,
      name: { sk: "Gorila", cs: "Gorila", en: "Gorilla" } },
    { id: "krava", tier: 4, cls: null, race: "beast", emoji: "🐮", atk: 4, hp: 7,
      power: { kw: "battlecry", fx: { type: "healHero", n: 3 } },
      name: { sk: "Kravička", cs: "Kravička", en: "Cow" } },
    { id: "lev", tier: 5, cls: null, race: "beast", emoji: "🦁", atk: 8, hp: 6,
      power: { kw: "battlecry", fx: { type: "buffRace", race: "beast", a: 2, h: 2 } },
      name: { sk: "Lev kráľ", cs: "Lev král", en: "Lion King" } },
    { id: "slon", tier: 5, cls: null, race: "beast", emoji: "🐘", atk: 6, hp: 9, taunt: true,
      name: { sk: "Slon", cs: "Slon", en: "Elephant" } },
    { id: "panda", tier: 5, cls: null, race: "beast", emoji: "🐼", atk: 7, hp: 7,
      name: { sk: "Panda", cs: "Panda", en: "Panda" } },
    { id: "dinko", tier: 6, cls: null, race: "beast", emoji: "🦖", atk: 10, hp: 8,
      name: { sk: "Dinko", cs: "Dinousek", en: "Dino" } },
    { id: "mamut", tier: 6, cls: null, race: "beast", emoji: "🦣", atk: 8, hp: 12, taunt: true,
      name: { sk: "Mamut", cs: "Mamut", en: "Mammoth" } },
    { id: "jednorozec", tier: 6, cls: null, race: "fairy", emoji: "🦄", atk: 9, hp: 9,
      power: { kw: "endTurn", fx: { type: "buffAllFriends", a: 1, h: 1 } },
      name: { sk: "Jednorožec", cs: "Jednorožec", en: "Unicorn" } },

    // ---------- Neutrálne kúzla ----------
    { id: "minca", tier: 1, cls: null, emoji: "🪙", spell: true, fx: { type: "gold", n: 2 },
      name: { sk: "Zlatá minca", cs: "Zlatá mince", en: "Gold Coin" } },
    { id: "jablko", tier: 2, cls: null, emoji: "🍎", spell: true, fx: { type: "buffTarget", a: 2, h: 2 },
      name: { sk: "Zázračné jablko", cs: "Zázračné jablko", en: "Magic Apple" } },
    { id: "kniha", tier: 3, cls: null, emoji: "📖", spell: true, fx: { type: "discover" },
      name: { sk: "Kniha prianí", cs: "Kniha přání", en: "Wish Book" } },

    // ---------- Les ----------
    { id: "jezko-vojak", tier: 1, cls: "les", race: "beast", emoji: "🦔", atk: 2, hp: 2,
      name: { sk: "Ježko vojak", cs: "Ježek voják", en: "Hedgehog Soldier" } },
    { id: "vevericka", tier: 1, cls: "les", race: "beast", emoji: "🐿️", atk: 1, hp: 2,
      power: { kw: "endTurn", fx: { type: "growSelf", a: 1, h: 0 } },
      name: { sk: "Veverička", cs: "Veverka", en: "Squirrel" } },
    { id: "sova", tier: 2, cls: "les", race: "beast", emoji: "🦉", atk: 2, hp: 3,
      power: { kw: "battlecry", fx: { type: "draw", n: 1 } },
      name: { sk: "Sova múdra", cs: "Sova moudrá", en: "Wise Owl" } },
    { id: "medved", tier: 3, cls: "les", race: "beast", emoji: "🐻", atk: 4, hp: 5, taunt: true,
      name: { sk: "Medveď", cs: "Medvěd", en: "Bear" } },
    { id: "vlk", tier: 4, cls: "les", race: "beast", emoji: "🐺", atk: 6, hp: 5,
      power: { kw: "startFight", fx: { type: "growSelf", a: 2, h: 0 } },
      name: { sk: "Vlk samotár", cs: "Vlk samotář", en: "Lone Wolf" } },
    { id: "jelen", tier: 5, cls: "les", race: "beast", emoji: "🦌", atk: 7, hp: 7,
      power: { kw: "battlecry", fx: { type: "buffAllFriends", a: 2, h: 2 } },
      name: { sk: "Jeleň parohatý", cs: "Jelen parohatý", en: "Antler Stag" } },
    { id: "dub", tier: 6, cls: "les", race: "fairy", emoji: "🌳", atk: 8, hp: 10, taunt: true,
      power: { kw: "endTurn", fx: { type: "buffAllFriends", a: 1, h: 1 } },
      name: { sk: "Starý dub", cs: "Starý dub", en: "Old Oak" } },
    { id: "med", tier: 2, cls: "les", emoji: "🍯", spell: true, fx: { type: "buffTarget", a: 3, h: 3 },
      name: { sk: "Lesný med", cs: "Lesní med", en: "Forest Honey" } },
    { id: "koren", tier: 3, cls: "les", emoji: "🌱", spell: true, fx: { type: "buffTarget", a: 0, h: 4, taunt: true },
      name: { sk: "Pevný koreň", cs: "Pevný kořen", en: "Sturdy Root" } },

    // ---------- More ----------
    { id: "rybka", tier: 1, cls: "more", race: "beast", emoji: "🐟", atk: 1, hp: 1,
      power: { kw: "deathrattle", fx: { type: "summon", token: "bublina", n: 1 } },
      name: { sk: "Rybka", cs: "Rybka", en: "Little Fish" } },
    { id: "krab", tier: 1, cls: "more", race: "beast", emoji: "🦀", atk: 1, hp: 3, taunt: true,
      name: { sk: "Krab", cs: "Krab", en: "Crab" } },
    { id: "meduza", tier: 2, cls: "more", race: "beast", emoji: "🪼", atk: 2, hp: 2,
      power: { kw: "deathrattle", fx: { type: "dmgRandomEnemy", n: 2 } },
      name: { sk: "Medúza", cs: "Medúza", en: "Jellyfish" } },
    { id: "korytnacka", tier: 3, cls: "more", race: "beast", emoji: "🐢", atk: 2, hp: 6, taunt: true,
      name: { sk: "Korytnačka", cs: "Želva", en: "Turtle" } },
    { id: "delfin", tier: 4, cls: "more", race: "beast", emoji: "🐬", atk: 5, hp: 5,
      power: { kw: "battlecry", fx: { type: "healHero", n: 4 } },
      name: { sk: "Delfín", cs: "Delfín", en: "Dolphin" } },
    { id: "zralok", tier: 5, cls: "more", race: "beast", emoji: "🦈", atk: 8, hp: 5,
      power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 3 } },
      name: { sk: "Žralok", cs: "Žralok", en: "Shark" } },
    { id: "velryba", tier: 6, cls: "more", race: "beast", emoji: "🐋", atk: 7, hp: 12, taunt: true,
      power: { kw: "deathrattle", fx: { type: "summon", token: "rybka", n: 2 } },
      name: { sk: "Veľryba", cs: "Velryba", en: "Whale" } },
    { id: "perla", tier: 2, cls: "more", emoji: "🦪", spell: true, fx: { type: "gold", n: 3 },
      name: { sk: "Morská perla", cs: "Mořská perla", en: "Sea Pearl" } },
    { id: "vlna", tier: 3, cls: "more", emoji: "🌊", spell: true, fx: { type: "buffAllFriends", a: 1, h: 1 },
      name: { sk: "Veľká vlna", cs: "Velká vlna", en: "Big Wave" } },

    // ---------- Sopka ----------
    { id: "salamandra", tier: 1, cls: "ohen", race: "elemental", emoji: "🦎", atk: 2, hp: 1,
      power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 1 } },
      name: { sk: "Salamandra", cs: "Salamandr", en: "Salamander" } },
    { id: "iskricka", tier: 1, cls: "ohen", race: "elemental", emoji: "✨", atk: 1, hp: 1,
      power: { kw: "deathrattle", fx: { type: "dmgRandomEnemy", n: 1 } },
      name: { sk: "Iskrička", cs: "Jiskřička", en: "Sparkle" } },
    { id: "fenixik", tier: 2, cls: "ohen", race: "elemental", emoji: "🐣", atk: 2, hp: 2,
      power: { kw: "deathrattle", fx: { type: "summon", token: "plamienok", n: 1 } },
      name: { sk: "Fénixík", cs: "Fénixek", en: "Phoenix Chick" } },
    { id: "dracik", tier: 3, cls: "ohen", race: "dragon", emoji: "🐲", atk: 4, hp: 4,
      name: { sk: "Dráčik", cs: "Dráček", en: "Little Dragon" } },
    { id: "fenix", tier: 4, cls: "ohen", race: "elemental", emoji: "🐦‍🔥", atk: 5, hp: 4,
      power: { kw: "deathrattle", fx: { type: "summon", token: "plamienok", n: 2 } },
      name: { sk: "Fénix", cs: "Fénix", en: "Phoenix" } },
    { id: "obor", tier: 5, cls: "ohen", race: "elemental", emoji: "🌋", atk: 7, hp: 8, taunt: true,
      name: { sk: "Lávový obor", cs: "Lávový obr", en: "Lava Giant" } },
    { id: "kral-drakov", tier: 6, cls: "ohen", race: "dragon", emoji: "🐉", atk: 9, hp: 9,
      power: { kw: "startFight", fx: { type: "dmgRandomEnemy", n: 4 } },
      name: { sk: "Kráľ drakov", cs: "Král draků", en: "Dragon King" } },
    { id: "iskra", tier: 2, cls: "ohen", emoji: "⚡", spell: true, fx: { type: "buffTarget", a: 3, h: 0 },
      name: { sk: "Iskra sily", cs: "Jiskra síly", en: "Power Spark" } },
    { id: "srdce", tier: 4, cls: "ohen", emoji: "❤️‍🔥", spell: true, fx: { type: "buffTarget", a: 3, h: 3 },
      name: { sk: "Ohnivé srdce", cs: "Ohnivé srdce", en: "Fiery Heart" } },
  ];

  // Tokeny – vyvolávané príšerky, nie sú v obchode ani v balíčku.
  const TOKENS = [
    { id: "jahniatko", tier: 1, cls: null, race: "beast", emoji: "🐑", atk: 1, hp: 1, token: true,
      name: { sk: "Jahniatko", cs: "Jehňátko", en: "Lamb" } },
    { id: "bublina", tier: 1, cls: null, race: "elemental", emoji: "🫧", atk: 1, hp: 1, token: true,
      name: { sk: "Bublina", cs: "Bublina", en: "Bubble" } },
    { id: "plamienok", tier: 1, cls: null, race: "elemental", emoji: "🔥", atk: 1, hp: 1, token: true,
      name: { sk: "Plamienok", cs: "Plamínek", en: "Small Flame" } },
  ];

  const STARTERS = {
    les: ["jezko-vojak", "jezko-vojak", "jezko-vojak", "vevericka", "vevericka", "vevericka", "sova", "sova", "medved", "medved"],
    more: ["rybka", "rybka", "rybka", "krab", "krab", "krab", "meduza", "meduza", "korytnacka", "korytnacka"],
    ohen: ["salamandra", "salamandra", "salamandra", "iskricka", "iskricka", "iskricka", "fenixik", "fenixik", "dracik", "dracik"],
  };

  const byId = {};
  for (const d of [...DEFS, ...TOKENS]) byId[d.id] = d;

  // ---------- Texty schopností ----------
  const KW_LABEL = {
    battlecry: { sk: "Pri vyložení", cs: "Při vyložení", en: "Battlecry" },
    deathrattle: { sk: "Pri smrti", cs: "Při smrti", en: "Deathrattle" },
    startFight: { sk: "Pred bojom", cs: "Před bojem", en: "Start of fight" },
    endTurn: { sk: "Po nákupe", cs: "Po nákupu", en: "End of turn" },
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
    summon: (f, m) => ({
      sk: `vyvolaj ${f.n * m}× ${byId[f.token].name.sk}`,
      cs: `vyvolej ${f.n * m}× ${byId[f.token].name.cs}`,
      en: `summon ${f.n * m}× ${byId[f.token].name.en}`,
    }),
    discover: () => ({
      sk: "vyber si 1 z 3 kariet do ruky",
      cs: "vyber si 1 ze 3 karet do ruky",
      en: "discover: pick 1 of 3 cards",
    }),
  };

  // Popis karty pre daný stupeň (rank 1–3) a jazyk.
  function cardText(def, rank, lang) {
    const m = rank; // efekty ×1/×2/×3
    const parts = [];
    if (def.taunt) parts.push(TAUNT_LABEL[lang] + ".");
    if (def.power) {
      parts.push(`${KW_LABEL[def.power.kw][lang]}: ${FX_TEXT[def.power.fx.type](def.power.fx, m)[lang]}.`);
    }
    if (def.spell) parts.push(FX_TEXT[def.fx.type](def.fx, 1)[lang][0].toUpperCase() + FX_TEXT[def.fx.type](def.fx, 1)[lang].slice(1) + ".");
    return parts.join(" ");
  }

  // Staty pre stupeň: bronz ×1, striebro ×2, zlato ×4.
  const STAT_MULT = [null, 1, 2, 4];

  return { CLASSES, RACES, RACES_PL, DEFS, TOKENS, STARTERS, byId, cardText, STAT_MULT, KW_LABEL, TAUNT_LABEL };
})();

if (typeof module !== "undefined") module.exports = Cards;
