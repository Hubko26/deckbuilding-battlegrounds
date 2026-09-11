---
name: arena-ai
description: Pravidlá hry Zvieracia aréna a odporúčaná stratégia pre AI súpera. Použi, keď hráš ako bot (Claude-bot driver), ladíš heuristického bota v src/bot.js, alebo balansuješ karty.
---

# Zvieracia aréna – pravidlá a stratégia AI

## Pravidlá v skratke

- 1v1 autobattler + deckbuilding. Hrdina má 50 HP; prehráva, kto klesne na 0.
- **Mutácia („Pravidlo dnešnej arény")**: každá hra má jedno náhodné globálne
  pravidlo pre oboch hráčov (`state.mutator`, Claude ho dostáva v stave ako
  `mutator`). Prispôsob stratégiu: `echoDeath` deathrattly 2× (undead/summon
  raj), `bloodMoon` preživší +1/+1 navždy (stavaj na prežitie), `freeRefresh`
  refresh zadarmo (rolluj agresívne za trojicami), `twinEvolve` evolve z 2
  kópií (páry majú hodnotu trojíc), `plenty` 4 spoločné karty, `richSell`
  predaj za 2 (lacnejšie pivotovanie), `smallArena` 35 HP (tempo > scaling),
  `marathon` 65 HP (greed/scaling vyhráva), `gift` kúzlo do ruky každé kolo
  (víly profitujú), `echoCry` battlecry 2× (draci/battlecry telá raj).
- **Ban rasy** (voliteľné, default zapnuté): pred prvým kolom dostane každý
  hráč 3 rasy (`state.ban.offers[pid]`), jednu vyberie (`Engine.pickBan`);
  z oboch výberov sa jedna vylosuje a jej karty v celej hre NIE SÚ
  (`state.banned`, Claude ju dostáva v stave ako `bannedRace`). Nestavaj na
  zabanovanej rase – v obchode sa nikdy neobjaví; rasové aury a synergie na
  ňu sú mŕtve karty. Bot banuje hlavnú rasu zo svojej trojice
  (`Bot.pickBan`), žoldnierov (draci, ogri) až keď inú nemá.
- Kolo = nákupná fáza hráča A → nákupná fáza hráča B → automatický boj.
  V nepárnom kole začína p1, v párnom p2.
- Peniaze: `min(kolo + 2, 10)` na začiatku kola, neminuté prepadnú.
- Obchod: 3 spoločné karty (zdieľané, kúpená sa hneď nahradí) + súkromné
  (`min(tier+1, 6)`) + **spell slot** (1 kúzlo, súkromný, vlastný tier –
  kúzla neberú miesto príšerám; ostatné sloty ponúkajú LEN príšery,
  kúpa: `Engine.buySpell(state, pid)`). Tier spoločných = NIŽŠÍ z tierov
  oboch hráčov; súkromné idú podľa vlastného tieru. Príšera stojí 3,
  kúzla majú vlastnú cenu (Minca/Štít 1, Jablko/Umlčanie/Kniha/Koreň/
  Vlna/Živelná sila/Blesk/Klobúk/Vichor/Kliatba/Ovčia premena/Poklad/
  Portál 2, Srdce/Zrkadlo/Hviezdna moc 3;
  Živelná sila (id `iskra`) = TRVALO všetky výboje/výbuchy +1 damage,
  buffy KÚZIEL +1 na každé nenulové číslo (Jablko +2/+2 → +3/+3, Koreň
  +0/+4 → +0/+5, Vlna +1/+1 → +2/+2; Štít/Svätožiara/Pierko/Vichor bez
  zmeny) a dočasné buffy Živlov +1 (E004 Pri útoku +1/+1 Živlom, E008 Pri
  vyložení +1/+1 vybranej príšerke – cieľ = najsilnejšie telo), stackuje
  sa, kupuj pri elemental builde a pri buff-kúzlovom builde; Hviezdna moc
  🌟 (id `hviezda`, t6, cena 3) = Pečať +1/+1 KAŽDEJ rase (ako F008) +
  Živelná sila +1 naraz – hraj hneď, potom kúzla dávajú viac; Vichor (t4)
  = cieľ útočí v boji dvakrát a „Pri útoku" spustí
  pri každom útoku – hoď na E004/O006 alebo na najväčší útok, ideálne
  spolu so Svätožiarou; Umlčanie = v najbližšom boji náhodná súperova
  príšerka so schopnosťou stratí efekt aj Obrancu – counter na
  deathrattle a Pred bojom motory; Blesk (t3) = na začiatku boja výboj
  za 3+dmgBoost na náhodného súpera; Kúzelný klobúk (t4) = premeň
  vlastnú príšerku na náhodnú o tier vyššiu – hoď na najslabšie telo;
  Zrkadlo (t5) = kópia 1. stupňa cieľa do balíčka – akcelerátor trojíc,
  cieľ vždy karta, ktorej máš najviac kópií; Poklad škriatka (t5) =
  +2 zlato hneď a +2 v ďalšom kole; Kúzelný portál (id `portal`, t5) =
  vlastná príšerka na ploche sa vymení za NÁHODNÚ príšeru z balíčka, tá
  sa vyloží aj s battlecry – hoď na najslabšie telo (nie token), keď máš
  v balíčku veľké karty alebo Pečate; bez príšery v balíčku a kôpke sa
  nedá zahrať). Refresh 1, freeze mrazí súkromné aj spell slot.
  Pooly: každý hráč má vlastný pool 6 kópií každej príšery, spoločná
  ponuka 3 kópie – tretiu kópiu nevidíš častejšie než prvú, skôr menej;
  zlatá (9 kópií) z obchodu len ak súper kartu nekupuje, inak Zrkadlo/
  Kniha. Kúzla majú vlastný súkromný pool: 3 kópie do t3, len 2 kópie
  pre t4–t6 – Mincu/Jablko kúpiš max 3×, Hviezdnu moc/Portál/Zrkadlo max
  2× za hru. Predaj vracia kópiu do poolu (aj pri kúzle). Po každom
  boji sa obchod rolluje nanovo; zmrazená karta prežije do nového kola
  a rozmrazí sa (freeze platí jedno kolo).
- Tier obchodu 1–6, upgrade v štýle Battlegrounds (základ 5/8/9/11/12,
  cena klesá o 1 každé kolo na aktuálnom tieri, minimum 2).
- Kúpená karta ide do balíčka. Ruka sa doťahuje na 5 na začiatku vlastnej
  fázy; nezahrané karty idú na konci fázy do kôpky (discard). Prázdny
  balíček = kôpka sa zamieša. Vyloženie na plochu je zadarmo, max 5.
- Po boji idú VŠETKY karty z plochy do kôpky (aj preživšie); tokeny miznú.
  Damage hrdinovi = súčet TIEROV preživších súperových príšer (evolve
  stupeň nehrá rolu) – prežité vysoké tiery bolia, gold t1 dá stále 1.
- Evolve: 3 rovnaké kópie (karta + stupeň) KDEKOĽVEK (plocha, ruka,
  balíček, kôpka) sa automaticky spoja: bronz → strieborná (staty ×2)
  → zlatá (×4); efekty ×2/×3. Evolvnutá karta ide VŽDY do ruky (aj keď
  bola kópia na ploche) – vylož ju znova, battlecry sa spustí na vyššom
  stupni. Evolvnutá karta si nechá buffy DVOCH
  najsilnejších kópií (dočasné aj perma rast) – buffnuté kópie sa
  oplatí evolvovať. Predaj karty = +1 peniaz, karta preč z hry.
- Rasy: Beast 🐾, Elemental ✨, Undead 💀, Fairy 🧚, Dragon 🐲. Keywords: Pri
  vyložení (battlecry), Pri smrti (deathrattle), Obranca (taunt), Pred
  bojom, Po nákupe, Pri útoku, Po kúzle (afterSpell – spustí sa každým
  zoslaným kúzlom, kým je víla na ploche), Božský štít (prvé zranenie
  sa zruší; z kúzla Svätožiara), Pečať (Imprint = trvalá rasová aura,
  na karte „Pečať +1/+1 Zvieratám"). Buffy z boja sú dočasné; trvalé sú buffy
  z nákupnej fázy a AURY (`futureRace`: „VŠETKY tvoje X, aj v balíčku,
  navždy") – aury sa sčítavajú a aplikujú aj hneď na plochu a ruku.
- Rasové archetypy (trojuholník counterov):
  - **Beast = telá a mrchožrút**: B007 (1×) a B005 (t2, 2×) vyvolávajú
    Mláďa 🐣 s Obrancom (1/1, škáluje len evolvom) – Obranca ho nechá
    padnúť skoro, combo s B004 (rast navždy) a B009 (chránený mrchožrút).
    B004 (t2) = „Keď zomrie tvoje Zviera: +1/+1 NAVŽDY" (aj Mláďatá; rast ostáva na
    kópii karty cez balíček) – vykladaj ho vedľa B007/B005 každé kolo.
    B009 = scavenger („Keď zomrie tvoje Zviera:
    +2/+2 pre seba", bojové, dočasné) – chráň ho a kŕm smrťami zvierat
    (B005/B007 mláďatá = lacné smrti zvierat).
    B003/B008 rastú Po nákupe NAVŽDY (rast sa drží na kópii karty cez
    cyklus balíčka) – kupuj ich skoro a vykladaj každé kolo.
  - **Undead = horda + Pretečenie**: U001 2×, U005 2× (Pred bojom),
    U006 2×, U009 3× kostík (1/1); U002 (t1 battlecry) = v najbližšom
    boji všetky kostíky +1/+1 (stackuje sa, každé kolo znova – vykladaj ho
    pred bojom vždy, keď máš vyvolávačov); undead token, čo sa nezmestí na plnú
    plochu, dá celé staty jednej náhodnej živej vlastnej príšerke. U007 battlecry
    charga: ďalšie vyvolanie v boji vyvolá +1 navyše (stackuje sa).
    U010 (t6, 8/10 Obranca) položí undead auru +1/+1 PRI SMRTI (nie pri
    vyložení) – musí padnúť; kostíky a balíček ju dostanú navždy. Combo
    s U004 reviveAs / Pierkom = aura dvakrát.
    U004 (t2, cielený battlecry): označená príšerka po smrti vstane ako
    1/1 (stupeň 2/2, 3/3) – deathrattle prebehne PRED vstávaním, takže
    revivnutý deathrattler zomrie dvakrát a druhá dávka kostíkov pri
    plnej ploche pretečie do buffov. Ako bot cieľ VŽDY na U001/U006/U009
    (akcia `play` s `target`); aury sa na vstávajúceho aplikujú.
  - **Elemental = výboje + Živelná sila**: `dmgWeakEnemy` mieri na
    NÁHODNÉHO nepriateľa a pri evolve škáluje POČET zásahov (1/2/3),
    nie silu; E001 3, E006 (Pri smrti) 4, `dmgAllEnemies` E010 3 všetkým
    jednou vlnou. E002 (t1) Pri smrti 2× Bublina 🫧 (1/1, pri smrti výboj
    1) – lacné telá + reťaz výbojov. E007 (t4) Po nákupe Živelná sila +1
    navždy – drž ho na ploche každé kolo, je to hlavný motor rasy.
    Aura E003 t2 (+1/+1) navždy; E008 (t4) = cielený +1/+1(+⚡) vybranej
    príšerke do boja. E009 (t5) = Pri vyložení +1/+1 pre seba za každého
    Živla vyloženého v tejto hre (aj seba, tokeny nie; bez ⚡ a stupňa) –
    vykladaj ho každé kolo, v neskorej hre je to najväčšie telo živlov.
    Counter na undead hordu, slabé proti veľkým beast telám.
    E005 (t3) = na PRVÝ token, čo súper v boji vyvolá, výboj za 1
    (+Živelná sila), raz za boj; ak token padne, +2/+2 NAVŽDY. Nie je to
    anti-horda (1 výstrel), je to škálovač proti token rasám – proti
    undead/mláďatám/Bublinám vykladaj, kupuj k nemu Živelnú silu (kostík
    s U002/aurou inak prežije a E005 to kolo nerastie).
    E004 Whifflet (Pri útoku: +1/+1 všetkým ŽIVLOM vrátane Bublín) škáluje
    OBE čísla so Živelnou silou – daj ho úplne doľava a s Vichorom rozdá 2×.
  - **Fairy = Po kúzle motor**: F001 battlecry draw (1/2/3 podľa
    stupňa, NIE Po kúzle), F005 vracia zlato, F006
    battlecry pridá Iskričku ✨ (jednorazové kúzlo +1 útok – nejde do
    balíčka, po ťahu zmizne; spúšťa Po kúzle), F009 (t5, 6/6) Po kúzle
    +2/+2 všetkým kamarátom (dočasné, aj iné rasy), F008 (t6) Po kúzle
    VŠETKY tvoje príšerky každej rasy +1/+1 NAVŽDY (aj balíček, tokeny –
    každé kúzlo s ňou na ploche = permanentná aura; na t6 kupuj kúzla
    húfne). Self-rast F002/F004 je
    PERMANENTNÝ (prežije cyklus balíčka) – kúzla do nich sú investícia
    navždy. Kupuj kúzla húfne – každé kúzlo spustí všetky víly na
    ploche; víly vykladaj PRED hraním kúziel. Kúzla: Svätožiara (Božský
    štít), Fénixovo pierko (revive 1 HP; Pri smrti sa pritom spustí – hoď
    na B007/U-karty s Pri smrti = deathrattle dvakrát za boj), Žabia kliatba (HP súperovej
    príšerky na 1 – anti-beast), Ovčia premena 🐑 (t5: náhodná súperova
    príšerka sa na začiatku boja zmení na Ovečku 0/1 – stratí schopnosť,
    Obrancu, štít, pierko; counter na jednu veľkú kartu, hraj hneď). Draw
    kúzlo v hre nie je (Zvitok
    odstránený). POZOR: zahrané kúzlo ide do kôpky až na konci ťahu –
    v tom istom ťahu sa nedá znova dotiahnuť (žiadne draw comba).
  - **Dragon = žoldnieri pre každý build**: telá nad krivkou + cielené
    battlecry. t1: D007 Pred bojom = najpočetnejšia rasa +1/+1 (dočasne,
    ale drží celý boj), D001 v najbližšom boji náhodný súper −1/−1
    (odložené, hraj vždy). **Živelná sila na tele je až t3 (D005)** – bola
    na t1 a rozbiehala živelný snowball od druhého kola. Vyššie tiery mieria
    na RASU vybranej príšerky – D002/D008 buff do boja
    (VŠETKY ne-aurové dračie staty platia celé kolo: dostanú ich aj
    neskôr vyložené karty a tokeny vyvolané v boji – kombuje so summon
    buildmi; rovnako D007 Pred bojom aj D006 Po nákupe),
    D003/D009 permanentná aura +1/+1, D004 discover rasy, D010 (t6)
    evolvne cieľ o stupeň. Ako bot VŽDY cieľ smeruj na svoju dominantnú
    rasu (akcia `play` s `target`); draka kupuj do hocijakého buildu,
    keď je telo nad krivkou alebo battlecry živí tvoju rasu.
  - **Ogre = veľké staty, chaos efekty + Backstab.** Keď sa ogrí roll
    obráti proti tebe (chvost mince, ožratý úder do seba, chaos spúšťač na
    súperovu príšerku, divoká rana do vlastnej, zmätený obranca u súpera),
    dostanú **VŠETCI tvoji ogri Pečať +1/+1 navždy** – aj budúce kópie
    z balíčka a obchodu. **Bez stropu – každý smolný roll = Pečať.** Smola
    je teda payoff, nie trest: ogri sú plnohodnotná hlavná rasa, keď ich
    máš viac.
    Efekty (môžu udrieť aj vlastníka):
    O001 hod mincou (battlecry +4/+4 alebo −2/−2), O006 Pri útoku 50 %
    sa trafí sám za ½ útoku, O002 (5/6) Pred bojom spustí schopnosť
    náhodnej príšerky na bojisku – aj súperovej (deathrattle bez smrti,
    Pred bojom druhýkrát; dobrý s vlastnými deathrattle summonmi, riskantný
    proti undead horde), O003 Pred bojom 2 dmg
    VŠETKÝM (aj tvojim – zlé so swarm buildmi, dobré proti nim),
    O007 Pri smrti 5 dmg náhodnej príšerke – hod mincou 50 % tvoja strana,
    50 % súperova (vlastný zásah = backstab, čiže Pečať), O010 (t6 taunt
    + **Rozmach**: 50 % šanca, že úder zasiahne aj susedov cieľa – ogrí
    finišer proti širokej ploche súpera)
    Pri smrti 50 % vstane s 1 HP na NÁHODNEJ strane (aj u súpera!).
    Vanilla telá nad krivkou: O004/O005/O008 – bezpečný nákup. O009 (t4,
    7/7) má Divoký úder: každý zásah náhodne 1–14 (priemer 7,5), buffy a
    Pečať posúvajú rozsah (+1 → 2–15), striebro 2–28 – rozptyl, nie sila.
  - **Tokeny dostávajú permanentné aury** (`futureRace`) – kostík aj
    Mláďa s aurami škálujú; navyše škálujú stupňom rodiča. Dočasný dračí
    buff (D002/D006/D008) tokeny v boji dostanú tiež.
- Boj: útoky sa striedajú, útočí ďalšia príšera zľava doprava; cieľ
  náhodný, Obrancovia majú prednosť; damage obojstranný.
- Damage hrdinovi = súčet tierov preživších víťaza, **so stropom podľa
  kola**: 1–3 max 5, 4–10 max 10, 11–15 max 15, od 16. kola bez stropu.
  Early tempo teda nezabíja – greed do tieru sa do 10. kola oplatí viac,
  než napovedá čistý súčet tierov.

## Odporúčaná stratégia – postup v každom ťahu (v tomto poradí)

Odvodené z logov reálnych hier (2026-09-07) a z heuristického hard bota,
ktorý po týchto úpravách otáča prehraté hry (replay: −3 : 23 → 22 : 5).
Boti prehrávali na 4 veciach: miešanie rás, nafúknutý balíček plný
štartovacieho balastu a kúziel, plocha s 3–4 telami, upgrade s deravou
plochou. Rob VŠETKY kroky, každý ťah:

0. **Hlavná rasa je beast / elemental / undead / fairy / ogre. Dragon je
   PODPORNÝ** – drak je žoldnier s battlecry pre rasu cieľa. Ogri sú po
   reworku Backstab plnohodnotný build, ale len ako **zámer**: potrebujú
   rolly, ktoré Pečať generujú (O001, O006, O002, O007, O010), nie štyri
   vanilla telá. Tri náhodné ogry v balíčku z ogrov hlavnú rasu nerobia
   (Claude bot v logu z 8. 9. 2026 takto prehral: O004×3, O001×2, nula
   predajov, 22 kariet v balíčku). Ak je `dominantRace` null, vyber rasu,
   ktorej máš najviac, alebo tú, ktorej Pečať/motor je v ponuke.
1. **Predaj balast z ruky ešte pred vykladaním.** Stav ti posiela
   `junkInHand` – predaj všetko z neho ako prvé akcie ťahu. Balast = telo
   s 0 útoku (prehratý hod mincou), **každý Štít 🛡️** (výplňové kúzlo, pridanú
   hodnotu nemá – je v ponuke len preto, aby v spell slote neboli samé dobré
   kúzla; nekupuj ho NIKDY, ani vo vílom builde), **kúzlo nad strop 2 (víly 4)**
   – zahrané kúzlo ide do kôpky a vracia sa cyklom balíčka, jediná cesta von je
   predaj; ruka je 5 kariet a kúzlo v nej znamená o príšerku menej na ploche,
   čo vílí build bolí najviac, jeho slabina je práve ťahanie kariet
   (heuristický bot na tom v zázname z 8. 9. 2026 prehral: 6 Štítov
   v balíčku = plocha 2–4 z 5), a od 3. kola každá karta cudzej rasy
   tieru 1–2 bez páru (od tieru 3 aj s párom; dragon t1–2 sa ráta ako
   cudzia rasa – od tieru 3 aj drak t1–2, ogre len ak ogri nie sú tvoja hlavná rasa).
   Driver po pláne dohrá jadro hard bota (predaj balastu, strop balíčka,
   vyloženie, upgrade podľa kola, minutie zlata aj s refreshom, kúzla,
   poradie plochy) – je to poistka, ale plán, čo to nerobí, je zlý plán.
   Štartovací balíček je 10 náhodných t1 kariet – človek ich vypredá do
   6. kola, ty tiež. Nechaj si toľko tiel, aby si zaplnil plochu (aspoň 4);
   zvyšný balast zahraj a predaj nabudúce.
   **Tvrdý strop balíčka: 14 kariet** (všetky zóny; nad ním driver predá
   najslabšie telá z ruky bez páru). Plocha sa po boji vracia do kôpky
   a ruka je 5 NÁHODNÝCH kariet z cyklu balíčka – s 19 kartami ležia tvoje
   najsilnejšie karty v kôpke a bojuje náhodný balast (Claude bot, záznam
   z 11. 9. 2026: balíček 19, 1 predaj za hru, prehra 11 : 33). Víťaz drží
   11–13 kariet: každá karta v balíčku je taká, ktorú chce ťahať.
2. **Vylož príšerky – najprv obyčajné (najsilnejšie), battlecry buffery
   a Pečate ako posledné**, nech zasiahnu plnú plochu. Dračí cielený
   battlecry vždy s `target` na kartu dominantnej rasy; U004 s `target`
   na U001/U006/U009. Bojuj s PLNOU plochou (5).
3. **Výmena na plnej ploche**: ak máš v ruke telo aspoň o 3 staty
   (útok + život + 2 za schopnosť) lepšie než najslabšie na ploche, predaj
   najslabšie a vylož lepšie.
4. **Upgrade tieru podľa plánu**: t2 v 2.–3. kole, t3 v 4.–5., t4 v 7.,
   t5 v 9.–10., t6 v 12. (pravidlo `kolo ≥ tier·2−1` je NAJNESKÔR). Tier
   o jeden za hráčom = slabšia súkromná ponuka a spoločná ponuka sa rolluje
   podľa NIŽŠIEHO tieru z oboch hráčov. Upgraduj len keď je
   plocha plná (5) alebo keď ti po upgrade ostanú aspoň 3 zlata a plocha
   má aspoň 4 telá. S 1–3 telami na ploche NEUPGRADUJ – telá majú prednosť.
5. **Nakupuj podľa tejto priority** (všetko zlato, neminuté prepadne):
   a) tretia kópia = trojica (aj kópie v balíčku a kôpke – `copiesOwnedTowardTriple`),
   b) Pečať (aura) vlastnej rasy (E003, B002/B006/B010,
      U003/U008/U010, F008; draci D003/D009 s targetom na tvoju rasu),
   c) motor rasy (undead U002/U005/U006, elemental E007/E004 + Živelná
      sila/D005 (t3), beast B004/B007/B005/B003/B008, fairy F002/F004 + kúzla),
   d) druhá kópia rozbehnutej trojice,
   e) najlepšie telo vlastnej rasy najvyššieho dostupného tieru,
   f) drak s battlecry pre tvoju rasu (D002/D008 buff, D004 discover).
   NIKDY: príšera cudzej rasy tieru 1–2 po 3. kole (okrem trojice), tretie
   a ďalšie kúzlo v ne-vílovom balíčku, Vlna/Štít „lebo ostalo zlato".
   Radšej nech 1–2 zlata prepadnú, než kúpiť balast do balíčka.
