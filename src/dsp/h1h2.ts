import { FRAME_SEC, HOP_SEC } from "./constants.ts";
import { hanning } from "./math.ts";
import { rfft, magnitudeSquared, nFftForFrame } from "./fft.ts";

export function analyseH1H2(
  x: Float64Array,
  rate: number,
  f0: Float64Array,
  voiced: Uint8Array,
  maxFrames = 120,
): number | null {
  const frame = Math.floor(FRAME_SEC * rate);
  const hop = Math.floor(HOP_SEC * rate);
  const nFft = nFftForFrame(frame * 4);
  const window = hanning(frame);
  const df = rate / nFft;
  const vals: number[] = [];

  const voicedIdx: number[] = [];
  for (let i = 0; i < voiced.length; i++) {
    if (!voiced[i]) continue;
    const start = i * hop;
    if (start + frame > x.length) continue;
    const f = f0[i]!;
    if (f <= 0 || 2 * f >= rate / 2) continue;
    voicedIdx.push(i);
  }
  const stride = Math.max(1, Math.ceil(voicedIdx.length / maxFrames));

  for (let j = 0; j < voicedIdx.length; j += stride) {
    const i = voicedIdx[j]!;
    const start = i * hop;
    const f = f0[i]!;

    const seg = new Float64Array(nFft);
    for (let k = 0; k < frame; k++) seg[k] = x[start + k]! * window[k]!;
    const spec = magnitudeSquared(rfft(seg, nFft));
    const h: number[] = [];
    for (const k of [1, 2]) {
      const target = k * f;
      const jStart = Math.max(1, Math.floor((target * 0.85) / df) + 1);
      const jEnd = Math.min(spec.length, Math.ceil((target * 1.15) / df));
      if (jStart >= jEnd) break;
      let peak = 0;
      for (let j = jStart; j < jEnd; j++) {
        if (spec[j]! > peak) peak = spec[j]!;
      }
      h.push(20 * Math.log10(peak + 1e-20));
    }
    if (h.length === 2) vals.push(h[0]! - h[1]!);
  }

  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  const med =
    vals.length % 2 === 0 ? (vals[mid - 1]! + vals[mid]!) / 2 : vals[mid]!;
  return Math.round(med * 100) / 100;
}
