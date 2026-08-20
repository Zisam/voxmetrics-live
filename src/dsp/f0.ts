import { F0_MIN, F0_MAX, FRAME_SEC, HOP_SEC } from "./constants.ts";
import { hanning, rms } from "./math.ts";
import {
  irfft,
  magnitudeSquared,
  nFftForFrame,
  rfft,
  type Spectrum,
} from "./fft.ts";

export interface F0Track {
  times: Float64Array;
  f0: Float64Array;
  voiced: Uint8Array;
  /** Unsmoothed period-based F0 per frame (0 when unvoiced). */
  rawF0: Float64Array;
  /** RMS of the mean-removed (unwindowed) frame (0 when unvoiced). */
  frameRms: Float64Array;
}

/**
 * Pick the fundamental lag from an ACF. A linear short-lag bias makes a
 * longer lag win only when its peak is substantially higher, preventing
 * noise/hum-inflated ACF tails (amplified by window-overlap normalization)
 * from stealing the fundamental.
 */
export function pickLag(
  acf: Float64Array,
  lagMin: number,
  lagMax: number,
  rel = 0.9,
  bias = 0.15,
): number | null {
  const hi = Math.min(lagMax, acf.length - 2);
  if (hi <= lagMin) return null;
  const span = hi - lagMin;
  const biasAt = (lag: number) => bias * ((lag - lagMin) / span);

  let bestRaw = -Infinity;
  let bestEff = -Infinity;
  for (let i = lagMin; i <= hi; i++) {
    if (acf[i]! > bestRaw) bestRaw = acf[i]!;
    const eff = acf[i]! - biasAt(i);
    if (eff > bestEff) bestEff = eff;
  }
  if (bestRaw <= 0) return null;

  for (let lag = lagMin; lag <= hi; lag++) {
    const val = acf[lag]!;
    if (
      val - biasAt(lag) >= rel * bestEff &&
      val >= acf[lag - 1]! &&
      val >= acf[lag + 1]!
    ) {
      if (lagMin < lag && lag < acf.length - 1) {
        const a = acf[lag - 1]!;
        const b = acf[lag]!;
        const c = acf[lag + 1]!;
        const denom = a - 2 * b + c;
        if (denom !== 0) return lag + (0.5 * (a - c)) / denom;
      }
      return lag;
    }
  }

  let argmax = lagMin;
  let argmaxEff = -Infinity;
  for (let i = lagMin; i <= hi; i++) {
    const eff = acf[i]! - biasAt(i);
    if (eff > argmaxEff) {
      argmaxEff = eff;
      argmax = i;
    }
  }
  let lag = argmax;
  if (lagMin < lag && lag < acf.length - 1) {
    const a = acf[lag - 1]!;
    const b = acf[lag]!;
    const c = acf[lag + 1]!;
    const denom = a - 2 * b + c;
    if (denom !== 0) lag += (0.5 * (a - c)) / denom;
  }
  return lag;
}

/** If pickLag locked on a high harmonic, fold down to the fundamental. */
export function foldToFundamental(
  acf: Float64Array,
  lag: number,
  lagMax: number,
  rate: number,
  margin = 1.02,
): number {
  let folded = lag;
  const hi = Math.min(lagMax, acf.length - 2);
  while (rate / folded > 650 && folded * 2 <= hi) {
    const doubled = Math.round(folded * 2);
    if (acf[doubled]! > margin * acf[Math.round(folded)]!) folded = doubled;
    else break;
  }
  return folded;
}

function windowAcf(window: Float64Array, nFft: number, lagMax: number): Float64Array {
  const spec = rfft(window, nFft);
  const power = magnitudeSquared(spec);
  const acfSpec: Spectrum = { re: power, im: new Float64Array(power.length) };
  const acf = irfft(acfSpec, nFft);
  const out = new Float64Array(lagMax + 2);
  for (let i = 0; i < out.length; i++) out[i] = acf[i]! / (acf[0] || 1);
  return out;
}

