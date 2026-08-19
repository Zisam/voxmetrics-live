import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkerOutMessage } from "../src/types.ts";
import { BUFFER_SECONDS, METRICS_INTERVAL_MS } from "../src/dsp/constants.ts";
import * as analyseModule from "../src/dsp/analyse.ts";
import {
  appendBuffer,
  createWorkerState,
  handleWorkerMessage,
} from "../src/worker/dsp-core.ts";
import { synth, RATE } from "./synth.ts";

function toFloat32(samples: ArrayLike<number>): Float32Array {
  return Float32Array.from(samples);
}

function feedAudio(
  state: ReturnType<typeof createWorkerState>,
  samples: Float64Array,
  chunkSize: number,
  now: number | ((chunkIndex: number) => number),
) {
  const messages: WorkerOutMessage[] = [];
  let chunkIndex = 0;
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, Math.min(i + chunkSize, samples.length));
    const t = typeof now === "function" ? now(chunkIndex) : now;
    messages.push(
      ...handleWorkerMessage(
        state,
        { type: "audio", samples: toFloat32(chunk) },
        t,
      ),
    );
    chunkIndex++;
  }
  return messages;
}

function messageTypes(messages: WorkerOutMessage[]): string[] {
  return messages.map((m) => m.type);
}

describe("appendBuffer", () => {
  it("appends samples without trimming under the limit", () => {
    const state = createWorkerState();
    state.rate = RATE;
    const chunk = toFloat32(new Float64Array(1000).fill(0.1));
    expect(appendBuffer(state, chunk)).toBe(0);
    expect(state.buffer.length).toBe(1000);
  });

  it("trims aligned to hop and returns dropped frame count", () => {
    const state = createWorkerState();
    state.rate = RATE;
    const hop = Math.floor(0.005 * RATE);
    const maxSamples = RATE * BUFFER_SECONDS;
    state.buffer = new Float64Array(maxSamples);

    const extra = hop * 3;
    const dropped = appendBuffer(state, toFloat32(new Float64Array(extra).fill(0.1)));

    expect(state.buffer.length).toBe(maxSamples);
    expect(dropped).toBe(3);
  });

  it("does not trim when overflow is smaller than one hop", () => {
    const state = createWorkerState();
    state.rate = RATE;
    const hop = Math.floor(0.005 * RATE);
    const maxSamples = RATE * BUFFER_SECONDS;
    state.buffer = new Float64Array(maxSamples);

    const extra = hop - 1;
    expect(appendBuffer(state, toFloat32(new Float64Array(extra).fill(0.1)))).toBe(0);
    expect(state.buffer.length).toBe(maxSamples + extra);
  });
});

