import { describe, expect, it } from "vitest";
import { trackF0, longestVoicedRun, f0ToCents, F0Tracker, foldToFundamental } from "../src/dsp/f0.ts";
import { analyseVibrato } from "../src/dsp/vibrato.ts";
import { analyseBuffer } from "../src/dsp/analyse.ts";
import { noteName } from "../src/dsp/math.ts";
import {
  analyseFormants,
  findPolyRoots,
  levinson,
  selectFormants,
} from "../src/dsp/formants.ts";
import { analyseH1H2 } from "../src/dsp/h1h2.ts";
import { computeLtas, bandMeanDb, spectralCentroid, singerFormant } from "../src/dsp/ltas.ts";
import { VIB_TRUSTED_SECONDS } from "../src/dsp/constants.ts";
import { synth, RATE } from "./synth.ts";

function medianVoicedF0(f0: Float64Array, voiced: Uint8Array): number {
  const vals: number[] = [];
  for (let i = 0; i < f0.length; i++) if (voiced[i]) vals.push(f0[i]!);
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)]!;
}

describe("trackF0", () => {
  it("measures pure tone near 440 Hz", () => {
    const sig = synth(0, 0, 440, 2);
    const { f0, voiced } = trackF0(sig, RATE);
    const med = medianVoicedF0(f0, voiced);
    expect(med).toBeGreaterThan(435);
    expect(med).toBeLessThan(445);
  });

  it("tracks fundamental when H2 dominates (weak H1)", () => {
    const weakF0: [number, number][] = [
      [1, 0.12],
      [2, 0.9],
      [3, 0.35],
      [4, 0.15],
    ];
    const sig = synth(0, 0, 220, 2, weakF0);
    const { f0, voiced } = trackF0(sig, RATE);
    const med = medianVoicedF0(f0, voiced);
    expect(med).toBeGreaterThan(210);
    expect(med).toBeLessThan(230);
  });

  it("agrees offline and live on H2-dominant 440 Hz (fold symmetry)", () => {
    const weakF0: [number, number][] = [
      [1, 0.12],
      [2, 0.9],
      [3, 0.35],
      [4, 0.15],
    ];
    const sig = synth(0, 0, 440, 2, weakF0);
    const { f0, voiced } = trackF0(sig, RATE);
    const offMed = medianVoicedF0(f0, voiced);
    expect(offMed).toBeGreaterThan(430);
    expect(offMed).toBeLessThan(450);

    const tracker = new F0Tracker(RATE, 2);
    const streamed: number[] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const part = sig.subarray(i, Math.min(i + 4096, sig.length));
      tracker.pushSamples(Float32Array.from(part));
      for (const frame of tracker.append()) {
        if (frame.voiced) streamed.push(frame.f0);
      }
    }
    streamed.sort((a, b) => a - b);
    const liveMed = streamed[Math.floor(streamed.length / 2)]!;
    expect(Math.abs(liveMed - offMed)).toBeLessThan(3);
  });

  it("throws on buffer shorter than analysis window", () => {
    expect(() => trackF0(new Float64Array(100), RATE)).toThrow(/короче окна/);
  });
});

describe("longestVoicedRun", () => {
  it("finds the longest contiguous voiced segment", () => {
    const voiced = new Uint8Array([0, 1, 1, 1, 0, 1, 0]);
    expect(longestVoicedRun(voiced)).toEqual([1, 4]);
  });

  it("handles trailing voiced run", () => {
    const voiced = new Uint8Array([0, 1, 1]);
    expect(longestVoicedRun(voiced)).toEqual([1, 3]);
  });
});

describe("f0ToCents", () => {
  it("centers voiced frames around median", () => {
    const f0 = new Float64Array([100, 200, 200]);
    const voiced = new Uint8Array([0, 1, 1]);
    const cents = f0ToCents(f0, voiced);
    expect(cents[0]).toBeNaN();
    expect(cents[1]).toBeCloseTo(0, 5);
    expect(cents[2]).toBeCloseTo(0, 5);
  });
});

describe("foldToFundamental", () => {
  it("folds when doubled-lag peak is clearly stronger (subharmonic lock)", () => {
    const acf = new Float64Array(200);
    acf.fill(0.1);
    acf[0] = 1;
    acf[50] = 0.9;
    acf[100] = 0.98;
    const folded = foldToFundamental(acf, 50, 150, 44100);
    expect(folded).toBeGreaterThan(95);
    expect(folded).toBeLessThan(105);
  });

  it("does not fold a clean high note (peaks nearly equal)", () => {
    const acf = new Float64Array(200);
    acf.fill(0.1);
    acf[0] = 1;
    acf[50] = 0.96;
    acf[100] = 0.94;
    const folded = foldToFundamental(acf, 50, 150, 44100);
    expect(folded).toBeGreaterThan(45);
    expect(folded).toBeLessThan(55);
  });
});

