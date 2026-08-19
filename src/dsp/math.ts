export function hanning(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n <= 1) {
    if (n === 1) w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

export function nextPow2(n: number): number {
  return 1 << Math.ceil(Math.log2(n));
}

export function rms(arr: Float64Array): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i]! * arr[i]!;
  return Math.sqrt(s / arr.length);
}

export function median(values: Float64Array | number[]): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function medianFilter(values: Float64Array, size = 5): Float64Array {
  const odd = Math.max(3, size | 1);
  const half = odd >> 1;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const window: number[] = [];
    for (let j = i - half; j <= i + half; j++) {
      const idx = j < 0 ? 0 : j >= values.length ? values.length - 1 : j;
      window.push(values[idx]!);
    }
    window.sort((a, b) => a - b);
    out[i] = window[half]!;
  }
  return out;
}

export function convolveSame(signal: Float64Array, kernel: Float64Array): Float64Array {
  const n = signal.length;
  const m = kernel.length;
  const half = Math.floor(m / 2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < m; k++) {
      const j = i + k - half;
      if (j >= 0 && j < n) sum += signal[j]! * kernel[k]!;
    }
    out[i] = sum;
  }
  return out;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function hzToMidi(hz: number): number {
  return 12 * Math.log2(hz / 440) + 69;
}

export function midiToNoteLabel(midi: number): string {
  const idx = Math.round(midi);
  if (idx < 0 || idx > 127) return "";
  const note = NOTE_NAMES[((idx % 12) + 12) % 12]!;
  return `${note}${Math.floor(idx / 12) - 1}`;
}

export function noteName(hz: number | null): string {
  if (!hz || hz <= 0) return "—";
  const idx = Math.round(hzToMidi(hz));
  if (idx < 0 || idx > 127) return "—";
  return midiToNoteLabel(idx);
}
