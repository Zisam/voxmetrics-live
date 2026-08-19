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
}

function pickLag(acf: Float64Array, lagMin: number, lagMax: number, rel = 0.9): number | null {
  const hi = Math.min(lagMax, acf.length - 2);
  if (hi <= lagMin) return null;
  let best = -Infinity;
  for (let i = lagMin; i <= hi; i++) {
    if (acf[i]! > best) best = acf[i]!;
  }
  if (best <= 0) return null;

  for (let lag = lagMin; lag <= hi; lag++) {
    const val = acf[lag]!;
    if (val >= rel * best && val >= acf[lag - 1]! && val >= acf[lag + 1]!) {
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
  for (let i = lagMin + 1; i <= hi; i++) {
    if (acf[i]! > acf[argmax]!) argmax = i;
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
  const voiced = new Uint8Array(nFrames);

  const seg = new Float64Array(frame);
  for (let i = 0; i < nFrames; i++) {
    times[i] = (i * hop + frame / 2) / rate;
    for (let j = 0; j < frame; j++) seg[j] = x[i * hop + j]!;
    let mean = 0;
    for (let j = 0; j < frame; j++) mean += seg[j]!;
    mean /= frame;
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

    const lag = pickLag(acf, lagMin, lagMax);
    if (lag === null || acf[Math.round(lag)]! < 0.35) continue;

    f0[i] = rate / lag;
    voiced[i] = 1;
  }

  return { times, f0, voiced };
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

/** Incremental pitch tracker for live input. */
export class F0Tracker {
  private readonly frame: number;
  private readonly hop: number;
  private readonly lagMin: number;
  private readonly lagMax: number;
  private readonly window: Float64Array;
  private readonly nFft: number;
  private readonly acfW: Float64Array;
  private readonly seg: Float64Array;
  private buffer = new Float64Array(0);
  private nextFrame = 0;
  private rmsAll = 1e-12;
  private elapsedSamples = 0;
  private readonly rate: number;

  constructor(rate: number) {
    this.rate = rate;
    this.frame = Math.floor(FRAME_SEC * rate);
    this.hop = Math.floor(HOP_SEC * rate);
    this.lagMin = Math.max(2, Math.floor(rate / F0_MAX));
    this.lagMax = Math.min(Math.floor(this.frame / 2), Math.floor(rate / F0_MIN));
    this.window = hanning(this.frame);
    this.nFft = nFftForFrame(this.frame);
    this.acfW = windowAcf(this.window, this.nFft, this.lagMax);
    this.seg = new Float64Array(this.frame);
  }

  reset(): void {
    this.buffer = new Float64Array(0);
    this.nextFrame = 0;
    this.rmsAll = 1e-12;
    this.elapsedSamples = 0;
  }

  append(samples: Float32Array | Float64Array): { t: number; f0: number; voiced: boolean }[] {
    this.elapsedSamples += samples.length;

    let energySum = 0;
    for (let i = 0; i < this.buffer.length; i++) energySum += this.buffer[i]! * this.buffer[i]!;
    this.rmsAll = Math.sqrt(energySum / this.buffer.length) || 1e-12;

    const out: { t: number; f0: number; voiced: boolean }[] = [];
    while (this.nextFrame * this.hop + this.frame <= this.buffer.length) {
      const i = this.nextFrame;
      const start = i * this.hop;
      for (let j = 0; j < this.frame; j++) this.seg[j] = this.buffer[start + j]!;
      let mean = 0;
      for (let j = 0; j < this.frame; j++) mean += this.seg[j]!;
      mean /= this.frame;
      for (let j = 0; j < this.frame; j++) this.seg[j] = (this.seg[j]! - mean) * this.window[j]!;

      const energy = rms(this.seg);
      const streamSample = this.elapsedSamples - this.buffer.length + start + this.frame / 2;
      const t = streamSample / this.rate;
      if (energy < 0.1 * this.rmsAll) {
        out.push({ t, f0: 0, voiced: false });
        this.nextFrame++;
        continue;
      }

      const spec = rfft(this.seg, this.nFft);
      const power = magnitudeSquared(spec);
      const acfSpec: Spectrum = { re: power, im: new Float64Array(power.length) };
      const acfFull = irfft(acfSpec, this.nFft);
      const acf = new Float64Array(this.lagMax + 2);
      if (acfFull[0]! <= 0) {
        out.push({ t, f0: 0, voiced: false });
        this.nextFrame++;
        continue;
      }
      for (let k = 0; k < acf.length; k++) {
        acf[k] = acfFull[k]! / acfFull[0]! / Math.max(this.acfW[k]!, 0.1);
      }
      const lag = pickLag(acf, this.lagMin, this.lagMax);
      if (lag === null || acf[Math.round(lag)]! < 0.35) {
        out.push({ t, f0: 0, voiced: false });
      } else {
        out.push({ t, f0: this.rate / lag, voiced: true });
      }
      this.nextFrame++;
    }
    return out;
  }

  syncBuffer(audio: Float64Array, droppedFrames = 0): void {
    this.buffer = audio.slice();
    if (droppedFrames > 0) {
      this.nextFrame = Math.max(0, this.nextFrame - droppedFrames);
    }
    const maxFrame = Math.max(0, Math.floor((this.buffer.length - this.frame) / this.hop) + 1);
    if (this.nextFrame > maxFrame) this.nextFrame = maxFrame;
  }
}
