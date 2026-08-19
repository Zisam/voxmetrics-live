import type { WorkerInMessage } from "../types.ts";
import { createAnalyserState, handleAnalyserMessage } from "./analyser-core.ts";

const state = createAnalyserState();

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const out = handleAnalyserMessage(state, ev.data);
  if (out.length === 0) return;
  if (out.length === 1) {
    self.postMessage(out[0]);
    return;
  }
  self.postMessage({ type: "batch", messages: out });
};

export {};
