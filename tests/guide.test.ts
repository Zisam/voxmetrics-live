import { describe, expect, it } from "vitest";
import {
  GUIDE_DISCLAIMER,
  GUIDE_SECTIONS,
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
});
