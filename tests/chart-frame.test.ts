import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createFrameScheduler,
  resetYRangeCache,
  yRangeWithHysteresis,
} from "../src/ui/chart-frame.ts";

describe("createFrameScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coalesces multiple schedule calls into one frame", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    let runs = 0;
    const { schedule } = createFrameScheduler(() => {
      runs++;
    });
    schedule();
    schedule();
    expect(runs).toBe(1);
  });
});

describe("yRangeWithHysteresis", () => {
  it("expands range when pitch goes outside cached bounds", () => {
    resetYRangeCache();
    const first = yRangeWithHysteresis([60, 72], 0);
    const second = yRangeWithHysteresis([48, 72], 100);
    expect(second[0]).toBeLessThan(first[0]!);
  });
});