describe("handleWorkerMessage", () => {
  it("handles start and stop lifecycle", () => {
    const state = createWorkerState();
    const start = handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);
    expect(start).toEqual([{ type: "status", message: "Слушаю микрофон…" }]);
    expect(state.running).toBe(true);
    expect(state.tracker).not.toBeNull();

    const stop = handleWorkerMessage(state, { type: "stop" }, 1000);
    expect(stop).toEqual([{ type: "status", message: "Остановлено" }]);
    expect(state.running).toBe(false);
  });

  it("ignores audio before start", () => {
    const state = createWorkerState();
    const sig = synth(0, 0, 440, 0.2);
    const out = handleWorkerMessage(
      state,
      { type: "audio", samples: toFloat32(sig) },
      0,
    );
    expect(out).toEqual([]);
  });

  it("ignores audio after stop", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);
    handleWorkerMessage(state, { type: "stop" }, 100);

    const sig = synth(0, 0, 440, 0.5);
    const out = handleWorkerMessage(
      state,
      { type: "audio", samples: toFloat32(sig) },
      200,
    );
    expect(out).toEqual([]);
    expect(state.buffer.length).toBe(0);
  });

  it("returns empty when chunk is too short for a new frame", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const tiny = new Float32Array(64);
    const out = handleWorkerMessage(state, { type: "audio", samples: tiny }, 500);
    expect(out).toEqual([]);
  });

  it("does not emit metrics when no new f0 frames were produced", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const tiny = new Float32Array(64);
    const out = handleWorkerMessage(
      state,
      { type: "audio", samples: tiny },
      METRICS_INTERVAL_MS + 100,
    );
    expect(out).toEqual([]);
    expect(out.some((m) => m.type === "metrics")).toBe(false);
  });

  it("emits f0 points for voiced audio", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 1);
    const out = feedAudio(state, sig, 4096, 0);
    const f0Msgs = out.filter((m) => m.type === "f0");
    expect(f0Msgs.length).toBeGreaterThan(0);

    const voiced = f0Msgs.flatMap((m) => m.points.filter((p) => p.voiced));
    expect(voiced.length).toBeGreaterThan(0);
    expect(voiced[0]!.cents).toBeCloseTo(0, 5);
  });

  it("emits metrics and ltas after interval with enough buffer", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);
    const metrics = out.filter((m) => m.type === "metrics");
    const ltas = out.filter((m) => m.type === "ltas");

    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0]!.metrics.f0_median_hz).not.toBeNull();
    expect(ltas.length).toBeGreaterThan(0);
    expect(ltas[0]!.freqs.length).toBeGreaterThan(0);
  });

  it("emits f0 before metrics and ltas in the same batch", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    let batchWithMetrics: WorkerOutMessage[] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const chunk = sig.subarray(i, Math.min(i + 4096, sig.length));
      const batch = handleWorkerMessage(
        state,
        { type: "audio", samples: toFloat32(chunk) },
        METRICS_INTERVAL_MS + 1,
      );
      if (batch.some((m) => m.type === "metrics")) {
        batchWithMetrics = batch;
        break;
      }
    }

    expect(batchWithMetrics.length).toBeGreaterThan(0);
    const types = messageTypes(batchWithMetrics);
    expect(types.indexOf("f0")).toBeLessThan(types.indexOf("metrics"));
    expect(types.indexOf("metrics")).toBeLessThan(types.indexOf("ltas"));
  });

  it("respects monotonic clock for metrics interval", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    const early = feedAudio(state, sig, 4096, () => 500);
    expect(early.some((m) => m.type === "metrics")).toBe(false);

    const later = handleWorkerMessage(
      state,
      { type: "audio", samples: toFloat32(sig.subarray(0, 4096)) },
      METRICS_INTERVAL_MS + 500,
    );
    expect(later.some((m) => m.type === "metrics")).toBe(true);
  });

  it("does not emit metrics before interval elapses", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 1);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS - 1);
    expect(out.some((m) => m.type === "metrics")).toBe(false);
  });

  it("recenters pitch chart cents after metrics update", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);
    expect(state.chartMedianHz).toBeGreaterThan(430);

    const later = handleWorkerMessage(
      state,
      { type: "audio", samples: toFloat32(sig.subarray(0, 4096)) },
      METRICS_INTERVAL_MS + 2,
    );
    const points = later.find((m) => m.type === "f0")?.points ?? [];
    const voiced = points.filter((p) => p.voiced);
    expect(voiced.length).toBeGreaterThan(0);
    for (const p of voiced) {
      expect(Math.abs(p.cents)).toBeLessThan(50);
    }
  });

  it("keeps buffer within rolling window limit", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, BUFFER_SECONDS + 5);
    feedAudio(state, sig, 4096, METRICS_INTERVAL_MS * 20);

    const hop = Math.floor(0.005 * RATE);
    const maxSamples = RATE * BUFFER_SECONDS;
    expect(state.buffer.length).toBeGreaterThan(maxSamples - hop);
    expect(state.buffer.length).toBeLessThanOrEqual(maxSamples + hop - 1);
  });

  it("posts error message when analysis throws", () => {
    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE }, 0);

    const analyseSpy = vi.spyOn(analyseModule, "analyseBuffer");
    analyseSpy.mockImplementation(() => {
      throw new Error("analysis failed");
    });

    const sig = synth(0, 0, 440, 2);
    let errorBatch: WorkerOutMessage[] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const chunk = sig.subarray(i, Math.min(i + 4096, sig.length));
      const batch = handleWorkerMessage(
        state,
        { type: "audio", samples: toFloat32(chunk) },
        METRICS_INTERVAL_MS + 1,
      );
      if (batch.some((m) => m.type === "error")) {
        errorBatch = batch;
        break;
      }
    }

    const types = messageTypes(errorBatch);
    expect(types[0]).toBe("f0");
    expect(types.indexOf("f0")).toBeLessThan(types.indexOf("error"));
    expect(errorBatch.find((m) => m.type === "error")).toEqual({
      type: "error",
      message: "analysis failed",
    });

    analyseSpy.mockRestore();
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
