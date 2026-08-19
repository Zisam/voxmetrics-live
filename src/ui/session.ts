import { median } from "../dsp/math.ts";
import { BASELINE_VOICED_SAMPLES } from "../dsp/constants.ts";

/** Cents threshold to treat a pitch change as a new note phrase. */
export const NOTE_JUMP_CENTS = 100;

export interface HudBaselineState {
  hudBaselineHz: number;
  recentVoicedHz: number[];
}

export function isNoteJump(state: HudBaselineState, f0Hz: number): boolean {
  if (state.hudBaselineHz <= 0) return false;
  return Math.abs(1200 * Math.log2(f0Hz / state.hudBaselineHz)) > NOTE_JUMP_CENTS;
}

export function pushRecentVoiced(state: HudBaselineState, f0Hz: number): void {
  state.recentVoicedHz.push(f0Hz);
  if (state.recentVoicedHz.length > BASELINE_VOICED_SAMPLES) {
    state.recentVoicedHz = state.recentVoicedHz.slice(-BASELINE_VOICED_SAMPLES);
  }
}

export function seedBaseline(state: HudBaselineState, f0Hz: number): void {
  state.recentVoicedHz = [f0Hz];
  state.hudBaselineHz = f0Hz;
}

export function refreshHudBaseline(state: HudBaselineState): void {
  if (!state.recentVoicedHz.length) {
    state.hudBaselineHz = 0;
    return;
  }
  state.hudBaselineHz = median(state.recentVoicedHz);
}

export function clearHudBaseline(state: HudBaselineState): void {
  state.recentVoicedHz = [];
  state.hudBaselineHz = 0;
}

export function ingestVoicedFrames(state: HudBaselineState, f0Values: number[]): void {
  if (!f0Values.length) return;
  for (const f0 of f0Values) {
    if (isNoteJump(state, f0)) seedBaseline(state, f0);
    else pushRecentVoiced(state, f0);
  }
  refreshHudBaseline(state);
}

export function centsReferenceHz(
  state: HudBaselineState,
  frameF0: number,
  voiced: boolean,
): number {
  if (state.hudBaselineHz > 0) return state.hudBaselineHz;
  if (voiced && frameF0 > 0) return frameF0;
  return 1;
}

export type StreamMessageType = "f0" | "metrics" | "ltas" | "status" | "error";

export function acceptWorkerStreamMessage(
  type: StreamMessageType,
  active: boolean,
): boolean {
  if (type === "status" || type === "error") return true;
  return active;
}