6. **Refresh, keď v ponuke nie je nič pre tvoju rasu**: ak nič nespĺňa
   a)–e) a ostanú ti aspoň 4 zlata, daj `refresh` – driver z nového rollu
   kúpi najlepšiu kartu tvojej rasy za teba (výsledok nevidíš, po refreshi
   neplánuj nákupy). Neminuté zlato prepadne: 1–2 zlata v 11 kolách je
   14 zlata v koši. Nikdy refresh ako poslednú akciu s menej než 4 zlatami.
7. **Freeze**: dobrá karta v súkromnej ponuke (trojica, Pečať tvojej rasy),
   na ktorú už nemáš → `freeze`, kúpiš ju v novom kole.
8. **Kúzla až po vyložení**: buffy (Jablko, Srdce, Koreň) na najsilnejšiu
   príšerku; Vichor na kartu s „Pri útoku" (E004, O006) alebo najväčší
   útok, ideálne so Svätožiarou; Živelná sila a Umlčanie/Kliatba/Ovčia
   premena/Blesk vždy hneď; Mincu hneď na začiatku ťahu; víly vyložiť
   PRED kúzlami.
9. **Usporiadaj plochu** (`move`, slot 0 útočí prvý): „Pri útoku" karty
   (E004, O006) úplne vľavo → tvrdé telá podľa útoku → Obrancovia tam,
   kde kryjú motor → škálovače (B004, B009, E005, E007, F002, F004)
   úplne vpravo, nech útočia posledné a prežijú.
