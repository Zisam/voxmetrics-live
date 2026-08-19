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

  const companion = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n - 1; i++) companion[i][i + 1] = 1;
  for (let i = 0; i < n; i++) companion[n - 1][i] = -c[n - i]!;

  let re = companion.map((row) => row.slice());
  let im = Array.from({ length: n }, () => new Float64Array(n));
  for (let iter = 0; iter < 200; iter++) {
    let maxOff = 0;
    for (let p = 0; p < n - 1; p++) {
      let colMax = 0;
      for (let i = p; i < n; i++) colMax = Math.max(colMax, Math.abs(re[i]![p]!));
      if (colMax === 0) continue;
      let pivot = p;
      for (let i = p + 1; i < n; i++) {
        if (Math.abs(re[i]![p]!) > Math.abs(re[pivot]![p]!)) pivot = i;
      }
      if (pivot !== p) {
        [re[p], re[pivot]] = [re[pivot]!, re[p]!];
        [im[p], im[pivot]] = [im[pivot]!, im[p]!];
      }
      const xRe = re[p]![p]!;
      const xIm = im[p]![p]!;
      const mag2 = xRe * xRe + xIm * xIm || 1e-20;
      for (let j = p; j < n; j++) {
        const numRe = re[p]![j]! * xRe + im[p]![j]! * xIm;
        const numIm = im[p]![j]! * xRe - re[p]![j]! * xIm;
        re[p]![j] = numRe / mag2;
        im[p]![j] = numIm / mag2;
      }
      for (let i = 0; i < n; i++) {
        if (i === p) continue;
        const factorRe = re[i]![p]!;
        const factorIm = im[i]![p]!;
        for (let j = p; j < n; j++) {
          re[i]![j] -= factorRe * re[p]![j]! - factorIm * im[p]![j]!;
          im[i]![j] -= factorRe * im[p]![j]! + factorIm * re[p]![j]!;
        }
      }
      maxOff = Math.max(maxOff, Math.abs(im[p]![p]!));
    }
    if (maxOff < 1e-10) break;
  }

  const roots: { re: number; im: number }[] = [];
  for (let i = 0; i < n; i++) roots.push({ re: re[i]![i]!, im: im[i]![i]! });
  return roots;
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
