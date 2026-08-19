import { TRACKER_BUFFER_SEC } from "../dsp/constants.ts";
import { F0Tracker } from "../dsp/f0.ts";
import {
  centsReferenceHz,
  clearHudBaseline,
  ingestVoicedFrames,
} from "../ui/session.ts";
import type { F0Point, WorkerInMessage, WorkerOutMessage } from "../types.ts";

export interface WorkerState {
  rate: number;
  tracker: F0Tracker | null;
  running: boolean;
  hudBaselineHz: number;
  recentVoicedHz: number[];
}

export function createWorkerState(): WorkerState {
  return {
    rate: 44100,
    tracker: null,
    running: false,
    hudBaselineHz: 0,
    recentVoicedHz: [],
  };
}

export function resetWorkerSession(state: WorkerState): void {
  state.tracker = null;
  state.running = false;
  clearHudBaseline(state);
}

export function handleWorkerMessage(
  state: WorkerState,
  msg: WorkerInMessage,
): WorkerOutMessage[] {
  const out: WorkerOutMessage[] = [];

  if (msg.type === "start") {
    resetWorkerSession(state);
    state.rate = msg.sampleRate;
    state.tracker = new F0Tracker(state.rate, TRACKER_BUFFER_SEC);
    state.running = true;
    out.push({ type: "status", message: "Слушаю микрофон…" });
    return out;
  }

  if (msg.type === "stop") {
    resetWorkerSession(state);
    out.push({ type: "status", message: "Остановлено" });
    return out;
  }

  if (msg.type !== "audio" || !state.running || !state.tracker) return out;

  state.tracker.pushSamples(msg.samples);
  const newFrames = state.tracker.append();
  if (newFrames.length === 0) return out;

  const voicedHz = newFrames
    .filter((f) => f.voiced && f.f0 > 0)
    .map((f) => f.f0);
  ingestVoicedFrames(state, voicedHz);

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

  return out;
}
