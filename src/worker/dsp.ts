import type { WorkerInMessage } from "../types.ts";
import { handleWorkerMessage, createWorkerState } from "./dsp-core.ts";

const state = createWorkerState();

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  for (const msg of handleWorkerMessage(state, ev.data)) {
    self.postMessage(msg);
  }
};

export {};
