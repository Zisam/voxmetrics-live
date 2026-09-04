# Архитектура voxmetrics-live

Live-тренажёр вокала в браузере — график F0 в реальном времени, панель метрик голоса, тренер с метрономом.

- **Деплой**: https://zisam.github.io/voxmetrics-live/
- **Стек**: TypeScript, Vite, Web Audio API, Web Worker, uPlot
- **Тесты**: vitest; CI через GitHub Actions (npm test + build → deploy на Pages)
- **Правила**: тесты обязательны для всех изменений; юнит-тесты — node env, без DOM

## Поток данных

```
Mic → capture-processor.js (AudioWorklet, 1024 сэмпла ≈ 21ms)
  → gate.ts (шумовой гейт, ползунок в тулбаре)
  → notch.ts (режектор 50 Hz)
  → два воркера:
     dsp.ts (dsp-core.ts) — реалтайм F0Tracker → f0 points + HUD baseline
     analyser.ts (analyser-core.ts) — 6s кольцевой буфер → метрики каждые 2s
```

## Ключевые модули

| Модуль | Что делает |
|---|---|
| `src/dsp/f0.ts` | F0Tracker (ACF + short-lag bias + foldToFundamental), trackF0 (офлайн) |
| `src/dsp/vibrato.ts` | Вибрато: rate, extent, regularity, period_cv (CV периодов волны) |
| `src/dsp/tremolo.ts` | Детектор AM (3–9 Hz) + suppressVibratoAm (гейт AM-следа вибрато) |
| `src/dsp/voice-quality.ts` | Jitter (frame-sampled), shimmer, CPP (cepstral peak prominence) |
| `src/dsp/formants.ts` | LPC форманты F1–F3 |
| `src/dsp/ltas.ts` | LTAS + singerFormant (певческая форманта, клип динамики 30 dB) |
| `src/ui/metronome.ts` | Lookahead-планировщик на аудиочасах, якорь фазы через getOutputTimestamp |
| `src/ui/vibrato-guide.ts` | Коридор ±75¢ + фазозапертая синусоида + метки кликов на графике |
| `src/ui/coach.ts` | computeCoachHints — ключи хинтов, локале-независимые; контекст метронома (±15% от темпа) |
| `src/ui/i18n.ts` | RU/EN/JA словарь, t()/fmt()/setLocale() |
| `src/ui/guide.ts` | Руководство по тренировке (трёхъязычное, секции по ключам тренера) |
| `src/ui/session-log.ts` | TSV-экспорт (23 колонки), 5000 строк максимум |
| `src/ui/pitch-buffer.ts` | Скроллящийся ряд с привязкой к stream-времени + latencyCompSec |
| `src/ui/metrics-panel.ts` | Панель метрик, уровни good/ok/warn, спарклайн LTAS |

## UI-элементы

- Тулбар: Начать/Стоп, селектор канала (R=микрофон / L=гитара), гейт (ползунок −90..−20 dB), «?» (руководство), «Эталон» (оверлей), «Метроном», BPM (55–95, дефолт 83 = 5.5 Hz), «Сдвиг» (компенсация латентности голоса, дефолт 120 ms), селектор языка RU/EN/JA
- График: кривая F0 vs ноты (midi), коридор 150¢, синусоида-эталон (фазозаперта к клику), вертикальные метки ударов (сильная/слабая доля)
- Панель метрик: Вибрато (rate/extent/regularity/periodCV/steady), Тон, Резонанс (F1–F3 + певческая форманта), Стабильность (jitter/shimmer/CPP), Спектр, LTAS
- Тренер: баннеры по центру («Вибрато быстрее!», «Отлично!», «В кармане!»), максимум 2, приоритетная сортировка
- Футер: «Скачать метрики» (TSV), GitHub

## Референсы вибрато

| Исполнитель | Замеры |
|---|---|
| Ruki (the GazettE) «Dogma» | 5.8 Hz / 190¢, 5.3 Hz / 132¢ |
| 茅原実里 | 5.64 Hz / 146¢ |
| M. Shadows (A7X) «The Stage» | 5.79/169¢, 5.64/125¢, 5.29/67¢ |

Целевая зона: **5.5 Hz / 150¢ / periodCV ≤ 0.10**. Лестница BPM: 60→64→69→72→76→80→83 (клик на каждый 4-й качок волны).

## Полезные команды

```bash
npm test                            # все тесты
npm run build                       # tsc + vite build
npx tsc --noEmit                    # проверка типов
node scripts/aggregate-vibrato.mjs  # отчёт по TSV из ~/Downloads
gh run list --limit 1               # статус CI
```

## Известные ограничения / TODO

- Воркер-статусы шлют ключи словаря (не текст) — рендерятся через t()
- DSP-ошибки (throw в f0.ts / ltas.ts) на русском — не локализованы
- Нет детектора регистра (грудь/микст/голова) — для будущих фич
- Драйв/rasp — не реализован (отложен)
