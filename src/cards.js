// Dáta kariet. Roster = 60 príšer z art sád (assets/cards), 6 rás × 10,
// každá príšera má vlastné meno a obrázok pre každý evolučný stupeň
// (bronz → striebro → zlato), + 9 Psíkov (rasa doggy, art sada Doggo).
// Karta bez artu by dostala noArt: true (generický rám s emoji ako tokeny).
// Texty schopností sa generujú zo šablón v src/i18n.js (L.cards).
//
// Príšera: { id, tier, race, stageNames: [meno1, meno2, meno3], atk, hp,
//            taunt?, power?, noArt?, emoji? }  – art sa odvodí z id: assets/cards/<ID>_<rank>.webp
// Kúzlo:   { id, tier, emoji, spell: true, fx }  – meno {sk,cs,en} sa pripojí z L.cards.names
//          gen: true = kúzlo sa len generuje (nie je v obchode ani v poole);
//          pet: true = Pohladkanie – kúzlo so stupňom (rank) bez stropu,
//          3 rovnaké sa spoja (Engine.checkPetMerge), meno L.cards.petName(rank)
// power = { kw: "battlecry"|"deathrattle"|"startFight"|"endTurn", fx: {...} }
// fx = { type, a?, h?, n?, race?, token?, taunt? } – čísla sa násobia stupňom (×1/×2/×3).
//
// Classy nie sú – každý hráč hrá z rovnakého poolu. Štartovací balíček je
// 10 náhodných kariet tieru 1, max 2 kópie jednej karty (skladá ho engine).

