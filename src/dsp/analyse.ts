import type { MetricsSnapshot } from "../types.ts";
import { trackF0 } from "./f0.ts";
import { analyseVibrato } from "./vibrato.ts";
import { analyseH1H2 } from "./h1h2.ts";
import { analyseFormants } from "./formants.ts";
import {
  bandMeanDb,
  computeLtas,
  spectralCentroid,
} from "./ltas.ts";
import { REF_BAND, SF_BAND } from "./constants.ts";

export interface AnalyseOutput {
  metrics: MetricsSnapshot;
  ltas: { freqs: Float64Array; db: Float64Array } | null;
}

export function analyseBuffer(x: Float64Array, rate: number): AnalyseOutput {
  const { f0, voiced } = trackF0(x, rate);
  const voicedF0: number[] = [];
  for (let i = 0; i < f0.length; i++) {
    if (voiced[i]) voicedF0.push(f0[i]!);
  }
  voicedF0.sort((a, b) => a - b);
  const f0Median =
    voicedF0.length === 0
      ? null
      : Math.round(
          (voicedF0.length % 2 === 0
            ? (voicedF0[voicedF0.length / 2 - 1]! + voicedF0[voicedF0.length / 2]!) / 2
            : voicedF0[Math.floor(voicedF0.length / 2)]!) * 100,
        ) / 100;

  let voicedCount = 0;
  for (let i = 0; i < voiced.length; i++) if (voiced[i]) voicedCount++;

  let ltas: { freqs: Float64Array; db: Float64Array } | null = null;
  let sfBalance: number | null = null;
  let centroid = 0;
  if (x.length >= 4096) {
    try {
      const result = computeLtas(x, rate);
      ltas = result;
      const sf = bandMeanDb(result.freqs, result.db, SF_BAND[0], SF_BAND[1]);
      const ref = bandMeanDb(result.freqs, result.db, REF_BAND[0], REF_BAND[1]);
      sfBalance = sf !== null && ref !== null ? Math.round((sf - ref) * 100) / 100 : null;
      centroid = spectralCentroid(result.freqs, result.db);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !message.includes("короче") &&
        message !== "не нашёл озвученных участков"
      ) {
        throw err;
      }
    }
  }

  const metrics: MetricsSnapshot = {
    when: new Date().toISOString().slice(0, 19),
    duration_s: Math.round((x.length / rate) * 100) / 100,
    sample_rate: rate,
    voiced_share: voiced.length ? Math.round((voicedCount / voiced.length) * 1000) / 1000 : 0,
    f0_median_hz: f0Median,
    vibrato: analyseVibrato(f0, voiced, rate),
    h1_h2_db: analyseH1H2(x, rate, f0, voiced),
    sf_balance_db: sfBalance,
    spectral_centroid_hz: centroid,
    formants_hz: x.length >= rate / 2 ? analyseFormants(x, rate) : [],
  };

  return { metrics, ltas };
}
