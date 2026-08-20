import { longestVoicedRun } from "./f0.ts";
import { median, medianFilter, convolveSame, hanning } from "./math.ts";
import { rfftMagnitude, rfftfreqN } from "./fft.ts";
import { HOP_SEC } from "./constants.ts";

/** Tremolo = amplitude modulation at 3-9 Hz while pitch stays steady. */
export const TREMOLO_MIN_HZ = 3;
export const TREMOLO_MAX_HZ = 9;
export const TREMOLO_MIN_SECONDS = 1;
/** Modulation depth (dB peak-to-peak) above which tremolo is worth reporting. */
export const TREMOLO_MIN_DEPTH_DB = 3;
/** Spectral prominence of the AM peak over the band median. */
export const TREMOLO_MIN_PROMINENCE = 3;

export interface TremoloResult {
  rate_hz: number;
  depth_db: number;
}

/**
 * Detect tremolo on the dB envelope of voiced frame RMS. Returns null when
 * there is no clear 3-9 Hz amplitude modulation on the longest voiced run.
 */
export function analyseTremolo(
  frameRms: Float64Array,
  voiced: Uint8Array,
  rate: number | null = null,
): TremoloResult | null {
  const run = longestVoicedRun(voiced);
  if (!run) return null;
  const [lo, hi] = run;
  const seg = frameRms.subarray(lo, hi);
  const hopSec = rate === null ? HOP_SEC : Math.floor(HOP_SEC * rate) / rate;
  const dur = (hi - lo) * hopSec;
  if (dur < TREMOLO_MIN_SECONDS) return null;

  const db = new Float64Array(seg.length);
  for (let i = 0; i < seg.length; i++) {
    db[i] = 20 * Math.log10(seg[i]! + 1e-12);
  }

  const smooth = medianFilter(db, 5);
  for (let i = 0; i < db.length; i++) {
    if (Math.abs(db[i]! - smooth[i]!) > 20) db[i] = smooth[i]!;
  }

  const win = Math.max(3, Math.floor(0.4 / hopSec) | 1);
  const kernel = new Float64Array(win).fill(1 / win);
  const trend = convolveSame(db, kernel);
  const edge = win >> 1;
  let workDb = db;
  let workTrend = trend;
  if (db.length > 2 * edge + 4) {
    workDb = db.slice(edge, db.length - edge);
    workTrend = trend.slice(edge, trend.length - edge);
  }

  const osc = new Float64Array(workDb.length);
  for (let i = 0; i < osc.length; i++) osc[i] = workDb[i]! - workTrend[i]!;
  if (osc.length < 16) return null;

  const windowed = new Float64Array(osc.length);
  const hann = hanning(osc.length);
  for (let i = 0; i < osc.length; i++) windowed[i] = osc[i]! * hann[i]!;

  const spec = rfftMagnitude(windowed);
  const freqs = rfftfreqN(osc.length, hopSec);

  let peak = 0;
  const bandIdx: number[] = [];
  const bandVals: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= TREMOLO_MIN_HZ && freqs[i]! <= TREMOLO_MAX_HZ) {
      bandIdx.push(i);
      bandVals.push(spec[i]!);
      if (spec[i]! > peak) peak = spec[i]!;
    }
  }
  if (bandIdx.length < 3 || peak <= 0) return null;
  const medianBand = median(new Float64Array(bandVals)) || 1e-20;
  const prominence = peak / medianBand;
  if (prominence < TREMOLO_MIN_PROMINENCE) return null;

  let idx = bandIdx[0]!;
  for (const i of bandIdx) {
    if (spec[i]! >= spec[idx]!) idx = i;
  }
  let tremRate = freqs[idx]!;
  if (idx > 0 && idx < spec.length - 1) {
    const a = spec[idx - 1]!;
    const b = spec[idx]!;
    const c = spec[idx + 1]!;
    const d = a - 2 * b + c;
    if (d !== 0) {
      tremRate += ((0.5 * (a - c)) / d) * (freqs[1]! - freqs[0]!);
    }
  }
  if (tremRate < TREMOLO_MIN_HZ || tremRate > TREMOLO_MAX_HZ) return null;

  // peak-to-peak depth of the oscillation in dB (2x amplitude of AC component)
  let maxOsc = -Infinity;
  let minOsc = Infinity;
  for (const v of osc) {
    if (v > maxOsc) maxOsc = v;
    if (v < minOsc) minOsc = v;
  }
  const depthDb = maxOsc - minOsc;
  if (depthDb < TREMOLO_MIN_DEPTH_DB) return null;

  return {
    rate_hz: Math.round(tremRate * 100) / 100,
    depth_db: Math.round(depthDb * 10) / 10,
  };
}