const Cards = (() => {
  // Všetky texty (rasy, kľúčové slová, mená kúziel/tokenov, šablóny
  // schopností) sú v src/i18n.js (L.cards) – tu len aliasy pre existujúce API.
  const RACES = L.cards.races;
  const RACES_PL = L.cards.racesPl;
  const RACES_NOM = L.cards.racesNom;
  const RACE_ICON = { beast: "🐾", elemental: "✨", undead: "💀", fairy: "🧚", dragon: "🐲", ogre: "👹", doggy: "🐶" };

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
    // B006 = t6 beast payoff (rasa nemala t6 kartu a pôsobila slabo): 7/9,
    // Pri smrti vyvolá 2 SuperMláďatá – vlastný token (klasické Mláďa
    // ostáva): 1/1 Obranca, ktorý Pri smrti položí Pečať +1/+1 Zvieratám.
    // Stupeň rodiča škáluje token aj jeho Pečať. Bola t4 Pečať +0/+1.
    // Obranca odstránený (14. 9. 2026): s ním padal prvý a SuperMláďatá
    // Pečate rozdali skôr, než mal súper čo zabiť – bez neho je to payoff.
    M("B006", 6, "beast", ["Rumblebean", "Boulderroll", "Fortressback"], 7, 9,
      { power: { kw: "deathrattle", fx: { type: "summon", token: "supermlada", n: 2 } } }),
    M("B009", 4, "beast", ["Prowlpip", "Sabershade", "Moonfang"], 5, 4,
      { power: { kw: "raceDeath", fx: { type: "growSelf", race: "beast", a: 2, h: 2 } } }),
    M("B010", 5, "beast", ["Shellop", "Reefram", "Tidemammoth"], 6, 10,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } } }),

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
    // E003: živelná Pečať +1/+1 (bola +0/+1) – živly potrebujú útok, nie
    // len životy. Na t3 ako B002 (bola t2 – Pečať v 2. kole bola priskoro),
    // tiery vymenené so Zappipom E006.
    M("E003", 3, "elemental", ["Pebblit", "Craggleback", "Mountainheart"], 3, 5,
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
    M("E006", 2, "elemental", ["Zappip", "Voltclaw", "Stormregent"], 4, 4,
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

    // ---------- Psíci (Doggy) – good boys: Pohladkanie + psie správanie ----------
    // Art sada Fantasy_Cards_Doggo (9 psov × 3 stupne, 16. 9. 2026) = 9 kariet:
    // corgi zabávač P001, buldog rytier P002 Obranca, pudlí alchymistka P003
    // Ocikaj, jazvečík vynálezca P004 Aport, bígl stopár P005 Vyňuchaj, husky
    // šamanka P006 Zavýjanie, retriever bylinkár P007 Pečať, dalmatín showman
    // P008, shiba ronin P009 Vodca svorky. Motor rasy je
    // kúzlo Pohladkanie (id `pet`): +1/+1, Psíkovi NAVŽDY (pa/ph), 3 rovnaké
    // sa spoja na vyšší stupeň ×2 (Super +2, Mega +4, Giga +8…) bez stropu.
    // Generujú ho LEN P001 (Pri vyložení) a P002 (Pri smrti) – odhad 2–3
    // pohladkania za kolo, 25–35 za hru (logy: hra ~12 kôl, hráč vyloží
    // 1,5–2 karty dominantnej rasy za kolo). Zvyšok rasy sú psie schopnosti:
    // Ocikaj (staty na polovicu), Aport (krádež polovice zvyšných statov),
    // Vyňuchaj (tutor), Zavýjanie. Pohladkanie sa predáva za 0 (inak by
    // generátory boli zlatý motor). Pôvodný návrh mal 11 kariet (Brechot –
    // Obranca preč, Snackpaw – Po nákupe pohladkanie); art sada má 9 psov,
    // tak rasa má 9 kariet ako ostatné (10) – t3 má len jednu kartu.
    M("P001", 1, "doggy", ["Wigglecrown", "Jinglepaw", "Carnival King"], 1, 2,
      { power: { kw: "battlecry", fx: { type: "addPet", n: 1 } } }),
    M("P002", 1, "doggy", ["Bumblesnout", "Ironjowl", "Royal Bulwark"], 1, 3,
      { taunt: true, power: { kw: "deathrattle", fx: { type: "addPet", n: 1 } } }),
    // P003 Ocikaj: náhodný súper má útok aj životy na polovicu (zaokrúhlené
    // hore, 1 ostane 1), do konca boja. Stupeň = počet súperov, každého raz.
    M("P003", 2, "doggy", ["Fizzlepuff", "Brewbark", "Grand Alchehound"], 2, 3,
      { power: { kw: "startFight", fx: { type: "halveEnemy" } } }),
    // P004 Aport (Po údere): ak súper úder prežije, polovicu jeho zvyšných
    // statov ukradne a dá náhodnému kamarátovi. Bez stupňa (ako O006).
    M("P004", 2, "doggy", ["Zipbolt", "Gearhound", "Clockwork Ace"], 3, 2,
      { power: { kw: "afterAttack", fx: { type: "fetchSteal" } } }),
    // P005 Vyňuchaj: tutor – Pohladkanie z balíčka (najvyšší stupeň), inak
    // náhodná karta. Psí draw – bez neho by pohladkania riedili balíček.
    M("P005", 3, "doggy", ["Snifflecap", "Trailwhisker", "Grand Scentmaster"], 3, 4,
      { power: { kw: "battlecry", fx: { type: "fetchPet", n: 1 } } }),
    // P006 Zavýjanie: všetci Psíci +1/+1 za každého Psíka na ploche (aj seba).
    M("P006", 4, "doggy", ["Snowblink", "Aurorawoof", "Froststar Shaman"], 4, 7,
      { power: { kw: "startFight", fx: { type: "howl", a: 1, h: 1 } } }),
    M("P007", 4, "doggy", ["Sunnytail", "Kindheart", "Dawn Shepherd"], 5, 6,
      { power: { kw: "battlecry", fx: { type: "futureRace", race: "doggy", a: 1, h: 1 } } }),
    // P008: +1/+1 za každé zahrané Pohladkanie (počet zoslaní – po spojení
    // je to 15–25 za hru; body pohladkaní by dali 60+).
    M("P008", 5, "doggy", ["Spotpop", "Emberdot", "Grand Firemaster"], 6, 6,
      { power: { kw: "battlecry", fx: { type: "petScale", a: 1, h: 1 } } }),
    // P009 (t6): Vodca svorky (kw packLeader, pasívna v nákupnej fáze) – kým
    // je na ploche, každé Pohladkanie pohladká všetkých tvojich Psíkov
    // (engine SPELL_CAST.petBuff). Masívne hladkanie je celý endgame psíkov;
    // bojové časti (kopírovanie statov, Verný až do konca) hráč zamietol.
    M("P009", 6, "doggy", ["Miso", "Shadowshiba", "Moonfang Ronin"], 8, 8,
      { power: { kw: "packLeader", fx: { type: "packLeader" } } }),

    // ---------- Kúzla (spoločné pre všetkých) ----------
    // Pohladkanie: generované kúzlo psíkov (nie je v obchode – gen), cena 0,
    // stupeň bez stropu (sila ×2 za stupeň – L.cards.petValue). Cieľ: vlastná
    // príšerka; Psíkovi ostáva navždy. Spúšťa vílie „Po kúzle" (je to kúzlo),
    // Živelná sila ho NEzosilňuje.
    { id: "pet", cost: 0, tier: 1, emoji: "👋", spell: true, gen: true, pet: true, fx: { type: "petBuff", a: 1, h: 1 } },
    // Minca od t2 – na t1 bola automatická kúpa a rozbiehala snowball.
    { id: "minca", cost: 1, tier: 2, emoji: "🪙", spell: true, fx: { type: "gold", n: 2 } },
    { id: "stit", cost: 1, tier: 1, emoji: "🛡️", spell: true, fx: { type: "buffTarget", a: 0, h: 0, taunt: true } },
    { id: "jablko", cost: 2, tier: 2, emoji: "🍎", spell: true, fx: { type: "buffTarget", a: 2, h: 2 } },
    { id: "ticho", cost: 2, tier: 2, emoji: "🤫", spell: true, fx: { type: "silence", n: 1 } },
    { id: "kniha", cost: 2, tier: 3, emoji: "📖", spell: true, fx: { type: "discover" } },
    // Draw kúzlo (Zvitok múdrosti, draw 2) ODSTRÁNENÉ: víly s ním pretočili
    // celý balíček a všetky kúzla každú hru – motor Po kúzle nemal strop.
    // Jediný draw v hre je F001 (battlecry, 1/2/3 podľa stupňa).
    { id: "koren", cost: 2, tier: 3, emoji: "🌱", spell: true, fx: { type: "buffTarget", a: 0, h: 4, taunt: true } },
    { id: "vlna", cost: 2, tier: 3, emoji: "🌊", spell: true, fx: { type: "buffAllFriends", a: 1, h: 1 } },
    { id: "srdce", cost: 3, tier: 4, emoji: "❤️‍🔥", spell: true, fx: { type: "buffTarget", a: 3, h: 3 } },
    // Živelná sila (bývalá Večná iskra): trvalý „ability power" – výboje,
    // výbuchy (všetky rasy, aj Blesk) a DOČASNÉ buffy Živlov (E004 Pri
    // útoku, E007 Po nákupe, E008 Pri vyložení) navždy +1. Permanentné aury
    // (E003/E009) nie – snowball.
    { id: "iskra", cost: 2, tier: 3, emoji: "⚡", spell: true, fx: { type: "dmgBoost", n: 1 } },
    { id: "svatoziara", cost: 2, tier: 3, emoji: "😇", spell: true, fx: { type: "buffTarget", a: 0, h: 0, shield: true } },
    { id: "pierko", cost: 2, tier: 3, emoji: "🪶", spell: true, fx: { type: "buffTarget", a: 0, h: 0, revive: true } },
    // Vichor: cieľ útočí v boji dvakrát – „Pri útoku" karty (E004, O006) sa
    // spustia pri každom útoku; s Božským štítom prežije aj druhý výmenný úder.
    { id: "vichor", cost: 2, tier: 4, emoji: "🌪️", spell: true, fx: { type: "buffTarget", a: 0, h: 0, windfury: true } },
    { id: "kliatba", cost: 2, tier: 4, emoji: "🐸", spell: true, fx: { type: "hex", n: 1 } },
    // Ovčia premena: najsilnejšia odložená kliatba – na začiatku najbližšieho
    // boja sa náhodná súperova príšerka zmení na Ovečku 0/1 (bez schopnosti,
    // Obrancu, štítu…). Tvrdý counter na jednu veľkú kartu, preto až t5.
    { id: "ovca", cost: 2, tier: 5, emoji: "🐑", spell: true, fx: { type: "polymorph", n: 1 } },
    // Blesk: prvé ofenzívne kúzlo – odložený výboj (štýl kliatby/umlčania),
    // škáluje so Živelnou silou (dmgBoost), synergia s vílami (lacný trigger).
    { id: "blesk", cost: 2, tier: 3, emoji: "⛈️", spell: true, fx: { type: "bolt", n: 1 } },
    // Klobúk: chaos premena – vlastná príšerka sa zmení na náhodnú o tier
    // vyššiu (stupeň 1). Pivot nástroj + zábava pre deti (ogre vibe).
    { id: "klobuk", cost: 2, tier: 4, emoji: "🎩", spell: true, fx: { type: "transform" } },
    // Zrkadlo: akcelerátor trojíc pre late game (t5+ nemal žiadne kúzlo).
    { id: "zrkadlo", cost: 3, tier: 5, emoji: "🪞", spell: true, fx: { type: "copyToDeck" } },
    // Portál: vlastná príšerka na ploche sa vymení za náhodnú z balíčka –
    // prichádzajúca sa vyloží (battlecry znova), odchádzajúca ide do balíčka.
    // Endgame nástroj: dostaň z balíčka veľkú kartu hneď, nie o kolo neskôr.
    { id: "portal", cost: 2, tier: 5, emoji: "🌀", spell: true, fx: { type: "swapDeck" } },
    // Poklad: greed ekonomika pre najvyššie tiery – polovica zlata hneď,
    // polovica na začiatku ďalšieho kola (jediný spôsob, ako si preniesť zlato).
    { id: "poklad", cost: 2, tier: 5, emoji: "💰", spell: true, fx: { type: "goldLater", n: 2 } },
    // Hviezdna moc: jediné t6 kúzlo – Pečať +1/+1 KAŽDEJ rase (ako F008) a
    // k tomu Živelná sila +1. Živelná sila zosilňuje aj buffy kúziel, takže
    // každé ďalšie kúzlo dáva viac – late-game snowball za plnú cenu.
    { id: "hviezda", cost: 3, tier: 6, emoji: "🌟", spell: true, fx: { type: "starPower", a: 1, h: 1, n: 1 } },
  ];

  // Tokeny – vyvolávané príšerky, nie sú v obchode ani v balíčku.
  const TOKENS = [
    // Kostík 1/1 (bol 2/1) – hordu škáluje U002 (bojový +1/+1) a aury.
    { id: "kostik", tier: 1, race: "undead", emoji: "💀", atk: 1, hp: 1, token: true },
    // Bublina: elemental token z E002 – pri smrti výboj 1 (+Živelná sila),
    // jeden zásah (hits: 1). Tokeny sú vždy stupňa 1 – evolvnutý vyvolávač
    // ich dáva viac (+1 za stupeň), nie väčšie. Bez Pretečenia (len undead).
    // SuperMláďa: token B006 – Obranca, Pri smrti Pečať +1/+1 Zvieratám
    // (strieborný B006 = 3 SuperMláďatá = 3 Pečate). Klasické Mláďa nemení.
    { id: "supermlada", tier: 1, race: "beast", emoji: "🐻", atk: 1, hp: 1, token: true, taunt: true,
      power: { kw: "deathrattle", fx: { type: "futureRace", race: "beast", a: 1, h: 1 } } },
    { id: "bublina", tier: 1, race: "elemental", emoji: "🫧", atk: 1, hp: 1, token: true,
      power: { kw: "deathrattle", fx: { type: "dmgWeakEnemy", n: 1, hits: 1 } } },
    // Iskrička: jednorazové kúzlo z battlecry F006 – po zoslaní ZMIZNE
    // (nejde do kôpky ani balíčka), rovnako prepadne nezahraná na konci ťahu.
    { id: "iskricka", tier: 1, emoji: "✨", spell: true, token: true, cost: 0,
      fx: { type: "buffTarget", a: 1, h: 0 } },
    // Mláďa má Obrancu: berie údery, padne skoro a kŕmi sovu B004 („Keď
    // zomrie tvoje Mláďa"); chráni aj mrchožrúta B009.
    { id: "mlada", tier: 1, race: "beast", emoji: "🐣", atk: 1, hp: 1, token: true, taunt: true },
    // Ovečka 0/1: výsledok Ovčej premeny – súperova príšerka na jeden boj.
    // Neútočí (0), padne na prvý úder, preživšia dá hrdinovi len 1 (tier 1).
    { id: "ovecka", tier: 1, race: "beast", emoji: "🐑", atk: 0, hp: 1, token: true },
  ];

  const byId = {};
  for (const d of [...DEFS, ...TOKENS]) byId[d.id] = d;
  // Mená kúziel a tokenov (aj množné číslo / akuzatív) sú v src/i18n.js – pripojíme ich k definíciám,
  // aby def.name fungovalo ako doteraz (nameOf, UI, bot).
  for (const d of [...DEFS, ...TOKENS]) {
    if (L.cards.names[d.id]) d.name = L.cards.names[d.id];
    if (L.cards.namesPl[d.id]) d.namePl = L.cards.namesPl[d.id];
    if (L.cards.namesAcc[d.id]) d.nameAcc = L.cards.namesAcc[d.id];
  }

  // Meno karty pre daný stupeň (mená príšer sú vlastné mená, neprekladajú sa).
  function nameOf(def, rank, lang) {
    if (def.pet) return L.cards.petName(rank || 1)[lang] ?? L.cards.petName(rank || 1).sk; // Pohladkanie podľa stupňa
    if (def.stageNames) return def.stageNames[Math.min(rank, 3) - 1];
    const n = def.name;
    return n[lang] ?? n.sk;
  }

  // Kúzla majú kompletnú kartu (assets/cards/<id>_1.webp, rovnaký rám ako
  // príšery: kryštál s tierom vľavo hore, banner mena, textový box, kruh na
  // cenu dole). Nové kúzlo bez artu pridaj sem, kým art nemá – dostane emoji.
  const SPELL_NO_ART = new Set();

  // Cesta k obrázku pre daný stupeň; kúzla bez artu, tokeny a príšery
  // s noArt (psíci) majú emoji.
  function artOf(def, rank) {
    if (def.spell) return SPELL_NO_ART.has(def.id) ? null : `assets/cards/${def.id}_1.webp`;
    if (!def.stageNames || def.noArt) return null;
    return `assets/cards/${def.id}_${Math.min(rank, 3)}.webp`;
  }

  // ---------- Texty schopností ----------
  // Šablóny a labely sú v src/i18n.js (L.cards.fx, L.cards.kwLabel …).
  const KW_LABEL = L.cards.kwLabel;
  const TAUNT_LABEL = L.cards.taunt;
  const CLEAVE_LABEL = L.cards.cleave;
  const WILD_LABEL = L.cards.wild;
  const IMPRINT = L.cards.imprint;
  // Divoký úder (def.wildAtk): rozsah zásahu podľa AKTUÁLNEHO útoku (buffy
  // ho posúvajú) a stupňa: atk − 6·m … atk + 7·m (bronz 7 → 1–14).
  const WILD_LOW = 6, WILD_HIGH = 7;
  const wildRange = (atk, rank) => {
    const m = STAT_MULT[rank] || 1;
    return [Math.max(0, atk - WILD_LOW * m), atk + WILD_HIGH * m];
  };

  // Popis karty pre daný stupeň (rank 1–3) a jazyk.
  // html=true obalí kľúčové slová (Taunt, Deathrattle…) do <strong>.
  // boost = trvalý bonus Večnej iskry majiteľa – výboje/výbuchy ukážu
  // navýšené číslo (html navyše zeleno cez <span class="boosted">).
  // opts.atk: aktuálny útok inštancie (Divoký úder ukáže posunutý rozsah).
  function cardText(def, rank, lang, html, boost, opts) {
    const m = rank; // efekty ×1/×2/×3
    const T = L.cards;
    const b = s => (html ? `<strong>${s}</strong>` : s);
    const hl = base => {
      if (!boost) return String(base);
      const v = base + boost;
      return html ? `<span class="boosted">${v}</span>` : String(v);
    };
    const fxText = (fx, mult, kw) => T.fx[fx.type](fx, mult, hl, kw, def, byId)[lang];
    const parts = [];
    if (def.taunt) parts.push(b(T.taunt[lang]) + ".");
    if (def.cleave) {
      parts.push(`${b(T.cleave[lang])}: ${T.cleaveText(Math.round(def.cleave * 100))[lang]}.`);
    }
    if (def.wildAtk) {
      const atk = opts && opts.atk != null ? opts.atk : def.atk * STAT_MULT[rank];
      parts.push(`${b(T.wild[lang])}: ${T.wildText(wildRange(atk, rank))[lang]}.`);
    }
    for (const pw of powersOf(def)) {
      if (pw.kw === "raceDeath") {
        // Scavenger: label nesie rasu („Keď zomrie tvoje Zviera: …“).
        parts.push(`${b(T.raceDeathLabel(pw.fx.race)[lang])}: ${fxText(pw.fx, m)}.`);
      } else if (pw.kw === "onEnemySummon") {
        // Lovec tokenov: vlastný label („Keď súper vyvolá token: …“).
        parts.push(`${b(T.enemySummonLabel[lang])}: ${fxText(pw.fx, m)}.`);
      } else {
        parts.push(`${b(T.kwLabel[pw.kw][lang])}: ${fxText(pw.fx, m, pw.kw)}.`);
      }
    }
    // Pohladkanie: číslo podľa stupňa kúzla (m = rank), ostatné kúzla ×1.
    if (def.spell) { const s = fxText(def.fx, def.pet ? rank : 1); parts.push(s[0].toUpperCase() + s.slice(1) + "."); }
    if (def.spell && def.token) parts.push(T.oneShotNote[lang]);
    if (def.pet) parts.push(T.petMergeNote[lang]);
    return parts.join(" ");
  }

  // Staty pre stupeň: bronz ×1, striebro ×2, zlato ×4.
  const STAT_MULT = [null, 1, 2, 4];

  // Schopnosti karty: `power` (hlavná – bot, cielenie battlecry) + voliteľná
  // `power2` (B006: Pred bojom + Pri smrti). Engine spúšťa všetky s daným kw.
  const powersOf = def => def.power2 ? [def.power, def.power2] : def.power ? [def.power] : [];

  // Sila Pohladkania podľa stupňa (1, 3, 9, 27…) – rovnaké číslo používa
  // engine (petBuff) aj text karty (L.cards.fx.petBuff).
  const petValue = L.cards.petValue;

  return { RACES, RACES_PL, RACES_NOM, RACE_ICON, DEFS, TOKENS, byId, nameOf, artOf, cardText, powersOf, STAT_MULT, KW_LABEL, TAUNT_LABEL, CLEAVE_LABEL, WILD_LABEL, IMPRINT, wildRange, petValue };
})();

if (typeof module !== "undefined") module.exports = Cards;
