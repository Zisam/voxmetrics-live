import type { F0Point } from "../types.ts";
import { hzToMidi, noteName } from "../dsp/math.ts";
import {
  MAX_PITCH_POINTS,
  PITCH_WINDOW_SEC,
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

/** Tracks wall time + stream anchor for chart scroll/placement. */
export interface ScrollState {
  lastWallSec: number | null;
  /** Stream time of the newest appended point (worker `t`). */
  anchorT: number | null;
  /** Wall time when the anchor was established. */
  anchorWallSec: number | null;
  /** Stream time of the newest appended point ever (dedup guard). */
  lastT: number | null;
}

export function createScrollState(): ScrollState {
  return { lastWallSec: null, anchorT: null, anchorWallSec: null, lastT: null };
}

export function resetScrollState(scroll: ScrollState): void {
  scroll.lastWallSec = null;
  scroll.anchorT = null;
  scroll.anchorWallSec = null;
  scroll.lastT = null;
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
  if (scroll.lastWallSec == null) return;
  if (xs.length === 0) {
    // keep the anchor fresh so a device stall doesn't displace later points
    scroll.lastWallSec = wallSec;
    return;
  }
  const delta = wallSec - scroll.lastWallSec;
  if (delta > 0) {
    shiftSeriesLeft(xs, midi, delta);
    scroll.lastWallSec = wallSec;
  }
}

/**
 * Append F0 batch anchored to stream timestamps. Points are placed on a
 * grid whose newest position is `windowSec - latencyCompSec`: the trace
 * leads the right edge by the capture/processing latency (worklet chunk
 * accumulation + input path) so the sung wave lines up with wall-clock
 * overlays (click marks, reference sine). Existing points are reconciled
 * against the new anchor so wall/stream drift never produces unsorted x.
 */
export function appendScrollingPitchPoints(
  scroll: ScrollState,
  xs: number[],
  midi: (number | null)[],
  points: F0Point[],
  windowSec = PITCH_WINDOW_SEC,
  wallSec = performance.now() / 1000,
  latencyCompSec = 0,
): PitchBatchResult {
  if (!points.length) return { hudPoint: null, silenceBatch: true };

  if (scroll.lastWallSec == null) scroll.lastWallSec = wallSec;

  const anchorX = windowSec - latencyCompSec;
  const batchNewestT = points[points.length - 1]!.t;

  if (scroll.anchorT != null && batchNewestT > scroll.anchorT) {
    // Net-correct existing series: expected x(t) = anchorX - (anchor' - t).
    // Current x(t) ≈ anchorX - (anchor - t) - wallElapsed (ticks).
    // Needed left-shift = streamAdvance - wallElapsed; ≈ 0 in steady state.
    // A right-shift (wall ran ahead of a stalled stream) may only undo drift:
    // never push points beyond anchorX.
    const wallElapsed = wallSec - (scroll.anchorWallSec ?? wallSec);
    const streamAdvance = batchNewestT - scroll.anchorT;
    let delta = streamAdvance - wallElapsed;
    if (delta < 0 && xs.length > 0) {
      const maxRightShift = anchorX - xs[xs.length - 1]!;
      delta = Math.max(delta, -Math.max(0, maxRightShift));
    }
    if (delta !== 0) shiftSeriesLeft(xs, midi, delta);
    scroll.anchorT = batchNewestT;
    scroll.anchorWallSec = wallSec;
  } else if (scroll.anchorT == null) {
    scroll.anchorT = batchNewestT;
    scroll.anchorWallSec = wallSec;
  }

  let hudPoint: F0Point | null = null;
  let anyVoiced = false;

  for (const p of points) {
    // dedup guard: stream must stay strictly increasing for sorted x
    if (scroll.lastT != null && p.t <= scroll.lastT) continue;
    const x = anchorX - (scroll.anchorT! - p.t);
    if (x < 0) {
      scroll.lastT = p.t;
      continue;
    }
    xs.push(x);
    scroll.lastT = p.t;
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
