import type { GuideSection } from "./guide.ts";

/** English guide content (mirror of the RU sections by id). */
export const GUIDE_SECTIONS_EN: GuideSection[] = [
  {
    id: "start",
    title: "Getting started",
    triggers: ["first-run", "noSignal"],
    intro:
      "Put on headphones, allow the microphone, pick the channel, and sing one note for 5 seconds while watching the curve. If the banner says “I can't hear you!” — sing louder or lower the gate threshold in the toolbar. Banners in the center of the screen tell you what to train right now. Warm up before every session: humming and sirens for 2–3 minutes.",
    exercises: [
      {
        name: "First test",
        steps: [
          "Sing a comfortable note and hold it for 5–10 seconds",
          "Keep the curve horizontal along a note line of the grid",
          "Earn the green “reliable” mark on the Vibrato card",
        ],
      },
    ],
  },
  {
    id: "vibrato",
    title: "Vibrato",
    triggers: ["vibFaster", "vibSlower", "vibNarrower", "vibWider", "vibSmoother"],
    intro:
      "Vibrato is not a mysterious gift — it is a rhythmic skill, like fast drum strokes: slow and controlled first, then speed up with a metronome until it runs on autopilot. That is how professionals build it (Ruki of the GazettE, by the way, started as a drummer). Target: ~5.5 Hz rate, 130–190 cents extent, tempo stability ≤ 10 % — the Vibrato card shows all three.",
    references: "shared",
    target: "shared",
    exercises: [
      {
        name: "Warm-up (2–3 minutes)",
        steps: [
          "Humming or lip rolls: 5–8 slides across your range",
          "Sirens on [u]: 6–8 smooth cycles, relaxed jaw",
        ],
      },
      {
        name: "Tempo ladder — the core exercise (in BPM)",
        steps: [
          "Conversion: 1 metronome click = every 4th wave cycle (the wave is like 16th notes). BPM = Hz × 15. Entry — 60 BPM (4 Hz, slow wave), target 5.5 Hz = 83 BPM",
          "Start: set 60 BPM and swing the pitch once per count syllable “1-and-and-and” — the click lands on “1”. Slow and precise beats fast",
          "If 60 feels easy — measure your base: sing 3–4 s of vibrato, multiply the card “Rate” by 15, start from the nearest lower step",
          "Ladder: 60 → 64 → 69 → 72 → 76 → 80 → 83 BPM (steps of 2–5 BPM = +0.15–0.35 Hz). The “Tempo” slider drives both the click and the sine",
          "“In the pocket”: when every 4th cycle matches the click exactly, the click “disappears” into your sound — the key sign of locking in",
          "Silent gaps: click 10 s → silent 5–10 s → back. Hold the tempo in silence; check “Tempo stab.” ≤ 10 %",
          "Around the click: one pass slightly ahead of the click, one slightly behind — builds the sense of “where the click is” (Mac Santiago method)",
          "Step cleared: stability ≤ 10 % and regularity ≥ 60 % two passes in a row",
          "Fine check: briefly double the click — every 2nd cycle (83 → 166 BPM), verify, return to the sparse click",
        ],
      },
      {
        name: "Portions or continuous? Both — different exercises",
        steps: [
          "Portions 4/4 (wave 4 beats → rest 4 beats): train clean wave attacks from silence and keep errors inside the portion. For vibrato this is the main thing — starting the wave is the weakest link",
          "Continuous 2–3 minutes: installs autopilot and exposes drift. This is the step exam, not the lesson",
          "Portion progression on a step: 4/4 → 8/8 → continuous",
        ],
      },
      {
        name: "Step scheme: 4 phases of 2–3 minutes (10–12 min)",
        steps: [
          "Phase 1 — Portions: wave 4 beats / rest 4 beats, 8–10 cycles (~3 min). Watch the cleanliness of every attack",
          "Phase 2 — Lengthening: 8 beats of wave / 8 of rest (~3 min). Attack plus short sustain",
          "Phase 3 — Continuous: wave without breaks, as long as breath allows (~2 min). Autopilot",
          "Phase 4 — Click-silence: click 4 bars → silent 4 bars → back (~2 min). Hold the tempo in silence",
          "Measure “Tempo stab.” in phase 4: period-CV during click silence proves the tempo is yours, not the metronome's",
          "Step passed: clean portions + 2 minutes continuous + stability ≤ 10 % in silence",
        ],
      },
      {
        name: "Without the metronome — mandatory",
        steps: [
          "End every day with a free pass (1–2 min): the wave holds its tempo by itself",
          "The metronome is a trainer, not a crutch: drummers warn about click dependence; the goal is an inner pulse, verified by the card",
        ],
      },
      {
        name: "Steps down — control check",
        steps: [
          "Reaching 83 BPM, come back to 69 and 60",
          "Being able to slow down without losing the wave = the tempo is under control, not “broke loose and ran”",
        ],
      },
      {
        name: "Displaced click — advanced",
        steps: [
          "Offset the clicks from the downbeat (metronome on a weak beat) and keep leading the wave",
          "A drumming trick: if the tempo holds on a displaced click, it is truly yours, not “sliding off someone else's”",
        ],
      },
      {
        name: "Dual task — the autopilot test",
        steps: [
          "Sing vibrato while counting out loud or tapping a different rhythm with a finger",
          "The wave survives with your mind busy — the program is on autopilot",
          "Falls apart — go one step down: autopilot is not consolidated yet",
        ],
      },
      {
        name: "Delayed vibrato",
        steps: [
          "Start the note straight, no wave, for 2 seconds",
          "Switch the wave on and carry it to the end of the breath",
          "The goal is a clean “straight → wave” switch on any ladder step",
        ],
      },
    ],
  },
  {
    id: "jitter",
    title: "Pitch shakiness",
    triggers: ["pitchShaky"],
    intro:
      "Fine pitch tremor usually means tension or weak breath support. Train a calm exhale and a relaxed larynx.",
    exercises: [
      {
        name: "Diaphragmatic breathing",
        steps: [
          "Hand on the belly, inhale through the nose over 4 counts — the belly rises",
          "Exhale on a steady “sss” for 8–16 counts",
          "Repeat 5 times before singing",
        ],
      },
      {
        name: "Candle",
        steps: [
          "Imagine a candle flame 20 cm in front of your face",
          "Blow at it steadily without putting it out, 15 seconds",
          "The same steady stream — on the vowel [u]",
        ],
      },
    ],
  },
  {
    id: "tremolo",
    title: "Volume wobble (tremolo)",
    triggers: ["tremolo", "volumeWobbling"],
    intro:
      "If loudness swings instead of pitch, the air flow is uneven or the sound “jumps” on the folds. The goal is even air pressure.",
    exercises: [
      {
        name: "Messa di voce",
        steps: [
          "One note: start soft, grow to loud, return to soft",
          "Smooth transitions, no jumps — 8–10 seconds total",
          "Then the same at a steady medium volume",
        ],
      },
      {
        name: "Counting on the exhale",
        steps: [
          "Steady exhale, count out loud from 1 to 15 at one volume",
          "Control the force with a hand on the belly, not the throat",
        ],
      },
    ],
  },
  {
    id: "singer",
    title: "Ring and resonance",
    triggers: ["moreRing"],
    intro:
      "“Ring” is a boosted upper spectrum — the voice sounds brighter and cuts through the space. The feeling of sound “in the mask”: vibration in the nose and lips area.",
    exercises: [
      {
        name: "Humming with a yawn",
        steps: [
          "A soft [m] at a comfortable pitch, mouth as at the start of a yawn",
          "Look for a tickle/vibration on the lips and around the nose",
          "1–2 minutes, then syllables “ma-me-mi-mo-mu” keeping the feeling",
        ],
      },
      {
        name: "Voiced consonants",
        steps: [
          "Sing [n] and the syllable [ng] on different vowels",
          "Carry the consonant's ring into the vowel without a “drop”",
        ],
      },
    ],
  },
  {
    id: "cpp",
    title: "Sound cleanliness",
    triggers: ["denserSound"],
    intro:
      "Breathiness — air bursts out before the tone. Start the sound cleanly: inhale — a beat of silence — straight into the tone.",
    exercises: [
      {
        name: "Clean attack",
        steps: [
          "Inhale through the nose, pause, then a clean vowel [a] with no “ha”",
          "Repeat 10 times on a comfortable note",
          "Watch the “CPP” card: rising = cleaner sound",
        ],
      },
    ],
  },
  {
    id: "steady",
    title: "Steady long tone",
    triggers: ["holdNote"],
    intro:
      "The foundation of everything: a note without breaks and without changing color. This is the support test.",
    exercises: [
      {
        name: "Pillar of sound",
        steps: [
          "One note for 10 seconds: one pitch, one volume, one color",
          "Record your best result of the session",
        ],
      },
    ],
  },
  {
    id: "pitch",
    title: "Intonation",
    triggers: ["off-note"],
    intro:
      "The curve on the chart is your tuner: keep it strictly on the target note line. Singing downward in tune is harder than upward.",
    exercises: [
      {
        name: "Hit the line",
        steps: [
          "Pick a note on the grid and “land” the curve on its line",
          "Hold 5 seconds so the curve does not slide off",
        ],
      },
      {
        name: "Scales downward",
        steps: [
          "Sing a major scale from the top note down",
          "Every step — on its own grid line, no “sliding”",
        ],
      },
    ],
  },
];
