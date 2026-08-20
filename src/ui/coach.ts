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

export type HintLevel = "good" | "warn" | "info";

export interface CoachHint {
  level: HintLevel;
  text: string;
  priority: number;
}

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
 * style banners). No jargon: only what to do.
 */
export function computeCoachHints(
  metrics: MetricsSnapshot,
  maxHints = 2,
): CoachHint[] {
  const hints: CoachHint[] = [];

  if (metrics.voiced_share < 0.4) {
    hints.push({
      level: "warn",
      priority: PRIO.signal,
      text: "Не слышу голос!",
    });
    return hints.slice(0, maxHints);
  }

  if (metrics.tremolo) {
    hints.push({
      level: "warn",
      priority: PRIO.tremolo,
      text: "Качается громкость!",
    });
  }

  const v = metrics.vibrato;
  if (v) {
    if (v.rate_hz < VIB_RATE_GOOD[0]) {
      hints.push({
        level: "warn",
        priority: PRIO.vibratoRate,
        text: "Вибрато быстрее!",
      });
    } else if (v.rate_hz > VIB_RATE_GOOD[1]) {
      hints.push({
        level: "warn",
        priority: PRIO.vibratoRate,
        text: "Вибрато медленнее!",
      });
    }
    if (v.extent_cents_direct > VIB_EXTENT_GOOD[1]) {
      hints.push({
        level: "warn",
        priority: PRIO.vibratoExtent,
        text: "Вибрато уже!",
      });
    } else if (v.extent_cents_direct < VIB_EXTENT_GOOD[0]) {
      hints.push({
        level: "warn",
        priority: PRIO.vibratoExtent,
        text: "Вибрато шире!",
      });
    }
    if (
      v.regularity != null &&
      v.regularity < VIB_REGULARITY_GOOD &&
      !hints.some((h) => h.priority === PRIO.vibratoRate)
    ) {
      hints.push({
        level: "warn",
        priority: PRIO.vibratoRegularity,
        text: "Волна ровнее!",
      });
    }
  }

  if (v == null || v.steady_seconds < VIB_TRUSTED_SECONDS) {
    hints.push({
      level: "info",
      priority: PRIO.steady,
      text: "Держите ноту!",
    });
  }

  if (metrics.jitter_pct != null && metrics.jitter_pct > JITTER_OK_PCT) {
    hints.push({
      level: "warn",
      priority: PRIO.jitter,
      text: "Высота дрожит!",
    });
  } else if (
    metrics.jitter_pct != null &&
    metrics.jitter_pct > JITTER_GOOD_PCT &&
    !hints.some((h) => h.priority === PRIO.tremolo)
  ) {
    hints.push({
      level: "warn",
      priority: PRIO.jitter,
      text: "Высота дрожит!",
    });
  }

  if (
    metrics.shimmer_db != null &&
    metrics.shimmer_db > SHIMMER_OK_DB &&
    !hints.some((h) => h.priority === PRIO.tremolo)
  ) {
    hints.push({
      level: "warn",
      priority: PRIO.shimmer,
      text: "Громкость плывёт!",
    });
  } else if (
    metrics.shimmer_db != null &&
    metrics.shimmer_db > SHIMMER_GOOD_DB &&
    !hints.some((h) => h.priority === PRIO.tremolo) &&
    !hints.some((h) => h.priority === PRIO.jitter)
  ) {
    hints.push({
      level: "warn",
      priority: PRIO.shimmer,
      text: "Громкость плывёт!",
    });
  }

  if (hints.length === 0) {
    if (metrics.vibrato && metrics.vibrato.trusted) {
      hints.push({
        level: "good",
        priority: PRIO.praise,
        text: "Отлично!",
      });
    }
    if (
      metrics.singer_formant_db == null ||
      metrics.singer_formant_db < SINGER_FORMANT_GOOD_DB
    ) {
      hints.push({
        level: "info",
        priority: PRIO.singer,
        text: "Больше полётности!",
      });
    }
    if (
      metrics.cpp_db != null &&
      metrics.cpp_db < CPP_OK_DB &&
      metrics.singer_formant_db != null &&
      metrics.singer_formant_db < SINGER_FORMANT_GOOD_DB
    ) {
      hints.push({
        level: "warn",
        priority: PRIO.cpp,
        text: "Плотнее звук!",
      });
    } else if (metrics.cpp_db != null && metrics.cpp_db >= CPP_GOOD_DB) {
      hints.push({
        level: "good",
        priority: PRIO.praise + 1,
        text: "Чистый звук!",
      });
    }
  }

  return hints.sort((a, b) => b.priority - a.priority).slice(0, maxHints);
}
