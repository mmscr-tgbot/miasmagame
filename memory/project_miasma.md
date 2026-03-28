---
name: miasma_massacre
description: Telegram Web App multiplayer game (DBD-like) with Firebase backend
type: project
---

# Miasma Massacre

**Жанр:** Асинхронный мультиплеер / Survival horror (а-ля Dead by Daylight)
**Платформа:** Telegram Web App + браузер
**Стек:** Vanilla JS, Firebase (Realtime DB + Auth), HTML/CSS

## Структура кода
- `src/game/` — игровая логика: game.js, player.js, generator.js, room.js, input.js
- `src/firebase/` — auth.js, database.js, config.js
- `src/ui/` — ui.js
- `index.html` —SPA с экранами: меню, выбор роли, игра, game over

## Геймплей
- **Выжившие (4):** управляют джойстиком, чинят 5 генераторов, сбегают через выход
- **Убийца (1):** быстрее, ловит выживших
- **Правила:** 5 генераторов → открывается выход → сбежать
- Firebase для синхронизации состояния между игроками

## Особенности
- Мобильное управление (touch joystick)
- Анонимная авторизация Firebase
- Хостится на GitHub Pages или Firebase Hosting
- Интеграция с Telegram через BotFather menu button
