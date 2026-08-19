import { FRAME_SEC, HOP_SEC } from "./constants.ts";
import { hanning } from "./math.ts";
import { rfft, rfftfreq, magnitudeSquared, nFftForFrame } from "./fft.ts";

export function analyseH1H2(
  x: Float64Array,
  rate: number,
  f0: Float64Array,
  voiced: Uint8Array,
): number | null {
  const frame = Math.floor(FRAME_SEC * rate);
  const hop = Math.floor(HOP_SEC * rate);
  const nFft = nFftForFrame(frame * 4);
  const window = hanning(frame);
  const freqs = rfftfreq(nFft, 1 / rate);
  const vals: number[] = [];

  for (let i = 0; i < voiced.length; i++) {
    if (!voiced[i]) continue;
    const start = i * hop;
    if (start + frame > x.length) continue;
    const f = f0[i]!;
    if (f <= 0 || 2 * f >= rate / 2) continue;

    const seg = new Float64Array(nFft);
    for (let j = 0; j < frame; j++) seg[j] = x[start + j]! * window[j]!;
    const spec = magnitudeSquared(rfft(seg, nFft));
    const h: number[] = [];
    for (const k of [1, 2]) {
      const target = k * f;
      const band: number[] = [];
      for (let j = 0; j < freqs.length; j++) {
        if (freqs[j]! > target * 0.85 && freqs[j]! < target * 1.15) band.push(spec[j]!);
      }
      if (band.length === 0) break;
      h.push(20 * Math.log10(Math.max(...band) + 1e-20));
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