export function trackF0(x: Float64Array, rate: number): F0Track {
  const frame = Math.floor(FRAME_SEC * rate);
  const hop = Math.floor(HOP_SEC * rate);
  if (frame < 8 || hop < 1) throw new Error("слишком низкая частота дискретизации");
  const nFrames = Math.max(0, Math.floor((x.length - frame) / hop) + 1);
  if (nFrames === 0) throw new Error(`запись короче окна анализа (${FRAME_SEC * 1000} мс)`);

  const lagMin = Math.max(2, Math.floor(rate / F0_MAX));
  const lagMax = Math.min(Math.floor(frame / 2), Math.floor(rate / F0_MIN));
  if (lagMax <= lagMin + 1) throw new Error("слишком короткое окно анализа");

  const window = hanning(frame);
  const nFft = nFftForFrame(frame);
  const acfW = windowAcf(window, nFft, lagMax);
  const rmsAll = rms(x) || 1e-12;

  const times = new Float64Array(nFrames);
  const f0 = new Float64Array(nFrames);
  const rawF0 = new Float64Array(nFrames);
  const frameRms = new Float64Array(nFrames);
  const voiced = new Uint8Array(nFrames);

  const seg = new Float64Array(frame);
  for (let i = 0; i < nFrames; i++) {
    times[i] = (i * hop + frame / 2) / rate;
    for (let j = 0; j < frame; j++) seg[j] = x[i * hop + j]!;
    let mean = 0;
    for (let j = 0; j < frame; j++) mean += seg[j]!;
    mean /= frame;
    let rawRms = 0;
    for (let j = 0; j < frame; j++) {
      const v = seg[j]! - mean;
      rawRms += v * v;
    }
    rawRms = Math.sqrt(rawRms / frame);
    for (let j = 0; j < frame; j++) seg[j] = (seg[j]! - mean) * window[j]!;

    const energy = rms(seg);
    if (energy < 0.1 * rmsAll) continue;

    const spec = rfft(seg, nFft);
    const power = magnitudeSquared(spec);
    const acfSpec: Spectrum = { re: power, im: new Float64Array(power.length) };
    const acfFull = irfft(acfSpec, nFft);
    const acf = new Float64Array(lagMax + 2);
    if (acfFull[0]! <= 0) continue;
    for (let k = 0; k < acf.length; k++) {
      acf[k] = acfFull[k]! / acfFull[0]! / Math.max(acfW[k]!, 0.1);
    }

    let lag = pickLag(acf, lagMin, lagMax);
    if (lag !== null) lag = foldToFundamental(acf, lag, lagMax, rate);
    if (lag === null || acf[Math.round(lag)]! < 0.35) continue;

    f0[i] = rate / lag;
    rawF0[i] = rate / lag;
    frameRms[i] = rawRms;
    voiced[i] = 1;
  }

  return { times, f0, voiced, rawF0, frameRms };
}

export function longestVoicedRun(voiced: Uint8Array): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLen = 0;
  let curStart: number | null = null;
  for (let i = 0; i < voiced.length; i++) {
    if (voiced[i] && curStart === null) curStart = i;
    else if (!voiced[i] && curStart !== null) {
      if (i - curStart > bestLen) {
        bestLen = i - curStart;
        best = [curStart, i];
      }
      curStart = null;
    }
  }
  if (curStart !== null && voiced.length - curStart > bestLen) {
    best = [curStart, voiced.length];
  }
  return best;
}

