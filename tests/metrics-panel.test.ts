import { describe, expect, it } from "vitest";
import {
  CPP_GOOD_DB,
  CPP_OK_DB,
  F1_RANGE,
  F2_RANGE,
  F3_RANGE,
  cppLevel,
  fmtDb,
  fmtRangeRef,
  formantLevel,
  jitterLevel,
  medianNoteLabel,
  SHIMMER_GOOD_DB,
  SHIMMER_OK_DB,
  shimmerLevel,
  SINGER_FORMANT_BAND,
  SINGER_FORMANT_GOOD_DB,
  SINGER_FORMANT_OK_DB,
  singerFormantLevel,
  VIB_EXTENT_GOOD,
  VIB_EXTENT_OK,
  VIB_RATE_GOOD,
  VIB_RATE_OK,
  VIB_REGULARITY_GOOD,
  VIB_REGULARITY_OK,
  VIB_STEADY_TRUSTED_SEC,
  vibExtentLevel,
  vibRateLevel,
  vibRegularityLevel,
  vibSteadyLevel,
} from "../src/ui/metrics-panel.ts";
import {
  JITTER_GOOD_PCT,
  JITTER_OK_PCT,
} from "../src/dsp/constants.ts";

describe("vibRateLevel", () => {
  it("marks typical operatic vibrato rate as good", () => {
    expect(vibRateLevel(5.5)).toBe("good");
    expect(vibRateLevel(6.8)).toBe("good");
  });

  it("marks borderline rates as ok", () => {
    expect(vibRateLevel(4)).toBe("ok");
    expect(vibRateLevel(9)).toBe("ok");
  });

  it("marks extreme rates as warn", () => {
    expect(vibRateLevel(3)).toBe("warn");
    expect(vibRateLevel(11)).toBe("warn");
  });
});

describe("vibExtentLevel", () => {
  it("marks typical extents as good", () => {
    expect(vibExtentLevel(100)).toBe("good");
    expect(vibExtentLevel(200)).toBe("good");
  });

  it("marks small and large extents as ok or warn", () => {
    expect(vibExtentLevel(25)).toBe("ok");
    expect(vibExtentLevel(300)).toBe("ok");
    expect(vibExtentLevel(10)).toBe("warn");
    expect(vibExtentLevel(500)).toBe("warn");
  });
});

describe("vibRegularityLevel", () => {
  it("classifies regularity", () => {
    expect(vibRegularityLevel(0.8)).toBe("good");
    expect(vibRegularityLevel(0.5)).toBe("ok");
    expect(vibRegularityLevel(0.1)).toBe("warn");
  });
});

describe("reference ranges match quality levels (UI can't contradict colors)", () => {
  it("vibrato rate: ref boundaries are 'good', just outside is 'ok'", () => {
    expect(vibRateLevel(VIB_RATE_GOOD[0])).toBe("good");
    expect(vibRateLevel(VIB_RATE_GOOD[1])).toBe("good");
    expect(vibRateLevel(VIB_RATE_GOOD[0] - 0.01)).toBe("ok");
    expect(vibRateLevel(VIB_RATE_GOOD[1] + 0.01)).toBe("ok");
    expect(vibRateLevel(VIB_RATE_OK[0] - 0.01)).toBe("warn");
    expect(vibRateLevel(VIB_RATE_OK[1] + 0.01)).toBe("warn");
  });

  it("vibrato extent: ref boundaries are 'good', just outside is 'ok'", () => {
    expect(vibExtentLevel(VIB_EXTENT_GOOD[0])).toBe("good");
    expect(vibExtentLevel(VIB_EXTENT_GOOD[1])).toBe("good");
    expect(vibExtentLevel(VIB_EXTENT_GOOD[0] - 1)).toBe("ok");
    expect(vibExtentLevel(VIB_EXTENT_GOOD[1] + 1)).toBe("ok");
    expect(vibExtentLevel(VIB_EXTENT_OK[0] - 1)).toBe("warn");
    expect(vibExtentLevel(VIB_EXTENT_OK[1] + 1)).toBe("warn");
  });

  it("vibrato regularity: ref threshold is 'good'", () => {
    expect(vibRegularityLevel(VIB_REGULARITY_GOOD)).toBe("good");
    expect(vibRegularityLevel(VIB_REGULARITY_GOOD - 0.001)).not.toBe("good");
    expect(vibRegularityLevel(VIB_REGULARITY_OK)).toBe("ok");
  });

  it("steady tone: trusted seconds threshold is 'good'", () => {
    expect(vibSteadyLevel(VIB_STEADY_TRUSTED_SEC, false)).toBe("good");
    expect(vibSteadyLevel(VIB_STEADY_TRUSTED_SEC - 0.1, false)).not.toBe("good");
    expect(vibSteadyLevel(2, true)).toBe("good");
  });

  it("fmtRangeRef renders the same numbers as the boundaries", () => {
    expect(fmtRangeRef(VIB_RATE_GOOD, "Гц")).toBe("норма 4.5–7.5 Гц");
    expect(fmtRangeRef(VIB_EXTENT_GOOD, "центов")).toBe(
      "норма 40–250 центов",
    );
  });
});

