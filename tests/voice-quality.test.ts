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

describe("CPP harmonic-to-noise sensitivity", () => {
  /** Glottal-like pulse train (flat harmonic comb) + noise floor at hnrDb. */
  function pulsePlusNoise(f0: number, hnrDb: number, dur: number): Float64Array {
    const n = Math.floor(RATE * dur);
    const out = new Float64Array(n);
    const period = RATE / f0;
    let nextPulse = 0;
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x3fffffff - 1;
    };
    const pulseA = 0.4;
    const trainRms = pulseA * Math.sqrt(1 / period);
    const noiseRms = trainRms / 10 ** (hnrDb / 20);
    for (let i = 0; i < n; i++) {
      if (i >= nextPulse) {
        out[i] = pulseA;
        nextPulse += period;
      }
      out[i] += noiseRms * Math.SQRT2 * rand();
    }
    return out;
  }

  it("pure noise stays near zero", () => {
    const n = Math.floor(RATE * 2);
    const noise = new Float64Array(n);
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = seed / 0x3fffffff - 1;
    }
    const cpp = cepstralPeakProminenceDb(noise, RATE)!;
    expect(cpp).toBeLessThan(1);
  });

  it("grows monotonically with harmonic-to-noise ratio", () => {
    const levels = [0, 6, 12, 24, 40].map((hnr) =>
      cepstralPeakProminenceDb(pulsePlusNoise(110, hnr, 3), RATE)!,
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
    console.log("CPP vs HNR:", levels.map((v) => v.toFixed(2)).join(" "));
  });

  it("voice-like signal at healthy HNR lands in the calibrated band", () => {
    const healthy = cepstralPeakProminenceDb(pulsePlusNoise(110, 20, 3), RATE)!;
    // anchors for CPP_GOOD_DB=4 / CPP_OK_DB=2.5 calibration
    expect(healthy).toBeGreaterThan(4);
    expect(healthy).toBeLessThan(10);

    const breathy = cepstralPeakProminenceDb(pulsePlusNoise(110, 3, 3), RATE)!;
    expect(breathy).toBeLessThan(healthy);
  });

  it("declining-harmonic comb also discriminates HNR", () => {
    const comb = (hnrDb: number) => {
      const n = Math.floor(RATE * 3);
      const out = new Float64Array(n);
      const harmonics: [number, number][] = [];
      for (let k = 1; k <= 12; k++) harmonics.push([k, 0.85 ** (k - 1)]);
      const noiseRms = (0.35 / 10 ** (hnrDb / 20)) * 5;
      let phase = 0;
      let seed = 4242;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x3fffffff - 1;
      };
      for (let i = 0; i < n; i++) {
        phase += (2 * Math.PI * 220) / RATE;
        let s = 0;
        for (const [k, a] of harmonics) s += a * Math.sin(k * phase);
        out[i] = s * 0.2 + noiseRms * Math.SQRT2 * rand();
      }
      return out;
    };
    const clean = cepstralPeakProminenceDb(comb(30), RATE)!;
    const noisy = cepstralPeakProminenceDb(comb(3), RATE)!;
    expect(clean).toBeGreaterThan(noisy);
  });
});
