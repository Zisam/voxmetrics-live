/** Guide content: structured so tests can verify completeness. */

import { getLocale, t, type Locale } from "./i18n.ts";
import { coachText } from "./coach.ts";
import { GUIDE_SECTIONS_EN } from "./guide-content-en.ts";
import { GUIDE_SECTIONS_JA } from "./guide-content-ja.ts";

export type GuideMetricId =
  | "vibrato"
  | "jitter"
  | "shimmer"
  | "tremolo"
  | "singer"
  | "cpp"
  | "steady"
  | "pitch"
  | "start";

export interface VibratoReference {
  artist: string;
  source: string;
  measurements: { hz: number; cents: number }[];
}

/** Performer vibrato measurements used as training references. */
export const VIBRATO_REFERENCES: VibratoReference[] = [
  {
    artist: "Ruki (the GazettE)",
    source: "«Dogma»",
    measurements: [
      { hz: 5.8, cents: 190 },
      { hz: 5.3, cents: 132 },
    ],
  },
  {
    artist: "茅原実里",
    source: "",
    measurements: [{ hz: 5.64, cents: 146 }],
  },
];

export interface GuideExercise {
  name: string;
  steps: string[];
}

const VIBRATO_TARGETS: Record<Locale, string> = {
  ru: "Ориентир по референсам: волна около 5.5 Гц с размахом 150 центов и стабильностью темпа ≤ 10 %. Тренируется как барабанная дробь: клик метронома — на каждый 4-й качок волны (5.5 Гц = 82.5, на практике 83 BPM). Ползунок «Темп» задаёт и клик, и синусоиду-эталон.",
  en: "Reference target: a wave near 5.5 Hz with a 150-cent extent and tempo stability ≤ 10 %. Trained like a drum roll: the metronome click lands on every 4th wave cycle (5.5 Hz = 82.5, in practice 83 BPM). The “Tempo” slider drives both the click and the reference sine.",
  ja: "参照目標：約5.5 Hz、振幅150セント、テンポ安定 ≤ 10 %の波。ドラムロールのように鍛えます：クリックは波の4サイクル目ごと（5.5 Hz = 82.5、実際は83 BPM）。「テンポ」スライダーがクリックも参照サイン波も動かします。",
};

export function vibratoTarget(): string {
  return VIBRATO_TARGETS[getLocale()];
}

export interface GuideSection {
  id: GuideMetricId;
  title: string;
  /** Coach hint keys this section explains (locale-independent). */
  triggers: string[];
  intro: string;
  exercises: GuideExercise[];
  /** "shared" = use the shared VIBRATO_REFERENCES table. */
  references?: "shared";
  target?: "shared";
}

const GUIDE_DISCLAIMERS: Record<Locale, string> = {
  ru: "Честно: гарантировать результат в постановке голоса нельзя — но короткие регулярные занятия надёжнее редких подвигов. 10–15 минут в день, и метрики сами покажут прогресс. При боли или дискомфорте в горле — остановитесь и обратитесь к педагогу или фониатру.",
  en: "Honest note: no one can guarantee results in vocal training — but short regular sessions beat rare heroic ones. 10–15 minutes a day, and the metrics will show the progress themselves. If your throat hurts or feels strained — stop and see a teacher or a phoniatrician.",
  ja: "正直に：声のトレーニングの結果は誰も保証できません——しかし短くても毎日の練習は、まれな特訓より確実です。1日10〜15分、メトリクスが進歩を示します。喉に痛みや違和感があれば中断し、教師または音声医師に相談してください。",
};

export function guideDisclaimer(): string {
  return GUIDE_DISCLAIMERS[getLocale()];
}

