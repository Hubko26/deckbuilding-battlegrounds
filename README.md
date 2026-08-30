# ⚔️ Zvieracia aréna

Detský autobattler + deckbuilding (6+): nakupuj zvieratká z obchodu, skladaj trojice,
evolvuj ich na strieborné a zlaté a nechaj ich automaticky bojovať proti súperovi.
Kombinácia Hearthstone Battlegrounds (obchod, tiery, automatický boj) a klasického
deckbuildingu (kúpené karty idú do balíčka, ruka sa doťahuje).

Herné pravidlá a rozhodnutia: [DESIGN.md](DESIGN.md).

## Spustenie

Windows: dvojklik na **start.bat**. Alebo v termináli:

```bash
node server.mjs
```

a otvor `http://localhost:5180`. Server vypíše aj adresu v lokálnej sieti –
na druhom zariadení ju otvor a klikni **📶 Hraj s kamarátom (sieť)** na oboch:
hráči sa automaticky spárujú (1v1 po LAN, bez internetu).

## GitHub Pages / statický hosting

Hra funguje aj bez Node servera (napr. na GitHub Pages): bot normálne,
a multiplayer cez **kód miestnosti** – keď lokálny server nebeží, tlačidlo
„Hraj s kamarátom“ ponúkne „🎲 Vytvoriť hru“ (ukáže 4-miestny kód) a
„Pripojiť sa“ (kamarát kód zadá). Spojenie je P2P (WebRTC/PeerJS, signaling
cez verejný PeerJS cloud) – funguje aj cez internet, nielen v jednej sieti.

## Testy

```bash
npm test
```

Herná logika (`src/engine.js`) je oddelená od UI a testovaná v Node (`node --test`)
s deterministickou náhodou.

## Štruktúra

- `src/cards.js` – dáta kariet (classy, rasy, schopnosti), trojjazyčné SK/CZ/EN
- `src/engine.js` – herná logika bez DOM (obchod, evolve, automatický boj)
- `src/bot.js` – heuristický súper (easy/normal/hard), vymeniteľný za LLM bota
- `src/game.js` – UI a animácie