10. **Recykluj battlecry telá** (`discard`, nie predaj) len pri karte, ktorej
    hodnota je battlecry a telo je slabé (F001 draw, D004 discover) – Pečate
    a aury nie, tie už svoje spravili a telo je nad krivkou.

### Nákupné zoznamy podľa rasy (priorita zľava doprava)

- **Undead**: U002 (t1, kostíky +1/+1 v boji – vykladaj každé kolo), U001,
  U003 (t2 Pečať), U004 (t2, target U001/U006/U009), U005/U006 (t3), U008
  (t4 Pečať), U007 (t4 charga), U009 (t5), U010 (t6, Pečať pri smrti –
  Obranca, nech padne). Proti undead: E010, O003, výboje E001/E006; E005
  je len škálovač (jeden výstrel za boj), hordu nezastaví.
- **Elemental**: E002 (t1 Bubliny), E001, E003 (t2 Pečať), E004 (t2 – vľavo,
  s Vichorom 2×), Živelná sila ⚡ + D005 (t3) vždy (každý +1 navždy), E005 (t3,
  proti tokenom), E006, E007 (t4 – hlavný motor, drž na ploche každé kolo),
  E008 (t4, +1/+1(+⚡) vybranej – na najsilnejšie telo), E009 (t5, +1/+1
  za každého vyloženého Živla za hru – vykladaj každé kolo), E010 (t6).
  Slabí proti beast telám.
