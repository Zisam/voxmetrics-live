import type { MetricsSnapshot } from "../types.ts";

export interface LtasSnapshot {
  freqs: number[];
  db: number[];
}

let latestMetrics: MetricsSnapshot | null = null;
let latestLtas: LtasSnapshot | null = null;

export function setLatestMetrics(metrics: MetricsSnapshot): void {
  latestMetrics = metrics;
}

export function setLatestLtas(ltas: LtasSnapshot): void {
  latestLtas = ltas;
}

export function getLatestMetrics(): MetricsSnapshot | null {
  return latestMetrics;
}

export function getLatestLtas(): LtasSnapshot | null {
  return latestLtas;
}

export function clearMetricsStore(): void {
  latestMetrics = null;
  latestLtas = null;
}
