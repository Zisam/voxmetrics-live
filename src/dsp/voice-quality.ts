import { hanning } from "./math.ts";
import { rfft, magnitudeSquared, nFftForFrame, ifft } from "./fft.ts";

/** Local jitter: mean |ΔT| / mean T over consecutive voiced cycles (rap-style, %). */
export function localJitterPct(rawF0: Float64Array, voiced: Uint8Array): number | null {
  const periods: number[] = [];
  for (let i = 0; i < rawF0.length; i++) {
    if (voiced[i] && rawF0[i]! > 0) periods.push(1 / rawF0[i]!);
  }
  if (periods.length < 2) return null;

  let sumAbsD = 0;
  let count = 0;
  for (let i = 1; i < periods.length; i++) {
    sumAbsD += Math.abs(periods[i]! - periods[i - 1]!);
    count++;
  }
  let meanP = 0;
  for (const p of periods) meanP += p;
  meanP /= periods.length;
  if (meanP <= 0) return null;
  return (sumAbsD / count / meanP) * 100;
}

/** Local shimmer dB: mean |ΔA| in dB between consecutive voiced cycles. */
export function localShimmerDb(frameRms: Float64Array, voiced: Uint8Array): number | null {
  const amps: number[] = [];
  for (let i = 0; i < frameRms.length; i++) {
    if (voiced[i] && frameRms[i]! > 0) amps.push(frameRms[i]!);
  }
  if (amps.length < 2) return null;

  let sumAbsD = 0;
  let count = 0;
  for (let i = 1; i < amps.length; i++) {
    sumAbsD += Math.abs(20 * Math.log10(amps[i]! / amps[i - 1]!));
    count++;
  }
  return sumAbsD / count;
}

/**
 * Cepstral peak prominence (CPP), dB: real cepstrum of windowed frames,
 * peak in the expected quefrency band vs a regression baseline over the
 * voiced quefrency range. Higher = cleaner harmonic structure (less
 * breathiness/hoarseness).
 */
export function cepstralPeakProminenceDb(
  x: Float64Array,
  rate: number,
  f0Min = 70,
  f0Max = 1000,
  maxFrames = 60,
): number | null {
  if (x.length < 1024) return null;
  const frame = Math.floor(0.04 * rate);
  if (x.length < frame) return null;
  const hop = Math.max(frame, Math.floor((x.length - frame) / maxFrames) || frame);
  const nFft = nFftForFrame(frame * 2);
  const window = hanning(frame);

  // log-power spectrum -> ifft = real cepstrum; average CPP over frames
  const qMin = Math.floor(rate / f0Max);
  const qMax = Math.ceil(rate / f0Min);
  const values: number[] = [];

  for (let start = 0; start + frame <= x.length; start += hop) {
    const seg = new Float64Array(nFft);
    let mean = 0;
    for (let j = 0; j < frame; j++) mean += x[start + j]!;
    mean /= frame;
    for (let j = 0; j < frame; j++) seg[j] = (x[start + j]! - mean) * window[j]!;

    const power = magnitudeSquared(rfft(seg, nFft));
    // cepstrum input: log magnitude (0.5·ln power) so dB conversion is 20/ln10
    const logSpecRe = new Float64Array(power.length);
    for (let j = 0; j < power.length; j++) {
      logSpecRe[j] = 0.5 * Math.log(power[j]! + 1e-20);
    }
    const cepstrum = irfftLogSpectrum(logSpecRe, nFft);
    if (!cepstrum) continue;

    // baseline: linear regression of cepstrum over quefrency [qMin..qMax*2]
    const qEnd = Math.min(cepstrum.length - 1, qMax * 2);
    if (qEnd <= qMin) continue;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let q = qMin; q <= qEnd; q++) {
      const y = cepstrum[q]!;
      n++;
      sx += q;
      sy += y;
      sxx += q * q;
      sxy += q * y;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) continue;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;

    let peak = -Infinity;
    let peakQ = 0;
    for (let q = qMin; q <= qMax && q < cepstrum.length; q++) {
      if (cepstrum[q]! > peak) {
        peak = cepstrum[q]!;
        peakQ = q;
      }
    }
    if (!Number.isFinite(peak)) continue;

    const baseline = slope * peakQ + intercept;
    // cepstrum is in natural-log units; convert quefrency-peak prominence to dB
    values.push((peak - baseline) * (20 / Math.LN10));
  }

  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const med =
    values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;
  return med;
}

/** Inverse FFT of a symmetric log-magnitude spectrum (real cepstrum). */
function irfftLogSpectrum(logMag: Float64Array, nFft: number): Float64Array | null {
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const half = logMag.length;
  for (let i = 0; i < half; i++) re[i] = logMag[i]!;
  for (let i = 1; i < half - 1; i++) {
    re[nFft - i] = re[i]!;
  }
  // phase-zero inverse via ifft of the real symmetric array
  ifft(re, im);
  return re;
}
