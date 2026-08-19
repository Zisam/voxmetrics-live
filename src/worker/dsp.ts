import type { WorkerInMessage, WorkerOutMessage } from "../types.ts";
import { createWorkerState, handleWorkerMessage } from "./dsp-core.ts";

const state = createWorkerState();

const audioQueue: Float32Array[] = [];
let drainScheduled = false;

function postMessages(messages: WorkerOutMessage[]): void {
  if (messages.length === 0) return;
  if (messages.length === 1) {
    self.postMessage(messages[0]!);
    return;
  }
  self.postMessage({ type: "batch", messages });
}

function drainAudioQueue(): void {
  drainScheduled = false;
  if (audioQueue.length === 0) return;

  const out: WorkerOutMessage[] = [];
  for (const samples of audioQueue.splice(0)) {
    out.push(...handleWorkerMessage(state, { type: "audio", samples }));
  }
  postMessages(out);
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
