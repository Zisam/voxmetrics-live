import { describe, expect, it } from "vitest";
import { BUFFER_SECONDS } from "../src/dsp/constants.ts";
import {
  appendAudioRing,
  createAudioRing,
  resetAudioRing,
  ringToArray,
  ringTail,
} from "../src/ui/audio-ring.ts";
import { RATE } from "./synth.ts";

describe("appendAudioRing", () => {
  it("appends without drop under capacity", () => {
    const ring = createAudioRing(RATE);
    const chunk = new Float32Array(1000).fill(0.1);
    expect(appendAudioRing(ring, chunk, RATE)).toBe(0);
    expect(ring.length).toBe(1000);
  });

  it("keeps fixed capacity and returns dropped frames", () => {
    const ring = createAudioRing(RATE);
    const maxSamples = RATE * BUFFER_SECONDS;
    const hop = Math.floor(0.005 * RATE);
    ring.length = maxSamples;

    const extra = hop * 3;
    const dropped = appendAudioRing(
      ring,
      new Float32Array(extra).fill(0.1),
      RATE,
    );

    expect(ring.length).toBe(maxSamples);
    expect(dropped).toBe(3);
  });

  it("ringToArray round-trips appended samples", () => {
    const ring = createAudioRing(RATE);
    appendAudioRing(ring, new Float32Array([1, 2, 3]), RATE);
    expect(Array.from(ringToArray(ring))).toEqual([1, 2, 3]);
  });

  it("reset clears length", () => {
    const ring = createAudioRing(RATE);
    appendAudioRing(ring, new Float32Array([1]), RATE);
    resetAudioRing(ring);
    expect(ring.length).toBe(0);
  });
});

describe("ringTail", () => {
  function seeded(
    capacity: number,
    start: number,
    length: number,
    contents: number[],
  ): ReturnType<typeof createAudioRing> {
    const data = new Float64Array(capacity);
    data.set(contents);
    return { data, capacity, start, length };
  }

  it("returns empty array for empty ring", () => {
    expect(ringTail(createAudioRing(RATE), 4).length).toBe(0);
  });

  it("returns contiguous tail when not wrapped", () => {
    // logical: data[2..7) = [3,4,5,6,7]
    const ring = seeded(8, 2, 5, [9, 9, 3, 4, 5, 6, 7, 9]);
    expect(Array.from(ringTail(ring, 3))).toEqual([5, 6, 7]);
  });

  it("returns wrapped tail spanning index 0", () => {
    // logical: data[6],data[7],data[0],data[1],data[2] = [7,8,1,2,3]
    const ring = seeded(8, 6, 5, [1, 2, 3, 9, 9, 9, 7, 8]);
    expect(Array.from(ringTail(ring, 4))).toEqual([8, 1, 2, 3]);
  });

  it("returns full ring via ringToArray when take equals length", () => {
    // logical: data[5..8) + data[0..2) = [6,7,8,3,4]
    const ring = seeded(8, 5, 5, [3, 4, 9, 9, 9, 6, 7, 8]);
    expect(Array.from(ringTail(ring, 5))).toEqual([6, 7, 8, 3, 4]);
  });

  it("handles wrapped tail ending exactly at capacity boundary", () => {
    // logical: data[3..8) = [4,5,6,7,8]; tail(4): start'=4, end'=0 → wrap branch
    const ring = seeded(8, 3, 5, [9, 9, 9, 4, 5, 6, 7, 8]);
    expect(Array.from(ringTail(ring, 4))).toEqual([5, 6, 7, 8]);
  });

  it("clamps take to available length", () => {
    const ring = seeded(8, 0, 3, [1, 2, 3, 0, 0, 0, 0, 0]);
    expect(Array.from(ringTail(ring, 100))).toEqual([1, 2, 3]);
  });
});
