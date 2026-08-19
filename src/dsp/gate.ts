/**
 * Stateful RMS noise gate with hysteresis and smoothed attack/release.
 * Detection runs on chunk input level (dBFS RMS); gain is a one-pole
 * envelope so the gate never clicks. Threshold is adjustable while running.
 */
export interface NoiseGate {
  process(x: Float32Array): Float32Array;
  setThresholdDb(db: number): void;
  getThresholdDb(): number;
}

const ATTACK_SEC = 0.005;
const RELEASE_SEC = 0.15;
/** Gate closes only when level falls this far below the open threshold. */
const HYSTERESIS_DB = 4;

export function createGate(sampleRate: number, thresholdDb = -50): NoiseGate {
  let threshold = thresholdDb;
  const attackCoef = Math.exp(-1 / (ATTACK_SEC * sampleRate));
  const releaseCoef = Math.exp(-1 / (RELEASE_SEC * sampleRate));
  let open = false;
  let gain = 0;

  return {
    process(x: Float32Array): Float32Array {
      if (x.length === 0) return x;

      let sumSq = 0;
      for (let i = 0; i < x.length; i++) sumSq += x[i]! * x[i]!;
      const db = 10 * Math.log10(sumSq / x.length + 1e-20);

      if (db >= threshold) open = true;
      else if (db < threshold - HYSTERESIS_DB) open = false;

      const target = open ? 1 : 0;
      for (let i = 0; i < x.length; i++) {
        const coef = target > gain ? attackCoef : releaseCoef;
        gain = target + (gain - target) * coef;
        x[i] = x[i]! * gain;
      }
      return x;
    },
    setThresholdDb(db: number): void {
      threshold = db;
    },
    getThresholdDb(): number {
      return threshold;
    },
  };
}
