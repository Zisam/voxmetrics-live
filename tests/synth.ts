const RATE = 44100;

const HARMONICS: [number, number][] = [
  [1, 1.0],
  [2, 0.55],
  [3, 0.35],
  [4, 0.2],
  [5, 0.12],
  [8, 0.07],
  [10, 0.06],
  [11, 0.05],
];

export function synth(
  rateHz = 0,
  extentCents = 0,
  f0 = 293.66,
  dur = 6,
  harmonics: [number, number][] = HARMONICS,
): Float64Array {
  const n = Math.floor(RATE * dur);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const cents = (extentCents / 2) * Math.sin(2 * Math.PI * rateHz * t);
    const freq = f0 * 2 ** (cents / 1200);
    phase += (2 * Math.PI * freq) / RATE;
    let sig = 0;
    for (const [k, amp] of harmonics) sig += amp * Math.sin(k * phase);
    const fade = Math.min(Math.min(t / 0.15, (dur - t) / 0.15), 1);
    out[i] = sig * fade;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / (peak * 1.05);
  return out;
}

export { RATE };
