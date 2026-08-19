import { describe, expect, it } from "vitest";
import { createGate } from "../src/dsp/gate.ts";
import { RATE } from "./synth.ts";

function makeSine(dbRms: number, seconds: number): Float32Array {
  const amp = 10 ** (dbRms / 20) * Math.SQRT2;
  const n = Math.floor(RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  }
  return out;
}

function rmsDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return 10 * Math.log10(s / x.length + 1e-20);
}

/** Process in worklet-sized chunks through a single stateful gate. */
function run(gate: ReturnType<typeof createGate>, x: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i += 4096) {
    gate.process(x.subarray(i, Math.min(i + 4096, x.length)));
  }
  return x;
}

describe("createGate", () => {
  it("passes signal above threshold (default -50 dB)", () => {
    const gate = createGate(RATE);
    const sig = makeSine(-30, 1);
    const expected = rmsDb(sig);
    const out = run(gate, sig);
    // skip attack transient: steady-state gain ≈ 1
    expect(rmsDb(out.subarray(RATE / 2))).toBeGreaterThan(expected - 0.2);
    expect(rmsDb(out.subarray(RATE / 2))).toBeLessThan(expected + 0.2);
  });

  it("mutes signal below threshold after release settles", () => {
    const gate = createGate(RATE);
    const out = run(gate, makeSine(-70, 1));
    expect(rmsDb(out.subarray(RATE / 2))).toBeLessThan(-100);
  });

  it("holds open inside the hysteresis band when already open", () => {
    const gate = createGate(RATE);
    const loud = run(gate, makeSine(-40, 0.3));
    expect(rmsDb(loud.subarray(loud.length - RATE / 10))).toBeGreaterThan(-41);

    // -52 dB is below -50 but above the -54 close threshold: stays open
    const band = makeSine(-52, 0.5);
    const expected = rmsDb(band);
    const out = run(gate, band);
    expect(rmsDb(out.subarray(RATE / 5))).toBeGreaterThan(expected - 1);
  });

  it("stays closed inside the hysteresis band when already closed", () => {
    const gate = createGate(RATE);
    const out = run(gate, makeSine(-52, 0.5));
    expect(rmsDb(out.subarray(RATE / 5))).toBeLessThan(-100);
  });

  it("applies threshold changes live", () => {
    const gate = createGate(RATE, -40);
    const first = run(gate, makeSine(-30, 0.3));
    expect(rmsDb(first.subarray(first.length - RATE / 10))).toBeGreaterThan(-31);

    gate.setThresholdDb(-20);
    expect(gate.getThresholdDb()).toBe(-20);
    const second = run(gate, makeSine(-30, 1.5));
    // after the 150 ms release tail the -30 dB signal is deeply attenuated
    expect(rmsDb(second.subarray(second.length - RATE / 4))).toBeLessThan(-90);
  });

  it("opens again after silence when signal returns", () => {
    const gate = createGate(RATE);
    run(gate, makeSine(-70, 0.5));
    const back = run(gate, makeSine(-35, 0.5));
    expect(rmsDb(back.subarray(back.length - RATE / 10))).toBeGreaterThan(-36);
  });

  it("attack settles to unity within ~5 ms (one-pole 63%)", () => {
    const gate = createGate(RATE, -60);
    const sig = makeSine(-30, 0.05); // 50 ms of loud signal
    const out = gate.process(sig);
    // after ~3 time constants (15 ms) gain should be within noise of unity
    const tail = out.subarray(Math.floor(RATE * 0.02));
    const expected = rmsDb(sig.subarray(Math.floor(RATE * 0.02)));
    expect(rmsDb(tail)).toBeGreaterThan(expected - 0.1);
  });

  it("handles empty chunks without state corruption", () => {
    const gate = createGate(RATE);
    run(gate, makeSine(-30, 0.2));
    expect(gate.process(new Float32Array(0)).length).toBe(0);
    const back = run(gate, makeSine(-30, 0.3));
    expect(rmsDb(back.subarray(back.length - RATE / 10))).toBeGreaterThan(-31);
  });
});
