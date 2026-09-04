import { describe, expect, it } from "vitest";
import type { F0Point } from "../src/types.ts";
import {
  MAX_PITCH_POINTS,
  PITCH_WINDOW_SEC,
} from "../src/dsp/constants.ts";
import {
  appendScrollingPitchPoints,
  computeYRange,
  createScrollState,
  hudFromPoint,
  NOW_X,
  nowMarker,
  panYRange,
  pitchXRange,
  resetScrollState,
  resolveHudPoint,
  tickWallScroll,
  Y_PAN_MAX_SEMITONE,
  Y_PAN_MIN_SEMITONE,
  Y_ZOOM_MIN_SPAN_SEMITONES,
  zoomYRange,
} from "../src/ui/pitch-buffer.ts";

function point(
  t: number,
  f0_hz: number,
  voiced: boolean,
  cents = 0,
): F0Point {
  return { t, f0_hz, voiced, cents: voiced ? cents : NaN };
}

describe("appendScrollingPitchPoints", () => {
  it("places the latest sample at NOW_X", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(1, 440, true)], undefined, 1);
    expect(xs[xs.length - 1]).toBe(NOW_X);
    expect(midi[0]).toBeCloseTo(69, 5);
  });

  it("scrolls existing trace left when wall time advances", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(1, 440, true)], undefined, 1);
    tickWallScroll(scroll, xs, midi, 1.5);
    appendScrollingPitchPoints(scroll, xs, midi, [point(1.5, 440, true)], undefined, 1.5);
    expect(xs[0]).toBeCloseTo(NOW_X - 0.5, 5);
    expect(xs[xs.length - 1]).toBe(NOW_X);
  });

  it("drops samples that scrolled past the left edge", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(0, 440, true)], undefined, 0);
    tickWallScroll(scroll, xs, midi, PITCH_WINDOW_SEC + 1);
    appendScrollingPitchPoints(scroll, xs, midi, [
      point(PITCH_WINDOW_SEC + 1, 440, true),
    ], undefined, PITCH_WINDOW_SEC + 1);
    expect(xs.every((x) => x >= 0)).toBe(true);
    expect(xs.length).toBeLessThanOrEqual(MAX_PITCH_POINTS);
  });

  it("returns last voiced when batch ends with silence", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    const result = appendScrollingPitchPoints(scroll, xs, midi, [
      point(1, 440, true),
      point(1.1, 0, false),
    ]);
    expect(result.hudPoint).toEqual(point(1, 440, true));
    expect(result.silenceBatch).toBe(false);
  });

  it("resets scroll anchor after resetScrollState", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(10, 440, true)], undefined, 10);
    resetScrollState(scroll);
    xs.length = 0;
    midi.length = 0;
    appendScrollingPitchPoints(scroll, xs, midi, [point(0.2, 440, true)], undefined, 0.2);
    expect(xs).toEqual([NOW_X]);
  });

  it("does not displace fresh points after a long stall with empty series", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(1, 440, true)], undefined, 1);
    tickWallScroll(scroll, xs, midi, 7);
    expect(xs.length).toBe(0); // scrolled out of window and trimmed
    // long stall with empty series must not accumulate wall delta
    tickWallScroll(scroll, xs, midi, 15);
    appendScrollingPitchPoints(scroll, xs, midi, [point(3.2, 440, true)], undefined, 15);
    expect(xs[xs.length - 1]).toBeCloseTo(NOW_X, 5);
    tickWallScroll(scroll, xs, midi, 15.25);
    expect(xs[xs.length - 1]).toBeCloseTo(NOW_X - 0.25, 5);
  });

  it("ignores duplicate or overlapping batches to keep x sorted", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(
      scroll,
      xs,
      midi,
      [point(2, 440, true), point(2.005, 440, true)],
      undefined,
      2,
    );
    const len = xs.length;

    // exact redelivery of the same batch: nothing appended
    const dup = appendScrollingPitchPoints(
      scroll,
      xs,
      midi,
      [point(2, 440, true), point(2.005, 440, true)],
      undefined,
      2.05,
    );
    expect(dup.silenceBatch).toBe(true);
    expect(xs.length).toBe(len);

    // partial overlap: stale point skipped, new point appended at NOW_X
    appendScrollingPitchPoints(
      scroll,
      xs,
      midi,
      [point(2.005, 440, true), point(2.01, 440, true)],
      undefined,
      2.1,
    );
    expect(xs.length).toBe(len + 1);
    expect(xs[xs.length - 1]).toBeCloseTo(NOW_X, 5);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    }
  });

  it("latency compensation leads the curve off the right edge", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(
      scroll,
      xs,
      midi,
      [point(1, 440, true)],
      undefined,
      1,
      0.12,
    );
    // newest point sits 0.12 s ahead of the raw NOW_X
    expect(xs[xs.length - 1]).toBeCloseTo(NOW_X - 0.12, 5);
    // later batch keeps the same offset
    appendScrollingPitchPoints(
      scroll,
      xs,
      midi,
      [point(1.093, 440, true)],
      undefined,
      1.093,
      0.12,
    );
    expect(xs[xs.length - 1]).toBeCloseTo(NOW_X - 0.12, 5);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    }
  });
});

