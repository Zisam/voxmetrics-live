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
  pitchXRange,
  resetScrollState,
  resolveHudPoint,
  tickWallScroll,
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
