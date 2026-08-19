import {
  VIB_MIN,
  VIB_MAX,
  VIB_MIN_SECONDS,
  VIB_TRUSTED_SECONDS,
  VIB_MIN_EXTENT,
  VIB_MIN_PROMINENCE,
  HOP_SEC,
} from "./constants.ts";
import { medianFilter, median } from "./math.ts";
import { rfft, rfftfreq, magnitudeSquared } from "./fft.ts";
import { longestVoicedRun } from "./f0.ts";
import type { VibratoResult } from "../types.ts";

function vibratoRegularity(
  osc: Float64Array,
  p2p: Float64Array,
  fs: number,
  vibRate: number,
): number | null {
  const scores: number[] = [];
  if (p2p.length >= 3) {
    let mean = 0;
    for (let i = 0; i < p2p.length; i++) mean += p2p[i]!;
    mean /= p2p.length;
    if (mean > 0) {
      let varSum = 0;
      for (let i = 0; i < p2p.length; i++) varSum += (p2p[i]! - mean) ** 2;
      scores.push(Math.sqrt(varSum / p2p.length) / mean);
    }
  }

  const crossings: number[] = [];
  for (let i = 0; i < osc.length - 1; i++) {
    if (osc[i]! <= 0 && osc[i + 1]! > 0) crossings.push(i);
  }
  if (crossings.length >= 4) {
    const expected = 1 / vibRate;
    const periods: number[] = [];
    for (let i = 1; i < crossings.length; i++) {
      const p = (crossings[i]! - crossings[i - 1]!) / fs;
      if (p > 0.4 * expected && p < 2.5 * expected) periods.push(p);
    }
    if (periods.length >= 3) {
      let mean = 0;
      for (const p of periods) mean += p;
      mean /= periods.length;
      if (mean > 0) {
        let varSum = 0;
        for (const p of periods) varSum += (p - mean) ** 2;
        scores.push(Math.sqrt(varSum / periods.length) / mean);
      }
    }
  }

  if (scores.length === 0) return null;
  return Math.round(Math.max(0, Math.min(1, 1 - Math.max(...scores))) * 1000) / 1000;
}

export function analyseVibrato(
  f0: Float64Array,
  voiced: Uint8Array,
  rate: number | null = null,
): VibratoResult | null {
  const run = longestVoicedRun(voiced);
  if (!run) return null;
  const [lo, hi] = run;
  const seg = f0.slice(lo, hi);

  const hopSec = rate === null ? HOP_SEC : Math.floor(HOP_SEC * rate) / rate;
  const fs = 1 / hopSec;
  const dur = (hi - lo) * hopSec;
  if (dur < VIB_MIN_SECONDS) return null;

  const med = median(seg);
  const cents = new Float64Array(seg.length);
  for (let i = 0; i < seg.length; i++) cents[i] = 1200 * Math.log2(seg[i]! / med);

  const smooth = medianFilter(cents, 5);
  for (let i = 0; i < cents.length; i++) {
    if (Math.abs(cents[i]! - smooth[i]!) > 300) cents[i] = smooth[i]!;
  }

  let win = Math.max(3, Math.floor(0.4 / hopSec) | 1);
  const kernel = new Float64Array(win).fill(1 / win);
  const trend = convolveSameReflect(cents, kernel);
  let workCents = cents;
  let workTrend = trend;
  const edge = win >> 1;
  if (cents.length > 2 * edge + 4) {
    workCents = cents.slice(edge, cents.length - edge);
    workTrend = trend.slice(edge, trend.length - edge);
  }

  const osc = new Float64Array(workCents.length);
  for (let i = 0; i < osc.length; i++) osc[i] = workCents[i]! - workTrend[i]!;
  if (osc.length < 16) return null;

  const windowed = new Float64Array(osc.length);
  const hann = hanning1(osc.length);
  for (let i = 0; i < osc.length; i++) windowed[i] = osc[i]! * hann[i]!;

  const nFft = nextPow2(osc.length);
  const spec = magnitudeSquared(rfft(windowed, nFft));
  const freqs = rfftfreq(nFft, hopSec);

  let peak = 0;
  let medianBand = 0;
  const bandIdx: number[] = [];
  const bandVals: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= VIB_MIN && freqs[i]! <= VIB_MAX) {
      bandIdx.push(i);
      bandVals.push(spec[i]!);
      if (spec[i]! > peak) peak = spec[i]!;
    }
  }
  if (bandIdx.length < 3 || peak <= 0) return null;
  medianBand = median(new Float64Array(bandVals)) || 1e-20;
  const prominence = peak / medianBand;

  let idx = bandIdx[0]!;
  for (const i of bandIdx) {
    if (spec[i]! >= spec[idx]!) idx = i;
  }
  let vibRate = freqs[idx]!;
  if (idx > 0 && idx < spec.length - 1) {
    const a = spec[idx - 1]!;
    const b = spec[idx]!;
    const c = spec[idx + 1]!;
    const d = a - 2 * b + c;
    if (d !== 0) vibRate += (0.5 * (a - c)) / d * (freqs[1]! - freqs[0]!);
  }
  if (vibRate < VIB_MIN || vibRate > VIB_MAX) return null;

  const denom = win * Math.sin((Math.PI * vibRate) / fs);
  const h = denom !== 0 ? Math.sin((Math.PI * vibRate * win) / fs) / denom : 0;
  const gain = Math.abs(1 - h) || 1;

  let rmsSum = 0;
  for (let i = 0; i < osc.length; i++) rmsSum += osc[i]! * osc[i]!;
  const rms = Math.sqrt(rmsSum / osc.length);
  const extentRms = (2 * Math.sqrt(2) * rms) / gain;

  const period = Math.max(2, Math.round(fs / vibRate));
  const p2p: number[] = [];
  for (let i = 0; i <= osc.length - period; i += period) {
    const chunk = osc.slice(i, i + period);
    if (chunk.length !== period) continue;
    let loVal = chunk[0]!;
    let hiVal = chunk[0]!;
    for (const v of chunk) {
      if (v < loVal) loVal = v;
      if (v > hiVal) hiVal = v;
    }
    p2p.push(hiVal - loVal);
  }
  const extentDirect = p2p.length ? median(new Float64Array(p2p)) / gain : extentRms;

  if (extentDirect < VIB_MIN_EXTENT || prominence < VIB_MIN_PROMINENCE) return null;

  return {
    rate_hz: Math.round(vibRate * 100) / 100,
    extent_cents_rms: Math.round(extentRms * 10) / 10,
    extent_cents_direct: Math.round(extentDirect * 10) / 10,
    regularity: vibratoRegularity(osc, new Float64Array(p2p), fs, vibRate),
    steady_seconds: Math.round(dur * 100) / 100,
    center_hz: Math.round(med * 100) / 100,
    trusted: dur >= VIB_TRUSTED_SECONDS,
  };
}

function convolveSameReflect(signal: Float64Array, kernel: Float64Array): Float64Array {
  const n = signal.length;
  const m = kernel.length;
  const half = Math.floor(m / 2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      const j = reflect(i + k - half, n);
      sum += signal[j]! * kernel[k]!;
    }
    out[i] = sum;
  }
  return out;
}

function reflect(i: number, n: number): number {
  if (i < 0) return -i;
  if (i >= n) return 2 * n - i - 2;
  return i;
}

function hanning1(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

function nextPow2(n: number): number {
  return 1 << Math.ceil(Math.log2(Math.max(2, n)));
}
