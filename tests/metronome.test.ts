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
}

/** Mock AudioContext capturing every scheduled click as freq/gain pairs. */
function makeCtx() {
  const clicks: Click[] = [];
  let lastFreq = 0;
  const ctx = {
    currentTime: 0,
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
        // read frequency at click time: metronome sets it after node creation
        setValueAtTime: vi.fn((v: number) => {
          clicks.push({ freq: lastFreq, gain: v });
        }),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  return { ctx, clicks };
}

describe("createMetronome", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clicks an accent then three soft beats at the requested BPM", () => {
    const { ctx, clicks } = makeCtx();
    const met = createMetronome(ctx as never);

    met.start(60); // 1000 ms per beat
    expect(clicks.length).toBe(1); // immediate accent
    expect(clicks[0]!.freq).toBe(1568);
    expect(clicks[0]!.gain).toBeCloseTo(0.5);

    vi.advanceTimersByTime(3000); // beats 2, 3, 4 — soft
    expect(clicks.length).toBe(4);
    for (const c of clicks.slice(1)) {
      expect(c.freq).toBe(1046.5);
      expect(c.gain).toBeCloseTo(0.3);
    }

    vi.advanceTimersByTime(1000); // beat 1 again — accent
    expect(clicks.length).toBe(5);
    expect(clicks[4]!.freq).toBe(1568);

    met.stop();
    vi.advanceTimersByTime(5000);
    expect(clicks.length).toBe(5); // no clicks after stop
    expect(met.isOn()).toBe(false);
    expect(met.getBpm()).toBe(0);
  });

  it("BPM controls the interval period", () => {
    const { ctx, clicks } = makeCtx();
    const met = createMetronome(ctx as never);
    met.start(120); // 500 ms per beat
    vi.advanceTimersByTime(1500);
    expect(clicks.length).toBe(4); // accent + 3 soft
    met.stop();
  });

  it("stop is idempotent and start re-anchors the accent", () => {
    const { ctx, clicks } = makeCtx();
    const met = createMetronome(ctx as never);
    met.stop();
    met.stop();
    expect(met.isOn()).toBe(false);

    met.start(83); // ~723 ms per beat
    vi.advanceTimersByTime(800); // one soft beat lands
    met.start(83); // restart: fresh accent immediately
    expect(clicks.length).toBe(3); // accent, soft, accent
    expect(clicks[0]!.freq).toBe(1568);
    expect(clicks[2]!.freq).toBe(1568);
    met.stop();
  });

  it("start(0) is a no-op", () => {
    const { ctx, clicks } = makeCtx();
    const met = createMetronome(ctx as never);
    met.start(0);
    vi.advanceTimersByTime(2000);
    expect(clicks.length).toBe(0);
    expect(met.isOn()).toBe(false);
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