- **Beast**: B003 (t1 rast navždy), B007 (t1 Mláďa s Obrancom) + B004 (t2
  sova – rastie navždy za padnuté Mláďa), B005 (t2), B002 (t3 Pečať +1/+1), B008
  (t3 rast navždy), B009 (t4 mrchožrút, vpravo), B010 (t5 Pečať), B006 (t6
  Obranca 7/9: Pri smrti 2× SuperMláďa 1/1 Obranca, každé Pri smrti Pečať
  +1/+1 Zvieratám – t6 cieľ beast buildu, tri smrti kŕmia mrchožrútov;
  vykladaj vľavo, nech padne skoro a Pečate stihnú zvyšok boja). B001 (t1, Pri smrti +1/+1 všetkým Zvieratám do konca boja – aj
  Mláďatám, čo prídu neskôr) – vykladaj vľavo, nech padne skoro a buffne
  zvyšok; kŕmi aj B004/B009.
- **Fairy**: F002/F004 (rast navždy z každého kúzla), F003, F005 (zlato),
  F001 (draw), F006 (Iskrička), F007 (t4), F010 (t4), F009 (t5), F008 (t6
  Pečať všetkým za každé kúzlo). Kúzla kupuj húfne (Minca, Jablko, Koreň,
  Svätožiara…), cast až keď sú víly na ploche. Strop kúziel neplatí.
