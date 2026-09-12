// Dáta kariet. Roster = 60 príšer z art sád (assets/cards), 6 rás × 10,
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
// 10 náhodných kariet tieru 1, max 2 kópie jednej karty (skladá ho engine).

const Cards = (() => {
  const RACES = {
    beast: { sk: "Zviera", cs: "Zvíře", en: "Beast" },
    elemental: { sk: "Živel", cs: "Živel", en: "Elemental" },
    undead: { sk: "Nemŕtvy", cs: "Nemrtvý", en: "Undead" },
    fairy: { sk: "Víla", cs: "Víla", en: "Fairy" },
    dragon: { sk: "Drak", cs: "Drak", en: "Dragon" },
    ogre: { sk: "Ogr", cs: "Zlobr", en: "Ogre" },
  };
  const RACES_PL = { // datív množného čísla („+2/+2 všetkým Zvieratám“)
    beast: { sk: "Zvieratám", cs: "Zvířatům", en: "Beasts" },
    elemental: { sk: "Živlom", cs: "Živlům", en: "Elementals" },
    undead: { sk: "Nemŕtvym", cs: "Nemrtvým", en: "Undead" },
    fairy: { sk: "Vílam", cs: "Vílám", en: "Fairies" },
    dragon: { sk: "Drakom", cs: "Drakům", en: "Dragons" },
    ogre: { sk: "Ogrom", cs: "Zlobrům", en: "Ogres" },
  };
  const RACES_NOM = { // nominatív množného čísla („všetky budúce Zvieratá“)
    beast: { sk: "Zvieratá", cs: "Zvířata", en: "Beasts" },
    elemental: { sk: "Živly", cs: "Živly", en: "Elementals" },
    undead: { sk: "Nemŕtvi", cs: "Nemrtví", en: "Undead" },
    fairy: { sk: "Víly", cs: "Víly", en: "Fairies" },
    dragon: { sk: "Draky", cs: "Draci", en: "Dragons" },
    ogre: { sk: "Ogri", cs: "Zlobři", en: "Ogres" },
  };
  const RACE_ICON = { beast: "🐾", elemental: "✨", undead: "💀", fairy: "🧚", dragon: "🐲", ogre: "👹" };

  const M = (id, tier, race, stageNames, atk, hp, extra = {}) =>
    ({ id, tier, race, stageNames, atk, hp, ...extra });

  const DEFS = [
    // ---------- Zvieratá (Beast) ----------
    // B001: „Pri smrti: +1/+1 všetkým Zvieratám do konca boja" (evolve ×2/×3)
    // – bývalá jediná ne-ogrská vanilla. Padne skoro (2/2 bez Obrancu), kŕmi
    // mrchožrútov B004/B009 cez raceDeath a ešte buffne zvyšok zvierat.
    // lasting: buff dostanú aj Mláďatá vyvolané neskôr v boji (fightRaceBuffs).
    M("B001", 1, "beast", ["Bristlebit", "Quilltail", "Ironwood Ravager"], 2, 2,
      { power: { kw: "deathrattle", fx: { type: "buffRace", race: "beast", a: 1, h: 1, lasting: true } } }),
    M("B003", 1, "beast", ["Hopple", "Bogbell", "Mirethrone"], 1, 1,
      { power: { kw: "endTurn", fx: { type: "growSelf", a: 1, h: 1, perm: true } } }),
    M("B007", 1, "beast", ["Finwhisk", "Rapidsnout", "Riverking"], 1, 1,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "mlada", n: 1 } } }),
    // B004: „Keď zomrie tvoje Zviera: +1/+1 NAVŽDY" (raceDeath + perm) –
    // kŕmi ho každé padnuté zviera vrátane Mláďat (tokeny sú beast). Beast
    // ladder k B009 (rovnaký trigger, +2/+2 dočasne). Pôvodne len Mláďa –
    // príliš úzke; bývalý battlecry draw bol kópia F001.
    M("B004", 2, "beast", ["Hootnip", "Moongaze", "Nightoracle"], 2, 3,
      { power: { kw: "raceDeath", fx: { type: "growSelf", race: "beast", a: 1, h: 1, perm: true } } }),
    // B005: stádo mláďat pri smrti – kŕmi B009 (rastie za smrť zvieraťa).
    M("B005", 2, "beast", ["Tuftdash", "Thornhorn", "Briarhart"], 3, 2,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "mlada", n: 2 } } }),
    // B002 = skorá Pečať zvierat +1/+1 (bola +1/+0 – zvieratám chýbal
    // t6 payoff a skorá aura bola slabá).
    M("B002", 3, "beast", ["Honeygruff", "Ambermaw", "Golden Ursarch"], 4, 5,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } } }),
    M("B008", 3, "beast", ["Snortlet", "Mossgore", "Elderwood Tusker"], 3, 5,
      { power: { kw: "endTurn", fx: { type: "growSelf", a: 2, h: 2, perm: true } } }),
    // B006 = t6 beast payoff (rasa nemala t6 kartu a pôsobila slabo): Obranca
    // 7/9, Pri smrti vyvolá 2 SuperMláďatá – vlastný token (klasické Mláďa
    // ostáva): 1/1 Obranca, ktorý Pri smrti položí Pečať +1/+1 Zvieratám.
    // Stupeň rodiča škáluje token aj jeho Pečať. Bola t4 Pečať +0/+1.
    M("B006", 6, "beast", ["Rumblebean", "Boulderroll", "Fortressback"], 7, 9,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "summon", token: "supermlada", n: 2 } } }),
    M("B009", 4, "beast", ["Prowlpip", "Sabershade", "Moonfang"], 5, 4,
      { power: { kw: "raceDeath", fx: { type: "growSelf", race: "beast", a: 2, h: 2 } } }),
    M("B010", 5, "beast", ["Shellop", "Reefram", "Tidemammoth"], 6, 10,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } } }),

    // ---------- Živly (Elemental) ----------
    // Výboje 3 dmg (bolo 2): kostíky s aurami prežívali 2-ky a undead
    // prestal byť elemental korisť; na veľké beast telá je 3 stále nič.
    // Prekopanie živlov: telá na krivku (E001 2/2, E004 4/4, E005 3/5, E006
    // 4/4), výboj ladder t1 3 → t3 4 → t6 výbuch 3, Bubliny ako telá +
    // výbuchy, E007/E008 z dočasných buffov na trvalé škálovanie.
    M("E001", 1, "elemental", ["Cinderglimp", "Cindercrest", "Crownflare"], 2, 2,
      { power: { kw: "startFight", fx: { type: "dmgWeakEnemy", n: 3 } } }),
    // E002: Pri smrti 2× Bublina 🫧 (1/1, Pri smrti: výboj 1 +Živelná sila) –
    // živly konečne majú telá navyše a každá padnutá Bublina strieľa.
    M("E002", 1, "elemental", ["Bubbleskip", "Tideripple", "Abyssalume"], 1, 3,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "summon", token: "bublina", n: 2 } } }),
    // E003: skorá živelná aura +1/+1 (bola +0/+1) – živly potrebujú útok,
    // nie len životy; ostatné rasy majú skorú auru +0/+1.
    M("E003", 2, "elemental", ["Pebblit", "Craggleback", "Mountainheart"], 3, 5,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "elemental", a: 1, h: 1 } } }),
    // E004: buffuje LEN Živly (vrátane Bublín – tokeny majú rasu), nie celú
    // plochu. Bonus škáluje so Živelnou silou (dmgBoost) v oboch číslach;
    // s Vichorom (2 útoky) sa spúšťa dvakrát. Dôvod kupovať ⚡ v nízkych tieroch.
    M("E004", 2, "elemental", ["Whifflet", "Galeplume", "Tempestalon"], 4, 4,
      { power: { kw: "onAttack", fx: { type: "buffRace", race: "elemental", a: 1, h: 1 } } }),
    // E005 Lovec tokenov: PRVÝ token, čo súper v boji vyvolá, dostane výboj
    // za 1 (+Živelná sila); ak padne, E005 rastie +2/+2 NAVŽDY (pa/ph).
    // Jeden výstrel za boj – pôvodný výboj na každý token s rastom +1/+1 za
    // každý zabitý kostík decimoval undead bez stropu. Kostík s U002 (2/2)
    // alebo aurou bronzový výboj prežije – živly musia kupovať Živelnú silu.
    // Evolve: výboj 1/2/3, rast ×stupeň. Bývalý výboj 3 bol kópia E001.
    M("E005", 3, "elemental", ["Nibblfrost", "Glacihorn", "Wintercrown"], 3, 5,
      { power: { kw: "onEnemySummon", fx: { type: "zapToken", n: 1, a: 2, h: 2 } } }),
    M("E006", 3, "elemental", ["Zappip", "Voltclaw", "Stormregent"], 4, 4,
      { power: { kw: "deathrattle", fx: { type: "dmgWeakEnemy", n: 4 } } }),
    // E007: motor identity – Po nákupe Živelná sila +1 navždy (evolve +2/+3),
    // kým je na ploche. Živly už nezávisia od spell slotu; kúp-vylož-predaj
    // stojí 2 zlata za +1 = cena kúzla, bez zneužitia.
    M("E007", 4, "elemental", ["Sproutsnout", "Verdantusk", "Worldroot"], 4, 7,
      { power: { kw: "endTurn", fx: { type: "dmgBoost", n: 1 } } }),
    // E008 Prismite: cielený battlecry „+1/+1 vybranej príšerke" (buffOne,
    // do konca boja) – ako dočasný buff Živla ho škáluje Živelná sila v oboch
    // číslach (⚡+2 → +3/+3), evolve ×2/×3. Živly majú aury E003 t2 / E009 t5.
    M("E008", 4, "elemental", ["Prismite", "Shardmane", "Auroraclysm"], 5, 5,
      { power: { kw: "battlecry", fx: { type: "buffOne", a: 1, h: 1 } } }),
    // E009: „Pri vyložení: +1/+1 pre seba za každého Živla, ktorého si v tejto
    // hre vyložil (aj seba)" – racePlayedScale, obdoba F010 spellScale. Bývalá
    // Pečať +2/+2: živly už škálujú Živelnou silou (E007/D005/⚡), druhá
    // rasová aura bola navyše. Dočasné, nenásobí sa stupňom ani ⚡.
    M("E009", 5, "elemental", ["Gleamwisp", "Dawnwing", "Solarchon"], 7, 6,
      { power: { kw: "battlecry", fx: { type: "racePlayedScale", race: "elemental", a: 1, h: 1 } } }),
    M("E010", 6, "elemental", ["Duskdrop", "Gloamstalker", "Eclipse Sovereign"], 9, 9,
      { power: { kw: "startFight", fx: { type: "dmgAllEnemies", n: 3 } } }),

    // ---------- Nemŕtvi (Undead) ----------
    M("U001", 1, "undead", ["Rattlewink", "Bonebound", "Ossuary Hound"], 1, 1,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 2 } } }),
    // U002: „Pri vyložení: v najbližšom boji všetky tvoje Kostíky +1/+1"
    // (fightToken – bojový buff tokenu, po boji končí, stackuje sa). Kostík
    // je základ 1/1, U002 ho vracia na 2/2 – t1 undead stojí na ňom.
    // Pôvodný výboj (dmgWeakEnemy) bol elemental mechanika mimo témy.
    M("U002", 1, "undead", ["Candlejaw", "Wickgrin", "Hearthhaunt"], 2, 1,
      { power: { kw: "battlecry", fx: { type: "fightToken", token: "kostik", a: 1, h: 1 } } }),
    // U003: prevzal skorú undead auru po U004 (ten dostal reviveAs) –
    // bez t2 aury sa undead scaling zosypal (beast > undead 74 % v sime).
    M("U003", 2, "undead", ["Gravebloom", "Thornwraith", "Mausoleum Hart"], 2, 4,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: "undead", a: 0, h: 1 } } }),
    // U004: cielený battlecry – označená príšerka po smrti vstane ako 1/1
    // (stupeň 2/2, 3/3). Aury sa na vstávajúcu aplikujú; combo s deathrattle
    // summonmi na plnej ploche (Pretečenie = buffy).
    M("U004", 2, "undead", ["Mournmoth", "Veilwing", "Eclipse Mourner"], 4, 5,
      { power: { kw: "battlecry", fx: { type: "reviveAs" } } }),
    M("U005", 3, "undead", ["Cryptcub", "Sarcoclaw", "Tombsphinx"], 3, 4,
      { power: { kw: "startFight", fx: { type: "summon", token: "kostik", n: 2 } } }),
    M("U006", 3, "undead", ["Bonebell", "Knellhorn", "Cathedral Ram"], 2, 6,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 2 } } }),
    M("U007", 4, "undead", ["Shroudling", "Veilprank", "Phantom Duke"], 5, 4,
      { power: { kw: "battlecry", fx: { type: "summonCharge", n: 1 } } }),
    M("U008", 4, "undead", ["Tombturtle", "Reliquaryback", "Necropolis Tortoise"], 3, 8,
      { taunt: true, power: { kw: "battlecry", fx: { type: "futureRace", race: "undead", a: 1, h: 0 } } }),
    M("U009", 5, "undead", ["Hollowhound", "Gravehowl", "Sepulcher Sentinel"], 5, 4,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "kostik", n: 3 } } }),
    // U010: aura ako DEATHRATTLE (nie battlecry) – tank musí padnúť, potom
    // navždy buffne všetkých nemŕtvych aj kostíkov, čo ešte prídu. Combo
    // s U004 (reviveAs), Pierkom a echoDeath = dvojitá aura; endgame akcelerátor.
    M("U010", 6, "undead", ["Wispwarden", "Lantern Guard", "Soul Bastion"], 8, 10,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "futureRace", race: "undead", a: 1, h: 1 } } }),

    // ---------- Víly (Fairy) – schopnosti sa spúšťajú zoslaním kúzla ----------
    M("F002", 1, "fairy", ["Gleamcap", "Sporejester", "Mycelial Monarch"], 1, 2,
      { power: { kw: "afterSpell", fx: { type: "growSelf", a: 1, h: 1, perm: true } } }),
    M("F003", 1, "fairy", ["Petalprank", "Briarwink", "Rosethorn Duchess"], 2, 1,
      { power: { kw: "afterSpell", fx: { type: "buffFriend", a: 1, h: 1 } } }),
    // F001: battlecry draw namiesto Po kúzle – opakované ťahanie kŕmilo
    // nekonečný motor s F005 (gold za kúzlo). Evolve škáluje počet (1/2/3).
    M("F001", 2, "fairy", ["Dewwhistle", "Bloomtrill", "Garden Empress"], 2, 3,
      { power: { kw: "battlecry", fx: { type: "draw", n: 1 } } }),
    M("F004", 2, "fairy", ["Thistletick", "Burrbounce", "Thornball Titan"], 2, 5,
      { taunt: true, power: { kw: "afterSpell", fx: { type: "growSelf", a: 1, h: 2, perm: true } } }),
    M("F005", 3, "fairy", ["Moonlace", "Silversilk", "Celestial Weaver"], 3, 5,
      { power: { kw: "afterSpell", fx: { type: "gold", n: 1 } } }),
    // F006: battlecry dáva jednorazovú Iskričku – kŕmi Po kúzle motor.
    M("F006", 3, "fairy", ["Puddlepix", "Lilytrick", "Pondcourt Prince"], 4, 4,
      { power: { kw: "battlecry", fx: { type: "addSpell", spell: "iskricka", n: 1 } } }),
    M("F007", 4, "fairy", ["Acornkin", "Branchbaron", "Oakheart Regent"], 4, 7,
      { taunt: true, power: { kw: "afterSpell", fx: { type: "buffRace", race: "fairy", a: 1, h: 1 } } }),
    M("F010", 4, "fairy", ["Mirrorling", "Glimmerdouble", "Prism Queen"], 3, 4,
      { power: { kw: "battlecry", fx: { type: "spellScale", a: 1, h: 1 } } }),
    // F009 (t5): prebrala bývalú t6 schopnosť – Po kúzle +2/+2 všetkým
    // kamarátom (dočasné, aj iné rasy). Telo 8/8 → 6/6, lebo nesie ability.
    M("F009", 5, "fairy", ["Honeyfizz", "Nectarbolt", "Hivecrown"], 6, 6,
      { power: { kw: "afterSpell", fx: { type: "buffAllFriends", a: 2, h: 2 } } }),
    // F008 (t6, finálna víla): Po kúzle PERMANENTNE +1/+1 VŠETKÝM tvojim
    // príšerkám bez ohľadu na rasu (futureAll = aura pre každú rasu naraz,
    // aj balíček, tokeny). Endgame akcelerátor – t6 musí rásť rýchlejšie než t5.
    M("F008", 6, "fairy", ["Starbud", "Cometbloom", "Astral Bouquet"], 7, 8,
      { power: { kw: "afterSpell", fx: { type: "futureAll", a: 1, h: 1 } } }),

    // ---------- Draci (Dragon) – žoldnieri: zosilňujú RASU cieľa ----------
    // Cielený battlecry (fx s targetom): hráč pustí draka na vlastnú príšerku
    // a efekt sa aplikuje na JEJ rasu; bez cieľa fallback = najsilnejšia
    // vlastná príšerka. Telá nad krivkou – drak je silný aj sám.
    // t1 draci: malé battlecry namiesto vanilky (draci = žoldnieri).
    // D001 útočný: odložené oslabenie súpera (štýl Kliatby – v boji, nech
    // nezáleží na tom, kto nakupoval prvý). D007 nesie Pred bojom buff
    // najpočetnejšej rasy – dočasný a bez hromadenia, preto je na t1 bezpečný.
    // Živelná sila (`dmgBoost`) sa z t1 PRESUNULA na D005 (t3): je trvalá,
    // stackuje sa pri každom vyložení a karta cykluje balíčkom, takže na t1
    // rozbiehala živelný snowball od prvého kola. Na t3 je to odmena za už
    // postavený build, nie jeho štartér.
    M("D001", 1, "dragon", ["Flickerwyrm", "Blazewing", "Inferno Crown"], 3, 2,
      { power: { kw: "battlecry", fx: { type: "shrinkEnemy", a: 1, h: 1 } } }),
    M("D007", 1, "dragon", ["Puffsnack", "Sugarscale", "Confection Colossus"], 2, 4,
      { power: { kw: "startFight", fx: { type: "buffTopRace", a: 1, h: 1 } } }),
    M("D002", 2, "dragon", ["Puddlewing", "Tidecoil", "Oceanic Leviathan"], 3, 4,
      { power: { kw: "battlecry", fx: { type: "buffRaceOf", a: 1, h: 1 } } }),
    M("D006", 2, "dragon", ["Lunabat", "Crescentwing", "Eclipse Dragon"], 2, 5,
      { power: { kw: "endTurn", fx: { type: "buffRandomRace", a: 1, h: 1 } } }),
    M("D004", 3, "dragon", ["Shardnip", "Prismwing", "Cathedral Dragon"], 4, 4,
      { power: { kw: "battlecry", fx: { type: "discoverRace" } } }),
    M("D005", 3, "dragon", ["Nimbusnip", "Galefin", "Tempest Emperor"], 5, 4,
      { power: { kw: "battlecry", fx: { type: "dmgBoost", n: 1 } } }),
    M("D003", 4, "dragon", ["Mossclaw", "Grovewyrm", "Worldbark Dragon"], 5, 6,
      { power: { kw: "battlecry", fx: { type: "futureRaceOf", a: 1, h: 1 } } }),
    M("D008", 5, "dragon", ["Rivetwyrm", "Forgewing", "Ironstar Dragon"], 6, 9,
      { taunt: true, power: { kw: "battlecry", fx: { type: "buffRaceOf", a: 2, h: 2 } } }),
    M("D009", 5, "dragon", ["Petalwyrm", "Rosescale", "Spring Sovereign"], 7, 7,
      { power: { kw: "battlecry", fx: { type: "futureRaceOf", a: 1, h: 1 } } }),
    M("D010", 6, "dragon", ["Specklestar", "Cometcoil", "Galaxy Dragon"], 8, 8,
      { power: { kw: "battlecry", fx: { type: "evolveTarget" } } }),

    // ---------- Ogri (Ogre) – derpy chaos: veľké staty, efekt sa môže
    // obrátiť proti vlastníkovi. Všetka náhoda cez state.rng. ----------
    M("O001", 1, "ogre", ["Pebblenose", "Boulderbelly", "Mountain King"], 2, 3,
      { power: { kw: "battlecry", fx: { type: "coinflip", a: 4, h: 4, da: 2, dh: 2 } } }),
    M("O004", 1, "ogre", ["Mossbelly", "Rootcrusher", "Ancient Grove Guardian"], 3, 4),
    // O006: Ožratý úder – pri útoku 50 % šanca, že sa trafí sám za ½ útoku.
    M("O006", 2, "ogre", ["Nibblepot", "Kegcrusher", "Grand Feastkeeper"], 5, 5,
      { power: { kw: "onAttack", fx: { type: "drunkStrike" } } }),
    M("O005", 2, "ogre", ["Snowgulp", "Glaciergrip", "Winter Titan"], 4, 5),
    // O002 Chaos spúšťač: Pred bojom spustí schopnosť náhodnej príšerky na
    // bojisku – aj súperovej (deathrattle bez smrti, Pred bojom druhýkrát,
    // Pri útoku…). Evolve = počet spustení (1/2/3). Telo 5/6 = ogria krivka.
    M("O002", 3, "ogre", ["Mudmunch", "Bogstomper", "Marsh Colossus"], 5, 6,
      { power: { kw: "startFight", fx: { type: "triggerRandom", n: 1 } } }),
    M("O008", 3, "ogre", ["Bubbletusk", "Reefstomper", "Tidal Sovereign"], 5, 7),
    M("O003", 4, "ogre", ["Emberknuckle", "Cindermaul", "Volcano Chieftain"], 7, 8,
      { power: { kw: "startFight", fx: { type: "dmgAllBoth", n: 2 } } }),
    // O009 Divoký úder: každý zásah (útok aj obrana, aj Rozmach) dá náhodne
    // 1–14 namiesto 7 (wildAtk: rozsah atk−6 … atk+7, za stupeň ×2/×4).
    // Pečať a buffy posúvajú celý rozsah (+1 → 2–15). Ogrí rozptyl na tele.
    M("O009", 4, "ogre", ["Dustnose", "Dunehammer", "Sunstone Guardian"], 7, 7, { wildAtk: true }),
    M("O007", 5, "ogre", ["Rumbletuft", "Thundermaul", "Tempest Chieftain"], 9, 7,
      { power: { kw: "deathrattle", fx: { type: "dmgRandomAny", n: 5 } } }),
    // O010 Ogrí hazard (t6): Rozmach (50 % šanca zasiahnuť aj susedov cieľa)
    // + Pred bojom hod mincou – hlava: Pečať +2/+2 Ogrom, chvost: Pečať +1/+1
    // rase náhodnej SÚPEROVEJ príšerky (a chvost je backstab → aj Ogri +1/+1).
    // Každá rasa má na t6 Pečať-kartu (U010, B006, F008), ogri mali len telo
    // s Rozmachom; toto je ich uber t6 s ogrím rozptylom. Evolve ×2/×3
    // (striebro: +4/+4 alebo +2/+2 súperovi). Bez Obrancu (2026-09-12).
    M("O010", 6, "ogre", ["Twinklebrow", "Moonmaul", "Celestial Titan"], 10, 10,
      { cleave: 0.5, power: { kw: "startFight", fx: { type: "ogreGamble", a: 1, h: 1, oa: 2, oh: 2 } } }),

    // ---------- Kúzla (spoločné pre všetkých) ----------
    // Minca od t2 – na t1 bola automatická kúpa a rozbiehala snowball.
    { id: "minca", cost: 1, tier: 2, emoji: "🪙", spell: true, fx: { type: "gold", n: 2 },
      name: { sk: "Zlatá minca", cs: "Zlatá mince", en: "Gold Coin" } },
    { id: "stit", cost: 1, tier: 1, emoji: "🛡️", spell: true, fx: { type: "buffTarget", a: 0, h: 0, taunt: true },
      name: { sk: "Štít", cs: "Štít", en: "Shield" } },
    { id: "jablko", cost: 2, tier: 2, emoji: "🍎", spell: true, fx: { type: "buffTarget", a: 2, h: 2 },
      name: { sk: "Zázračné jablko", cs: "Zázračné jablko", en: "Magic Apple" } },
    { id: "ticho", cost: 2, tier: 2, emoji: "🤫", spell: true, fx: { type: "silence", n: 1 },
      name: { sk: "Umlčanie", cs: "Umlčení", en: "Silence" } },
    { id: "kniha", cost: 2, tier: 3, emoji: "📖", spell: true, fx: { type: "discover" },
      name: { sk: "Kniha prianí", cs: "Kniha přání", en: "Wish Book" } },
    // Draw kúzlo (Zvitok múdrosti, draw 2) ODSTRÁNENÉ: víly s ním pretočili
    // celý balíček a všetky kúzla každú hru – motor Po kúzle nemal strop.
    // Jediný draw v hre je F001 (battlecry, 1/2/3 podľa stupňa).
    { id: "koren", cost: 2, tier: 3, emoji: "🌱", spell: true, fx: { type: "buffTarget", a: 0, h: 4, taunt: true },
      name: { sk: "Pevný koreň", cs: "Pevný kořen", en: "Sturdy Root" } },
    { id: "vlna", cost: 2, tier: 3, emoji: "🌊", spell: true, fx: { type: "buffAllFriends", a: 1, h: 1 },
      name: { sk: "Veľká vlna", cs: "Velká vlna", en: "Big Wave" } },
    { id: "srdce", cost: 3, tier: 4, emoji: "❤️‍🔥", spell: true, fx: { type: "buffTarget", a: 3, h: 3 },
      name: { sk: "Ohnivé srdce", cs: "Ohnivé srdce", en: "Fiery Heart" } },
    // Živelná sila (bývalá Večná iskra): trvalý „ability power" – výboje,
    // výbuchy (všetky rasy, aj Blesk) a DOČASNÉ buffy Živlov (E004 Pri
    // útoku, E007 Po nákupe, E008 Pri vyložení) navždy +1. Permanentné aury
    // (E003/E009) nie – snowball.
    { id: "iskra", cost: 2, tier: 3, emoji: "⚡", spell: true, fx: { type: "dmgBoost", n: 1 },
      name: { sk: "Živelná sila", cs: "Živelná síla", en: "Elemental Power" } },
    { id: "svatoziara", cost: 2, tier: 3, emoji: "😇", spell: true, fx: { type: "buffTarget", a: 0, h: 0, shield: true },
      name: { sk: "Svätožiara", cs: "Svatozář", en: "Halo" } },
    { id: "pierko", cost: 2, tier: 3, emoji: "🪶", spell: true, fx: { type: "buffTarget", a: 0, h: 0, revive: true },
      name: { sk: "Fénixovo pierko", cs: "Fénixovo pírko", en: "Phoenix Feather" } },
    // Vichor: cieľ útočí v boji dvakrát – „Pri útoku" karty (E004, O006) sa
    // spustia pri každom útoku; s Božským štítom prežije aj druhý výmenný úder.
    { id: "vichor", cost: 2, tier: 4, emoji: "🌪️", spell: true, fx: { type: "buffTarget", a: 0, h: 0, windfury: true },
      name: { sk: "Vichor", cs: "Vichr", en: "Windfury" } },
    { id: "kliatba", cost: 2, tier: 4, emoji: "🐸", spell: true, fx: { type: "hex", n: 1 },
      name: { sk: "Žabia kliatba", cs: "Žabí kletba", en: "Frog Curse" } },
    // Ovčia premena: najsilnejšia odložená kliatba – na začiatku najbližšieho
    // boja sa náhodná súperova príšerka zmení na Ovečku 0/1 (bez schopnosti,
    // Obrancu, štítu…). Tvrdý counter na jednu veľkú kartu, preto až t5.
    { id: "ovca", cost: 2, tier: 5, emoji: "🐑", spell: true, fx: { type: "polymorph", n: 1 },
      name: { sk: "Ovčia premena", cs: "Ovčí proměna", en: "Polymorph" } },
    // Blesk: prvé ofenzívne kúzlo – odložený výboj (štýl kliatby/umlčania),
    // škáluje so Živelnou silou (dmgBoost), synergia s vílami (lacný trigger).
    { id: "blesk", cost: 2, tier: 3, emoji: "⛈️", spell: true, fx: { type: "bolt", n: 1 },
      name: { sk: "Blesk", cs: "Blesk", en: "Lightning Bolt" } },
    // Klobúk: chaos premena – vlastná príšerka sa zmení na náhodnú o tier
    // vyššiu (stupeň 1). Pivot nástroj + zábava pre deti (ogre vibe).
    { id: "klobuk", cost: 2, tier: 4, emoji: "🎩", spell: true, fx: { type: "transform" },
      name: { sk: "Kúzelný klobúk", cs: "Kouzelný klobouk", en: "Magic Hat" } },
    // Zrkadlo: akcelerátor trojíc pre late game (t5+ nemal žiadne kúzlo).
    { id: "zrkadlo", cost: 3, tier: 5, emoji: "🪞", spell: true, fx: { type: "copyToDeck" },
      name: { sk: "Zrkadlo", cs: "Zrcadlo", en: "Mirror" } },
    // Portál: vlastná príšerka na ploche sa vymení za náhodnú z balíčka –
    // prichádzajúca sa vyloží (battlecry znova), odchádzajúca ide do balíčka.
    // Endgame nástroj: dostaň z balíčka veľkú kartu hneď, nie o kolo neskôr.
    { id: "portal", cost: 2, tier: 5, emoji: "🌀", spell: true, fx: { type: "swapDeck" },
      name: { sk: "Kúzelný portál", cs: "Kouzelný portál", en: "Magic Portal" } },
    // Poklad: greed ekonomika pre najvyššie tiery – polovica zlata hneď,
    // polovica na začiatku ďalšieho kola (jediný spôsob, ako si preniesť zlato).
    { id: "poklad", cost: 2, tier: 5, emoji: "💰", spell: true, fx: { type: "goldLater", n: 2 },
      name: { sk: "Poklad škriatka", cs: "Poklad skřítka", en: "Goblin Treasure" } },
    // Hviezdna moc: jediné t6 kúzlo – Pečať +1/+1 KAŽDEJ rase (ako F008) a
    // k tomu Živelná sila +1. Živelná sila zosilňuje aj buffy kúziel, takže
    // každé ďalšie kúzlo dáva viac – late-game snowball za plnú cenu.
    { id: "hviezda", cost: 3, tier: 6, emoji: "🌟", spell: true, fx: { type: "starPower", a: 1, h: 1, n: 1 },
      name: { sk: "Hviezdna moc", cs: "Hvězdná moc", en: "Star Power" } },
  ];

  // Tokeny – vyvolávané príšerky, nie sú v obchode ani v balíčku.
  const TOKENS = [
    // Kostík 1/1 (bol 2/1) – hordu škáluje U002 (bojový +1/+1) a aury.
    { id: "kostik", tier: 1, race: "undead", emoji: "💀", atk: 1, hp: 1, token: true,
      namePl: { sk: "Kostíky", cs: "Kůstky", en: "Bonelets" }, // množné číslo (U002 text)
      name: { sk: "Kostík", cs: "Kůstka", en: "Bonelet" } },
    // Bublina: elemental token z E002 – pri smrti výboj 1 (+Živelná sila),
    // jeden zásah (hits: 1). Tokeny sú vždy stupňa 1 – evolvnutý vyvolávač
    // ich dáva viac (+1 za stupeň), nie väčšie. Bez Pretečenia (len undead).
    // SuperMláďa: token B006 – Obranca, Pri smrti Pečať +1/+1 Zvieratám
    // (strieborný B006 = 3 SuperMláďatá = 3 Pečate). Klasické Mláďa nemení.
    { id: "supermlada", tier: 1, race: "beast", emoji: "🐻", atk: 1, hp: 1, token: true, taunt: true,
      namePl: { sk: "SuperMláďatá", cs: "SuperMláďata", en: "SuperCubs" },
      power: { kw: "deathrattle", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } },
      name: { sk: "SuperMláďa", cs: "SuperMládě", en: "SuperCub" } },
    { id: "bublina", tier: 1, race: "elemental", emoji: "🫧", atk: 1, hp: 1, token: true,
      namePl: { sk: "Bubliny", cs: "Bubliny", en: "Bubbles" },
      power: { kw: "deathrattle", fx: { type: "dmgWeakEnemy", n: 1, hits: 1 } },
      name: { sk: "Bublina", cs: "Bublina", en: "Bubble" } },
    // Iskrička: jednorazové kúzlo z battlecry F006 – po zoslaní ZMIZNE
    // (nejde do kôpky ani balíčka), rovnako prepadne nezahraná na konci ťahu.
    { id: "iskricka", tier: 1, emoji: "✨", spell: true, token: true, cost: 0,
      fx: { type: "buffTarget", a: 1, h: 0 },
      name: { sk: "Iskrička", cs: "Jiskřička", en: "Sparkle" },
      nameAcc: { sk: "Iskričku", cs: "Jiskřičku", en: "Sparkle" } }, // akuzatív („pridaj Iskričku“)
    // Mláďa má Obrancu: berie údery, padne skoro a kŕmi sovu B004 („Keď
    // zomrie tvoje Mláďa"); chráni aj mrchožrúta B009.
    { id: "mlada", tier: 1, race: "beast", emoji: "🐣", atk: 1, hp: 1, token: true, taunt: true,
      namePl: { sk: "Mláďatá", cs: "Mláďata", en: "Cubs" },
      name: { sk: "Mláďa", cs: "Mládě", en: "Cub" } },
    // Ovečka 0/1: výsledok Ovčej premeny – súperova príšerka na jeden boj.
    // Neútočí (0), padne na prvý úder, preživšia dá hrdinovi len 1 (tier 1).
    { id: "ovecka", tier: 1, race: "beast", emoji: "🐑", atk: 0, hp: 1, token: true,
      namePl: { sk: "Ovečky", cs: "Ovečky", en: "Sheep" },
      name: { sk: "Ovečka", cs: "Ovečka", en: "Sheep" } },
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
    afterSpell: { sk: "Po kúzle", cs: "Po kouzle", en: "After a spell" },
    onAttack: { sk: "Pri útoku", cs: "Při útoku", en: "On attack" },
    raceDeath: { sk: "Kamarát padol", cs: "Kamarád padl", en: "Friend fell" }, // proc badge
    onEnemySummon: { sk: "Výboj na token", cs: "Výboj na token", en: "Token zap" }, // proc badge
  };
  const TAUNT_LABEL = { sk: "Obranca", cs: "Obránce", en: "Taunt" };
  const CLEAVE_LABEL = { sk: "Rozmach", cs: "Rozmach", en: "Cleave" };
  const WILD_LABEL = { sk: "Divoký úder", cs: "Divoký úder", en: "Wild Strike" };
  // Divoký úder (def.wildAtk): rozsah zásahu podľa AKTUÁLNEHO útoku (buffy
  // ho posúvajú) a stupňa: atk − 6·m … atk + 7·m (bronz 7 → 1–14).
  const WILD_LOW = 6, WILD_HIGH = 7;
  const wildRange = (atk, rank) => {
    const m = STAT_MULT[rank] || 1;
    return [Math.max(0, atk - WILD_LOW * m), atk + WILD_HIGH * m];
  };
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
  // Pečať: trvalá rasová aura (futureRace / futureRaceOf / futureAll) – všetky
  // tvoje príšerky danej rasy (plocha, ruka, balíček, kôpka, tokeny aj
  // budúce) dostanú staty NAVŽDY. Vysvetlenie je v pravidlách (game.js L.rules).
  const IMPRINT = { sk: "Pečať", cs: "Pečeť", en: "Imprint" };

  // Šablóny textov efektov. `m` je násobič čísel podľa stupňa (1/2/3).
  const FX_TEXT = {
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
      sk: `${IMPRINT.sk} +${f.a * m}/+${f.h * m} ${RACES_PL[f.race].sk}`,
      cs: `${IMPRINT.cs} +${f.a * m}/+${f.h * m} ${RACES_PL[f.race].cs}`,
      en: `${IMPRINT.en} +${f.a * m}/+${f.h * m} to ${RACES_PL[f.race].en}`,
    }),
    futureAll: (f, m) => ({
      sk: `${IMPRINT.sk} +${f.a * m}/+${f.h * m} všetkým tvojim príšerkám (každá rasa)`,
      cs: `${IMPRINT.cs} +${f.a * m}/+${f.h * m} všem tvým příšerkám (každá rasa)`,
      en: `${IMPRINT.en} +${f.a * m}/+${f.h * m} to all your minions (every race)`,
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
        sk: `+${a}/+${h} všetkým ${RACES_PL[f.race].sk}${tail.sk}`,
        cs: `+${a}/+${h} všem ${RACES_PL[f.race].cs}${tail.cs}`,
        en: `+${a}/+${h} to all ${RACES_PL[f.race].en}${tail.en}`,
      };
    },
    // Pečať pre všetky rasy + Živelná sila naraz (kúzlo Hviezdna moc).
    starPower: (f, m) => ({
      sk: `${IMPRINT.sk} +${f.a * m}/+${f.h * m} všetkým tvojim príšerkám (každá rasa) a Živelná sila +${f.n * m}`,
      cs: `${IMPRINT.cs} +${f.a * m}/+${f.h * m} všem tvým příšerkám (každá rasa) a Živelná síla +${f.n * m}`,
      en: `${IMPRINT.en} +${f.a * m}/+${f.h * m} to all your minions (every race) and Elemental Power +${f.n * m}`,
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
    summon: (f, m, hl) => {
      const tok = byId[f.token];
      const n = f.n + m - 1;
      const base = {
        sk: `vyvolaj ${n}× ${tok.name.sk} (${tok.atk}/${tok.hp})`,
        cs: `vyvolej ${n}× ${tok.name.cs} (${tok.atk}/${tok.hp})`,
        en: `summon ${n}× ${tok.name.en} (${tok.atk}/${tok.hp})`,
      };
      if (tok.power) { // token so schopnosťou (Bublina: Pri smrti výboj) – stupeň 1
        const inner = FX_TEXT[tok.power.fx.type](tok.power.fx, 1, hl);
        base.sk += `; každá ${KW_LABEL[tok.power.kw].sk.toLowerCase()}: ${inner.sk}`;
        base.cs += `; každá ${KW_LABEL[tok.power.kw].cs.toLowerCase()}: ${inner.cs}`;
        base.en += `; each one ${KW_LABEL[tok.power.kw].en.toLowerCase()}: ${inner.en}`;
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
      const n = byId[f.spell].nameAcc || byId[f.spell].name;
      return {
        sk: `pridaj do ruky ${m > 1 ? m + "× " : ""}${n.sk} (jednorazové kúzlo)`,
        cs: `přidej do ruky ${m > 1 ? m + "× " : ""}${n.cs} (jednorázové kouzlo)`,
        en: `add ${m > 1 ? m + "× " : ""}${byId[f.spell].name.en} to your hand (one-shot spell)`,
      };
    },
    fightToken: (f, m) => {
      const n = byId[f.token].namePl; // množné číslo („všetky tvoje Kostíky“)
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
      const acc = { elemental: { sk: "Živla", cs: "Živla", en: "Elemental" } }[f.race] || RACES[f.race];
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
      sk: `vyber príšerku – ${IMPRINT.sk} +${f.a * m}/+${f.h * m} jej rase`,
      cs: `vyber příšerku – ${IMPRINT.cs} +${f.a * m}/+${f.h * m} její rase`,
      en: `pick a minion – ${IMPRINT.en} +${f.a * m}/+${f.h * m} to its race`,
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
    // O010: hod mincou – hlava Pečať Ogrom, chvost Pečať rase súperovej príšerky.
    ogreGamble: (f, m) => ({
      sk: `hoď mincou 🪙 – ${IMPRINT.sk} +${f.oa * m}/+${f.oh * m} Ogrom, alebo ${IMPRINT.sk} +${f.a * m}/+${f.h * m} rase náhodnej SÚPEROVEJ príšerky`,
      cs: `hoď mincí 🪙 – ${IMPRINT.cs} +${f.oa * m}/+${f.oh * m} Zlobrům, nebo ${IMPRINT.cs} +${f.a * m}/+${f.h * m} rase náhodné SOUPEŘOVY příšerky`,
      en: `flip a coin 🪙 – ${IMPRINT.en} +${f.oa * m}/+${f.oh * m} to Ogres, or ${IMPRINT.en} +${f.a * m}/+${f.h * m} to the race of a random ENEMY minion`,
    }),
  };

  // Popis karty pre daný stupeň (rank 1–3) a jazyk.
  // html=true obalí kľúčové slová (Taunt, Deathrattle…) do <strong>.
  // boost = trvalý bonus Večnej iskry majiteľa – výboje/výbuchy ukážu
  // navýšené číslo (html navyše zeleno cez <span class="boosted">).
  // opts.atk: aktuálny útok inštancie (Divoký úder ukáže posunutý rozsah).
  function cardText(def, rank, lang, html, boost, opts) {
    const m = rank; // efekty ×1/×2/×3
    const b = s => (html ? `<strong>${s}</strong>` : s);
    const hl = base => {
      if (!boost) return String(base);
      const v = base + boost;
      return html ? `<span class="boosted">${v}</span>` : String(v);
    };
    const fxText = (fx, mult, kw) => FX_TEXT[fx.type](fx, mult, hl, kw, def)[lang];
    const parts = [];
    if (def.taunt) parts.push(b(TAUNT_LABEL[lang]) + ".");
    if (def.cleave) {
      parts.push(`${b(CLEAVE_LABEL[lang])}: ${cleaveText(Math.round(def.cleave * 100))[lang]}.`);
    }
    if (def.wildAtk) {
      const atk = opts && opts.atk != null ? opts.atk : def.atk * STAT_MULT[rank];
      parts.push(`${b(WILD_LABEL[lang])}: ${wildText(wildRange(atk, rank))[lang]}.`);
    }
    for (const pw of powersOf(def)) {
      if (pw.kw === "raceDeath") {
        // Scavenger: label nesie rasu („Keď zomrie tvoje Zviera: …“).
        const r = RACES[pw.fx.race];
        const label = { sk: `Keď zomrie tvoje ${r.sk}`, cs: `Když zemře tvé ${r.cs}`, en: `When your ${r.en} dies` };
        parts.push(`${b(label[lang])}: ${fxText(pw.fx, m)}.`);
      } else if (pw.kw === "onEnemySummon") {
        // Lovec tokenov: vlastný label („Keď súper vyvolá token: …“).
        const label = { sk: "Keď súper vyvolá prvý token", cs: "Když soupeř vyvolá první token", en: "When the enemy summons their first token" };
        parts.push(`${b(label[lang])}: ${fxText(pw.fx, m)}.`);
      } else {
        parts.push(`${b(KW_LABEL[pw.kw][lang])}: ${fxText(pw.fx, m, pw.kw)}.`);
      }
    }
    if (def.spell) { const s = fxText(def.fx, 1); parts.push(s[0].toUpperCase() + s.slice(1) + "."); }
    if (def.spell && def.token) {
      const note = { sk: "Jednorazové – po ťahu zmizne.", cs: "Jednorázové – po tahu zmizí.", en: "One-shot – vanishes after the turn." };
      parts.push(note[lang]);
    }
    return parts.join(" ");
  }

  // Staty pre stupeň: bronz ×1, striebro ×2, zlato ×4.
  const STAT_MULT = [null, 1, 2, 4];

  // Schopnosti karty: `power` (hlavná – bot, cielenie battlecry) + voliteľná
  // `power2` (B006: Pred bojom + Pri smrti). Engine spúšťa všetky s daným kw.
  const powersOf = def => def.power2 ? [def.power, def.power2] : def.power ? [def.power] : [];

  return { RACES, RACES_PL, RACES_NOM, RACE_ICON, DEFS, TOKENS, byId, nameOf, artOf, cardText, powersOf, STAT_MULT, KW_LABEL, TAUNT_LABEL, CLEAVE_LABEL, WILD_LABEL, IMPRINT, wildRange };
})();

if (typeof module !== "undefined") module.exports = Cards;
