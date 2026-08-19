import { describe, expect, it } from "vitest";
import { createNotch } from "../src/dsp/notch.ts";
import { F0Tracker } from "../src/dsp/f0.ts";
import { RATE } from "./synth.ts";

function synthWithHum(
  f0: number,
  dur: number,
  humAmp: number,
  noiseAmp: number,
): Float64Array {
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
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * f0) / RATE;
    let s = 0;
    for (const [k, amp] of harmonics) s += amp * Math.sin(k * phase);
    const fade = Math.min(t / 0.15, 1);
    s = (s / 5) * fade;
    s += humAmp * Math.sin(2 * Math.PI * 50 * t + 0.7);
    s += noiseAmp * rand();
    out[i] = s;
  }
  return out;
}

function rms(arr: Float32Array | Float64Array): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i]! * arr[i]!;
  return Math.sqrt(s / arr.length);
}

describe("createNotch", () => {
  it("attenuates 50 Hz strongly while leaving 150 Hz intact", () => {
    const n = RATE;
    const makeSine = (f: number) => {
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = Math.sin((2 * Math.PI * f * i) / RATE);
      return s;
    };
    const hum = makeSine(50);
    const tone = makeSine(150);

    // one stateful filter per signal stream (production usage)
    for (const sig of [hum, tone]) {
      const notch = createNotch(50, RATE);
      for (let i = 0; i < n; i += 4096) {
        notch(sig.subarray(i, Math.min(i + 4096, n)));
      }
    }

    const sineRms = Math.SQRT1_2;
    const humAtt = rms(hum.subarray(RATE / 2));
    const toneKeep = rms(tone.subarray(RATE / 2));
    expect(20 * Math.log10(humAtt / sineRms)).toBeLessThan(-30);
    expect(toneKeep / sineRms).toBeGreaterThan(0.98);
  });

  it("barely affects 45 Hz voice near the notch edge", () => {
    const n = RATE;
    const voice = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      voice[i] = Math.sin((2 * Math.PI * 45 * i) / RATE);
    }
    const notch = createNotch(50, RATE);
    for (let i = 0; i < n; i += 4096) {
      notch(voice.subarray(i, Math.min(i + 4096, n)));
    }
    const keep = rms(voice.subarray(RATE / 2)) / Math.SQRT1_2;
    expect(keep).toBeGreaterThan(0.95);
  });
});

describe("hum rejection in live tracking", () => {
  function trackMedian(sig: Float64Array): number {
    const notch = createNotch(50, RATE);
    const tracker = new F0Tracker(RATE, 2);
    const voiced: number[] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const chunk = Float32Array.from(
        sig.subarray(i, Math.min(i + 4096, sig.length)),
      );
      notch(chunk);
      tracker.pushSamples(chunk);
      for (const f of tracker.append()) {
        if (f.voiced) voiced.push(f.f0);
      }
    }
    voiced.sort((a, b) => a - b);
    return voiced[Math.floor(voiced.length / 2)] ?? 0;
  }

  it("tracks 150 Hz voice with 10% mains hum", () => {
    expect(trackMedian(synthWithHum(150, 4, 0.1, 0.01))).toBeGreaterThan(148);
    expect(trackMedian(synthWithHum(150, 4, 0.1, 0.01))).toBeLessThan(152);
  });

  it("tracks 150 Hz voice with 20% mains hum", () => {
    const med = trackMedian(synthWithHum(150, 4, 0.2, 0.01));
    expect(med).toBeGreaterThan(147);
    expect(med).toBeLessThan(153);
  });

  it("tracks 110 Hz voice with 10% mains hum", () => {
    const med = trackMedian(synthWithHum(110, 4, 0.1, 0.01));
    expect(med).toBeGreaterThan(108);
    expect(med).toBeLessThan(112);
  });

  it("tracks 220 Hz voice with 10% mains hum", () => {
    const med = trackMedian(synthWithHum(220, 4, 0.1, 0.01));
    expect(med).toBeGreaterThan(218);
    expect(med).toBeLessThan(222);
  });
});
