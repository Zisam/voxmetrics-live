import { describe, expect, it, vi } from "vitest";
import type { MetricsSnapshot, WorkerOutMessage } from "../src/types.ts";
import {
  BUFFER_SECONDS,
  METRICS_ANALYSIS_SEC,
  METRICS_INTERVAL_MS,
  METRICS_MIN_AUDIO_SEC,
} from "../src/dsp/constants.ts";
import * as analyseModule from "../src/dsp/analyse.ts";
import {
  createAnalyserState,
  handleAnalyserMessage,
} from "../src/worker/analyser-core.ts";
import { synth, RATE } from "./synth.ts";

const fakeMetrics: MetricsSnapshot = {
  when: "",
  duration_s: 0,
  sample_rate: RATE,
  voiced_share: 1,
  f0_median_hz: 440,
  vibrato: null,
  h1_h2_db: null,
  sf_balance_db: null,
  spectral_centroid_hz: 1000,
  formants_hz: [],
  singer_formant_hz: null,
  singer_formant_db: null,
  jitter_pct: null,
  shimmer_db: null,
  cpp_db: null,
  tremolo: null,
};

function toFloat32(samples: ArrayLike<number>): Float32Array {
  return Float32Array.from(samples);
}

function feedAudio(
  state: ReturnType<typeof createAnalyserState>,
  samples: Float64Array,
  chunkSize: number,
  now: number,
): WorkerOutMessage[] {
  const messages: WorkerOutMessage[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, Math.min(i + chunkSize, samples.length));
    messages.push(
      ...handleAnalyserMessage(
        state,
        { type: "audio", samples: toFloat32(chunk) },
        now,
      ),
    );
  }
  return messages;
}

describe("handleAnalyserMessage", () => {
  it("ignores audio before start", () => {
    const state = createAnalyserState();
    const sig = synth(0, 0, 440, 0.2);
    const out = handleAnalyserMessage(
      state,
      { type: "audio", samples: toFloat32(sig) },
      0,
    );
    expect(out).toEqual([]);
    expect(state.ring.length).toBe(0);
  });

  it("ignores audio after stop", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);
    handleAnalyserMessage(state, { type: "stop" }, 100);

    const sig = synth(0, 0, 440, 0.5);
    const out = handleAnalyserMessage(
      state,
      { type: "audio", samples: toFloat32(sig) },
      200,
    );
    expect(out).toEqual([]);
    expect(state.ring.length).toBe(0);
  });

  it("does not emit before minimum audio accumulates", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, METRICS_MIN_AUDIO_SEC - 0.5);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);
    expect(out.some((m) => m.type === "metrics")).toBe(false);
  });

  it("does not emit before interval elapses", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, METRICS_MIN_AUDIO_SEC);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS - 1);
    expect(out.some((m) => m.type === "metrics")).toBe(false);
  });

  it("emits metrics and ltas after interval with enough buffer", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);
    const metrics = out.filter((m) => m.type === "metrics");
    const ltas = out.filter((m) => m.type === "ltas");

    expect(metrics.length).toBe(1);
    expect(metrics[0]!.metrics.f0_median_hz).not.toBeNull();
    expect(metrics[0]!.metrics.duration_s).toBeGreaterThan(1.5);
    expect(ltas.length).toBe(1);
    expect(ltas[0]!.freqs.length).toBeGreaterThan(0);
  });

  it("throttles to one emission per interval", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);

    const more = handleAnalyserMessage(
      state,
      { type: "audio", samples: toFloat32(sig.subarray(0, 4096)) },
      METRICS_INTERVAL_MS + 500,
    );
    expect(more.some((m) => m.type === "metrics")).toBe(false);
  });

  it("emits again after a full interval passes", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 2);
    feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);

    const later = handleAnalyserMessage(
      state,
      { type: "audio", samples: toFloat32(sig.subarray(0, 4096)) },
      (METRICS_INTERVAL_MS + 1) + METRICS_INTERVAL_MS + 1,
    );
    expect(later.some((m) => m.type === "metrics")).toBe(true);
  });

  it("caps ring at rolling window limit", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, BUFFER_SECONDS + 5);
    feedAudio(state, sig, 4096, METRICS_INTERVAL_MS * 20);

    const maxSamples = RATE * BUFFER_SECONDS;
    expect(state.ring.length).toBeLessThanOrEqual(maxSamples);
    expect(state.ring.length).toBeGreaterThan(maxSamples - 4096);
  });

  it("caps analysis window at METRICS_ANALYSIS_SEC", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const spy = vi.spyOn(analyseModule, "analyseBuffer");
    spy.mockReturnValue({ metrics: fakeMetrics, ltas: null });

    // Accumulate > METRICS_ANALYSIS_SEC without triggering the interval.
    const sig = synth(0, 0, 440, METRICS_ANALYSIS_SEC + 2);
    feedAudio(state, sig, 4096, 100);
    expect(spy.mock.calls.length).toBe(0);
    expect(state.ring.length).toBeGreaterThan(RATE * METRICS_ANALYSIS_SEC);

    const out = handleAnalyserMessage(
      state,
      { type: "audio", samples: toFloat32(sig.subarray(0, 4096)) },
      METRICS_INTERVAL_MS + 1,
    );
    expect(out.some((m) => m.type === "metrics")).toBe(true);
    expect(spy.mock.calls.length).toBe(1);

    const audio = spy.mock.calls[0]![0]!;
    expect(audio.length).toBeLessThanOrEqual(RATE * METRICS_ANALYSIS_SEC);
    expect(audio.length).toBeGreaterThanOrEqual(RATE * (METRICS_ANALYSIS_SEC - 1));

    spy.mockRestore();
  });

  it("reinitialises ring and rate on restart", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const sig = synth(0, 0, 440, 1);
    feedAudio(state, sig, 4096, 0);
    expect(state.ring.length).toBeGreaterThan(0);

    handleAnalyserMessage(state, { type: "start", sampleRate: 48000 }, 500);
    expect(state.running).toBe(true);
    expect(state.ring.length).toBe(0);
    expect(state.rate).toBe(48000);
    expect(state.ring.capacity).toBe(48000 * BUFFER_SECONDS);
  });

  it("posts error message when analysis throws", () => {
    const state = createAnalyserState();
    handleAnalyserMessage(state, { type: "start", sampleRate: RATE }, 0);

    const analyseSpy = vi.spyOn(analyseModule, "analyseBuffer");
    analyseSpy.mockImplementation(() => {
      throw new Error("analysis failed");
    });

    const sig = synth(0, 0, 440, 2);
    const out = feedAudio(state, sig, 4096, METRICS_INTERVAL_MS + 1);

    expect(out).toEqual([{ type: "error", message: "analysis failed" }]);

    analyseSpy.mockRestore();
  });
});
