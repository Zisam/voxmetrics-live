import { describe, expect, it } from "vitest";
import { hzToMidi, midiToNoteLabel } from "../src/dsp/math.ts";

describe("hzToMidi", () => {
  it("returns 69 for A4 (440 Hz)", () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 5);
  });

  it("returns fractional MIDI for detuned pitch", () => {
    expect(hzToMidi(466.164)).toBeCloseTo(70, 2);
    expect(hzToMidi(440)).toBeLessThan(hzToMidi(466.164));
  });
});

describe("midiToNoteLabel", () => {
  it("labels middle C", () => {
    expect(midiToNoteLabel(60)).toBe("C4");
  });

  it("labels sharps", () => {
    expect(midiToNoteLabel(61)).toBe("C#4");
  });

  it("returns empty string for negative MIDI", () => {
    expect(midiToNoteLabel(-3)).toBe("");
  });

  it("returns empty string for out-of-range MIDI", () => {
    expect(midiToNoteLabel(-128)).toBe("");
    expect(midiToNoteLabel(200)).toBe("");
  });

  it("rounds fractional MIDI", () => {
    expect(midiToNoteLabel(69.4)).toBe("A4");
    expect(midiToNoteLabel(69.6)).toBe("A#4");
  });
});
