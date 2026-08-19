import type { F0Point } from "../types.ts";
import { hzToMidi, noteName } from "../dsp/math.ts";
import {
  MAX_PITCH_POINTS,
  PITCH_WINDOW_SEC,
  HOP_SEC,
} from "../dsp/constants.ts";

export { PITCH_WINDOW_SEC };

/** Display X of the live sample — fixed right edge of the chart. */
export const NOW_X = PITCH_WINDOW_SEC;

export const Y_PAD_SEMITONES = 3;
export const Y_MIN_SPAN_SEMITONES = 14;
export const DEFAULT_Y_RANGE: [number, number] = [57, 69];

export interface HudState {
  note: string;
  cents: string;
  centsClass: string;
  hz: string;
}

export interface NowMarker {
  t: number;
  midi: number;
}

export interface PitchBatchResult {
  hudPoint: F0Point | null;
  silenceBatch: boolean;
}

/** Tracks wall time between chart updates for left-scroll delta. */
export interface ScrollState {
  lastWallSec: number | null;
}

export function createScrollState(): ScrollState {
  return { lastWallSec: null };
}

export function resetScrollState(scroll: ScrollState): void {
  scroll.lastWallSec = null;
}

export function clearPitchSeries(xs: number[], midi: (number | null)[]): void {
  xs.length = 0;
  midi.length = 0;
}

export function resolveHudPoint(result: PitchBatchResult): F0Point | null {
  if (result.silenceBatch) return null;
  return result.hudPoint;
}

function trimSeriesHead(xs: number[], midi: (number | null)[]): void {
  let remove = 0;
  while (remove < xs.length && xs[remove]! < 0) remove++;
  if (remove > 0) {
    xs.splice(0, remove);
    midi.splice(0, remove);
  }
  const excess = xs.length - MAX_PITCH_POINTS;
  if (excess > 0) {
    xs.splice(0, excess);
    midi.splice(0, excess);
  }
}

function shiftSeriesLeft(
  xs: number[],
  midi: (number | null)[],
  delta: number,
): void {
  for (let i = 0; i < xs.length; i++) xs[i] -= delta;
  trimSeriesHead(xs, midi);
}

/** Shift trace left by elapsed wall time (call every animation frame). */
export function tickWallScroll(
  scroll: ScrollState,
  xs: number[],
  midi: (number | null)[],
  wallSec = performance.now() / 1000,
): void {
  if (scroll.lastWallSec == null || xs.length === 0) return;
  const delta = wallSec - scroll.lastWallSec;
  if (delta > 0) {
    shiftSeriesLeft(xs, midi, delta);
    scroll.lastWallSec = wallSec;
  }
}

/**
 * Append F0 batch at the right edge (NOW_X). Does not scroll — call
 * tickWallScroll each frame for continuous drift.
 */
export function appendScrollingPitchPoints(
  scroll: ScrollState,
  xs: number[],
  midi: (number | null)[],
  points: F0Point[],
  windowSec = PITCH_WINDOW_SEC,
  wallSec = performance.now() / 1000,
): PitchBatchResult {
  if (!points.length) return { hudPoint: null, silenceBatch: true };

  if (scroll.lastWallSec == null) scroll.lastWallSec = wallSec;

  let hudPoint: F0Point | null = null;
  let anyVoiced = false;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const x = windowSec - (n - 1 - i) * HOP_SEC;
    if (x < 0) continue;
    xs.push(x);
    if (p.voiced && p.f0_hz > 0) {
      midi.push(hzToMidi(p.f0_hz));
      hudPoint = p;
      anyVoiced = true;
    } else {
      midi.push(null);
    }
  }

  trimSeriesHead(xs, midi);
  return { hudPoint, silenceBatch: !anyVoiced };
}

export function computeYRange(
  midi: (number | null)[],
  pad = Y_PAD_SEMITONES,
  minSpan = Y_MIN_SPAN_SEMITONES,
  fallback: [number, number] = DEFAULT_Y_RANGE,
): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  let any = false;
  for (const v of midi) {
    if (v == null || Number.isNaN(v)) continue;
    any = true;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!any) return fallback;

  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);

  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = Math.floor(mid - minSpan / 2);
    hi = Math.ceil(mid + minSpan / 2);
  }
  return [lo, hi];
}

export function pitchXRange(): [number, number] {
  return [0, PITCH_WINDOW_SEC];
}

export function hudFromPoint(point: F0Point | null): HudState {
  if (!point?.voiced || point.f0_hz <= 0 || Number.isNaN(point.cents)) {
    return { note: "—", cents: "", centsClass: "hud-cents", hz: "" };
  }
  const cents = Math.round(point.cents);
  const sign = cents > 0 ? "+" : "";
  return {
    note: noteName(point.f0_hz),
    cents: `${sign}${cents} ¢`,
    centsClass: "hud-cents" + (Math.abs(cents) <= 10 ? " in-tune" : ""),
    hz: `${point.f0_hz.toFixed(1)} Гц`,
  };
}

/** Live marker at fixed X (NOW_X); Y follows last voiced pitch. */
export function nowMarker(midi: (number | null)[]): NowMarker | null {
  for (let i = midi.length - 1; i >= 0; i--) {
    const v = midi[i];
    if (v != null && !Number.isNaN(v)) return { t: NOW_X, midi: v };
  }
  return null;
}
