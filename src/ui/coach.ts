import type { MetricsSnapshot } from "../types.ts";
import {
  JITTER_GOOD_PCT,
  JITTER_OK_PCT,
  SHIMMER_GOOD_DB,
  SHIMMER_OK_DB,
  VIB_TRUSTED_SECONDS,
} from "../dsp/constants.ts";
import { SINGER_FORMANT_GOOD_DB } from "./metrics-panel.ts";
import { CPP_GOOD_DB, CPP_OK_DB } from "./metrics-panel.ts";
import { VIB_RATE_GOOD, VIB_EXTENT_GOOD, VIB_REGULARITY_GOOD } from "./metrics-panel.ts";
import type { Locale } from "./i18n.ts";

export type HintLevel = "good" | "warn" | "info";

export interface CoachHint {
  level: HintLevel;
  /** Dictionary key for the hint text. */
  key: CoachKey;
  priority: number;
}

/**
 * Locale-independent hint keys. Rendered through the coach dictionary so
 * the banner language follows the UI locale.
 */
export type CoachKey =
  | "noSignal"
  | "tremolo"
  | "vibFaster"
  | "vibSlower"
  | "vibNarrower"
  | "vibWider"
  | "vibSmoother"
  | "holdNote"
  | "pitchShaky"
  | "volumeWobbling"
  | "moreRing"
  | "denserSound"
  | "excellent"
  | "cleanSound";

const COACH_TEXT: Record<CoachKey, Record<Locale, string>> = {
  noSignal: {
    ru: "Не слышу голос!",
    en: "I can't hear you!",
    ja: "声が聞こえません！",
  },
  tremolo: {
    ru: "Качается громкость!",
    en: "Volume is wobbling!",
    ja: "音量が揺れています！",
  },
  vibFaster: {
    ru: "Вибрато быстрее!",
    en: "Vibrato faster!",
    ja: "ビブラートを速く！",
  },
  vibSlower: {
    ru: "Вибрато медленнее!",
    en: "Vibrato slower!",
    ja: "ビブラートを遅く！",
  },
  vibNarrower: {
    ru: "Вибрато уже!",
    en: "Vibrato narrower!",
    ja: "ビブラートを狭く！",
  },
  vibWider: {
    ru: "Вибрато шире!",
    en: "Vibrato wider!",
    ja: "ビブラートを広く！",
  },
  vibSmoother: {
    ru: "Волна ровнее!",
    en: "Smoother wave!",
    ja: "波をなめらかに！",
  },
  holdNote: {
    ru: "Держите ноту!",
    en: "Hold the note!",
    ja: "音を保って！",
  },
  pitchShaky: {
    ru: "Высота дрожит!",
    en: "Pitch is shaky!",
    ja: "音程が震えています！",
  },
  volumeWobbling: {
    ru: "Громкость плывёт!",
    en: "Volume is drifting!",
    ja: "音量が不安定！",
  },
  moreRing: {
    ru: "Больше полётности!",
    en: "More ring!",
    ja: "もつ響きを！",
  },
  denserSound: {
    ru: "Плотнее звук!",
    en: "Denser sound!",
    ja: "濃い音で！",
  },
  excellent: {
    ru: "Отлично!",
    en: "Excellent!",
    ja: "素晴らしい！",
  },
  cleanSound: {
    ru: "Чистый звук!",
    en: "Clean sound!",
    ja: "澄んだ音！",
  },
};

/** Render a coach key in the given (or current) locale. */
export function coachText(key: CoachKey, locale?: Locale): string {
  return COACH_TEXT[key]![locale ?? "ru"];
}

export const COACH_KEYS = COACH_TEXT;

const PRIO = {
  signal: 100,
  tremolo: 80,
  vibratoRate: 60,
  vibratoExtent: 55,
  vibratoRegularity: 50,
  steady: 45,
  jitter: 40,
  shimmer: 35,
  singer: 25,
  cpp: 20,
  praise: 10,
} as const;

/**
 * Turn metrics into short, action-oriented coaching hints (rhythm-game
 * style banners). Locale-independent: returns keys, rendered by the caller.
 */
export function computeCoachHints(
  metrics: MetricsSnapshot,
  maxHints = 2,
): CoachHint[] {
  const hints: CoachHint[] = [];
  const push = (level: HintLevel, priority: number, key: CoachKey) => {
    hints.push({ level, priority, key });
  };

  if (metrics.voiced_share < 0.4) {
    push("warn", PRIO.signal, "noSignal");
    return hints.slice(0, maxHints);
  }

  if (metrics.tremolo) {
    push("warn", PRIO.tremolo, "tremolo");
  }

  const v = metrics.vibrato;
  if (v) {
    if (v.rate_hz < VIB_RATE_GOOD[0]) {
      push("warn", PRIO.vibratoRate, "vibFaster");
    } else if (v.rate_hz > VIB_RATE_GOOD[1]) {
      push("warn", PRIO.vibratoRate, "vibSlower");
    }
    if (v.extent_cents_direct > VIB_EXTENT_GOOD[1]) {
      push("warn", PRIO.vibratoExtent, "vibNarrower");
    } else if (v.extent_cents_direct < VIB_EXTENT_GOOD[0]) {
      push("warn", PRIO.vibratoExtent, "vibWider");
    }
    if (
      v.regularity != null &&
      v.regularity < VIB_REGULARITY_GOOD &&
      !hints.some((h) => h.priority === PRIO.vibratoRate)
    ) {
      push("warn", PRIO.vibratoRegularity, "vibSmoother");
    }
  }

  if (v == null || v.steady_seconds < VIB_TRUSTED_SECONDS) {
    push("info", PRIO.steady, "holdNote");
  }

  if (metrics.jitter_pct != null && metrics.jitter_pct > JITTER_OK_PCT) {
    push("warn", PRIO.jitter, "pitchShaky");
  } else if (
    metrics.jitter_pct != null &&
    metrics.jitter_pct > JITTER_GOOD_PCT &&
    !hints.some((h) => h.priority === PRIO.tremolo)
  ) {
    push("warn", PRIO.jitter, "pitchShaky");
  }

  if (
    metrics.shimmer_db != null &&
    metrics.shimmer_db > SHIMMER_OK_DB &&
    !hints.some((h) => h.priority === PRIO.tremolo)
  ) {
    push("warn", PRIO.shimmer, "volumeWobbling");
  } else if (
    metrics.shimmer_db != null &&
    metrics.shimmer_db > SHIMMER_GOOD_DB &&
    !hints.some((h) => h.priority === PRIO.tremolo) &&
    !hints.some((h) => h.priority === PRIO.jitter)
  ) {
    push("warn", PRIO.shimmer, "volumeWobbling");
  }

  if (hints.length === 0) {
    if (metrics.vibrato && metrics.vibrato.trusted) {
      push("good", PRIO.praise, "excellent");
    }
    if (
      metrics.singer_formant_db == null ||
      metrics.singer_formant_db < SINGER_FORMANT_GOOD_DB
    ) {
      push("info", PRIO.singer, "moreRing");
    }
    if (
      metrics.cpp_db != null &&
      metrics.cpp_db < CPP_OK_DB &&
      metrics.singer_formant_db != null &&
      metrics.singer_formant_db < SINGER_FORMANT_GOOD_DB
    ) {
      push("warn", PRIO.cpp, "denserSound");
    } else if (metrics.cpp_db != null && metrics.cpp_db >= CPP_GOOD_DB) {
      push("good", PRIO.praise + 1, "cleanSound");
    }
  }

  return hints.sort((a, b) => b.priority - a.priority).slice(0, maxHints);
}
