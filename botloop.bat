@echo off
rem Boti hraju dookola (GitHub Pages verzia) a zapisuju vysledky do data\botloop\results.jsonl.
rem Bezi, kym je toto okno otvorene a pocitac nespi. Ctrl+C = koniec.
cd /d "%~dp0"
title Zvieracia arena - boti dookola
:loop
node tools/botloop.mjs %*
echo Boti skoncili - restart o 10 s (Ctrl+C = koniec)...
timeout /t 10 /nobreak >nul
goto loop