describe("F0Tracker", () => {
  it("matches offline trackF0 via pushSamples streaming", () => {
    const sig = synth(0, 0, 440, 2);
    const offline = trackF0(sig, RATE);
    const tracker = new F0Tracker(RATE, 2);
    const streamed: number[] = [];
    const chunk = 4096;
    for (let i = 0; i < sig.length; i += chunk) {
      const part = sig.subarray(i, Math.min(i + chunk, sig.length));
      tracker.pushSamples(Float32Array.from(part));
      for (const frame of tracker.append()) {
        if (frame.voiced) streamed.push(frame.f0);
      }
    }
    streamed.sort((a, b) => a - b);
    const offMed = medianVoicedF0(offline.f0, offline.voiced);
    const streamMed = streamed[Math.floor(streamed.length / 2)]!;
    expect(streamMed).toBeGreaterThan(offMed - 2);
    expect(streamMed).toBeLessThan(offMed + 2);
  });

  it("matches offline trackF0 on streaming chunks", () => {
    const sig = synth(0, 0, 440, 2);
    const offline = trackF0(sig, RATE);
    const tracker = new F0Tracker(RATE);
    const streamed: number[] = [];
    const chunk = 2048;
    for (let i = 0; i < sig.length; i += chunk) {
      const part = sig.subarray(i, Math.min(i + chunk, sig.length));
      const buf = sig.slice(0, i + part.length);
      tracker.syncBuffer(buf, 0, part.length);
      for (const frame of tracker.append()) {
        if (frame.voiced) streamed.push(frame.f0);
      }
    }
    streamed.sort((a, b) => a - b);
    const offMed = medianVoicedF0(offline.f0, offline.voiced);
    const streamMed = streamed[Math.floor(streamed.length / 2)]!;
    expect(streamMed).toBeGreaterThan(offMed - 1);
    expect(streamMed).toBeLessThan(offMed + 1);
  });

  it(
    "keeps monotonic timestamps when buffer is trimmed",
    { timeout: 30_000 },
    () => {
      const sig = synth(0, 0, 440, 20);
      const tracker = new F0Tracker(RATE);
      let buffer = new Float64Array(0);
      const chunk = 4096;
      const maxSamples = RATE * 15;
      const hop = Math.floor(0.005 * RATE);
      const times: number[] = [];
      for (let i = 0; i < sig.length; i += chunk) {
        const samples = sig.subarray(i, Math.min(i + chunk, sig.length));
        const merged = new Float64Array(buffer.length + samples.length);
        merged.set(buffer);
        for (let j = 0; j < samples.length; j++) merged[buffer.length + j] = samples[j]!;
        buffer = merged;
        let dropped = 0;
        if (buffer.length > maxSamples) {
          const alignedDrop = Math.floor((buffer.length - maxSamples) / hop) * hop;
          buffer = buffer.slice(alignedDrop);
          dropped = Math.floor(alignedDrop / hop);
        }
        tracker.syncBuffer(buffer, dropped, samples.length);
        for (const frame of tracker.append()) times.push(frame.t);
      }
      for (let i = 1; i < times.length; i++) {
        expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
      }
      expect(times[times.length - 1]).toBeCloseTo(sig.length / RATE, 0);
    },
  );

  it.each([
    [880, 5],
    [1046.5, 6],
  ])("tracks high note %.1f Hz without octave fold", (f0, tol) => {
    const sig = synth(0, 0, f0, 2);
    const tracker = new F0Tracker(RATE, 2);
    const streamed: number[] = [];
    for (let i = 0; i < sig.length; i += 4096) {
      const part = sig.subarray(i, Math.min(i + 4096, sig.length));
      tracker.pushSamples(Float32Array.from(part));
      for (const frame of tracker.append()) {
        if (frame.voiced) streamed.push(frame.f0);
      }
    }
    streamed.sort((a, b) => a - b);
    const med = streamed[Math.floor(streamed.length / 2)]!;
    expect(Math.abs(med - f0)).toBeLessThan(tol);
  });
});

describe("noteName", () => {
  it("returns A4 for 440 Hz", () => {
    expect(noteName(440)).toBe("A4");
  });

  it("returns em dash for null and non-positive values", () => {
    expect(noteName(null)).toBe("—");
    expect(noteName(0)).toBe("—");
  });

  it("returns em dash for out-of-range low pitch", () => {
    expect(noteName(5)).toBe("—");
  });
});