- **Ogre**: endgame je **O010** (t6, Obranca + Rozmach) – proti swarmu je to
  finišer, kupuj ho hneď, ako naň máš tier. Build stojí na
  **generátoroch Backstabu** – O006 (Pri útoku,
  hádže každý boj), O001 (lacný hod), O002/O007/O010. Vanilla telá
  O004/O005/O008/O009 Pečať negenerujú, len z nej žijú (O009 ju mení na
  posun rozsahu Divokého úderu), takže ich ber až
  ako doplnok. Pečať nemá strop – každý ožratý úder, chvost mince či
  chaos na súperovej karte je +1/+1 celej rase, takže viac generátorov
  (2–3× O006 vľavo, Vichor 🌪️ na O006) Pečať zrýchľuje. O003 len bez
  vlastného swarmu. Ako splash bez generátorov je ogre stále len telo.
- **Draci** patria do každého buildu: D002/D008 buff rasy cieľa do boja,
  D003/D009 Pečať rasy cieľa, D004 discover rasy, D010 evolvne cieľ.
  Vždy `target` na najlepšiu kartu dominantnej rasy.

### Čo NEROBIŤ (z logov)

- Nekupuj Štít/Vlnu/Ticho za zvyšné zlato – balíček bez tiel prehráva.
- Nedrž páry cudzej rasy „na trojicu" po tieri 3 – strieborná t1 karta
  v 10. kole nič nerieši.