export function f0ToCents(f0: Float64Array, voiced: Uint8Array): Float64Array {
  const voicedVals: number[] = [];
  for (let i = 0; i < f0.length; i++) {
    if (voiced[i]) voicedVals.push(f0[i]!);
  }
  const med = voicedVals.length ? medianOf(voicedVals) : 1;
  const cents = new Float64Array(f0.length);
  for (let i = 0; i < f0.length; i++) {
    if (voiced[i]) cents[i] = 1200 * Math.log2(f0[i]! / med);
    else cents[i] = NaN;
  }
  return cents;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

const F0_MEDIAN_WIN = 3;

/** Incremental pitch tracker for live input. */
export class F0Tracker {
  private readonly frame: number;
  private readonly hop: number;
  private readonly lagMin: number;
  private readonly lagMax: number;
  private readonly window: Float64Array;
  private readonly nFft: number;
  private readonly nHalf: number;
  private readonly acfW: Float64Array;
  private readonly seg: Float64Array;
  private readonly acf: Float64Array;
  private readonly acfSpecIm: Float64Array;
  private readonly store: Float64Array;
  private readonly maxSamples: number;
  private buffer: Float64Array<ArrayBufferLike> = new Float64Array(0);
  private storeLen = 0;
  private nextFrame = 0;
  private rmsAll = 1e-12;
  private elapsedSamples = 0;
  private voicedSmooth: number[] = [];
  private readonly rate: number;

  constructor(rate: number, maxBufferSec = 15) {
    this.rate = rate;
    this.frame = Math.floor(FRAME_SEC * rate);
    this.hop = Math.floor(HOP_SEC * rate);
    this.lagMin = Math.max(2, Math.floor(rate / F0_MAX));
    this.lagMax = Math.min(Math.floor(this.frame / 2), Math.floor(rate / F0_MIN));
    this.window = hanning(this.frame);
    this.nFft = nFftForFrame(this.frame);
    this.nHalf = (this.nFft >> 1) + 1;
    this.acfW = windowAcf(this.window, this.nFft, this.lagMax);
    this.seg = new Float64Array(this.frame);
    this.acf = new Float64Array(this.lagMax + 2);
    this.acfSpecIm = new Float64Array(this.nHalf);
    this.maxSamples = Math.floor(rate * maxBufferSec);
    this.store = new Float64Array(this.maxSamples);
  }

  reset(): void {
    this.buffer = new Float64Array(0);
    this.storeLen = 0;
    this.nextFrame = 0;
    this.rmsAll = 1e-12;
    this.elapsedSamples = 0;
    this.voicedSmooth = [];
  }

  /** Append live mic chunk into a linear rolling buffer (production path). */
  pushSamples(samples: Float32Array): void {
    let overflow = this.storeLen + samples.length - this.maxSamples;
    if (overflow > 0 && this.hop > 0) {
      const drop = Math.min(
        this.storeLen,
        Math.ceil(overflow / this.hop) * this.hop,
      );
      if (drop > 0) {
        this.store.copyWithin(0, drop, this.storeLen);
        this.storeLen -= drop;
        this.nextFrame = Math.max(0, this.nextFrame - Math.floor(drop / this.hop));
      }
    }
    this.store.set(samples, this.storeLen);
    this.storeLen += samples.length;
    this.elapsedSamples += samples.length;
    this.buffer = this.store.subarray(0, this.storeLen);
    const maxFrame = Math.max(
      0,
      Math.floor((this.buffer.length - this.frame) / this.hop) + 1,
    );
    if (this.nextFrame > maxFrame) this.nextFrame = maxFrame;
  }

  /** Process frames not yet extracted from the buffer set by syncBuffer(). */
  append(): { t: number; f0: number; voiced: boolean; rawF0: number; rms: number }[] {
    let energySum = 0;
    for (let i = 0; i < this.buffer.length; i++) energySum += this.buffer[i]! * this.buffer[i]!;
    this.rmsAll = Math.sqrt(energySum / this.buffer.length) || 1e-12;

    const out: { t: number; f0: number; voiced: boolean; rawF0: number; rms: number }[] = [];
    while (this.nextFrame * this.hop + this.frame <= this.buffer.length) {
      const i = this.nextFrame;
      const start = i * this.hop;
      for (let j = 0; j < this.frame; j++) this.seg[j] = this.buffer[start + j]!;
      let mean = 0;
      for (let j = 0; j < this.frame; j++) mean += this.seg[j]!;
      mean /= this.frame;
      let rawRms = 0;
      for (let j = 0; j < this.frame; j++) {
        const v = this.seg[j]! - mean;
        rawRms += v * v;
      }
      rawRms = Math.sqrt(rawRms / this.frame);
      for (let j = 0; j < this.frame; j++) this.seg[j] = (this.seg[j]! - mean) * this.window[j]!;

      const energy = rms(this.seg);
      const streamSample = this.elapsedSamples - this.buffer.length + start + this.frame / 2;
      const t = streamSample / this.rate;
      if (energy < 0.1 * this.rmsAll) {
        this.voicedSmooth = [];
        out.push({ t, f0: 0, voiced: false, rawF0: 0, rms: rawRms });
        this.nextFrame++;
        continue;
      }

      const spec = rfft(this.seg, this.nFft);
      const power = magnitudeSquared(spec);
      this.acfSpecIm.fill(0);
      const acfSpec: Spectrum = { re: power, im: this.acfSpecIm };
      const acfFull = irfft(acfSpec, this.nFft);
      if (acfFull[0]! <= 0) {
        this.voicedSmooth = [];
        out.push({ t, f0: 0, voiced: false, rawF0: 0, rms: rawRms });
        this.nextFrame++;
        continue;
      }
      for (let k = 0; k < this.acf.length; k++) {
        this.acf[k] = acfFull[k]! / acfFull[0]! / Math.max(this.acfW[k]!, 0.1);
      }
      let lag = pickLag(this.acf, this.lagMin, this.lagMax);
      if (lag !== null) lag = foldToFundamental(this.acf, lag, this.lagMax, this.rate);
      if (lag === null || this.acf[Math.round(lag)]! < 0.35) {
        this.voicedSmooth = [];
        out.push({ t, f0: 0, voiced: false, rawF0: 0, rms: rawRms });
      } else {
        const raw = this.rate / lag;
        this.voicedSmooth.push(raw);
        if (this.voicedSmooth.length > F0_MEDIAN_WIN) this.voicedSmooth.shift();
        const f0 = medianOf(this.voicedSmooth);
        out.push({ t, f0, voiced: true, rawF0: raw, rms: rawRms });
      }
      this.nextFrame++;
    }
    return out;
  }

  /** Call after each audio chunk: sync buffer, adjust frame index, count new samples. */
  syncBuffer(audio: Float64Array, droppedFrames = 0, newSamples = 0): void {
    if (newSamples > 0) this.elapsedSamples += newSamples;
    this.buffer = audio;
    if (droppedFrames > 0) {
      this.nextFrame = Math.max(0, this.nextFrame - droppedFrames);
    }
    const maxFrame = Math.max(0, Math.floor((this.buffer.length - this.frame) / this.hop) + 1);
    if (this.nextFrame > maxFrame) this.nextFrame = maxFrame;
  }
}
