import { BUFFER_SECONDS, METRICS_INTERVAL_MS } from "../dsp/constants.ts";
import { F0Tracker } from "../dsp/f0.ts";
import { analyseBuffer } from "../dsp/analyse.ts";
import type { F0Point, WorkerInMessage, WorkerOutMessage } from "../types.ts";

let rate = 44100;
let tracker: F0Tracker | null = null;
let buffer = new Float64Array(0);
let running = false;
let lastMetricsAt = 0;
let chartMedianHz = 0;

function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

function appendBuffer(samples: Float32Array): number {
  const merged = new Float64Array(buffer.length + samples.length);
  merged.set(buffer);
  for (let i = 0; i < samples.length; i++) merged[buffer.length + i] = samples[i]!;
  buffer = merged;

  const maxSamples = rate * BUFFER_SECONDS;
  if (buffer.length <= maxSamples) return 0;

  const drop = buffer.length - maxSamples;
  const hop = Math.floor(0.005 * rate);
  const alignedDrop = Math.floor(drop / hop) * hop;
  buffer = buffer.slice(alignedDrop);
  return Math.floor(alignedDrop / hop);
}

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type === "start") {
    rate = msg.sampleRate;
    tracker = new F0Tracker(rate);
    buffer = new Float64Array(0);
    chartMedianHz = 0;
    running = true;
    lastMetricsAt = performance.now();
    post({ type: "status", message: "Слушаю микрофон…" });
    return;
  }

  if (msg.type === "stop") {
    running = false;
    post({ type: "status", message: "Остановлено" });
    return;
  }

  if (msg.type !== "audio" || !running || !tracker) return;

  const droppedFrames = appendBuffer(msg.samples);
  tracker.syncBuffer(buffer, droppedFrames);
  const newFrames = tracker.append(msg.samples);
  if (newFrames.length === 0) return;

  const med = chartMedianHz;
  const outPoints: F0Point[] = [];
  for (const frame of newFrames) {
    const baseline = med || frame.f0 || 1;
    outPoints.push({
      t: frame.t,
      cents: frame.voiced ? 1200 * Math.log2(frame.f0 / baseline) : NaN,
      voiced: frame.voiced,
    });
  }

  post({ type: "f0", points: outPoints });

  const now = performance.now();
  if (now - lastMetricsAt >= METRICS_INTERVAL_MS && buffer.length >= rate / 2) {
    lastMetricsAt = now;
    try {
      const { metrics, ltas } = analyseBuffer(buffer, rate);
      if (metrics.f0_median_hz) chartMedianHz = metrics.f0_median_hz;
      post({ type: "metrics", metrics });
      if (ltas) {
        post({
          type: "ltas",
          freqs: Array.from(ltas.freqs),
          db: Array.from(ltas.db),
        });
      }
    } catch (err) {
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

export {};