describe("analyseVibrato", () => {
  it("rate within 0.15 Hz at 6 Hz", () => {
    const sig = synth(6, 180, 293.66, 6);
    const { f0, voiced } = trackF0(sig, RATE);
    const v = analyseVibrato(f0, voiced, RATE);
    expect(v).not.toBeNull();
    expect(v!.rate_hz).toBeGreaterThan(5.85);
    expect(v!.rate_hz).toBeLessThan(6.15);
  });

  it("extent within 10%", () => {
    const sig = synth(6, 200, 293.66, 6);
    const { f0, voiced } = trackF0(sig, RATE);
    const v = analyseVibrato(f0, voiced, RATE);
    expect(v).not.toBeNull();
    expect(v!.extent_cents_direct).toBeGreaterThan(180);
    expect(v!.extent_cents_direct).toBeLessThan(220);
  });

  it("straight tone returns null", () => {
    const sig = synth(0, 0, 293.66, 6);
    const { f0, voiced } = trackF0(sig, RATE);
    expect(analyseVibrato(f0, voiced, RATE)).toBeNull();
  });

  it("returns null for segments shorter than 1 s", () => {
    const sig = synth(6, 180, 293.66, 0.5);
    const { f0, voiced } = trackF0(sig, RATE);
    expect(analyseVibrato(f0, voiced, RATE)).toBeNull();
  });

  it("marks trusted only after 4 s", () => {
    const short = synth(6, 180, 293.66, 2);
    const { f0: f0s, voiced: vs } = trackF0(short, RATE);
    expect(analyseVibrato(f0s, vs, RATE)?.trusted).toBe(false);

    const long = synth(6, 180, 293.66, 6);
    const { f0: f0l, voiced: vl } = trackF0(long, RATE);
    const v = analyseVibrato(f0l, vl, RATE);
    expect(v?.trusted).toBe(true);
    expect(v!.steady_seconds).toBeGreaterThanOrEqual(VIB_TRUSTED_SECONDS);
  });
});

describe("findPolyRoots", () => {
  it("finds complex conjugate pair for second-order resonator", () => {
    const w = (2 * Math.PI * 500) / RATE;
    const r = 0.95;
    const coeffs = new Float64Array([1, -2 * r * Math.cos(w), r * r]);
    const roots = findPolyRoots(coeffs);
    expect(roots).toHaveLength(2);
    const pos = roots.filter((z) => z.im > 0);
    expect(pos).toHaveLength(1);
    const root = pos[0]!;
    const freq = (Math.atan2(root.im, root.re) * RATE) / (2 * Math.PI);
    expect(freq).toBeGreaterThan(450);
    expect(freq).toBeLessThan(550);
  });
});

describe("selectFormants", () => {
  it("returns sorted formants within bandwidth limit", () => {
    const freqs = new Float64Array([500, 1500, 2500]);
    const bws = new Float64Array([100, 120, 150]);
    expect(selectFormants(freqs, bws, 3)).toEqual([500, 1500, 2500]);
  });

  it("filters wide bands", () => {
    const freqs = new Float64Array([500, 1500]);
    const bws = new Float64Array([600, 600]);
    expect(selectFormants(freqs, bws, 3)).toEqual([]);
  });
});

describe("analyseFormants", () => {
  it("detects resonances on harmonic tone", () => {
    const sig = synth(0, 0, 200, 5);
    const formants = analyseFormants(sig, RATE);
    expect(formants.length).toBeGreaterThanOrEqual(2);
    expect(formants[0]).toBeGreaterThan(200);
    expect(formants[0]).toBeLessThan(500);
  });

  it("returns empty array for short buffer", () => {
    expect(analyseFormants(new Float64Array(100), RATE)).toEqual([]);
  });
});

describe("levinson", () => {
  it("returns unit gain for white-noise autocorrelation", () => {
    const r = new Float64Array([1, 0.5, 0.25]);
    const a = levinson(r, 2);
    expect(a[0]).toBe(1);
    expect(a.length).toBe(3);
  });
});

describe("computeLtas", () => {
  it("returns frequency and dB arrays for voiced signal", () => {
    const sig = synth(0, 0, 440, 2);
    const { freqs, db } = computeLtas(sig, RATE);
    expect(freqs.length).toBe(db.length);
    expect(freqs.length).toBeGreaterThan(1000);
    expect(db[0]).toBeLessThan(0);
  });

  it("throws on buffer shorter than FFT window", () => {
    expect(() => computeLtas(new Float64Array(100), RATE)).toThrow(/короче окна/);
  });
});

