import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../src/types.ts";
import { computeCoachHints, coachText } from "../src/ui/coach.ts";
import { DICTS, fmt, type Locale, LOCALES } from "../src/ui/i18n.ts";

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
      period_cv: 0.08,
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

describe("computeCoachHints", () => {
  it("quiet/intermittent signal short-circuits everything", () => {
    const hints = computeCoachHints(snapshot({ voiced_share: 0.2 }));
    expect(hints.length).toBe(1);
    expect(hints[0]!.key).toBe("noSignal");
  });

  it("slow vibrato gets the speed hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, rate_hz: 3.2 } }),
    );
    expect(hints[0]!.key).toBe("vibFaster");
  });

  it("with a metronome target, drilling below the absolute band is fine", () => {
    const v = snapshot().vibrato!;
    // 60 BPM step = 4 Hz wave — below the 4.5 absolute floor
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, rate_hz: 4.0 } }),
      2,
      { targetWaveHz: 4.0 },
    );
    expect(hints.some((h) => h.key === "vibFaster")).toBe(false);
    expect(hints.some((h) => h.key === "inThePocket")).toBe(true);
  });

  it("metronome target tolerance is ±15 %", () => {
    const v = snapshot().vibrato!;
    // 4.0 target: 4.5 Hz is within +12.5 % → in the pocket
    expect(
      computeCoachHints(snapshot({ vibrato: { ...v, rate_hz: 4.5 } }), 2, {
        targetWaveHz: 4.0,
      }).some((h) => h.key === "inThePocket"),
    ).toBe(true);
    // 4.9 Hz is +22.5 % → too fast for the step
    expect(
      computeCoachHints(snapshot({ vibrato: { ...v, rate_hz: 4.9 } }), 2, {
        targetWaveHz: 4.0,
      }).some((h) => h.key === "vibSlower"),
    ).toBe(true);
    // 3.0 Hz is −25 % → behind the step
    expect(
      computeCoachHints(snapshot({ vibrato: { ...v, rate_hz: 3.0 } }), 2, {
        targetWaveHz: 4.0,
      }).some((h) => h.key === "vibFaster"),
    ).toBe(true);
  });

  it("fast vibrato gets the calm-down hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(snapshot({ vibrato: { ...v, rate_hz: 9 } }));
    expect(hints[0]!.key).toBe("vibSlower");
  });

  it("wide vibrato hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, extent_cents_direct: 400 } }),
    );
    expect(hints[0]!.key).toBe("vibNarrower");
  });

  it("barely visible vibrato hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, extent_cents_direct: 15 } }),
    );
    expect(hints[0]!.key).toBe("vibWider");
  });

  it("tremolo outranks vibrato problems", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({
        tremolo: { rate_hz: 5, depth_db: 6 },
        vibrato: { ...v, rate_hz: 3 },
      }),
    );
    expect(hints[0]!.key).toBe("tremolo");
  });

  it("high jitter gets support hint; tremolo suppresses shimmer duplicates", () => {
    const hints = computeCoachHints(snapshot({ jitter_pct: 0.4 }));
    expect(hints.some((h) => h.key === "pitchShaky")).toBe(true);

    const withTremolo = computeCoachHints(
      snapshot({
        tremolo: { rate_hz: 5, depth_db: 6 },
        jitter_pct: 0.4,
        shimmer_db: 0.2,
      }),
    );
    expect(withTremolo.some((h) => h.key === "volumeWobbling")).toBe(false);
    // pitch jitter is independent of amplitude tremolo — must survive
    expect(withTremolo.some((h) => h.key === "pitchShaky")).toBe(true);
  });

  it("no vibrato data and steady tone -> hold-the-note advice", () => {
    const hints = computeCoachHints(
      snapshot({ vibrato: null, singer_formant_db: 3, cpp_db: 3 }),
    );
    expect(hints.some((h) => h.key === "holdNote")).toBe(true);
  });

  it("all-good yields praise first", () => {
    const hints = computeCoachHints(snapshot());
    expect(hints[0]!.level).toBe("good");
    expect(["excellent", "cleanSound"]).toContain(hints[0]!.key);
  });

  it("on-step praise never masks a corrective warning", () => {
    const v = snapshot().vibrato!;
    // on the 83 BPM step but irregular — regularity advice must win
    const hints = computeCoachHints(
      snapshot({
        vibrato: { ...v, rate_hz: 5.5, regularity: 0.4 },
      }),
      2,
      { targetWaveHz: 5.53 },
    );
    expect(hints.some((h) => h.key === "vibSmoother")).toBe(true);
    expect(hints.some((h) => h.key === "inThePocket")).toBe(true);
    // the warn outranks the praise in the sorted slice
    expect(hints[0]!.level).toBe("warn");

    // on-step with shaky pitch: pitch advice outranks the praise too
    const shaky = computeCoachHints(
      snapshot({ jitter_pct: 0.4 }),
      2,
      { targetWaveHz: 5.53 },
    );
    expect(shaky[0]!.key).toBe("pitchShaky");
  });

  it("caps at two hints by priority", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({
        vibrato: { ...v, rate_hz: 3, extent_cents_direct: 400, regularity: 0.2 },
        jitter_pct: 0.5,
      }),
    );
    expect(hints.length).toBe(2);
  });
});

describe("coach banner texts across locales", () => {
  const cases: { key: Parameters<typeof coachText>[0]; ru: string }[] = [
    { key: "noSignal", ru: "Не слышу голос!" },
    { key: "tremolo", ru: "Качается громкость!" },
    { key: "vibFaster", ru: "Вибрато быстрее!" },
    { key: "holdNote", ru: "Держите ноту!" },
    { key: "excellent", ru: "Отлично!" },
  ];

  it("renders every hint in ru/en/ja without placeholders", () => {
    for (const c of cases) {
      expect(coachText(c.key, "ru")).toBe(c.ru);
      expect(coachText(c.key, "en").length).toBeGreaterThan(2);
      expect(coachText(c.key, "ja").length).toBeGreaterThan(2);
    }
  });
});

describe("i18n dictionary integrity", () => {
  it("every locale defines every key with the same shape", () => {
    const ruKeys = Object.keys(DICTS.ru).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(DICTS[locale]).sort(), locale).toEqual(ruKeys);
    }
  });

  it("no locale leaves raw RU in EN/JA values (spot check)", () => {
    const ruLetters = /[а-яА-ЯёЁ]/;
    for (const locale of ["en", "ja"] as Locale[]) {
      for (const [key, value] of Object.entries(DICTS[locale])) {
        expect(
          ruLetters.test(value),
          `${locale}.${key} contains Cyrillic`,
        ).toBe(false);
      }
    }
  });

  it("fmt replaces placeholders", () => {
    expect(fmt(DICTS.en.refRate, { lo: 4.5, hi: 7.5 })).toBe(
      "normal 4.5–7.5 Hz",
    );
    expect(fmt(DICTS.ja.refRegularity, { v: 60 })).toBe("正常 ≥ 60 %");
  });
});
