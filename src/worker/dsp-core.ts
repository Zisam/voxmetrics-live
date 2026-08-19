import {
  BASELINE_INTERVAL_MS,
  ENABLE_LIVE_METRICS,
  METRICS_ANALYSIS_SEC,
  METRICS_INTERVAL_MS,
  TRACKER_BUFFER_SEC,
} from "../dsp/constants.ts";
import { analyseBuffer } from "../dsp/analyse.ts";
import { F0Tracker } from "../dsp/f0.ts";
import {
  appendAudioRing,
  createAudioRing,
  resetAudioRing,
  ringTail,
  type AudioRing,
} from "../ui/audio-ring.ts";
import {
  centsReferenceHz,
  clearHudBaseline,
  ingestVoicedFrames,
} from "../ui/session.ts";
import type { F0Point, WorkerInMessage, WorkerOutMessage } from "../types.ts";

export interface WorkerState {
  rate: number;
  tracker: F0Tracker | null;
  ring: AudioRing;
  running: boolean;
  lastBaselineAt: number;
  lastMetricsAt: number;
  hudBaselineHz: number;
  recentVoicedHz: number[];
}

export function createWorkerState(): WorkerState {
  return {
    rate: 44100,
    tracker: null,
    ring: createAudioRing(44100),
    running: false,
    lastBaselineAt: 0,
    lastMetricsAt: 0,
    hudBaselineHz: 0,
    recentVoicedHz: [],
  };
}

export function resetWorkerSession(state: WorkerState): void {
  state.tracker = null;
  resetAudioRing(state.ring);
  state.running = false;
  clearHudBaseline(state);
  state.lastBaselineAt = 0;
  state.lastMetricsAt = 0;
}

export function shouldEmitMetrics(state: WorkerState, now: number): boolean {
  if (!ENABLE_LIVE_METRICS) return false;
  if (now - state.lastMetricsAt < METRICS_INTERVAL_MS) return false;
  return state.ring.length >= state.rate / 2;
}

export function maybeEmitMetrics(
  state: WorkerState,
  now: number,
): WorkerOutMessage[] {
  if (!shouldEmitMetrics(state, now)) return [];
  return emitMetricsNow(state, now);
}

export function emitMetricsNow(
  state: WorkerState,
  now: number,
): WorkerOutMessage[] {
  const out: WorkerOutMessage[] = [];
  state.lastMetricsAt = now;
  try {
    const tailSamples = Math.min(
      state.ring.length,
      state.rate * METRICS_ANALYSIS_SEC,
    );
    const audio = ringTail(state.ring, tailSamples);
    const { metrics, ltas } = analyseBuffer(audio, state.rate);
    out.push({ type: "metrics", metrics });
    if (ltas) {
      out.push({
        type: "ltas",
        freqs: Array.from(ltas.freqs),
        db: Array.from(ltas.db),
      });
    }
  } catch (err) {
    out.push({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return out;
}

export function handleWorkerMessage(
  state: WorkerState,
  msg: WorkerInMessage,
  now?: number,
  options?: { syncMetrics?: boolean },
): WorkerOutMessage[] {
  const out: WorkerOutMessage[] = [];
  const syncMetrics = options?.syncMetrics ?? true;

  if (msg.type === "start") {
    resetWorkerSession(state);
    state.rate = msg.sampleRate;
    state.ring = createAudioRing(state.rate);
    state.tracker = new F0Tracker(state.rate, TRACKER_BUFFER_SEC);
    state.running = true;
    const t = now ?? performance.now();
    state.lastBaselineAt = t;
    state.lastMetricsAt = t;
    out.push({ type: "status", message: "Слушаю микрофон…" });
    return out;
  }

  if (msg.type === "stop") {
    resetWorkerSession(state);
    out.push({ type: "status", message: "Остановлено" });
    return out;
  }

  if (msg.type !== "audio" || !state.running || !state.tracker) return out;

  appendAudioRing(state.ring, msg.samples, state.rate);
  state.tracker.pushSamples(msg.samples);
  const clock = now ?? performance.now();
  const metricsOut = syncMetrics ? maybeEmitMetrics(state, clock) : [];

  const newFrames = state.tracker.append();
  if (newFrames.length === 0) return metricsOut;

  const voicedHz = newFrames
    .filter((f) => f.voiced && f.f0 > 0)
    .map((f) => f.f0);
  ingestVoicedFrames(state, voicedHz);

  if (clock - state.lastBaselineAt >= BASELINE_INTERVAL_MS) {
    state.lastBaselineAt = clock;
  }

  const outPoints: F0Point[] = [];
  for (const frame of newFrames) {
    const ref = centsReferenceHz(state, frame.f0, frame.voiced);
    outPoints.push({
      t: frame.t,
      f0_hz: frame.f0,
      cents: frame.voiced ? 1200 * Math.log2(frame.f0 / ref) : NaN,
      voiced: frame.voiced,
    });
  }
  out.push({ type: "f0", points: outPoints });
  out.push(...metricsOut);

  return out;
}

export {
  clearHudBaseline,
  ingestVoicedFrames,
  pushRecentVoiced,
  refreshHudBaseline,
} from "../ui/session.ts";

export { appendAudioRing as appendBuffer } from "../ui/audio-ring.ts";
