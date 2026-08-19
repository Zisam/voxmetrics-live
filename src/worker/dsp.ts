import { BUFFER_SECONDS, METRICS_INTERVAL_MS } from "../dsp/constants.ts";
import { F0Tracker } from "../dsp/f0.ts";
import { analyseBuffer } from "../dsp/analyse.ts";
import type { F0Point, WorkerInMessage, WorkerOutMessage } from "../types.ts";

let rate = 44100;
let tracker: F0Tracker | null = null;
let buffer = new Float64Array(0);
let running = false;
let lastMetricsAt = 0;
let sessionStart = 0;

const f0History: F0Point[] = [];
const voicedHzHistory: number[] = [];
const MAX_F0_POINTS = 2000;

function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

function medianHz(): number {
  if (voicedHzHistory.length === 0) return 0;
  const sorted = [...voicedHzHistory].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function appendBuffer(samples: Float32Array): void {
  const merged = new Float64Array(buffer.length + samples.length);
  merged.set(buffer);
  for (let i = 0; i < samples.length; i++) merged[buffer.length + i] = samples[i]!;
  buffer = merged;

  const maxSamples = rate * BUFFER_SECONDS;
  if (buffer.length > maxSamples) {
    buffer = buffer.slice(buffer.length - maxSamples);
    tracker?.trim(maxSamples);
  }
}

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type === "start") {
    rate = msg.sampleRate;
    tracker = new F0Tracker(rate);
    buffer = new Float64Array(0);
    f0History.length = 0;
    voicedHzHistory.length = 0;
    running = true;
    lastMetricsAt = performance.now();
    sessionStart = performance.now();
    post({ type: "status", message: "Слушаю микрофон…" });
    return;
  }

  if (msg.type === "stop") {
    running = false;
    post({ type: "status", message: "Остановлено" });
    return;
  }

  if (msg.type !== "audio" || !running || !tracker) return;

  appendBuffer(msg.samples);
  const newFrames = tracker.append(msg.samples);
  if (newFrames.length === 0) return;

  const outPoints: F0Point[] = [];
  for (const frame of newFrames) {
    if (frame.voiced) {
      voicedHzHistory.push(frame.f0);
      while (voicedHzHistory.length > 500) voicedHzHistory.shift();
    }
    const med = medianHz() || frame.f0 || 1;
    const t = (performance.now() - sessionStart) / 1000;
    const point: F0Point = {
      t,
      cents: frame.voiced ? 1200 * Math.log2(frame.f0 / med) : NaN,
      voiced: frame.voiced,
    };
    f0History.push(point);
    outPoints.push(point);
  }

  while (f0History.length > MAX_F0_POINTS) f0History.shift();
  post({ type: "f0", points: outPoints });

  const now = performance.now();
  if (now - lastMetricsAt >= METRICS_INTERVAL_MS && buffer.length >= rate / 2) {
    lastMetricsAt = now;
    try {
      const { metrics, ltas } = analyseBuffer(buffer, rate);
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
