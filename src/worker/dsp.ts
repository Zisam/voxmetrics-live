import type { WorkerInMessage, WorkerOutMessage } from "../types.ts";
import {
  createWorkerState,
  emitMetricsNow,
  handleWorkerMessage,
  shouldEmitMetrics,
} from "./dsp-core.ts";

const state = createWorkerState();

const audioQueue: Float32Array[] = [];
let drainScheduled = false;
let metricsTimer: ReturnType<typeof setTimeout> | null = null;

function postMessages(messages: WorkerOutMessage[]): void {
  if (messages.length === 0) return;
  if (messages.length === 1) {
    self.postMessage(messages[0]!);
    return;
  }
  self.postMessage({ type: "batch", messages });
}

function scheduleDeferredMetrics(clock: number): void {
  if (!shouldEmitMetrics(state, clock)) return;
  if (metricsTimer !== null) return;
  state.lastMetricsAt = clock;
  metricsTimer = setTimeout(() => {
    metricsTimer = null;
    if (!state.running) return;
    postMessages(emitMetricsNow(state, performance.now()));
  }, 0);
}

function drainAudioQueue(): void {
  drainScheduled = false;
  if (audioQueue.length === 0) return;

  const batch = audioQueue.splice(0);
  const out: WorkerOutMessage[] = [];
  let clock = performance.now();
  for (const samples of batch) {
    out.push(
      ...handleWorkerMessage(
        state,
        { type: "audio", samples },
        clock,
        { syncMetrics: false },
      ),
    );
    clock = performance.now();
  }
  postMessages(out);
  scheduleDeferredMetrics(clock);
}

function queueAudio(samples: Float32Array): void {
  audioQueue.push(samples);
  if (!drainScheduled) {
    drainScheduled = true;
    queueMicrotask(drainAudioQueue);
  }
}

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (msg.type === "audio") {
    queueAudio(msg.samples);
    return;
  }
  postMessages(handleWorkerMessage(state, msg));
};

export {};
