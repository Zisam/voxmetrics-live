# voxmetrics live

Live-график высоты голоса в браузере — как вокальный тюнер: ноты на шкале, кривая F0 в реальном времени.
Все вычисления выполняются локально — аудио не отправляется на сервер.

Демо: https://zisam.github.io/voxmetrics-live/

Алгоритмы портированы из [voxmetrics](https://github.com/Zisam/voxmetrics): F0, вибрато, LTAS, H1-H2, форманты (часть метрик пока скрыта в UI).

## Запуск локально

```bash
npm install
npm run dev
```

Откройте http://localhost:5173/voxmetrics-live/ и разрешите доступ к микрофону.

## Сборка

```bash
npm run build
npm run preview
```

## Тесты

```bash
npm test
```

## Ограничения live-режима

- Скользящее окно **5 с**: история движется влево, текущий сэмпл закреплён справа (ось X 0…5 с).
- Отклонение в центах (HUD) центрируется по медиане последних ~400 voiced-фреймов F0 (~2 с непрерывного звука при hop 5 ms).
- Вибрато, LTAS, H1-H2 и форманты вычисляются в worker раз в ~1 с, но пока не отображаются в UI.
- Для точного офлайн-анализа используйте Python [voxmetrics](https://github.com/Zisam/voxmetrics).

## Стек

TypeScript, Vite, Web Audio API, Web Worker, uPlot.