- Neupgraduj s 2–3 telami na ploche, ani keď je cena 2.
- Neukončuj ťah s neminutými 3+ zlatými, ak je v ponuke telo tvojej rasy.
- Nenechaj E004/O006 vpravo a B009/E005/B004 vľavo.

## Rozhranie akcií (pre Claude-bot driver)

Stav hry je `state` (deterministický engine, `src/engine.js`). Legálne
akcie za hráča `pid` – vracajú events alebo `null` pri nelegálnom ťahu:

- `Engine.pickBan(state, pid, race)` – len vo fáze ban (`state.phase === "ban"`),
  raz za hráča, rasa z `state.ban.offers[pid]`; druhý výber vylosuje ban
  a spustí prvé kolo
- `Engine.buyCommon(state, pid, idx)` / `Engine.buyPrivate(state, pid, idx)` /
  `Engine.buySpell(state, pid)`
- `Engine.refreshShop(state, pid)` / `Engine.toggleFreeze(state, pid, idx)`
- `Engine.upgradeTier(state, pid)` (cena `Engine.upgradeCost(state, pid)`)
- `Engine.playMinion(state, pid, handIdx)`
- `Engine.castSpell(state, pid, handIdx, targetUid?)` +
  `Engine.pickDiscover(state, pid, choiceIdx)`
- `Engine.sellCard(state, pid, "hand"|"board", idx)` / `Engine.buyBack(state, pid)` – raz za ťah vráti poslednú predanú kartu do ruky za cenu predaja (poistka proti omylu; bot ju nepotrebuje)
- `Engine.discardCard(state, pid, "hand"|"board", idx)` – do kôpky bez
  peňazí (karta ostáva v balíčku; napr. battlecry telo pred bojom)
- `Engine.moveOnBoard(state, pid, boardIdx, slot)`
- `Engine.endShopTurn(state, pid)` – povinný záver ťahu

Multiplayer replikuje akcie: rovnaký seed + rovnaká sekvencia volaní musí
dať identický stav (nepoužívaj inú náhodu než `state.rng`).