describe("pitchXRange", () => {
  it("is always fixed 0..window", () => {
    expect(pitchXRange()).toEqual([0, PITCH_WINDOW_SEC]);
  });
});

describe("computeYRange", () => {
  it("returns fallback for empty series", () => {
    expect(computeYRange([])).toEqual([57, 69]);
  });
});

describe("panYRange", () => {
  it("reveals higher notes when the finger drags down", () => {
    expect(panYRange([57, 69], 100, 200)).toEqual([63, 75]);
  });

  it("reveals lower notes when the finger drags up", () => {
    expect(panYRange([57, 69], -100, 200)).toEqual([51, 63]);
  });

  it("clamps at the pan bounds preserving the span", () => {
    expect(panYRange([57, 69], -1000, 200)).toEqual([
      Y_PAN_MIN_SEMITONE,
      Y_PAN_MIN_SEMITONE + 12,
    ]);
    expect(panYRange([57, 69], 1000, 200)).toEqual([
      Y_PAN_MAX_SEMITONE - 12,
      Y_PAN_MAX_SEMITONE,
    ]);
  });

  it("returns the input range for zero-height plots and zero drags", () => {
    expect(panYRange([57, 69], 80, 0)).toEqual([57, 69]);
    expect(panYRange([57, 69], 0, 200)).toEqual([57, 69]);
  });
});

describe("zoomYRange", () => {
  it("zooms in around the midpoint anchor when fingers spread", () => {
    expect(zoomYRange([40, 60], 2, 0.5)).toEqual([45, 55]);
  });

  it("zooms out around the midpoint anchor when fingers close in", () => {
    expect(zoomYRange([50, 60], 0.5, 0.5)).toEqual([45, 65]);
  });

  it("keeps the value under the anchor fixed at the top edge", () => {
    expect(zoomYRange([40, 60], 2, 0)).toEqual([50, 60]);
  });

  it("keeps the value under the anchor fixed at the bottom edge", () => {
    expect(zoomYRange([40, 60], 2, 1)).toEqual([40, 50]);
  });

  it("clamps the span to the minimum zoom span", () => {
    expect(zoomYRange([60, 64], 10, 0.5)).toEqual([
      62 - Y_ZOOM_MIN_SPAN_SEMITONES / 2,
      62 + Y_ZOOM_MIN_SPAN_SEMITONES / 2,
    ]);
  });

  it("clamps zoomed-out ranges to the pan bounds", () => {
    expect(zoomYRange([100, 110], 0.01, 0.5)).toEqual([
      Y_PAN_MIN_SEMITONE,
      Y_PAN_MAX_SEMITONE,
    ]);
  });

  it("returns the input range for degenerate factors", () => {
    expect(zoomYRange([57, 69], 0, 0.5)).toEqual([57, 69]);
    expect(zoomYRange([57, 69], Number.NaN, 0.5)).toEqual([57, 69]);
    expect(zoomYRange([57, 69], 1, 0.5)).toEqual([57, 69]);
  });
});

describe("hudFromPoint", () => {
  it("shows note and cents for voiced point", () => {
    const hud = hudFromPoint(point(0, 440, true, 5));
    expect(hud.note).toBe("A4");
    expect(hud.cents).toBe("+5 ¢");
  });
});

describe("resolveHudPoint", () => {
  it("keeps HUD on last voiced frame when batch ends in silence", () => {
    expect(
      resolveHudPoint({
        hudPoint: point(1, 440, true),
        silenceBatch: false,
      }),
    ).toEqual(point(1, 440, true));
  });
});

describe("nowMarker", () => {
  it("pins marker X to NOW_X when voiced", () => {
    expect(nowMarker([69])).toEqual({ t: NOW_X, midi: 69 });
  });

  it("follows last voiced pitch when latest hop is unvoiced", () => {
    expect(nowMarker([69, null])).toEqual({ t: NOW_X, midi: 69 });
  });
});
