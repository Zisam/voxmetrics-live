import { describe, expect, it } from "vitest";
import type { F0Point } from "../src/types.ts";
import { createWorkerState, handleWorkerMessage } from "../src/worker/dsp-core.ts";
import {
  appendScrollingPitchPoints,
  createScrollState,
  NOW_X,
  PITCH_WINDOW_SEC,
  tickWallScroll,
} from "../src/ui/pitch-buffer.ts";
import { MAX_PITCH_POINTS } from "../src/dsp/constants.ts";
import { synth, RATE } from "./synth.ts";

function glissando(dur: number, f0Start: number, octavesPerSec: number): Float64Array {
  const n = Math.floor(RATE * dur);
  const out = new Float64Array(n);
  let phase = 0;
  const harmonics: [number, number][] = [
    [1, 1.0],
    [2, 0.55],
    [3, 0.35],
    [4, 0.2],
    [5, 0.12],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f0 = f0Start * 2 ** (t * octavesPerSec);
    phase += (2 * Math.PI * f0) / RATE;
    let s = 0;
    for (const [k, amp] of harmonics) s += amp * Math.sin(k * phase);
    out[i] = (s / 5) * Math.min(t / 0.15, 1);
  }
  return out;
}

describe("live chart pipeline (worker f0 -> scrolling series)", () => {
  it("keeps x sorted and newest at NOW_X under frame jitter and batch coalescing", () => {
    const dur = 8;
    const sig = glissando(dur, 220, 0.25); // 2 octaves over 8 s

    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });
    const batches: F0Point[][] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const chunk = sig.subarray(i, Math.min(i + 4096, sig.length));
      const out = handleWorkerMessage(state, {
        type: "audio",
        samples: Float32Array.from(chunk),
      });
      for (const m of out) {
        if (m.type === "f0") batches.push(m.points);
      }
    }
    expect(batches.length).toBeGreaterThan(dur * 10);

    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    const frameSec = 1 / 60;
    const batchIntervalSec = 4096 / RATE;
    let nextBatchAt = 0.2;
    let batchIdx = 0;
    let coalesced = 0;
    let inversions = 0;
    let lastAppendX = 0;
    let firstVoicedMidi = 0;

    for (let wall = 0; wall <= dur; wall += frameSec) {
      tickWallScroll(scroll, xs, midi, wall);
      let appendedThisFrame = 0;
      // every 7th batch is held until the next batch's deadline passes,
      // forcing 2-batch coalescing in a single frame (metrics DOM jank)
      while (batchIdx < batches.length && wall >= nextBatchAt) {
        if (batchIdx % 7 === 0 && wall < nextBatchAt + batchIntervalSec) break;
        appendScrollingPitchPoints(
          scroll,
          xs,
          midi,
          batches[batchIdx]!,
          undefined,
          wall,
        );
        lastAppendX = xs[xs.length - 1]!;
        batchIdx++;
        nextBatchAt += batchIntervalSec;
        appendedThisFrame++;
        if (appendedThisFrame > 1) coalesced++;
      }
      for (let i = 1; i < xs.length; i++) {
        if (xs[i]! < xs[i - 1]!) inversions++;
      }
      if (firstVoicedMidi === 0) {
        const v = midi.find((m) => m != null);
        if (v != null) firstVoicedMidi = v;
      }
    }

    const voicedVals = midi.filter((m): m is number => m != null);
    const lastVoicedMidi = voicedVals[voicedVals.length - 1] ?? 0;

    expect(coalesced).toBeGreaterThan(0);
    expect(inversions).toBe(0);
    expect(lastAppendX).toBeCloseTo(NOW_X, 3);
    expect(xs[0]!).toBeGreaterThanOrEqual(0);
    expect(xs.length).toBeLessThanOrEqual(MAX_PITCH_POINTS);
    expect(xs[xs.length - 1]!).toBeLessThanOrEqual(NOW_X + 1e-9);
    // visible window is PITCH_WINDOW_SEC of a fast glissando: pitch must move
    expect(lastVoicedMidi - firstVoicedMidi).toBeGreaterThan(10);
  });

  it("renders silence as nulls and keeps the marker pitch after tone stops", () => {
    const tone = synth(0, 0, 330, 3);
    const silence = new Float64Array(RATE * 2);
    const merged = new Float64Array(tone.length + silence.length);
    merged.set(tone);
    merged.set(silence, tone.length);

    const state = createWorkerState();
    handleWorkerMessage(state, { type: "start", sampleRate: RATE });
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    let wall = 0;
    for (let i = 0; i < merged.length; i += 4096) {
      const chunk = merged.subarray(i, Math.min(i + 4096, merged.length));
      const out = handleWorkerMessage(state, {
        type: "audio",
        samples: Float32Array.from(chunk),
      });
      wall += 4096 / RATE;
      tickWallScroll(scroll, xs, midi, wall);
      for (const m of out) {
        if (m.type === "f0") {
          appendScrollingPitchPoints(scroll, xs, midi, m.points, undefined, wall);
        }
      }
    }

    expect(midi.length).toBe(xs.length);
    expect(midi.some((m) => m == null)).toBe(true);
    const voiced = midi.filter((m): m is number => m != null);
    expect(voiced.length).toBeGreaterThan(100);
    const med = voiced[Math.floor(voiced.length / 2)]!;
    expect(Math.abs(med - 64)).toBeLessThan(1); // E4 for 330 Hz
    // after 2 s of silence the trace scrolled but stayed within the window
    expect(xs[xs.length - 1]!).toBeLessThanOrEqual(PITCH_WINDOW_SEC);
    expect(xs[xs.length - 1]!).toBeGreaterThan(PITCH_WINDOW_SEC - 1);
  });
});
