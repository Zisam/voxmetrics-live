export interface VibratoResult {
  rate_hz: number;
  extent_cents_rms: number;
  extent_cents_direct: number;
  regularity: number | null;
  /** Cycle-to-cycle period variation (CV) of the F0 wave; lower = steadier tempo. */
  period_cv: number | null;
  steady_seconds: number;
  center_hz: number;
  trusted: boolean;
}

export interface MetricsSnapshot {
  when: string;
  duration_s: number;
  sample_rate: number;
  voiced_share: number;
  f0_median_hz: number | null;
  vibrato: VibratoResult | null;
  h1_h2_db: number | null;
  sf_balance_db: number | null;
  spectral_centroid_hz: number;
  formants_hz: number[];
  singer_formant_hz: number | null;
  singer_formant_db: number | null;
  jitter_pct: number | null;
  shimmer_db: number | null;
  cpp_db: number | null;
  tremolo: { rate_hz: number; depth_db: number } | null;
}

export interface F0Point {
  t: number;
  f0_hz: number;
  cents: number;
  voiced: boolean;
}

export type WorkerOutMessage =
  | { type: "f0"; points: F0Point[] }
  | { type: "metrics"; metrics: MetricsSnapshot }
  | { type: "ltas"; freqs: Float64Array; db: Float64Array }
  | { type: "status"; message: string }
  | { type: "error"; message: string }
  | { type: "batch"; messages: WorkerOutMessage[] };

export type WorkerInMessage =
  | { type: "start"; sampleRate: number }
  | { type: "stop" }
  | { type: "audio"; samples: Float32Array };
