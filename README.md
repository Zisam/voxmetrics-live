# voxmetrics live

Live-мониторинг голоса в браузере: F0, вибрато, LTAS, H1-H2, форманты.
Все вычисления выполняются локально — аудио не отправляется на сервер.

Демо: https://zisam.github.io/voxmetrics-live/

Алгоритмы портированы из [voxmetrics](https://github.com/Zisam/voxmetrics) (Python CLI для офлайн-анализа WAV).

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

- Вибрато требует ≥1 с ровной ноты; надёжный замер — от 4 с (`trusted: false` иначе).
- LTAS, H1-H2 и форманты обновляются раз в ~1 с по скользящему буферу (15 с).
- H1-H2 — индикатор тренда между сессиями, не абсолютное значение.
- Для точного офлайн-анализа используйте Python [voxmetrics](https://github.com/Zisam/voxmetrics).

## Стек

TypeScript, Vite, Web Audio API, Web Worker, uPlot.
