import { BUFFER_SECONDS } from "../dsp/constants.ts";

export interface AudioRing {
  data: Float64Array;
  capacity: number;
  start: number;
  length: number;
}

export function createAudioRing(sampleRate: number): AudioRing {
  const capacity = sampleRate * BUFFER_SECONDS;
  return { data: new Float64Array(capacity), capacity, start: 0, length: 0 };
}

export function resetAudioRing(ring: AudioRing): void {
  ring.start = 0;
  ring.length = 0;
}

/** Contiguous copy for offline analysis (called ~1 Hz). */
export function ringToArray(ring: AudioRing): Float64Array {
  if (ring.length === 0) return new Float64Array(0);
  if (ring.start + ring.length <= ring.capacity) {
    return ring.data.slice(ring.start, ring.start + ring.length);
  }
  const out = new Float64Array(ring.length);
  const first = ring.capacity - ring.start;
  out.set(ring.data.subarray(ring.start, ring.capacity));
  out.set(ring.data.subarray(0, ring.length - first), first);
  return out;
}

/**
 * View into ring when contiguous; otherwise null (tracker uses tail only).
 */
export function ringContiguousView(ring: AudioRing): Float64Array | null {
  if (ring.length === 0) return new Float64Array(0);
  if (ring.start + ring.length <= ring.capacity) {
    return ring.data.subarray(ring.start, ring.start + ring.length);
  }
  return null;
}

/** Last N samples as contiguous slice (may allocate once if wrapped). */
export function ringTail(ring: AudioRing, n: number): Float64Array {
  const take = Math.min(n, ring.length);
  if (take === 0) return new Float64Array(0);
  const end = (ring.start + ring.length) % ring.capacity;
  const start = (ring.start + ring.length - take) % ring.capacity;
  if (start < end || take === ring.length && ring.start + ring.length <= ring.capacity) {
    if (start < end) return ring.data.subarray(start, end);
    return ring.data.subarray(ring.start, ring.start + ring.length);
  }
  const out = new Float64Array(take);
  const first = ring.capacity - start;
  out.set(ring.data.subarray(start, ring.capacity));
  out.set(ring.data.subarray(0, take - first), first);
  return out;
}

export function appendAudioRing(
  ring: AudioRing,
  samples: Float32Array,
  sampleRate: number,
): number {
  const hop = Math.floor(0.005 * sampleRate);
  let droppedFrames = 0;

  const overflow = ring.length + samples.length - ring.capacity;
  if (overflow > 0) {
    const needDrop = overflow;
    const alignedDrop =
      hop > 0 ? Math.ceil(needDrop / hop) * hop : needDrop;
    const drop = Math.min(ring.length, alignedDrop);
    if (drop > 0) {
      ring.start = (ring.start + drop) % ring.capacity;
      ring.length -= drop;
      droppedFrames = hop > 0 ? Math.floor(drop / hop) : 0;
    }
  }

  for (let i = 0; i < samples.length; i++) {
    const idx = (ring.start + ring.length) % ring.capacity;
    ring.data[idx] = samples[i]!;
    ring.length++;
  }

  return droppedFrames;
}
