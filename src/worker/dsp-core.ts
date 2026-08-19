import { BUFFER_SECONDS, METRICS_INTERVAL_MS } from "../dsp/constants.ts";
import { F0Tracker } from "../dsp/f0.ts";
import { analyseBuffer } from "../dsp/analyse.ts";
import type { F0Point, WorkerInMessage, WorkerOutMessage } from "../types.ts";

export interface WorkerState {
  rate: number;
  tracker: F0Tracker | null;
  buffer: Float64Array;
  running: boolean;
  lastMetricsAt: number;
  chartMedianHz: number;
}

export function createWorkerState(): WorkerState {
  return {
    rate: 44100,
    tracker: null,
    buffer: new Float64Array(0),
    running: false,
    lastMetricsAt: 0,
    chartMedianHz: 0,
  };
}

export function appendBuffer(state: WorkerState, samples: Float32Array): number {
  const merged = new Float64Array(state.buffer.length + samples.length);
  merged.set(state.buffer);
  for (let i = 0; i < samples.length; i++) merged[state.buffer.length + i] = samples[i]!;
  state.buffer = merged;

  const maxSamples = state.rate * BUFFER_SECONDS;
  if (state.buffer.length <= maxSamples) return 0;

  const drop = state.buffer.length - maxSamples;
  const hop = Math.floor(0.005 * state.rate);
  const alignedDrop = Math.floor(drop / hop) * hop;
  state.buffer = state.buffer.slice(alignedDrop);
  return Math.floor(alignedDrop / hop);
}

export function handleWorkerMessage(
  state: WorkerState,
  msg: WorkerInMessage,
  now?: number,
): WorkerOutMessage[] {
  const out: WorkerOutMessage[] = [];

  if (msg.type === "start") {
    state.rate = msg.sampleRate;
    state.tracker = new F0Tracker(state.rate);
    state.buffer = new Float64Array(0);
    state.chartMedianHz = 0;
    state.running = true;
    state.lastMetricsAt = now ?? performance.now();
    out.push({ type: "status", message: "Слушаю микрофон…" });
    return out;
  }

  if (msg.type === "stop") {
    state.running = false;
    out.push({ type: "status", message: "Остановлено" });
    return out;
  }

  if (msg.type !== "audio" || !state.running || !state.tracker) return out;

  const droppedFrames = appendBuffer(state, msg.samples);
  state.tracker.syncBuffer(state.buffer, droppedFrames, msg.samples.length);
  const newFrames = state.tracker.append();
  if (newFrames.length === 0) return out;

  const med = state.chartMedianHz;
  const outPoints: F0Point[] = [];
  for (const frame of newFrames) {
    const baseline = med || frame.f0 || 1;
    outPoints.push({
      t: frame.t,
      cents: frame.voiced ? 1200 * Math.log2(frame.f0 / baseline) : NaN,
      voiced: frame.voiced,
    });
  }
  out.push({ type: "f0", points: outPoints });

  const metricsNow = now ?? performance.now();
  if (
    metricsNow - state.lastMetricsAt >= METRICS_INTERVAL_MS &&
    state.buffer.length >= state.rate / 2
  ) {
    state.lastMetricsAt = metricsNow;
    try {
      const { metrics, ltas } = analyseBuffer(state.buffer, state.rate);
      if (metrics.f0_median_hz) state.chartMedianHz = metrics.f0_median_hz;
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
  }

  return out;
}
