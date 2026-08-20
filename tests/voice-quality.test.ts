import { describe, expect, it } from "vitest";
import {
  cepstralPeakProminenceDb,
  localJitterPct,
  localShimmerDb,
} from "../src/dsp/voice-quality.ts";
import { synth, RATE } from "./synth.ts";

describe("localJitterPct", () => {
  it("returns near zero for a perfectly periodic synth tone", () => {
    const rawF0 = new Float64Array(200).fill(220);
    const voiced = new Uint8Array(200).fill(1);
    expect(localJitterPct(rawF0, voiced)!).toBeLessThan(0.5);
  });

  it("grows with cycle-to-cycle period variation", () => {
    const voiced = new Uint8Array(200).fill(1);
    const steady = new Float64Array(200).fill(220);
    const wobble = new Float64Array(200);
    for (let i = 0; i < 200; i++) {
      wobble[i] = i % 2 === 0 ? 220 : 220 * 1.03; // ±3% alternating
    }
    expect(localJitterPct(wobble, voiced)!).toBeGreaterThan(
      localJitterPct(steady, voiced)!,
    );
    // alternating ±3% F0 ≈ 3% period deviation ≈ ~2.9% jitter
    expect(localJitterPct(wobble, voiced)!).toBeGreaterThan(2);
    expect(localJitterPct(wobble, voiced)!).toBeLessThan(4);
  });

  it("ignores unvoiced frames", () => {
    const rawF0 = new Float64Array([220, 220, 0, 220, 220]);
    const voiced = new Uint8Array([1, 1, 0, 1, 1]);
    expect(localJitterPct(rawF0, voiced)!).toBeLessThan(0.01);
  });

  it("returns null with fewer than 2 voiced frames", () => {
    const rawF0 = new Float64Array([220, 0]);
    const voiced = new Uint8Array([1, 0]);
    expect(localJitterPct(rawF0, voiced)).toBeNull();
  });
});

describe("localShimmerDb", () => {
  it("returns near zero for constant amplitude", () => {
    const frameRms = new Float64Array(200).fill(0.5);
    const voiced = new Uint8Array(200).fill(1);
    expect(localShimmerDb(frameRms, voiced)!).toBeLessThan(0.01);
  });

  it("grows with alternating amplitude", () => {
    const voiced = new Uint8Array(200).fill(1);
    const steady = new Float64Array(200).fill(0.5);
    const wobble = new Float64Array(200);
    for (let i = 0; i < 200; i++) wobble[i] = i % 2 === 0 ? 0.5 : 0.5 * 10 ** (3 / 20);
    expect(localShimmerDb(wobble, voiced)!).toBeGreaterThan(2.5);
    expect(localShimmerDb(wobble, voiced)!).toBeLessThan(3.5);
    expect(localShimmerDb(wobble, voiced)!).toBeGreaterThan(
      localShimmerDb(steady, voiced)!,
    );
  });

  it("returns null with fewer than 2 voiced frames", () => {
    const frameRms = new Float64Array([0.5]);
    const voiced = new Uint8Array([1]);
    expect(localShimmerDb(frameRms, voiced)).toBeNull();
  });
});

describe("cepstralPeakProminenceDb", () => {
  it("produces a small positive CPP for a clean harmonic tone", () => {
    const sig = synth(0, 0, 220, 2);
    const cpp = cepstralPeakProminenceDb(sig, RATE);
    expect(cpp).not.toBeNull();
    // clean synthetic tone: weak-but-present rahmonic structure
    expect(cpp!).toBeGreaterThan(0.5);
    expect(cpp!).toBeLessThan(6);
  });

  it("drops when broadband noise dilutes the harmonic tone", () => {
    const clean = synth(0, 0, 220, 2);
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x3fffffff - 1;
    };
    const noisy = clean.map((v) => v + 0.8 * rand());
    const cppClean = cepstralPeakProminenceDb(clean, RATE)!;
    const cppNoisy = cepstralPeakProminenceDb(noisy, RATE)!;
    expect(cppNoisy).toBeLessThan(cppClean);
  });

  it("returns null for short buffers", () => {
    expect(cepstralPeakProminenceDb(new Float64Array(500), RATE)).toBeNull();
  });
});
