import { nextPow2 } from "./math.ts";

/** In-place radix-2 Cooley-Tukey FFT. re/im length = n (power of 2). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm;
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
}

export function ifft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]!;
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n;
    im[i] = -im[i]! / n;
  }
}

export interface Spectrum {
  re: Float64Array;
  im: Float64Array;
}

export function rfft(input: Float64Array, nFft: number): Spectrum {
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const copyLen = Math.min(input.length, nFft);
  for (let i = 0; i < copyLen; i++) re[i] = input[i]!;
  fft(re, im);
  const half = (nFft >> 1) + 1;
  return { re: re.slice(0, half), im: im.slice(0, half) };
}

export function irfft(spec: Spectrum, nFft: number): Float64Array {
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const half = spec.re.length;
  for (let i = 0; i < half; i++) {
    re[i] = spec.re[i]!;
    im[i] = spec.im[i]!;
  }
  for (let i = 1; i < half - 1; i++) {
    re[nFft - i] = re[i]!;
    im[nFft - i] = -im[i]!;
  }
  ifft(re, im);
  return re;
}

export function rfftfreq(nFft: number, d: number): Float64Array {
  const half = (nFft >> 1) + 1;
  const out = new Float64Array(half);
  for (let i = 0; i < half; i++) out[i] = i / (d * nFft);
  return out;
}

export function magnitudeSquared(spec: Spectrum): Float64Array {
  const out = new Float64Array(spec.re.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = spec.re[i]! * spec.re[i]! + spec.im[i]! * spec.im[i]!;
  }
  return out;
}

export function nFftForFrame(frame: number): number {
  return nextPow2(2 * frame);
}
