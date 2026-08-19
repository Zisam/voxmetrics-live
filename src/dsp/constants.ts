export const F0_MIN = 45.0;
export const F0_MAX = 1400.0;
export const FRAME_SEC = 0.05;
export const HOP_SEC = 0.005;
export const VIB_MIN = 2.0;
export const VIB_MAX = 12.0;
export const VIB_MIN_SECONDS = 1.0;
export const VIB_TRUSTED_SECONDS = 4.0;
export const VIB_MIN_EXTENT = 20.0;
export const VIB_MIN_PROMINENCE = 3.0;
export const SF_BAND: readonly [number, number] = [2200.0, 3400.0];
export const REF_BAND: readonly [number, number] = [300.0, 1000.0];
export const FORMANT_MAX_BW = 500.0;
export const FORMANT_MERGE_HZ = 200.0;
export const BUFFER_SECONDS = 15;
/** Visible pitch trace (s). ~5 s: short phrase + 1–2 vibrato cycles at 5–6 Hz; ~1000 pts at 5 ms hop. */
export const PITCH_WINDOW_SEC = 5;
export const MAX_PITCH_POINTS = Math.ceil(PITCH_WINDOW_SEC / HOP_SEC) + 20;
/** HUD cents baseline refresh interval. */
export const BASELINE_INTERVAL_MS = 1000;
/** Rolling voiced-frame count for HUD baseline (~2 s at 5 ms hop when continuously voiced). */
export const BASELINE_VOICED_SAMPLES = 400;
/** Full metrics/LTAS analysis interval (independent of HUD baseline). */
export const METRICS_INTERVAL_MS = 1000;
/** Live metrics window — shorter than BUFFER_SECONDS to keep ~1 Hz analysis cheap. */
export const METRICS_ANALYSIS_SEC = 4;
/** F0 tracker rolling buffer (s) — enough for 50 ms frame + live context. */
export const TRACKER_BUFFER_SEC = 2;
/** Compute metrics in worker (for future UI); emitted async so F0 stays realtime. */
export const ENABLE_LIVE_METRICS = true;
