import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMetronome } from "../src/ui/metronome.ts";
import {
  bpmToVibHz,
  VIB_REF_HZ,
  vibHzToBpm,
} from "../src/ui/vibrato-guide.ts";

interface Click {
  freq: number;
  gain: number;
  /** Audio-clock time the click was scheduled for. */
  at: number;
}

/**
 * Mock AudioContext with a manually advanced audio clock. The 25 ms
 * lookahead timer drives ctx.currentTime via a wall→audio mapping.
 */
function makeCtx() {
  const clicks: Click[] = [];
  let lastFreq = 0;
  const state = { audioT: 100, perfT: 10_000 };
  const ctx = {
    get currentTime() {
      return state.audioT;
    },
    getOutputTimestamp: () => ({
      contextTime: state.audioT,
      performanceTime: state.perfT,
    }),
    outputLatency: 0.0,
    baseLatency: 0.0,
    destination: {},
    createOscillator: () => ({
      frequency: {
        get value() {
          return lastFreq;
        },
        set value(v: number) {
          lastFreq = v;
        },
      },
      type: "",
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn((v: number, t: number) => {
          clicks.push({ freq: lastFreq, gain: v, at: t });
        }),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  return { ctx, clicks, state };
}

describe("createMetronome (lookahead scheduler)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules clicks on the exact audio-clock grid regardless of timer jitter", () => {
    const { ctx, clicks, state } = makeCtx();
    const met = createMetronome(ctx as never);
    const interval = 60 / 83;

    met.start(83);
    // advance audio clock alongside fake wall time (25 ms per timer tick)
    const stepMs = 25;
    const advance = (ms: number) => {
      for (let t = 0; t < ms; t += stepMs) {
        state.audioT += stepMs / 1000;
        state.perfT += stepMs;
        vi.advanceTimersByTime(stepMs);
      }
    };
    advance(4000); // ~5 beats at 83 BPM

    met.stop();
    expect(clicks.length).toBeGreaterThanOrEqual(6);

    // every click sits exactly on the grid t0 + k*interval
    const t0 = 100.05;
    clicks.forEach((c, k) => {
      expect(c.at).toBeCloseTo(t0 + k * interval, 6);
    });

    // accent pattern: accent at beats 0, 4, ...
    expect(clicks[0]!.freq).toBe(1568);
    // accent/soft gains and the square timbre (brighter than sine)
    expect(clicks[0]!.gain).toBeCloseTo(0.35);
    for (const c of clicks.slice(1, 4)) {
      expect(c.freq).toBe(1046.5);
      expect(c.gain).toBeCloseTo(0.2);
    }
    expect(clicks[4]!.freq).toBe(1568);

    // nothing scheduled beyond the lookahead horizon +1 step after stop
    const before = clicks.length;
    advance(2000);
    expect(clicks.length).toBe(before);
  });

  it("anchor maps the first grid click through getOutputTimestamp", () => {
    const { ctx, state } = makeCtx();
    const met = createMetronome(ctx as never);
    expect(met.anchorWallSec()).toBeNull();
    expect(met.beatIntervalSec()).toBeNull();

    met.start(83);
    // first click scheduled at audio t=100.05; wall when heard:
    // perfT/1000 + (audioT - contextTime) — with 0 latency = 10 + 0.05
    const anchor = met.anchorWallSec();
    expect(anchor).not.toBeNull();
    expect(anchor!).toBeCloseTo(state.perfT / 1000 + 0.05, 6);
    expect(met.beatIntervalSec()).toBeCloseTo(60 / 83, 6);

    met.stop();
    expect(met.anchorWallSec()).toBeNull();
    expect(met.beatIntervalSec()).toBeNull();
  });

  it("stop is idempotent; start(0) is a no-op", () => {
    const { ctx, clicks } = makeCtx();
    const met = createMetronome(ctx as never);
    met.stop();
    met.stop();
    expect(met.isOn()).toBe(false);
    met.start(0);
    vi.advanceTimersByTime(1000);
    expect(clicks.length).toBe(0);
    expect(met.isOn()).toBe(false);
  });

  it("restart re-anchors the grid", () => {
    const { ctx, clicks, state } = makeCtx();
    const met = createMetronome(ctx as never);
    met.start(83);
    state.audioT += 0.3;
    state.perfT += 300;
    vi.advanceTimersByTime(300);
    const n1 = clicks.length;

    met.start(83);
    // lookahead buffer primed immediately with the NEW grid
    expect(clicks.length).toBeGreaterThan(n1);
    expect(clicks[n1]!.freq).toBe(1568);
    const t0new = clicks[n1]!.at;
    // new grid starts 0.05 s after the advanced audio clock (100 + 0.3)
    expect(t0new).toBeCloseTo(100 + 0.3 + 0.05, 6);
    // every new click sits on the new grid
    for (let k = 0; k < clicks.length - n1; k++) {
      expect(clicks[n1 + k]!.at).toBeCloseTo(t0new + k * (60 / 83), 6);
    }
    met.stop();
  });
});

describe("BPM <-> vibrato Hz conversions", () => {
  it("82 BPM is ~5.47 Hz (click per 4 cycles)", () => {
    expect(bpmToVibHz(82)).toBeCloseTo(5.4667, 3);
    expect(vibHzToBpm(5.4667)).toBeCloseTo(82.0005, 3);
  });

  it("round-trips and covers the guide ladder", () => {
    for (const bpm of [60, 64, 69, 72, 76, 80, 83, 95]) {
      expect(vibHzToBpm(bpmToVibHz(bpm))).toBeCloseTo(bpm, 6);
    }
  });

  it("5.5 Hz maps to 82.5 BPM; nearest whole tempo is 83", () => {
    expect(vibHzToBpm(VIB_REF_HZ)).toBeCloseTo(82.5, 6);
    expect(Math.round(vibHzToBpm(VIB_REF_HZ))).toBe(83);
  });
});
