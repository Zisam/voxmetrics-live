import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../src/types.ts";
import {
  MAX_SESSION_ENTRIES,
  SessionLog,
  TSV_HEADER,
  tsvFilename,
} from "../src/ui/session-log.ts";

function snapshot(over: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    when: "",
    duration_s: 6,
    sample_rate: 44100,
    voiced_share: 0.9,
    f0_median_hz: 220,
    vibrato: {
      rate_hz: 5.3,
      extent_cents_rms: 80,
      extent_cents_direct: 100,
      regularity: 0.75,
      steady_seconds: 5,
      center_hz: 220,
      trusted: true,
    },
    h1_h2_db: 4,
    sf_balance_db: -2,
    spectral_centroid_hz: 1200,
    formants_hz: [500, 1500, 2500],
    singer_formant_hz: 2800,
    singer_formant_db: 8,
    jitter_pct: 0.05,
    shimmer_db: 0.02,
    cpp_db: 5.5,
    tremolo: null,
    ...over,
  };
}

describe("SessionLog", () => {
  it("exports header and rows with tab separators", () => {
    const log = new SessionLog();
    log.add(snapshot(), new Date("2026-08-21T10:00:00Z"));
    const tsv = log.toTsv();
    const lines = tsv.split("\n");
    expect(lines[0]).toBe(TSV_HEADER);
    expect(lines).toHaveLength(2);

    const cols = lines[1]!.split("\t");
    expect(cols[0]).toBe("2026-08-21T10:00:00.000Z");
    expect(cols[1]).toBe("6");
    expect(cols[4]).toBe("5.3"); // vib_rate_hz
    expect(cols[5]).toBe("100"); // vib_extent_cents_direct
    expect(cols[6]).toBe("75"); // regularity as percent
    expect(cols[8]).toBe("1"); // trusted
    expect(cols[17]).toBe("500"); // f1
    // column count matches header
    expect(cols.length).toBe(TSV_HEADER.split("\t").length);
  });

  it("renders null metrics as empty cells, not NaN or 'null'", () => {
    const log = new SessionLog();
    log.add(
      snapshot({
        vibrato: null,
        tremolo: null,
        jitter_pct: null,
        singer_formant_hz: null,
        singer_formant_db: null,
        formants_hz: [],
      }),
      new Date("2026-08-21T10:00:00Z"),
    );
    const cols = log.toTsv().split("\n")[1]!.split("\t");
    expect(cols[4]).toBe(""); // vib_rate_hz
    expect(cols[8]).toBe(""); // vib_trusted
    expect(cols[9]).toBe(""); // tremolo_rate_hz
    expect(cols[11]).toBe(""); // jitter_pct
    expect(cols[17]).toBe(""); // f1
    expect(cols.every((c) => c !== "null" && c !== "NaN")).toBe(true);
  });

  it("clears between sessions and caps the buffer", () => {
    const log = new SessionLog();
    log.add(snapshot());
    expect(log.size()).toBe(1);
    log.clear();
    expect(log.size()).toBe(0);

    for (let i = 0; i < MAX_SESSION_ENTRIES + 50; i++) {
      log.add(snapshot({ duration_s: i }));
    }
    expect(log.size()).toBe(MAX_SESSION_ENTRIES);
    // oldest entries dropped: first remaining row has a later duration
    const first = log.toTsv().split("\n")[1]!.split("\t")[1]!;
    expect(Number(first)).toBe(50);
  });

  it("tremolo fields are exported when present", () => {
    const log = new SessionLog();
    log.add(snapshot({ tremolo: { rate_hz: 5.1, depth_db: 4.2 } }));
    const cols = log.toTsv().split("\n")[1]!.split("\t");
    expect(cols[9]).toBe("5.1");
    expect(cols[10]).toBe("4.2");
  });
});

describe("tsvFilename", () => {
  it("formats voxmetrics-YYYYMMDD-HHMM.tsv", () => {
    expect(tsvFilename(new Date("2026-08-21T09:05:00"))).toBe(
      "voxmetrics-20260821-0905.tsv",
    );
  });
});