/** RU sections are defined below; EN/JA live in their content modules. */
export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "start",
    title: "С чего начать",
    triggers: ["first-run", "noSignal"],
    intro:
      "Наденьте наушники, разрешите микрофон, выберите канал и пойте одну ноту 5 секунд, глядя на кривую. Если появилась подсказка «Не слышу голос!» — пойте громче или опустите порог гейта в тулбаре. Подсказки в центре экрана подскажут, что тренировать прямо сейчас. Разогревайтесь перед занятием: мычание и сирены 2–3 минуты.",
    exercises: [
      {
        name: "Первый тест",
        steps: [
          "Спойте удобную ноту и держите её 5–10 секунд",
          "Следите, чтобы кривая шла горизонтально вдоль линии нотной сетки",
          "Добейтесь зелёной метки «надёжно» в карточке Вибрато",
        ],
      },
    ],
  },
  {
    id: "vibrato",
    title: "Вибрато",
    triggers: ["vibFaster", "vibSlower", "vibNarrower", "vibWider", "vibSmoother"],
    intro:
      "Вибрато — не «таинственный дар», а ритмический навык, как быстрые удары у барабанщика: сначала медленно и под контролем, затем разгон под метроном до автопилота. Так развивают его и профессионалы (Ruki из the GazettE, кстати, начинал как барабанщик). Цель: частота ~5.5 Гц, размах 130–190 центов, стабильность темпа ≤ 10 % — карточка «Вибрато» показывает все три.",
    references: "shared",
    target: "shared",
    exercises: [
      {
        name: "Разминка (2–3 минуты)",
        steps: [
          "Мычание или липроллы: 5–8 слайдов по диапазону",
          "Сирены на [у]: 6–8 плавных циклов, челюсть свободная",
        ],
      },
      {
        name: "Лестница темпов — основное упражнение (в BPM)",
        steps: [
          "Перевод: 1 клик метронома = каждый 4-й качок волны (волна — как 16-е ноты). BPM = частота в Гц × 15. Вход — 60 BPM (4 Гц, медленная волна), цель 5.5 Гц = 83 BPM",
          "Старт: поставь 60 BPM и качай высоту по одному качку на слог счёта «1-и-и-и» — клик попадает в «1». Медленно и аккуратно важнее, чем быстро",
          "Если 60 идёт легко — замерь свою базу: спой 3–4 с вибрато, умножь «Частоту» из карточки на 15 и начни с ближайшей нижней ступени",
          "Лестница: 60 → 64 → 69 → 72 → 76 → 80 → 83 BPM (шаги 2–5 BPM = +0.15–0.35 Гц). Ползунок «Темп» в тулбаре задаёт и клик, и синусоиду",
          "«В кармане»: когда каждый 4-й качок точно совпадает с кликом, клик «пропадает» в звуке — главный признак попадания (как у барабанщиков)",
          "Тишина отрезками: клик 10 с → замолкает на 5–10 с → снова играет. Держи темп в тишине, сверяйся по «Стаб. темпа» ≤ 10 %",
          "Игра вокруг клика: один подход чуть впереди клика, другой чуть позади — строится чувство «где клик» (метод Мак Сантьяго)",
          "Ступень пройдена: стабильность ≤ 10 % и регулярность ≥ 60 % два подхода подряд",
          "Тонкая сверка: на короткое время удвой клик — на каждый 2-й качок (83 → 166 BPM), сверься и вернись к редкому клику",
        ],
      },
      {
        name: "Порции или непрерывно? Оба — это разные упражнения",
        steps: [
          "Порции 4/4 (волна 4 доли → пауза 4 доли): тренируют чистую атаку волны из тишины и не дают увезти ошибку дальше порции. Для вибрато это главное — включение волны слабее всего держится",
          "Непрерывно 2–3 минуты: ставит автопилот и выносит наружу дрейф. Это экзамен ступени, а не учеба",
          "Прогрессия порций на ступени: 4/4 → 8/8 → непрерывно",
        ],
      },
      {
        name: "Схема ступени: 4 фазы по 2–3 минуты (10–12 мин)",
        steps: [
          "Фаза 1 — Порции: волна 4 доли / пауза 4 доли, 8–10 циклов (~3 мин). Следи за чистотой каждой атаки",
          "Фаза 2 — Удлинение: 8 долей волны / 8 пауза (~3 мин). Атака плюс короткое удержание",
          "Фаза 3 — Непрерывно: волна без пауз, сколько позволяет дыхание (~2 мин). Автопилот",
          "Фаза 4 — Клик-тишина: клик 4 такта → молчит 4 такта → снова (~2 мин). Держи темп в тишине",
          "Мерь «Стаб. темпа» именно в фазе 4: periodCV в тишине клика показывает, что темп твой, а не метронома",
          "Ступень сдана: порции чистые + 2 минуты непрерывно + стабильность ≤ 10 % в тишине",
        ],
      },
      {
        name: "Без метронома — обязательно",
        steps: [
          "Каждый день заканчивай свободным подходом (1–2 мин): волна держит темп сама",
          "Метроном — тренажёр, а не костыль: барабанщики предупреждают о зависимости от клика; цель — внутренний пульс, проверяемый карточкой",
        ],
      },
      {
        name: "Ступени вниз — проверка контроля",
        steps: [
          "Достигнув 83 BPM, вернись на 69 и на 60",
          "Умение замедлиться без потери волны = темп под контролем, а не «сорвался и побежал»",
        ],
      },
      {
        name: "Смещённый клик — продвинутый уровень",
        steps: [
          "Сдвинь клики с доли (метроном на слабую долю) и продолжай вести волну",
          "Барабанный приём: если темп держится на смещённом клике — он действительно твой, а не «соскакивает с чужого»",
        ],
      },
      {
        name: "Двойная задача — тест автопилота",
        steps: [
          "Пой вибрато и одновременно считай вслух или отстукивай пальцем другой ритм",
          "Волна живёт при занятой голове — программа встала на автопилот",
          "Сыпется — вернись на ступень ниже: автопилот ещё не закрепился",
        ],
      },
      {
        name: "Отложенное вибрато",
        steps: [
          "Начни ноту ровно, без волны, на 2 секунды",
          "Включи волну и веди её до конца выдоха",
          "Цель — чистое переключение «ровно → волна» на любой ступени лестницы",
        ],
      },
    ],
  },
  {
    id: "jitter",
    title: "Дрожание высоты",
    triggers: ["pitchShaky"],
    intro:
      "Мелкая дрожь высоты обычно означает напряжение или слабую опору дыхания. Тренируйте спокойный выдох и расслабление гортани.",
    exercises: [
      {
        name: "Диафрагмальное дыхание",
        steps: [
          "Рука на животе, вдох носом на 4 счёта — живот надувается",
          "Выдох на «ссс» ровной струёй на 8–16 счётов",
          "Повторите 5 раз перед пением",
        ],
      },
      {
        name: "Свеча",
        steps: [
          "Представьте пламя свечи в 20 см перед лицом",
          "Дуйте на него ровно, не задувая, 15 секунд",
          "Та же ровная струя — на гласной [у]",
        ],
      },
    ],
  },
  {
    id: "tremolo",
    title: "Качание громкости (тремоло)",
    triggers: ["tremolo", "volumeWobbling"],
    intro:
      "Если вместо высоты качается громкость — воздух подаётся неровно или звук «прыгает» на связках. Цель — ровное давление воздуха.",
    exercises: [
      {
        name: "Messa di voce",
        steps: [
          "Одна нота: начните тихо, вырастите до громкой, вернитите к тихой",
          "Переходы плавные, без рывков — 8–10 секунд всего",
          "Затем то же на постоянной средней громкости",
        ],
      },
      {
        name: "Счёт на выдохе",
        steps: [
          "Ровный выдох, считайте вслух от 1 до 15 на одной громкости",
          "Силу контролируйте рукой на животе, а не горлом",
        ],
      },
    ],
  },
  {
    id: "singer",
    title: "Полётность и резонанс",
    triggers: ["moreRing"],
    intro:
      "«Полётность» — усиление верхней зоны спектра, голос звучит звонче и пробивает пространство. Ощущение звука «в маске»: вибрация в области носа и губ.",
    exercises: [
      {
        name: "Мычание с зевком",
        steps: [
          "Мягкое [м] на удобной высоте, рот как при начале зевка",
          "Ищите щекотку/вибрацию на губах и в области носа",
          "1–2 минуты, затем слоги «ма-мэ-ми-мо-му», сохраняя ощущение",
        ],
      },
      {
        name: "Звонкие согласные",
        steps: [
          "Поите [н] и слог [нг] на разных гласных",
          "Держите звонкость согласной в гласную без «провала»",
        ],
      },
    ],
  },
  {
    id: "cpp",
    title: "Чистота звука",
    triggers: ["denserSound"],
    intro:
      "Придыхательность — воздух прорывается до звука. Начинайте звук чисто: вдох — мгновение тишины — сразу тон.",
    exercises: [
      {
        name: "Чистая атака",
        steps: [
          "Вдох носом, пауза, затем сразу чистая гласная [а] без «ха»",
          "Повторите 10 раз на удобной ноте",
          "Контролируйте по карточке «CPP»: рост = чище звук",
        ],
      },
    ],
  },
  {
    id: "steady",
    title: "Ровный длинный тон",
    triggers: ["holdNote"],
    intro:
      "Основа всего: нота без перерыва и без изменения краски. Это и есть тест на опору.",
    exercises: [
      {
        name: "Столб звука",
        steps: [
          "Одна нота 10 секунд: одна высота, одна громкость, одна краска",
          "Записывайте лучший результат за занятие",
        ],
      },
    ],
  },
  {
    id: "pitch",
    title: "Интонация",
    triggers: ["off-note"],
    intro:
      "Кривая на графике — ваш тюнер: держите её строго на линии нужной ноты. Вниз петь интонационно труднее, чем вверх.",
    exercises: [
      {
        name: "Попади в линию",
        steps: [
          "Выберите ноту на сетке и «приземлите» кривую на её линию",
          "Держите 5 секунд так, чтобы кривая не сползала",
        ],
      },
      {
        name: "Гаммы вниз",
        steps: [
          "Пойте мажорную гамму от верхней ноты вниз",
          "Каждая ступень — на своей линии сетки, без «сползания»",
        ],
      },
    ],
  },
];

