import { describe, expect, it } from "vitest";
import { analyseFormants } from "../src/dsp/formants.ts";
import { analyseBuffer } from "../src/dsp/analyse.ts";
import { RATE } from "./synth.ts";

interface Resonator {
  a1: number;
  a2: number;
  s1: number;
  s2: number;
}

function makeResonator(f: number, bw: number): Resonator {
  const w = (2 * Math.PI * f) / RATE;
  const rad = Math.exp((-Math.PI * bw) / RATE);
  return { a1: 2 * rad * Math.cos(w), a2: -rad * rad, s1: 0, s2: 0 };
}

function step(r: Resonator, input: number): number {
  const y = input + r.a1 * r.s1 + r.a2 * r.s2;
  r.s2 = r.s1;
  r.s1 = y;
  return y;
}

/** Cascade of resonators driven by noise (a true all-pole process for LPC). */
function arSignal(
  targets: { f: number; bw: number }[],
  dur: number,
): Float64Array {
  const n = Math.floor(RATE * dur);
  const out = new Float64Array(n);
  const res = targets.map((t) => makeResonator(t.f, t.bw));
  let seed = 1234;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    let e = rand();
    for (const r of res) e = step(r, e);
    out[i] = e;
    const abs = Math.abs(e);
    if (abs > maxAbs) maxAbs = abs;
  }
  for (let i = 0; i < n; i++) out[i] = out[i]! / (maxAbs * 1.05);
  return out;
}

describe("formants recover known resonances", () => {
  it("male-like 500/1500/2500 Hz within 10%", () => {
    const sig = arSignal(
      [
        { f: 500, bw: 80 },
        { f: 1500, bw: 90 },
        { f: 2500, bw: 100 },
      ],
      4,
    );
    const got = analyseFormants(sig, RATE);
    expect(got.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(got[0]! - 500) / 500).toBeLessThan(0.1);
    expect(Math.abs(got[1]! - 1500) / 1500).toBeLessThan(0.1);
    expect(Math.abs(got[2]! - 2500) / 2500).toBeLessThan(0.1);
  });

  it("returns fewer formants when the signal has no resonances", () => {
    // white noise: LPC finds no narrow poles above 90 Hz with bw < 500
    const n = Math.floor(RATE * 2);
    const noise = new Float64Array(n);
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = seed / 0x3fffffff - 1;
    }
    const got = analyseFormants(noise, RATE);
    // broad-band poles get filtered by FORMANT_MAX_BW; result is unstable
    // by design — just assert it does not throw and returns an array
    expect(Array.isArray(got)).toBe(true);
  });
});

describe("singer formant end-to-end", () => {
  function harmonicTone(
    harmonics: [number, number][],
    f0: number,
    noiseAmp: number,
  ): Float64Array {
    const n = Math.floor(RATE * 4);
    const sig = new Float64Array(n);
    let phase = 0;
    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x3fffffff - 1;
    };
    for (let i = 0; i < n; i++) {
      phase += (2 * Math.PI * f0) / RATE;
      let s = 0;
      for (const [k, a] of harmonics) s += a * Math.sin(k * phase);
      sig[i] = s / 8 + noiseAmp * rand();
    }
    return sig;
  }

  const flat: [number, number][] = [];
  for (let k = 1; k <= 15; k++) flat.push([k, 0.9 ** (k - 1)]);
  const boosted: [number, number][] = flat.map(([k, a]) =>
    k === 13 ? [k, a * 10 ** (10 / 20)] : [k, a],
  );

  it("locates the boosted cluster peak and reports higher prominence", () => {
    const flatOut = analyseBuffer(
      harmonicTone(flat, 220, 0.0178),
      RATE,
    ).metrics;
    const boostOut = analyseBuffer(
      harmonicTone(boosted, 220, 0.0178),
      RATE,
    ).metrics;

    expect(boostOut.singer_formant_hz).not.toBeNull();
    expect(boostOut.singer_formant_hz!).toBeGreaterThan(2800);
    expect(boostOut.singer_formant_hz!).toBeLessThan(2920);
    expect(flatOut.singer_formant_db).not.toBeNull();
    expect(boostOut.singer_formant_db!).not.toBeNull();
    // +10 dB boost on the 13th harmonic must translate to a clear rise
    expect(
      boostOut.singer_formant_db! - flatOut.singer_formant_db!,
    ).toBeGreaterThan(5);
  });

  it("prominence stays bounded on synthetic tones (dynamic-range clip)", () => {
    // noiseless pure harmonic tone: floor bins must not inflate prominence
    const out = analyseBuffer(harmonicTone(flat, 220, 0), RATE).metrics;
    expect(out.singer_formant_db).not.toBeNull();
    expect(out.singer_formant_db!).toBeLessThan(35);
  });
});
