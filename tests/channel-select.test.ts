import { describe, expect, it } from "vitest";
import { pickChannel } from "../src/audio/channel-select.ts";

describe("pickChannel", () => {
  it("returns first channel for left selection on stereo input", () => {
    const l = new Float32Array([1, 1]);
    const r = new Float32Array([2, 2]);
    expect(pickChannel([l, r], "left")).toBe(l);
  });

  it("returns second channel for right selection on stereo input", () => {
    const l = new Float32Array([1, 1]);
    const r = new Float32Array([2, 2]);
    expect(pickChannel([l, r], "right")).toBe(r);
  });

  it("falls back to the only channel on mono input for right selection", () => {
    const mono = new Float32Array([3, 3]);
    expect(pickChannel([mono], "right")).toBe(mono);
    expect(pickChannel([mono], "left")).toBe(mono);
  });

  it("returns undefined for missing input", () => {
    expect(pickChannel(undefined, "right")).toBeUndefined();
    expect(pickChannel([], "left")).toBeUndefined();
  });
});
