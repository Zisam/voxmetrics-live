import { describe, expect, it } from "vitest";
import {
  clearMetricsStore,
  getLatestLtas,
  getLatestMetrics,
  setLatestLtas,
  setLatestMetrics,
} from "../src/ui/metrics-store.ts";

describe("metrics-store", () => {
  it("stores and retrieves latest metrics", () => {
    clearMetricsStore();
    const metrics = {
      when: "",
      duration_s: 1,
      sample_rate: 44100,
      voiced_share: 0.9,
      f0_median_hz: 440,
      vibrato: null,
      h1_h2_db: 5,
      sf_balance_db: -2,
      spectral_centroid_hz: 1200,
      formants_hz: [500, 1500],
    };
    setLatestMetrics(metrics);
    expect(getLatestMetrics()).toEqual(metrics);
  });

  it("stores and retrieves latest LTAS", () => {
    clearMetricsStore();
    const ltas = { freqs: [100, 200], db: [-10, -12] };
    setLatestLtas(ltas);
    expect(getLatestLtas()).toEqual(ltas);
  });

  it("clears stored snapshots", () => {
    setLatestMetrics({
      when: "",
      duration_s: 0,
      sample_rate: 44100,
      voiced_share: 0,
      f0_median_hz: null,
      vibrato: null,
      h1_h2_db: null,
      sf_balance_db: null,
      spectral_centroid_hz: 0,
      formants_hz: [],
    });
    setLatestLtas({ freqs: [], db: [] });
    clearMetricsStore();
    expect(getLatestMetrics()).toBeNull();
    expect(getLatestLtas()).toBeNull();
  });
});
