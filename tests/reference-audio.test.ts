import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseBuffer } from "../src/dsp/analyse.ts";
import { analyseTremolo, suppressVibratoAm } from "../src/dsp/tremolo.ts";
import { trackF0 } from "../src/dsp/f0.ts";
import { analyseVibrato } from "../src/dsp/vibrato.ts";
import type { MetricsSnapshot } from "../src/types.ts";

/**
 * Regression tests against performer reference extracts (see guide
 * VIBRATO_REFERENCES). The WAVs are copyrighted recordings and are NOT
 * committed: they live in the gitignored tests/fixtures/ directory. Copy
 * the files locally to activate these tests; they skip on CI and clean
 * clones.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const REFERENCES: { file: string; vibRate: [number, number]; vibExtent: [number, number] }[] = [
  { file: "Makenai_vibrato_01.wav", vibRate: [5.2, 6.0], vibExtent: [120, 170] },
  { file: "DOGMA_vibrato_01.wav", vibRate: [5.3, 6.2], vibExtent: [160, 250] },
];

const available = REFERENCES.every((r) => existsSync(join(FIXTURES, r.file)));

function readWavMono(path: string): { rate: number; data: Float64Array } {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 12;
  let rate = 44100;
  let bits = 16;
  let channels = 1;
  let dataStart = -1;
  let dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = dv.getUint32(pos + 4, true);
    if (id === "fmt ") {
      channels = dv.getUint16(pos + 10, true);
      rate = dv.getUint32(pos + 12, true);
      bits = dv.getUint16(pos + 22, true);
    } else if (id === "data") {
      dataStart = pos + 8;
      dataLen = size;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (dataStart < 0) throw new Error("no data chunk: " + path);
  const bps = bits / 8;
  const n = Math.floor(dataLen / bps / channels);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let c = 0; c < channels; c++) {
      const off = dataStart + (i * channels + c) * bps;
      if (bits === 16) v += dv.getInt16(off, true) / 32768;
      else if (bits === 24) {
        const u = (buf[off + 2]! << 16) | (buf[off + 1]! << 8) | buf[off]!;
        v += (u & 0x800000 ? u - 0x1000000 : u) / 8388608;
      } else if (bits === 32) v += dv.getInt32(off, true) / 2147483648;
      else throw new Error("unsupported bit depth: " + bits);
    }
    out[i] = v / channels;
  }
  return { rate, data: out };
}

function frameEnvelope(sig: Float64Array, rate: number) {
  const frame = Math.floor(0.05 * rate);
  const hop = Math.floor(0.005 * rate);
  const nFrames = Math.floor((sig.length - frame) / hop) + 1;
  const frameRms = new Float64Array(nFrames);
  const voiced = new Uint8Array(nFrames);
  let allRms = 0;
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    for (let j = 0; j < frame; j++) {
      const v = sig[i * hop + j]!;
      s += v * v;
    }
    frameRms[i] = Math.sqrt(s / frame);
    allRms += frameRms[i]!;
  }
  allRms /= nFrames;
  for (let i = 0; i < nFrames; i++) {
    if (frameRms[i]! > 0.1 * allRms) voiced[i] = 1;
  }
  return { frameRms, voiced };
}

describe.skipIf(!available)(
  "performer reference fixtures (local only, gitignored)",
  { timeout: 30_000 },
  () => {
    it("measures the documented vibrato parameters on each reference", () => {
      for (const ref of REFERENCES) {
        const { rate, data } = readWavMono(join(FIXTURES, ref.file));
        const track = trackF0(data, rate);
        const vib = analyseVibrato(track.f0, track.voiced, rate);
        expect(vib, ref.file).not.toBeNull();
        expect(vib!.rate_hz, ref.file).toBeGreaterThan(ref.vibRate[0]);
        expect(vib!.rate_hz, ref.file).toBeLessThan(ref.vibRate[1]);
        expect(vib!.extent_cents_direct, ref.file).toBeGreaterThan(ref.vibExtent[0]);
        expect(vib!.extent_cents_direct, ref.file).toBeLessThan(ref.vibExtent[1]);
      }
    });

    it("genuine vibrato never reports tremolo through the full pipeline", () => {
      for (const ref of REFERENCES) {
        const { rate, data } = readWavMono(join(FIXTURES, ref.file));
        const { metrics }: { metrics: MetricsSnapshot } = analyseBuffer(data, rate);
        expect(metrics.tremolo, ref.file).toBeNull();
      }
    });

    it("raw AM side-effect on DOGMA_01 is suppressed by the vibrato gate", () => {
      const { rate, data } = readWavMono(join(FIXTURES, "DOGMA_vibrato_01.wav"));
      const { frameRms, voiced } = frameEnvelope(data, rate);
      const raw = analyseTremolo(frameRms, voiced, rate);
      // the measured side-effect: deep AM at the vibrato rate
      expect(raw).not.toBeNull();
      const track = trackF0(data, rate);
      const vib = analyseVibrato(track.f0, track.voiced, rate);
      expect(vib).not.toBeNull();
      expect(suppressVibratoAm(raw, vib!.rate_hz)).toBeNull();
    });

    it("DOGMA_vibrato_02 (short/fragmented) stays clean end-to-end", () => {
      const path = join(FIXTURES, "DOGMA_vibrato_02.wav");
      if (!existsSync(path)) return;
      const { rate, data } = readWavMono(path);
      const { metrics } = analyseBuffer(data, rate);
      expect(metrics.tremolo).toBeNull();
    });
  },
);

describe("reference fixtures availability", () => {
  it(
    "skips reference tests when local fixtures are absent (CI, clean clones)",
    () => {
      // WAV fixtures are gitignored (copyrighted recordings): the reference
      // suite runs only on machines with the files copied into
      // tests/fixtures/, and skips everywhere else.
      expect(available).toBe(existsSync(join(FIXTURES, REFERENCES[0]!.file)));
    },
  );
});