/** Sections for the current locale. */
export function guideSections(): GuideSection[] {
  const locale = getLocale();
  if (locale === "en") return GUIDE_SECTIONS_EN;
  if (locale === "ja") return GUIDE_SECTIONS_JA;
  return GUIDE_SECTIONS;
}

const REF_TABLE_HEADERS: Record<Locale, string[]> = {
  ru: ["Исполнитель", "Частота", "Размах"],
  en: ["Performer", "Rate", "Extent"],
  ja: ["歌手", "周波数", "振幅"],
};

const CENTS_LABEL: Record<Locale, string> = {
  ru: "центов",
  en: "cents",
  ja: "セント",
};

export function renderGuide(root: HTMLElement): void {
  const locale = getLocale();
  const d = t();
  const sections = guideSections().map(
    (s) => `
      <section class="gsection">
        <h2>${s.title}</h2>
        ${
          s.triggers.length
            ? `<p class="gtriggers">${s.triggers
                .map((k) => `<span class="gchip">${triggerLabel(k)}</span>`)
                .join("")}</p>`
            : ""
        }
        <p class="gintro">${s.intro}</p>
        ${
          s.references === "shared"
            ? `
        <div class="grefs">
          <table class="greftable">
            <thead>
              <tr>${REF_TABLE_HEADERS[locale]!.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${VIBRATO_REFERENCES.flatMap((r) =>
                  r.measurements.map((m) => {
                    const src = r.source ? ` <span class="grefsrc">(${r.source})</span>` : "";
                    return `<tr><td>${r.artist}${src}</td><td>${m.hz} Hz</td><td>${m.cents} ${CENTS_LABEL[locale]}</td></tr>`;
                  }),
                )
                .join("")}
            </tbody>
          </table>
          ${s.target === "shared" ? `<p class="gtarget">${vibratoTarget()}</p>` : ""}
        </div>`
            : ""
        }
        ${s.exercises
          .map(
            (e) => `
          <div class="gexercise">
            <h3>${e.name}</h3>
            <ol>${e.steps.map((st) => `<li>${st}</li>`).join("")}</ol>
          </div>`,
          )
          .join("")}
      </section>`,
  ).join("");

  root.innerHTML = `
    <div class="guide-inner">
      <header class="guide-head">
        <h1>${d.howToTrain}</h1>
        <button type="button" class="guide-close" title="${d.closeBtn}">${d.closeBtn}</button>
      </header>
      <p class="gdisclaimer">${guideDisclaimer()}</p>
      ${sections}
    </div>`;
}

/** Coach keys that identify a section trigger (non-hints render raw). */
const TRIGGER_KEYS = new Set<string>([
  "noSignal",
  "tremolo",
  "vibFaster",
  "vibSlower",
  "vibNarrower",
  "vibWider",
  "vibSmoother",
  "holdNote",
  "pitchShaky",
  "volumeWobbling",
  "moreRing",
  "denserSound",
  "excellent",
  "cleanSound",
]);

function triggerLabel(key: string): string {
  if (TRIGGER_KEYS.has(key)) {
    return coachText(key as Parameters<typeof coachText>[0], localeOfGuide());
  }
  return key;
}

function localeOfGuide(): Locale {
  return getLocale();
}
