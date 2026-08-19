import { describe, expect, it } from "vitest";
import {
  acceptWorkerStreamMessage,
  centsReferenceHz,
  clearHudBaseline,
  ingestVoicedFrames,
  isNoteJump,
  pushRecentVoiced,
  refreshHudBaseline,
  seedBaseline,
} from "../src/ui/session.ts";

function baselineState() {
  return { hudBaselineHz: 0, recentVoicedHz: [] as number[] };
}

describe("acceptWorkerStreamMessage", () => {
  it("allows status and error when inactive", () => {
    expect(acceptWorkerStreamMessage("status", false)).toBe(true);
    expect(acceptWorkerStreamMessage("error", false)).toBe(true);
  });

  it("blocks stream data when inactive", () => {
    expect(acceptWorkerStreamMessage("f0", false)).toBe(false);
    expect(acceptWorkerStreamMessage("metrics", false)).toBe(false);
    expect(acceptWorkerStreamMessage("ltas", false)).toBe(false);
  });

  it("allows stream data when active", () => {
    expect(acceptWorkerStreamMessage("f0", true)).toBe(true);
  });
});

describe("hud baseline", () => {
  it("refreshes baseline immediately from voiced frames", () => {
    const state = baselineState();
    pushRecentVoiced(state, 440);
    pushRecentVoiced(state, 442);
    refreshHudBaseline(state);
    expect(state.hudBaselineHz).toBe(441);
  });

  it("preserves baseline on silence batch", () => {
    const state = baselineState();
    ingestVoicedFrames(state, [440]);
    ingestVoicedFrames(state, []);
    expect(state.hudBaselineHz).toBe(440);
    expect(state.recentVoicedHz).toEqual([440]);
  });

  it("resets baseline on large note jump", () => {
    const state = baselineState();
    ingestVoicedFrames(state, [440, 440, 440]);
    expect(isNoteJump(state, 880)).toBe(true);
    ingestVoicedFrames(state, [880]);
    expect(state.hudBaselineHz).toBe(880);
    expect(state.recentVoicedHz).toEqual([880]);
  });

  it("clears on stop helper", () => {
    const state = baselineState();
    seedBaseline(state, 440);
    clearHudBaseline(state);
    expect(state.hudBaselineHz).toBe(0);
  });

  it("uses live baseline for cents reference", () => {
    const state = baselineState();
    seedBaseline(state, 440);
    expect(centsReferenceHz(state, 466, true)).toBe(440);
  });
});

describe("ingestVoicedFrames", () => {
  it("updates baseline before cents would be computed in worker", () => {
    const state = baselineState();
    ingestVoicedFrames(state, [440]);
    expect(state.hudBaselineHz).toBe(440);
  });
});
