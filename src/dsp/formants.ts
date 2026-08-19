import {
  FORMANT_MAX_BW,
  FORMANT_MERGE_HZ,
} from "./constants.ts";
import { convolveSame, hanning, rms } from "./math.ts";

export function lowpassKernel(cutoffRatio: number, taps: number): Float64Array {
  taps = Math.max(3, taps | 1);
  const n = new Float64Array(taps);
  const center = (taps - 1) / 2;
  for (let i = 0; i < taps; i++) {
    const x = i - center;
    const sinc =
      x === 0 ? 2 * cutoffRatio : Math.sin(2 * Math.PI * cutoffRatio * x) / (Math.PI * x);
    n[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
  }
  let sum = 0;
  for (let i = 0; i < taps; i++) sum += n[i]!;
  for (let i = 0; i < taps; i++) n[i] = n[i]! / sum;
  return n;
}

export function levinson(r: Float64Array, order: number): Float64Array {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0]!;
  for (let i = 1; i <= order; i++) {
    let acc = r[i]!;
    for (let j = 1; j < i; j++) acc += a[j]! * r[i - j]!;
    const k = err !== 0 ? -acc / err : 0;
    const aNew = new Float64Array(order + 1);
    for (let j = 0; j <= order; j++) aNew[j] = a[j]!;
    for (let j = 1; j < i; j++) aNew[j] = a[j]! + k * a[i - j]!;
    aNew[i] = k;
    a.set(aNew);
    err *= 1 - k * k;
    if (err <= 0) break;
  }
  return a;
}

export function selectFormants(
  freqs: Float64Array,
  bws: Float64Array,
  nFormants: number,
): number[] {
  const fList: number[] = [];
  const bList: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! <= 90 || bws[i]! >= FORMANT_MAX_BW) continue;
    fList.push(freqs[i]!);
    bList.push(bws[i]!);
  }
  if (fList.length === 0) return [];

  const order = fList.map((_, i) => i).sort((a, b) => fList[a]! - fList[b]!);
  const mergedF: number[] = [];
  const mergedB: number[] = [];
  for (const idx of order) {
    const f = fList[idx]!;
    const b = bList[idx]!;
    if (mergedF.length && f - mergedF[mergedF.length - 1]! < FORMANT_MERGE_HZ) {
      if (b < mergedB[mergedB.length - 1]!) {
        mergedF[mergedF.length - 1] = f;
        mergedB[mergedB.length - 1] = b;
      }
      continue;
    }
    mergedF.push(f);
    mergedB.push(b);
  }
  return mergedF.slice(0, nFormants).map((f) => Math.round(f * 10) / 10);
}

function polyRoots(coeffs: Float64Array): { re: number; im: number }[] {
  const n = coeffs.length - 1;
  if (n <= 0) return [];

  const c = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) c[i] = coeffs[i]! / coeffs[0]!;

  type Cplx = { re: number; im: number };
  const roots: Cplx[] = [];
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * (k + 0.25)) / n;
    roots.push({ re: 0.85 * Math.cos(ang), im: 0.85 * Math.sin(ang) });
  }

  const evalAt = (z: Cplx): Cplx => {
    let re = c[n]!;
    let im = 0;
    for (let k = n - 1; k >= 0; k--) {
      const newRe = re * z.re - im * z.im + c[k]!;
      const newIm = re * z.im + im * z.re;
      re = newRe;
      im = newIm;
    }
    return { re, im };
  };

  const div = (a: Cplx, b: Cplx): Cplx => {
    const d = b.re * b.re + b.im * b.im || 1e-30;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };

  for (let iter = 0; iter < 80; iter++) {
    let maxDelta = 0;
    const next: Cplx[] = [];
    for (let i = 0; i < n; i++) {
      const z = roots[i]!;
      const p = evalAt(z);
      let denom: Cplx = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const diff = roots[j]!;
        denom = {
          re: denom.re * (z.re - diff.re) - denom.im * (z.im - diff.im),
          im: denom.re * (z.im - diff.im) + denom.im * (z.re - diff.re),
        };
      }
      const mag2 = denom.re * denom.re + denom.im * denom.im;
      const delta = mag2 < 1e-30 ? { re: 0, im: 0 } : div(p, denom);
      const upd = { re: z.re - delta.re, im: z.im - delta.im };
      next.push(upd);
      maxDelta = Math.max(maxDelta, Math.hypot(upd.re - z.re, upd.im - z.im));
    }
    for (let i = 0; i < n; i++) roots[i] = next[i]!;
    if (maxDelta < 1e-10) break;
  }

  return roots;
}

/** Exported for unit tests. */
export function findPolyRoots(coeffs: Float64Array): { re: number; im: number }[] {
  return polyRoots(coeffs);
}

function correlate(seg: Float64Array, order: number): Float64Array {
  const frame = seg.length;
  const out = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < frame - k; i++) sum += seg[i]! * seg[i + k]!;
    out[k] = sum;
  }
  return out;
}

export function analyseFormants(
  x: Float64Array,
  rate: number,
  nFormants = 3,
): number[] {
  const targetRate = 10000;
  const step = Math.max(1, Math.round(rate / targetRate));
  let y: Float64Array;
  let fs: number;
  if (step > 1) {
    const kernel = lowpassKernel(0.45 / step, 8 * step + 1);
    const filtered = convolveSame(x, kernel);
    const decimated = new Float64Array(Math.floor(filtered.length / step));
    for (let i = 0; i < decimated.length; i++) decimated[i] = filtered[i * step]!;
    y = decimated;
    fs = rate / step;
  } else {
    y = x;
    fs = rate;
  }

  const pre = new Float64Array(y.length);
  pre[0] = y[0]!;
  for (let i = 1; i < y.length; i++) pre[i] = y[i]! - 0.97 * y[i - 1]!;

  const order = 12;
  const frame = Math.floor(0.04 * fs);
  const hop = Math.floor(0.02 * fs);
  if (frame <= order + 1 || pre.length < frame) return [];

  const rmsAll = rms(pre) || 1e-12;
  const acc = new Float64Array(order + 1);
  let count = 0;
  const window = hanning(frame);

  for (let start = 0; start <= pre.length - frame; start += hop) {
    const seg = new Float64Array(frame);
    for (let i = 0; i < frame; i++) seg[i] = pre[start + i]! * window[i]!;
    if (rms(seg) < 0.1 * rmsAll) continue;
    const r = correlate(seg, order);
    if (r[0]! <= 0) continue;
    for (let i = 0; i <= order; i++) acc[i] += r[i]! / r[0]!;
    count++;
  }
  if (count === 0) return [];

  for (let i = 0; i <= order; i++) acc[i] = acc[i]! / count;
  const a = levinson(acc, order);
  const roots = polyRoots(a);

  const freqs: number[] = [];
  const bws: number[] = [];
  for (const root of roots) {
    if (root.im <= 0) continue;
    const angle = Math.atan2(root.im, root.re);
    const freq = (angle * fs) / (2 * Math.PI);
    const radius = Math.hypot(root.re, root.im);
    const bw = -(fs / Math.PI) * Math.log(Math.max(radius, 1e-12));
    if (freq < fs / 2 - 100) {
      freqs.push(freq);
      bws.push(bw);
    }
  }
  return selectFormants(new Float64Array(freqs), new Float64Array(bws), nFormants);
}