describe("singerFormantLevel", () => {
  it("classifies prominence by thresholds", () => {
    expect(singerFormantLevel(8)).toBe("good");
    expect(singerFormantLevel(SINGER_FORMANT_GOOD_DB)).toBe("good");
    expect(singerFormantLevel(SINGER_FORMANT_OK_DB)).toBe("ok");
    expect(singerFormantLevel(4.9)).toBe("ok");
    expect(singerFormantLevel(1)).toBe("warn");
    expect(singerFormantLevel(-2)).toBe("warn");
  });
});

describe("formantLevel", () => {
  it("marks in-range formants good, out-of-range neutral, missing empty", () => {
    expect(formantLevel(500, F1_RANGE)).toBe("good");
    expect(formantLevel(1800, F2_RANGE)).toBe("good");
    expect(formantLevel(2900, F3_RANGE)).toBe("good");
    expect(formantLevel(150, F1_RANGE)).toBe("");
    expect(formantLevel(4000, F3_RANGE)).toBe("");
    expect(formantLevel(undefined, F1_RANGE)).toBe("");
  });
});

describe("singer formant reference consistency (UI text vs levels)", () => {
  it("band constants stay inside documented ranges", () => {
    expect(SINGER_FORMANT_BAND[0]).toBe(2400);
    expect(SINGER_FORMANT_BAND[1]).toBe(3200);
    expect(SINGER_FORMANT_GOOD_DB).toBeGreaterThan(SINGER_FORMANT_OK_DB);
  });
});

describe("jitter/shimmer/cpp levels match reference constants", () => {
  it("jitter: good at threshold, ok just above, warn beyond ok", () => {
    expect(jitterLevel(JITTER_GOOD_PCT / 2)).toBe("good");
    expect(jitterLevel(JITTER_GOOD_PCT)).toBe("good");
    expect(jitterLevel(JITTER_GOOD_PCT + 0.01)).toBe("ok");
    expect(jitterLevel(JITTER_OK_PCT)).toBe("ok");
    expect(jitterLevel(JITTER_OK_PCT + 0.01)).toBe("warn");
  });

  it("shimmer thresholds classify monotonically", () => {
    expect(shimmerLevel(SHIMMER_GOOD_DB / 2)).toBe("good");
    expect(shimmerLevel(SHIMMER_OK_DB - 0.001)).toBe("ok");
    expect(shimmerLevel(SHIMMER_OK_DB + 0.001)).toBe("warn");
  });

  it("cpp thresholds classify monotonically", () => {
    expect(cppLevel(CPP_GOOD_DB)).toBe("good");
    expect(cppLevel(CPP_OK_DB)).toBe("ok");
    expect(cppLevel(CPP_OK_DB - 0.01)).toBe("warn");
    expect(cppLevel(CPP_GOOD_DB + 1)).toBe("good");
  });
});

describe("medianNoteLabel", () => {
  it("labels A4 for 440 Hz", () => {
    expect(medianNoteLabel(440)).toBe("A4");
  });

  it("returns em dash for missing values", () => {
    expect(medianNoteLabel(null)).toBe("—");
    expect(medianNoteLabel(0)).toBe("—");
  });
});

describe("fmtDb", () => {
  it("formats signed dB with one decimal", () => {
    expect(fmtDb(3.56)).toBe("+3.6 дБ");
    expect(fmtDb(-2.44)).toBe("-2.4 дБ");
  });

  it("returns em dash for null", () => {
    expect(fmtDb(null)).toBe("—");
  });
});
