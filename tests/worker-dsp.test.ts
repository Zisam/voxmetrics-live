import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkerOutMessage } from "../src/types.ts";
import { BASELINE_VOICED_SAMPLES } from "../src/dsp/constants.ts";
import {
  createWorkerState,
  handleWorkerMessage,
} from "../src/worker/dsp-core.ts";
import {
  pushRecentVoiced,
  refreshHudBaseline,
} from "../src/ui/session.ts";
import { synth, RATE } from "./synth.ts";

function toFloat32(samples: ArrayLike<number>): Float32Array {
  return Float32Array.from(samples);
}

function feedAudio(
  state: ReturnType<typeof createWorkerState>,
  samples: Float64Array,
  chunkSize: number,
) {
  const messages: WorkerOutMessage[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, Math.min(i + chunkSize, samples.length));
    messages.push(
      ...handleWorkerMessage(state, {
        type: "audio",
        samples: toFloat32(chunk),
      }),
    );
  }
  return messages;
}

function messageTypes(messages: WorkerOutMessage[]): string[] {
  return messages.map((m) => m.type);
}

describe("baseline helpers", () => {
  it("caps recent voiced samples", () => {
    const state = createWorkerState();
    for (let i = 0; i < BASELINE_VOICED_SAMPLES + 10; i++) {
      pushRecentVoiced(state, 440 + i);
    }
    expect(state.recentVoicedHz.length).toBe(BASELINE_VOICED_SAMPLES);
    expect(state.recentVoicedHz[0]).toBe(450);
  });

  it("refreshes baseline immediately from voiced samples", () => {
    const state = createWorkerState();
    state.recentVoicedHz = [440, 440, 440];
    refreshHudBaseline(state);
    expect(state.hudBaselineHz).toBe(440);
  });
});

describe("handleWorkerMessage", () => {
  it("handles start and stop lifecycle", () => {
    const state = createWorkerState();
    const start = handleWorkerMessage(state, { type: "start", sampleRate: RATE });
    expect(start).toEqual([{ type: "status", message: "Слушаю микрофон…" }]);
    expect(state.running).toBe(true);
    expect(state.tracker).not.toBeNull();

    const stop = handleWorkerMessage(state, { type: "stop" });
    expect(stop).toEqual([{ type: "status", message: "Остановлено" }]);
    expect(state.running).toBe(false);
    expect(state.tracker).toBeNull();
    expect(state.hudBaselineHz).toBe(0);
    expect(state.recentVoicedHz).toEqual([]);
  });

  it("ignores audio before start", () => {
    const state = createWorkerState();
    const sig = synth(0, 0, 440, 0.2);
    const out = handleWorkerMessage(state, {
      type: "audio",
      samples: toFloat32(sig),
    });
    expect(out).toEqual([]);
  });

  it("ignores audio after stop", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });
    handleWorkerMessage(state, { type: "stop" });

    const sig = synth(0, 0, 440, 0.5);
    const out = handleWorkerMessage(state, {
      type: "audio",
      samples: toFloat32(sig),
    });
    expect(out).toEqual([]);
  });

  it("returns empty when chunk is too short for a new frame", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });

    const tiny = new Float32Array(64);
    const out = handleWorkerMessage(state, { type: "audio", samples: tiny });
    expect(out).toEqual([]);
  });

  it("never emits metrics from the realtime worker", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });

    const sig = synth(0, 0, 440, 2);
    const out = feedAudio(state, sig, 4096);
    expect(messageTypes(out).every((t) => t === "f0" || t === "status")).toBe(true);
  });

  it("emits f0 points for voiced audio", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });

    const sig = synth(0, 0, 440, 1);
    const out = feedAudio(state, sig, 4096);
    const f0Msgs = out.filter((m) => m.type === "f0");
    expect(f0Msgs.length).toBeGreaterThan(0);

    const voiced = f0Msgs.flatMap((m) => m.points.filter((p) => p.voiced));
    expect(voiced.length).toBeGreaterThan(0);
    expect(voiced[0]!.f0_hz).toBeGreaterThan(430);
    expect(voiced[0]!.cents).toBeCloseTo(0, 1);
  });

  it("updates hud baseline on first voiced chunk", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });

    const sig = synth(0, 0, 440, 0.5);
    feedAudio(state, sig, 4096);
    expect(state.hudBaselineHz).toBeGreaterThan(430);
  });

  it("recenters pitch cents around refreshed baseline", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });

    const sig = synth(0, 0, 440, 2);
    feedAudio(state, sig, 4096);
    expect(state.hudBaselineHz).toBeGreaterThan(430);

    const later = handleWorkerMessage(state, {
      type: "audio",
      samples: toFloat32(sig.subarray(0, 4096)),
    });
    const points = later.find((m) => m.type === "f0")?.points ?? [];
    const voiced = points.filter((p) => p.voiced);
    expect(voiced.length).toBeGreaterThan(0);
    for (const p of voiced) {
      expect(Math.abs(p.cents)).toBeLessThan(50);
    }
  });

  it("clears baseline before first voiced frames in a session", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });
    expect(state.hudBaselineHz).toBe(0);
  });
});

describe("dsp.ts worker wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("forwards handler messages through postMessage", async () => {
    const posted: WorkerOutMessage[] = [];
    let onmessage: ((ev: MessageEvent) => void) | null = null;

    vi.stubGlobal("self", {
      postMessage: (msg: WorkerOutMessage) => posted.push(msg),
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler: ((ev: MessageEvent) => void) | null) {
        onmessage = handler;
      },
    });

    await import("../src/worker/dsp.ts");
    expect(onmessage).not.toBeNull();

    onmessage!({ data: { type: "start", sampleRate: RATE } } as MessageEvent);
    expect(posted).toEqual([{ type: "status", message: "Слушаю микрофон…" }]);

    posted.length = 0;
    onmessage!({ data: { type: "stop" } } as MessageEvent);
    expect(posted).toEqual([{ type: "status", message: "Остановлено" }]);

    vi.unstubAllGlobals();
  });
});
