import { describe, expect, it } from "vitest";
import {
  analyseTremolo,
  suppressVibratoAm,
  TREMOLO_VIB_RATE_TOL_HZ,
  TREMOLO_WITH_VIBRATO_MIN_DB,
} from "../src/dsp/tremolo.ts";
import { analyseBuffer } from "../src/dsp/analyse.ts";
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
    const sig = toneWithAm(220, 5, 1.5, 4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });

  it("returns null for short voiced runs", () => {
    const sig = toneWithAm(220, 5, 6, 0.4);
    const { frameRms, voiced } = frameEnvelope(sig);
    expect(analyseTremolo(frameRms, voiced, RATE)).toBeNull();
  });
});

describe("suppressVibratoAm (vibrato AM side-effect gate)", () => {
  it("keeps tremolo when there is no pitch vibrato", () => {
    const t = { rate_hz: 5, depth_db: 4 };
    expect(suppressVibratoAm(t, null)).toEqual(t);
  });

  it("suppresses AM at (nearly) the vibrato rate — natural vibrato side-effect", () => {
    // measured on DOGMA reference: AM 5.83 Hz 7.7 dB under 5.77 Hz vibrato
    expect(suppressVibratoAm({ rate_hz: 5.83, depth_db: 7.7 }, 5.77)).toBeNull();
    expect(
      suppressVibratoAm(
        { rate_hz: 5.5, depth_db: 9 },
        5.5 + TREMOLO_VIB_RATE_TOL_HZ,
      ),
    ).toBeNull();
  });

  it("suppresses shallow AM artifacts alongside vibrato", () => {
    // Makenai reference: AM 4.01 Hz 4.3 dB with 5.63 Hz vibrato
    expect(suppressVibratoAm({ rate_hz: 4.01, depth_db: 4.3 }, 5.63)).toBeNull();
  });

  it("keeps deep AM clearly off the vibrato rate — independent tremolo", () => {
    const t = { rate_hz: 4, depth_db: TREMOLO_WITH_VIBRATO_MIN_DB };
    expect(suppressVibratoAm(t, 6.5)).toEqual(t);
  });

  it("passes null through", () => {
    expect(suppressVibratoAm(null, null)).toBeNull();
    expect(suppressVibratoAm(null, 5)).toBeNull();
  });
});

describe("tremolo through analyseBuffer (end-to-end gate)", () => {
  it("real vibrato does not report tremolo", () => {
    const sig = synth(6, 150, 293.66, 5);
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.vibrato).not.toBeNull();
    expect(metrics.tremolo).toBeNull();
  });

  it("pure amplitude wobble without vibrato still reports tremolo", () => {
    // steady pitch, 5 Hz AM 6 dB — the "false vibrato" case
    const n = Math.floor(RATE * 4);
    const sig = new Float64Array(n);
    const amDepth = (10 ** (6 / 20) - 1) / (10 ** (6 / 20) + 1);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      phase += (2 * Math.PI * 220) / RATE;
      sig[i] = 0.5 * (1 + amDepth * Math.sin(2 * Math.PI * 5 * t)) * Math.sin(phase);
    }
    const { metrics } = analyseBuffer(sig, RATE);
    expect(metrics.vibrato).toBeNull();
    expect(metrics.tremolo).not.toBeNull();
  });
});
