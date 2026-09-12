TODO.md

Zo skenu kariet (2026-09-07) – hotové: U010 deathrattle aura, Živelná sila + E004,
Vichor, B004, U002 + kostík 1/1, F008/F009, D001/D007, O002, E005 Lovec tokenov.

Zostáva:

1. Aura ladder (vyšší tier = rýchlejší boost) – dnes 1,1,1,1,2,2,2,2,2:
   B002 t3 +0/+1 -> +1/+1, B006 t4 +0/+1 -> +1/+2, B010 t5 +1/+1 -> +2/+2,
   U008 t4 +1/+0 -> +1/+2, E009 t5 +1/+1 -> +2/+2, D009 t5 +1/+1 -> +2/+2
   (dnes kópia D003 t4), U010 t6 +1/+1 -> +3/+3.

2. Živly t4 – E007/E008 sú dočasné buffy (buffRace), na t4 platíš za jednorazovku:
   E007 "Po nákupe: Živelná sila +1 navždy" (alebo len ak 3+ Živly na ploche),
   E008 -> permanentná aura Živly +1/+1 (futureRace), aby ladder bol t2/t4/t5.

3. Výboj a kostík ladder: E006 t3 výboj 3 -> 4 (E001 t1 má tiež 3); U005/U006 t3
   kostík 2× -> 3×, U009 t5 3× -> 4×; E010 t6 výbuch 2 -> 3.

4. Tier 3 diera v krivke tiel: priemer t2 7.1 -> t3 8.3 (+1.2) pri najdrahšom
   upgrade (8 zlata). t3 telá +1 až +2 staty (B002, B008, E006, U005, U006, F005,
   F006, D004, D005, O008).

5. Roster diery: beast nemá t6 kartu; kúzla nemajú t6; t3 spell slot má 7 zo 17
   kúziel (kniha, koreň, vlna, iskra, svätožiara, pierko, blesk) – presunúť
   2–3 na iné tiery; Srdce t4 +3/+3 za 3 má horší kurz než Koreň t3 – +4/+4.

6. HOTOVO (2026-09-07): Bublina – E002 "Pri smrti: 2× Bublina", Bublina 1/1
   "Pri smrti: výboj 1 náhodnému" (+Živelná sila).

7. Ostatné poznámky: F001 (t2 víla draw) zostal jediný draw minion – OK;
   claude-bot prompt (src/claude-bot.js) nespomína nové mechaniky (Vichor,
   lovec tokenov, chaos spúšťač) – doplniť do textu pravidiel pri ďalšej úprave.

8. Mobil na ležato (landscape na telefóne): rovnaká úprava ako portrét
   (2026-09-07) – hlavička zbalená do ☰ už platí aj tu, ale rozloženie dosky
   (PlayGround-mobile-wide.webp) treba prejsť: ruka medzi rámiky, môj board
   v strede, obchod v 2 riadkoch, karty široké podľa slotu (nie podľa výšky),
   nech 5 kariet nepretečie. Overiť na reálnom telefóne aj v PWA režime.

9. HOTOVO (2026-09-09): chat v hre po sieti (LAN aj PeerJS) – políčko pod
   doskou, bubliny. Zostáva: na mobile na výšku je políčko pod doskou (treba
   scroll) – rovnaké ako chat s Claudom; overiť na reálnom telefóne.

10. HOTOVO (2026-09-09): hráč, ktorý prepne aplikáciu (stránka v pozadí),
    pošle „away"; súper vidí bublinu a po 60 s bez návratu ho odpojí – a čaká
    na jeho návrat (bod 11). Overiť na reálnom telefóne (iOS Safari:
    visibilitychange/pagehide pri prepnutí aplikácie).

11. HOTOVO (2026-09-09): návrat do hry – preživší hráč má celý log, čaká
    10 min; vrátený hráč stlačí „↩️ Vrátiť sa do hry 1234" (kód v
    localStorage, predvyplnený aj v „Pripojiť sa") a hra sa prehrá z logu.
    Overené v prehliadači: LAN (zavretie karty, kick po 60 s v pozadí) aj
    PeerJS (smrť hostiteľa, joiner prevzal kód). Zostáva: reálne telefóny,
    dvaja hráči v jednom prehliadači zdieľajú localStorage (len pri testovaní).

12. Boss fights (nápad 2026-09-12): jeden boss za každú rasu (6), hráč ho
    musí poraziť. Boss = bot s pevným build: v jeho obchode sú len karty jeho
    rasy (rollCard s filtrom rasy pre p2), pevný „boss balíček" alebo skript
    nákupov, možno vlastný handicap (zlato navyše, štartovacia Pečať, bossí
    trinket). Otázky: má trinket hráčovi stačiť na výhru (balance cez
    scenario/sim), či boss začína na vyššom tieri, či má vlastné HP a či sa
    dá vybrať obtiažnosť. UI: výber bossa na úvodnej obrazovke (portrét +
    popis), progres „porazení bossovia" v localStorage.
    - Neskôr COOP bossovia: dvaja hráči (sieť) proti jednému silnejšiemu
      bossovi – spojené plochy (2×5 = 10 slotov, alebo dva boardy bijúce sa
      striedavo) a vzájomné synergie (aury hráča A platia aj na kartách
      hráča B, spoločné trinkety). Vyžaduje nový bojový režim v engine
      (tri strany, poradie útokov, damage hrdinom) a sieťovú replikáciu
      troch účastníkov (boss beží u hostiteľa, druhý klient len replikuje).
