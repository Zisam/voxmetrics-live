import { describe, expect, it } from "vitest";
import {
  analyseTremolo,
  TREMOLO_MIN_DEPTH_DB,
} from "../src/dsp/tremolo.ts";
import { synth, RATE } from "./synth.ts";

/** Frame-RMS envelope of a signal, voiced = frame above global rms floor. */
function frameEnvelope(
  sig: Float64Array,
): { frameRms: Float64Array; voiced: Uint8Array } {
  const frame = Math.floor(0.05 * RATE);
  const hop = Math.floor(0.005 * RATE);
  const nFrames = Math.floor((sig.length - frame) / hop) + 1;
  const frameRms = new Float64Array(nFrames);
  const voiced = new Uint8Array(nFrames);
  let allRms = 0;
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    for (let j = 0; j < frame; j++) {
      const v = sig[i * hop + j]!;
      s += v * v;
    }
    frameRms[i] = Math.sqrt(s / frame);
    allRms += frameRms[i]!;
  }
  allRms /= nFrames;
  for (let i = 0; i < nFrames; i++) {
    if (frameRms[i]! > 0.1 * allRms) voiced[i] = 1;
  }
  return { frameRms, voiced };
}

function toneWithAm(
  f0: number,
  amHz: number,
  depthDb: number,
  dur: number,
): Float64Array {
  const n = Math.floor(RATE * dur);
  const out = new Float64Array(n);
  const amDepth = (10 ** (depthDb / 20) - 1) / (10 ** (depthDb / 20) + 1);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * f0) / RATE;
    const am = 1 + amDepth * Math.sin(2 * Math.PI * amHz * t);
    out[i] = 0.5 * am * Math.sin(phase);
  }
  return out;
}

describe("analyseTremolo", () => {
  it("detects 5 Hz tremolo with correct rate and depth", () => {
    const sig = toneWithAm(220, 5, 6, 4);
    const { frameRms, voiced } = frameEnvelope(sig);
    const t = analyseTremolo(frameRms, voiced, RATE);
    expect(t).not.toBeNull();
    expect(t!.rate_hz).toBeGreaterThan(4.5);
    expect(t!.rate_hz).toBeLessThan(5.5);
    expect(t!.depth_db).toBeGreaterThan(3);
    expect(t!.depth_db).toBeLessThan(9);
  });

  it("returns null for steady tone without amplitude modulation", () => {
    const sig = synth(0, 0, 220, 4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });

  it("returns null for pitch vibrato with constant amplitude", () => {
    // vibrato modulates F0, not amplitude — must not read as tremolo
    const sig = synth(6, 150, 293.66, 4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });

  it("returns null when depth is below the reporting threshold", () => {
    const sig = toneWithAm(220, 5, TREMOLO_MIN_DEPTH_DB / 2, 4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });

  it("returns null for short voiced runs", () => {
    const sig = toneWithAm(220, 5, 6, 0.4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });
});
