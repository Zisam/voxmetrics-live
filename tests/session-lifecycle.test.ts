import { describe, expect, it } from "vitest";
import type { F0Point } from "../src/types.ts";
import { acceptWorkerStreamMessage } from "../src/ui/session.ts";
import {
  appendScrollingPitchPoints,
  clearPitchSeries,
  createScrollState,
  NOW_X,
  resetScrollState,
  resolveHudPoint,
} from "../src/ui/pitch-buffer.ts";

function point(t: number, f0_hz: number, voiced: boolean): F0Point {
  return { t, f0_hz, voiced, cents: voiced ? 0 : NaN };
}

describe("session lifecycle (main-thread model)", () => {
  it("drops f0 updates after session becomes inactive", () => {
    let active = true;
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];

    const apply = (points: F0Point[]) => {
      if (!acceptWorkerStreamMessage("f0", active)) return;
      appendScrollingPitchPoints(scroll, xs, midi, points);
    };

    apply([point(1, 440, true)]);
    expect(xs.length).toBe(1);

    active = false;
    resetScrollState(scroll);
    clearPitchSeries(xs, midi);
    apply([point(2, 440, true)]);
    expect(xs.length).toBe(0);
  });

  it("accepts new session at NOW_X after reset", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    appendScrollingPitchPoints(scroll, xs, midi, [point(0.1, 440, true)]);
    expect(xs[0]).toBe(NOW_X);
  });

  it("does not block fresh session after clear", () => {
    const scroll = createScrollState();
    const xs: number[] = [3];
    const midi: (number | null)[] = [60];
    resetScrollState(scroll);
    clearPitchSeries(xs, midi);
    appendScrollingPitchPoints(scroll, xs, midi, [point(0.2, 440, true)]);
    expect(xs).toEqual([NOW_X]);
  });
});

describe("resolveHudPoint integration", () => {
  it("keeps HUD when batch ends voiced at NOW_X", () => {
    const scroll = createScrollState();
    const xs: number[] = [];
    const midi: (number | null)[] = [];
    const batch = appendScrollingPitchPoints(scroll, xs, midi, [
      point(1, 440, true),
      point(1.05, 440, true),
    ]);
    expect(resolveHudPoint(batch)?.f0_hz).toBe(440);
    expect(xs[xs.length - 1]).toBe(NOW_X);
  });
});
