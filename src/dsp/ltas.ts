import { rms } from "./math.ts";
import { hanning } from "./math.ts";
import { rfft, rfftfreq, magnitudeSquared } from "./fft.ts";

export function computeLtas(
  x: Float64Array,
  rate: number,
  nFft = 4096,
): { freqs: Float64Array; db: Float64Array } {
  if (x.length < nFft) {
    throw new Error(`запись короче окна LTAS (${nFft / rate} с)`);
  }
  const hop = nFft >> 1;
  const window = hanning(nFft);
  const acc = new Float64Array((nFft >> 1) + 1);
  let count = 0;
  const rmsAll = rms(x) || 1e-12;

  for (let start = 0; start <= x.length - nFft; start += hop) {
    const seg = new Float64Array(nFft);
    for (let i = 0; i < nFft; i++) seg[i] = x[start + i]!;
    if (rms(seg) < 0.1 * rmsAll) continue;
    for (let i = 0; i < nFft; i++) seg[i] = seg[i]! * window[i]!;
    const spec = magnitudeSquared(rfft(seg, nFft));
    for (let i = 0; i < acc.length; i++) acc[i] += spec[i]!;
    count++;
  }
  if (count === 0) throw new Error("не нашёл озвученных участков");

  const freqs = rfftfreq(nFft, 1 / rate);
  const db = new Float64Array(acc.length);
  for (let i = 0; i < acc.length; i++) {
    db[i] = 10 * Math.log10(acc[i]! / count + 1e-20);
  }
  return { freqs, db };
}

export function bandMeanDb(
  freqs: Float64Array,
  db: Float64Array,
  lo: number,
  hi: number,
): number | null {
  const vals: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! >= lo && freqs[i]! <= hi) vals.push(db[i]!);
  }
  if (vals.length === 0) return null;
  let sum = 0;
  for (const v of vals) sum += v;
  return sum / vals.length;
}

export function spectralCentroid(freqs: Float64Array, db: Float64Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < freqs.length; i++) {
    const w = 10 ** (db[i]! / 10);
    num += freqs[i]! * w;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : 0;
}
