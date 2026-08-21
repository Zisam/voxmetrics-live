import { describe, expect, it } from "vitest";
import {
  computeVibratoGuide,
  VIB_CORRIDOR_SEMI,
  VIB_REF_HZ,
  VIB_REF_SEMI_AMPLITUDE,
  visibleVoicedMedian,
} from "../src/ui/vibrato-guide.ts";

describe("computeVibratoGuide", () => {
  it("builds a 150-cent corridor around the held note", () => {
    const g = computeVibratoGuide(60);
    expect(g.lo).toBeCloseTo(60 - 0.75, 10);
    expect(g.hi).toBeCloseTo(60 + 0.75, 10);
  });

  it("reference sine is 5.5 Hz with 150 cents p2p, filling the corridor", () => {
    expect(VIB_REF_HZ).toBe(5.5);
    // 150 cents peak-to-peak = ±75 cents = ±0.75 semitone
    expect(VIB_REF_SEMI_AMPLITUDE).toBeCloseTo(0.75, 10);
    expect(VIB_CORRIDOR_SEMI).toBeCloseTo(0.75, 10);
    const g = computeVibratoGuide(60);
    expect(g.hz).toBe(VIB_REF_HZ);
    expect(g.amplitude).toBe(VIB_REF_SEMI_AMPLITUDE);
    // extremes touch the corridor bounds exactly
    expect(g.center + g.amplitude).toBeCloseTo(g.hi, 10);
    expect(g.center - g.amplitude).toBeCloseTo(g.lo, 10);
  });
});

describe("visibleVoicedMedian", () => {
  it("returns null when no voiced points", () => {
    expect(visibleVoicedMedian([])).toBeNull();
    expect(visibleVoicedMedian([null, null])).toBeNull();
  });

  it("ignores unvoiced gaps", () => {
    expect(visibleVoicedMedian([null, 60, null, 62])).toBe(61);
  });

  it("median of odd/even counts", () => {
    expect(visibleVoicedMedian([60, 62, 64])).toBe(62);
    expect(visibleVoicedMedian([60, 61, 63, 64])).toBe(62);
  });
});
