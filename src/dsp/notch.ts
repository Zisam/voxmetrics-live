/**
 * Stateful narrow biquad notch (transposed direct form II). Processes chunks
 * in place, keeping filter state across calls — removes mains hum (50 Hz)
 * before pitch tracking without touching adjacent voice frequencies.
 */
export function createNotch(
  freqHz: number,
  sampleRate: number,
  q = 20,
): (x: Float32Array) => Float32Array {
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const norm = 1 / (1 + alpha);
  const b0 = norm;
  const b1 = -2 * cosw * norm;
  const b2 = norm;
  const a1 = -2 * cosw * norm;
  const a2 = (1 - alpha) * norm;

  let s1 = 0;
  let s2 = 0;

  return (x: Float32Array): Float32Array => {
    for (let i = 0; i < x.length; i++) {
      const xn = x[i]!;
      const y = b0 * xn + s1;
      s1 = b1 * xn - a1 * y + s2;
      s2 = b2 * xn - a2 * y;
      x[i] = y;
    }
    return x;
  };
}
