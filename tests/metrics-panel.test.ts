import { describe, expect, it } from "vitest";
import {
  fmtDb,
  medianNoteLabel,
  vibExtentLevel,
  vibRateLevel,
  vibRegularityLevel,
} from "../src/ui/metrics-panel.ts";

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
