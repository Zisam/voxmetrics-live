import { describe, expect, it } from "vitest";
import { trackF0 } from "../src/dsp/f0.ts";
import { analyseVibrato } from "../src/dsp/vibrato.ts";
import { analyseBuffer } from "../src/dsp/analyse.ts";
import { synth, RATE } from "./synth.ts";

describe("trackF0", () => {
  it("measures pure tone near 440 Hz", () => {
    const sig = synth(0, 0, 440, 2);
    const { f0, voiced } = trackF0(sig, RATE);
    const vals: number[] = [];
    for (let i = 0; i < f0.length; i++) if (voiced[i]) vals.push(f0[i]!);
    vals.sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)]!;
    expect(med).toBeGreaterThan(435);
    expect(med).toBeLessThan(445);
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
});

describe("analyseBuffer", () => {
  it("returns expected fields for vibrato tone", () => {
    const sig = synth(6, 180, 293.66, 6);
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.f0_median_hz).not.toBeNull();
    expect(metrics.vibrato).not.toBeNull();
    expect(metrics.voiced_share).toBeGreaterThan(0.5);
  });
});
