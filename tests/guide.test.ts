import { describe, expect, it } from "vitest";
import {
  GUIDE_SECTIONS,
  VIBRATO_REFERENCES,
  guideSections,
  guideDisclaimer,
  vibratoTarget,
  type GuideMetricId,
} from "../src/ui/guide.ts";
import { GUIDE_SECTIONS_EN } from "../src/ui/guide-content-en.ts";
import { GUIDE_SECTIONS_JA } from "../src/ui/guide-content-ja.ts";
import { setLocale } from "../src/ui/i18n.ts";

const REQUIRED: GuideMetricId[] = [
  "start",
  "vibrato",
  "jitter",
  "tremolo",
  "singer",
  "cpp",
  "steady",
  "pitch",
];

const KNOWN_TRIGGER_KEYS = new Set([
  "first-run",
  "off-note",
  "noSignal",
  "tremolo",
  "vibFaster",
  "vibSlower",
  "vibNarrower",
  "vibWider",
  "vibSmoother",
  "holdNote",
  "pitchShaky",
  "volumeWobbling",
  "moreRing",
  "denserSound",
]);

const ACTIONABLE_HINTS = new Set([
  "noSignal",
  "tremolo",
  "vibFaster",
  "vibSlower",
  "vibNarrower",
  "vibWider",
  "vibSmoother",
  "holdNote",
  "pitchShaky",
  "volumeWobbling",
  "moreRing",
  "denserSound",
]);

function checkLocale(name: string, sections: typeof GUIDE_SECTIONS): void {
  describe(`guide content (${name})`, () => {
    it("covers every trainable aspect per locale", () => {
      const ids = sections.map((s) => s.id);
      for (const id of REQUIRED) expect(ids).toContain(id);
    });

    it("every section has intro and exercises with substantive steps", () => {
      for (const s of sections) {
        expect(s.title.length).toBeGreaterThan(1);
        expect(s.intro.length).toBeGreaterThan(10);
        expect(s.exercises.length).toBeGreaterThanOrEqual(1);
        for (const e of s.exercises) {
          expect(e.name.length).toBeGreaterThan(1);
          expect(e.steps.length).toBeGreaterThanOrEqual(2);
          for (const st of e.steps) expect(st.length).toBeGreaterThan(4);
        }
      }
    });

    it("triggers are locale-independent coach keys", () => {
      for (const s of sections) {
        for (const tr of s.triggers) {
          expect(KNOWN_TRIGGER_KEYS.has(tr), `${name}: ${tr}`).toBe(true);
        }
      }
    });

    it("every actionable coach hint has a guide section (praise excluded)", () => {
      const triggers = sections.flatMap((s) => s.triggers);
      for (const h of ACTIONABLE_HINTS) {
        expect(triggers, `${name}: ${h}`).toContain(h);
      }
    });

    it("vibrato section uses the shared reference table", () => {
      const vib = sections.find((s) => s.id === "vibrato")!;
      expect(vib.references).toBe("shared");
      expect(vib.target).toBe("shared");
    });
  });
}

checkLocale("ru", GUIDE_SECTIONS);
checkLocale("en", GUIDE_SECTIONS_EN);
checkLocale("ja", GUIDE_SECTIONS_JA);

describe("guide localization", () => {
  it("switches disclaimer and target by locale", () => {
    setLocale("ru");
    expect(guideDisclaimer()).toMatch(/гарантировать|нельзя/);
    expect(vibratoTarget()).toContain("5.5");

    setLocale("en");
    expect(guideDisclaimer()).toMatch(/guarantee/);
    expect(vibratoTarget()).toContain("83 BPM");
    expect(guideSections()).toBe(GUIDE_SECTIONS_EN);

    setLocale("ja");
    expect(guideDisclaimer()).toMatch(/保証/);
    expect(vibratoTarget()).toContain("83 BPM");
    expect(guideSections()).toBe(GUIDE_SECTIONS_JA);

    setLocale("ru");
    expect(guideSections()).toBe(GUIDE_SECTIONS);
  });
});

describe("vibrato references", () => {
  it("carries the performer measurements", () => {
    const ruki = VIBRATO_REFERENCES.find((r) => r.artist.includes("Ruki"))!;
    expect(ruki.source).toContain("Dogma");
    expect(ruki.measurements).toContainEqual({ hz: 5.8, cents: 190 });
    expect(ruki.measurements).toContainEqual({ hz: 5.3, cents: 132 });

    const chihara = VIBRATO_REFERENCES.find((r) =>
      r.artist.includes("茅原実里"),
    )!;
    expect(chihara.measurements).toContainEqual({ hz: 5.64, cents: 146 });
  });

  it("measurements cluster in the target zone", () => {
    for (const m of VIBRATO_REFERENCES.flatMap((r) => r.measurements)) {
      expect(m.hz).toBeGreaterThan(5);
      expect(m.hz).toBeLessThan(6);
      expect(m.cents).toBeGreaterThanOrEqual(130);
      expect(m.cents).toBeLessThanOrEqual(190);
    }
  });
});
