import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../src/types.ts";
import { computeCoachHints } from "../src/ui/coach.ts";

function snapshot(over: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    when: "",
    duration_s: 6,
    sample_rate: 44100,
    voiced_share: 0.9,
    f0_median_hz: 220,
    vibrato: {
      rate_hz: 5.5,
      extent_cents_rms: 80,
      extent_cents_direct: 100,
      regularity: 0.8,
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
    cpp_db: 12,
    tremolo: null,
    ...over,
  };
}

describe("computeCoachHints", () => {
  it("quiet/intermittent signal short-circuits everything", () => {
    const hints = computeCoachHints(snapshot({ voiced_share: 0.2 }));
    expect(hints.length).toBe(1);
    expect(hints[0]!.text).toBe("Не слышу голос!");
  });

  it("slow vibrato gets the speed hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, rate_hz: 3.2 } }),
    );
    expect(hints[0]!.text).toBe("Вибрато быстрее!");
  });

  it("fast vibrato gets the calm-down hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, rate_hz: 9 } }),
    );
    expect(hints[0]!.text).toBe("Вибрато медленнее!");
  });

  it("wide vibrato hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, extent_cents_direct: 400 } }),
    );
    expect(hints[0]!.text).toBe("Вибрато уже!");
  });

  it("barely visible vibrato hint", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({ vibrato: { ...v, extent_cents_direct: 15 } }),
    );
    expect(hints[0]!.text).toBe("Вибрато шире!");
  });

  it("tremolo outranks vibrato problems", () => {
    const v = snapshot().vibrato!;
    const hints = computeCoachHints(
      snapshot({
        tremolo: { rate_hz: 5, depth_db: 6 },
        vibrato: { ...v, rate_hz: 3 },
      }),
    );
    expect(hints[0]!.text).toBe("Качается громкость!");
  });

  it("high jitter gets support hint; tremolo suppresses shimmer duplicates", () => {
    const hints = computeCoachHints(snapshot({ jitter_pct: 0.4 }));
    expect(hints.some((h) => h.text === "Высота дрожит!")).toBe(true);

    const withTremolo = computeCoachHints(
      snapshot({
        tremolo: { rate_hz: 5, depth_db: 6 },
        jitter_pct: 0.4,
        shimmer_db: 0.2,
      }),
    );
    expect(withTremolo.some((h) => h.text === "Громкость плывёт!")).toBe(false);
    // pitch jitter is independent of amplitude tremolo — must survive
    expect(withTremolo.some((h) => h.text === "Высота дрожит!")).toBe(true);
  });

  it("no vibrato data and steady tone -> hold-the-note advice", () => {
    const hints = computeCoachHints(
      snapshot({ vibrato: null, singer_formant_db: 3, cpp_db: 3 }),
    );
    expect(hints.some((h) => h.text === "Держите ноту!")).toBe(true);
  });

  it("all-good yields praise first", () => {
    const hints = computeCoachHints(snapshot());
    expect(hints[0]!.level).toBe("good");
    expect(["Отлично!", "Чистый звук!"]).toContain(hints[0]!.text);
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

  it("hint texts are short game-style banners", () => {
    const v = snapshot().vibrato!;
    const cases: MetricsSnapshot[] = [
      snapshot({ voiced_share: 0.2 }),
      snapshot({ tremolo: { rate_hz: 5, depth_db: 6 } }),
      snapshot({ vibrato: { ...v, rate_hz: 3 } }),
      snapshot({ vibrato: { ...v, rate_hz: 10 } }),
      snapshot({ vibrato: { ...v, extent_cents_direct: 400 } }),
      snapshot({ vibrato: { ...v, extent_cents_direct: 15 } }),
      snapshot({ jitter_pct: 0.5 }),
      snapshot({ shimmer_db: 0.3 }),
      snapshot({ cpp_db: 2, singer_formant_db: 3 }),
      snapshot({ singer_formant_db: 3 }),
    ];
    const banned = ["цент", "дБ", "Гц", "%", "jitter", "shimmer", "CPP", "—"];
    for (const c of cases) {
      for (const h of computeCoachHints(c, 99)) {
        expect(h.text.length).toBeLessThanOrEqual(22);
        expect(h.text).toMatch(/[!…]$/);
        for (const b of banned) {
          expect(h.text).not.toContain(b);
        }
      }
    }
  });
});
