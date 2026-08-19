import {
  METRICS_ANALYSIS_SEC,
  METRICS_INTERVAL_MS,
  METRICS_MIN_AUDIO_SEC,
} from "../dsp/constants.ts";
import { analyseBuffer } from "../dsp/analyse.ts";
import {
  appendAudioRing,
  createAudioRing,
  resetAudioRing,
  ringTail,
  type AudioRing,
} from "../ui/audio-ring.ts";
import type { WorkerInMessage, WorkerOutMessage } from "../types.ts";

export interface AnalyserState {
  rate: number;
  ring: AudioRing;
  running: boolean;
  lastEmitAt: number;
}

export function createAnalyserState(): AnalyserState {
  return {
    rate: 44100,
    ring: createAudioRing(44100),
    running: false,
    lastEmitAt: 0,
  };
}

export function resetAnalyserSession(state: AnalyserState): void {
  resetAudioRing(state.ring);
  state.running = false;
  state.lastEmitAt = 0;
}

export function shouldEmitMetrics(state: AnalyserState, now: number): boolean {
  if (!state.running) return false;
  if (now - state.lastEmitAt < METRICS_INTERVAL_MS) return false;
  return state.ring.length >= state.rate * METRICS_MIN_AUDIO_SEC;
}

export function handleAnalyserMessage(
  state: AnalyserState,
  msg: WorkerInMessage,
  now = performance.now(),
): WorkerOutMessage[] {
  if (msg.type === "start") {
    resetAnalyserSession(state);
    state.rate = msg.sampleRate;
    state.ring = createAudioRing(state.rate);
    state.running = true;
    state.lastEmitAt = now;
    return [];
  }

  if (msg.type === "stop") {
    resetAnalyserSession(state);
    return [];
  }

  if (msg.type !== "audio" || !state.running) return [];

  appendAudioRing(state.ring, msg.samples, state.rate);
  if (!shouldEmitMetrics(state, now)) return [];
  state.lastEmitAt = now;

  const tailSamples = Math.min(
    state.ring.length,
    state.rate * METRICS_ANALYSIS_SEC,
  );
  const audio = ringTail(state.ring, tailSamples);
  try {
    const { metrics, ltas } = analyseBuffer(audio, state.rate);
    const out: WorkerOutMessage[] = [{ type: "metrics", metrics }];
    if (ltas) {
      out.push({ type: "ltas", freqs: ltas.freqs, db: ltas.db });
    }
    return out;
  } catch (err) {
    return [
      {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}