describe("bandMeanDb and spectralCentroid", () => {
  it("computes band mean and centroid from LTAS", () => {
    const sig = synth(0, 0, 440, 2);
    const { freqs, db } = computeLtas(sig, RATE);
    const mean = bandMeanDb(freqs, db, 400, 500);
    expect(mean).not.toBeNull();
    const centroid = spectralCentroid(freqs, db);
    expect(centroid).toBeGreaterThan(100);
  });
});

describe("singerFormant", () => {
  it("finds the 2.4-3.2 kHz cluster peak with positive prominence", () => {
    // synth harmonics: 10*293.66 = 2937 Hz inside the cluster, neighbors weak
    const sig = synth(0, 0, 293.66, 3);
    const { freqs, db } = computeLtas(sig, RATE);
    const sf = singerFormant(freqs, db);
    expect(sf).not.toBeNull();
    expect(sf!.hz).toBeGreaterThan(2400);
    expect(sf!.hz).toBeLessThan(3200);
    expect(sf!.hz).toBeCloseTo(2936.6, -1);
    // weak 10th harmonic (amp 0.06) over the clipped floor: modest prominence
    expect(sf!.prominenceDb).toBeGreaterThan(5);
  });

  it("returns null when LTAS does not cover the cluster", () => {
    const freqs = new Float64Array([100, 200, 300, 400, 500]);
    const db = new Float64Array([-10, -12, -14, -13, -11]);
    expect(singerFormant(freqs, db)).toBeNull();
  });

  it("measures prominence in the realistic 0-20 dB regime on crafted LTAS", () => {
    // 10 Hz bins; cluster 2400-3200, baselines 1500-2400 and 3200-4200
    const freqs = new Float64Array(501);
    const db = new Float64Array(501);
    for (let i = 0; i <= 500; i++) freqs[i] = i * 10;
    db.fill(-40);
    db[290] = -30; // 2900 Hz peak: +10 dB over flat baseline
    let sf = singerFormant(freqs, db);
    expect(sf!.hz).toBe(2900);
    expect(sf!.prominenceDb).toBeCloseTo(10, 5);

    db[290] = -37; // +3 dB → ok threshold
    sf = singerFormant(freqs, db);
    expect(sf!.prominenceDb).toBeCloseTo(3, 5);

    db[290] = -40; // flat → 0 dB
    sf = singerFormant(freqs, db);
    expect(sf!.prominenceDb).toBeCloseTo(0, 5);
  });

  it("is surfaced through analyseBuffer", () => {
    const sig = synth(0, 0, 293.66, 3);
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.singer_formant_hz).not.toBeNull();
    expect(metrics.singer_formant_hz!).toBeGreaterThan(2400);
    expect(metrics.singer_formant_hz!).toBeLessThan(3200);
    expect(metrics.singer_formant_db).toBeGreaterThan(5);
  });

  it("surfaces jitter/shimmer/cpp through analyseBuffer", () => {
    const sig = synth(0, 0, 220, 3);
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.jitter_pct).not.toBeNull();
    expect(metrics.jitter_pct!).toBeLessThan(0.15);
    expect(metrics.shimmer_db).not.toBeNull();
    expect(metrics.shimmer_db!).toBeLessThanOrEqual(0.05);
    expect(metrics.cpp_db).not.toBeNull();
    expect(metrics.cpp_db!).toBeGreaterThan(0.4);
  });
});

describe("analyseH1H2", () => {
  it("returns positive dB for harmonic tone with strong H1", () => {
    const sig = synth(0, 0, 200, 3);
    const { f0, voiced } = trackF0(sig, RATE);
    const h1h2 = analyseH1H2(sig, RATE, f0, voiced);
    expect(h1h2).not.toBeNull();
    expect(h1h2!).toBeGreaterThan(0);
  });
});

describe("analyseBuffer", () => {
  it("returns expected fields for vibrato tone", () => {
    const sig = synth(6, 180, 293.66, 6);
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.f0_median_hz).not.toBeNull();
    expect(metrics.vibrato).not.toBeNull();
    expect(metrics.voiced_share).toBeGreaterThan(0.5);
  });

  it("includes LTAS-derived metrics for long signals", () => {
    const sig = synth(0, 0, 440, 2);
    const { metrics, ltas } = analyseBuffer(sig, RATE);
    expect(ltas).not.toBeNull();
    expect(metrics.h1_h2_db).not.toBeNull();
    expect(metrics.spectral_centroid_hz).toBeGreaterThan(0);
    expect(metrics.formants_hz.length).toBeGreaterThan(0);
  });
});
