import type { MetricsSnapshot } from "../types.ts";

/** One recorded metrics snapshot with a wall-clock timestamp. */
export interface SessionLogEntry {
  t: string;
  metrics: MetricsSnapshot;
}

/** Safety cap: ~2.8 hours of continuous recording at the 2 s cadence. */
export const MAX_SESSION_ENTRIES = 5000;

export const TSV_HEADER =
  "time\tduration_s\tvoiced_share\tf0_median_hz\tvib_rate_hz\tvib_extent_cents\tvib_regularity_pct\tvib_period_cv\tvib_steady_s\tvib_trusted\ttremolo_rate_hz\ttremolo_depth_db\tjitter_pct\tshimmer_db\tcpp_db\th1_h2_db\tsf_balance_db\tspectral_centroid_hz\tf1_hz\tf2_hz\tf3_hz\tsinger_formant_hz\tsinger_formant_db";

function num(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "" : String(v);
}

/** Session metrics recorder with TSV export for spreadsheet analysis. */
export class SessionLog {
  private entries: SessionLogEntry[] = [];

  add(metrics: MetricsSnapshot, now: Date = new Date()): void {
    this.entries.push({ t: now.toISOString(), metrics });
    if (this.entries.length > MAX_SESSION_ENTRIES) this.entries.shift();
  }

  clear(): void {
    this.entries.length = 0;
  }

  size(): number {
    return this.entries.length;
  }

  toTsv(): string {
    const lines = [TSV_HEADER];
    for (const e of this.entries) {
      const m = e.metrics;
      const v = m.vibrato;
      const tr = m.tremolo;
      lines.push(
        [
          e.t,
          num(m.duration_s),
          num(m.voiced_share),
          num(m.f0_median_hz),
          num(v?.rate_hz),
          num(v?.extent_cents_direct),
          v?.regularity == null ? "" : String(Math.round(v.regularity * 100)),
          num(v?.period_cv),
          num(v?.steady_seconds),
          v == null ? "" : v.trusted ? "1" : "0",
          num(tr?.rate_hz),
          num(tr?.depth_db),
          num(m.jitter_pct),
          num(m.shimmer_db),
          num(m.cpp_db),
          num(m.h1_h2_db),
          num(m.sf_balance_db),
          num(m.spectral_centroid_hz > 0 ? m.spectral_centroid_hz : null),
          num(m.formants_hz[0]),
          num(m.formants_hz[1]),
          num(m.formants_hz[2]),
          num(m.singer_formant_hz),
          num(m.singer_formant_db),
        ].join("\t"),
      );
    }
    return lines.join("\n");
  }
}

export function tsvFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `voxmetrics-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}.tsv`
  );
}
