# ⚔️ Zvieracia aréna

Detský autobattler + deckbuilding (6+): nakupuj zvieratká z obchodu, skladaj trojice,
evolvuj ich na strieborné a zlaté a nechaj ich automaticky bojovať proti súperovi.
Kombinácia Hearthstone Battlegrounds (obchod, tiery, automatický boj) a klasického
deckbuildingu (kúpené karty idú do balíčka, ruka sa doťahuje).

Herné pravidlá a rozhodnutia: [DESIGN.md](DESIGN.md).

## Spustenie

Čisté HTML/JS bez buildu – stačí statický server:

```bash
python -m http.server 8000
```

a otvor `http://localhost:8000`. Funguje aj priamo na GitHub Pages.

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
