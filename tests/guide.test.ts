import { describe, expect, it } from "vitest";
import {
  GUIDE_DISCLAIMER,
  GUIDE_SECTIONS,
  VIBRATO_REFERENCES,
  type GuideMetricId,
} from "../src/ui/guide.ts";

describe("guide content", () => {
  it("has sections for every trainable aspect (shimmer covered by tremolo)", () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    const required: GuideMetricId[] = [
      "start",
      "vibrato",
      "jitter",
      "tremolo",
      "singer",
      "cpp",
      "steady",
      "pitch",
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it("every section has intro and at least one exercise with steps", () => {
    for (const s of GUIDE_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.intro.length).toBeGreaterThan(20);
      expect(s.exercises.length).toBeGreaterThanOrEqual(1);
      for (const e of s.exercises) {
        expect(e.name.length).toBeGreaterThan(3);
        expect(e.steps.length).toBeGreaterThanOrEqual(2);
        for (const st of e.steps) {
          expect(st.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("banner triggers reference actual coach hint texts", () => {
    // keep in sync with computeCoachHints outputs
    const knownHints = [
      "Не слышу голос!",
      "Качается громкость!",
      "Вибрато быстрее!",
      "Вибрато медленнее!",
      "Вибрато уже!",
      "Вибрато шире!",
      "Волна ровнее!",
      "Держите ноту!",
      "Высота дрожит!",
      "Громкость плывёт!",
      "Больше полётности!",
      "Плотнее звук!",
    ];
    const triggers = GUIDE_SECTIONS.flatMap((s) => s.triggers);
    for (const t of triggers) {
      if (t.startsWith("первый") || t.startsWith("мимо")) continue;
      expect(knownHints).toContain(t);
    }
    // reverse: every actionable hint must have a guide section (praise
    // banners excluded — they need no training advice)
    const praise = new Set(["Отлично!", "Чистый звук!"]);
    for (const h of knownHints) {
      if (praise.has(h)) continue;
      expect(triggers).toContain(h);
    }
  });

  it("disclaimer is honest: no guarantee promises, has safety note", () => {
    expect(GUIDE_DISCLAIMER).toContain("гарантировать");
    expect(GUIDE_DISCLAIMER).toContain("нельзя");
    expect(GUIDE_DISCLAIMER).toMatch(/дискомфорт|боль/);
    expect(GUIDE_DISCLAIMER).toMatch(/педагог|фониатр/);
  });

  it("vibrato section carries the performer references", () => {
    const vib = GUIDE_SECTIONS.find((s) => s.id === "vibrato")!;
    expect(vib.references).toBe(VIBRATO_REFERENCES);

    // Ruki (the GazettE, Dogma): 5.8/190 and 5.3/132
    const ruki = VIBRATO_REFERENCES.find((r) => r.artist.includes("Ruki"))!;
    expect(ruki.source).toContain("Dogma");
    expect(ruki.measurements).toContainEqual({ hz: 5.8, cents: 190 });
    expect(ruki.measurements).toContainEqual({ hz: 5.3, cents: 132 });

    // 茅原実里: 5.64/146
    const chihara = VIBRATO_REFERENCES.find((r) =>
      r.artist.includes("茅原実里"),
    )!;
    expect(chihara.measurements).toContainEqual({ hz: 5.64, cents: 146 });

    // target text names the 5.5 Hz / 150-cent zone and the overlay
    expect(vib.target).toContain("5.5 Гц");
    expect(vib.target).toContain("150 центов");
    expect(vib.target).toContain("±75");
  });

  it("references cluster around the target zone", () => {
    const all = VIBRATO_REFERENCES.flatMap((r) => r.measurements);
    for (const m of all) {
      expect(m.hz).toBeGreaterThan(5);
      expect(m.hz).toBeLessThan(6);
      expect(m.cents).toBeGreaterThanOrEqual(130);
      expect(m.cents).toBeLessThanOrEqual(190);
    }
  });
});
