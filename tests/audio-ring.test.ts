import { describe, expect, it } from "vitest";
import { BUFFER_SECONDS } from "../src/dsp/constants.ts";
import {
  appendAudioRing,
  createAudioRing,
  resetAudioRing,
  ringToArray,
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
