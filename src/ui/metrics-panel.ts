import type { MetricsSnapshot, VibratoResult } from "../types.ts";
import { hzToMidi, midiToNoteLabel } from "../dsp/math.ts";
import {
  JITTER_GOOD_PCT,
  JITTER_OK_PCT,
  SHIMMER_GOOD_DB,
  SHIMMER_OK_DB,
  SINGER_FORMANT_CLUSTER,
  VIB_TRUSTED_SECONDS,
} from "../dsp/constants.ts";

export { JITTER_GOOD_PCT, SHIMMER_GOOD_DB, SHIMMER_OK_DB };

export interface LtasSnapshot {
  freqs: Float64Array;
  db: Float64Array;
}

export type QualityLevel = "" | "ok" | "good" | "warn";

/** Reference (target) thresholds — single source for levels AND UI text. */
export const VIB_RATE_GOOD: readonly [number, number] = [4.5, 7.5];
export const VIB_RATE_OK: readonly [number, number] = [3.5, 9.5];
export const VIB_EXTENT_GOOD: readonly [number, number] = [40, 250];
export const VIB_EXTENT_OK: readonly [number, number] = [20, 400];
export const VIB_REGULARITY_GOOD = 0.6;
export const VIB_REGULARITY_OK = 0.35;
export const VIB_STEADY_TRUSTED_SEC = VIB_TRUSTED_SECONDS;

export function fmtRangeRef(range: readonly [number, number], unit: string): string {
  return `норма ${range[0]}–${range[1]} ${unit}`;
}

export function vibRateLevel(hz: number): QualityLevel {
  if (hz >= VIB_RATE_GOOD[0] && hz <= VIB_RATE_GOOD[1]) return "good";
  if (hz >= VIB_RATE_OK[0] && hz <= VIB_RATE_OK[1]) return "ok";
  return "warn";
}

export function vibExtentLevel(cents: number): QualityLevel {
  if (cents >= VIB_EXTENT_GOOD[0] && cents <= VIB_EXTENT_GOOD[1]) return "good";
  if (cents >= VIB_EXTENT_OK[0] && cents <= VIB_EXTENT_OK[1]) return "ok";
  return "warn";
}

export function vibRegularityLevel(v: number): QualityLevel {
  if (v >= VIB_REGULARITY_GOOD) return "good";
  if (v >= VIB_REGULARITY_OK) return "ok";
  return "warn";
}

/** Cycle-period stability (CV) of the vibrato wave; lower = steadier tempo. */
export const VIB_PERIODCV_GOOD = 0.1;
export const VIB_PERIODCV_OK = 0.2;

export function vibPeriodCvLevel(cv: number): QualityLevel {
  if (cv <= VIB_PERIODCV_GOOD) return "good";
  if (cv <= VIB_PERIODCV_OK) return "ok";
  return "warn";
}

export function vibSteadyLevel(steadySec: number, trusted: boolean): QualityLevel {
  if (trusted || steadySec >= VIB_STEADY_TRUSTED_SEC) return "good";
  if (steadySec >= 1) return "ok";
  return "warn";
}

/** Singer's-formant ("ring") prominence thresholds, dB over local baseline. */
export const SINGER_FORMANT_GOOD_DB = 6;
export const SINGER_FORMANT_OK_DB = 3;
export const SINGER_FORMANT_BAND: readonly [number, number] =
  SINGER_FORMANT_CLUSTER;

/** Broad formant orientation ranges (vowel- and voice-type dependent). */
export const F1_RANGE: readonly [number, number] = [250, 1000];
export const F2_RANGE: readonly [number, number] = [850, 2800];
export const F3_RANGE: readonly [number, number] = [2200, 3200];

export function singerFormantLevel(prominenceDb: number): QualityLevel {
  if (prominenceDb >= SINGER_FORMANT_GOOD_DB) return "good";
  if (prominenceDb >= SINGER_FORMANT_OK_DB) return "ok";
  return "warn";
}

export function formantLevel(
  hz: number | undefined,
  range: readonly [number, number],
): QualityLevel {
  if (hz == null) return "";
  if (hz >= range[0] && hz <= range[1]) return "good";
  return "";
}

/**
 * CPP orientation, calibrated to THIS implementation's scale (verified on
 * glottal-like pulse trains: pure noise ~0.4 dB, HNR 0-6 dB → 2-4 dB,
 * HNR 12-24 dB → 4-7.5 dB). Higher pitch reads ~2 dB lower on the same
 * scale (f0 220 vs 110), so GOOD=4 stays reachable for high voices.
 * Not comparable with Praat exports.
 */
export const CPP_GOOD_DB = 4;
export const CPP_OK_DB = 2.5;

export function jitterLevel(pct: number): QualityLevel {
  if (pct <= JITTER_GOOD_PCT) return "good";
  if (pct <= JITTER_OK_PCT) return "ok";
  return "warn";
}

export function shimmerLevel(db: number): QualityLevel {
  if (db <= SHIMMER_GOOD_DB) return "good";
  if (db <= SHIMMER_OK_DB) return "ok";
  return "warn";
}

export function cppLevel(db: number): QualityLevel {
  if (db >= CPP_GOOD_DB) return "good";
  if (db >= CPP_OK_DB) return "ok";
  return "warn";
}

export function medianNoteLabel(hz: number | null): string {
  if (hz == null || hz <= 0) return "—";
  const label = midiToNoteLabel(hzToMidi(hz));
  return label || "—";
}

export function fmtDb(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)} дБ`;
}

export interface MetricsPanelHandle {
  update(metrics: MetricsSnapshot): void;
  updateLtas(ltas: LtasSnapshot): void;
  reset(): void;
}

function setQuality(el: HTMLElement, level: QualityLevel): void {
  el.className = `mval${level ? ` q-${level}` : ""}`;
}

const LTAS_GRID_HZ = [100, 1000, 10000];

function drawLtas(canvas: HTMLCanvasElement, ltas: LtasSnapshot): boolean {
  const cssW = canvas.clientWidth || 260;
  const cssH = canvas.clientHeight || 64;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { freqs, db } = ltas;
  if (freqs.length < 3 || freqs.length !== db.length) return false;

  const fMin = Math.max(freqs[1]!, 50);
  const fMax = freqs[freqs.length - 1]!;
  if (!(fMax > fMin)) return false;
  const lMin = Math.log10(fMin);
  const lMax = Math.log10(fMax);

  let dMin = Infinity;
  let dMax = -Infinity;
  for (const v of db) {
    if (v < dMin) dMin = v;
    if (v > dMax) dMax = v;
  }
  if (!(dMax > dMin)) return false;

  const toX = (f: number) =>
    ((Math.log10(Math.max(f, fMin)) - lMin) / (lMax - lMin)) * (cssW - 2) + 1;
  const toY = (v: number) =>
    cssH - 2 - ((v - dMin) / (dMax - dMin)) * (cssH - 6);

  ctx.strokeStyle = "#252a36";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7280";
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "left";
  for (const f of LTAS_GRID_HZ) {
    if (f <= fMin || f >= fMax) continue;
    const x = toX(f);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH - 9);
    ctx.stroke();
    const label = f >= 1000 ? `${f / 1000}к` : `${f}`;
    ctx.fillText(label, x + 2, cssH - 1);
  }

  ctx.beginPath();
  ctx.moveTo(toX(freqs[1]!), toY(db[1]!));
  for (let i = 2; i < freqs.length; i++) ctx.lineTo(toX(freqs[i]!), toY(db[i]!));
  ctx.strokeStyle = "#5b8def";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(toX(freqs[freqs.length - 1]!), cssH);
  ctx.lineTo(toX(freqs[1]!), cssH);
  ctx.closePath();
  ctx.fillStyle = "rgba(91, 141, 239, 0.15)";
  ctx.fill();
  return true;
}

export function createMetricsPanel(root: HTMLElement): MetricsPanelHandle {
  root.innerHTML = `
    <div class="mlegend">
      <span class="mchip q-good">норма</span>
      <span class="mchip q-ok">допустимо</span>
      <span class="mchip q-warn">вне нормы</span>
    </div>
    <section class="mcard">
      <h2>Вибрато</h2>
      <div class="mrow">
        <span class="mlabel">Частота</span>
        <span class="mstack">
          <span class="mval" id="mv-vib-rate">—</span>
          <span class="mref">${fmtRangeRef(VIB_RATE_GOOD, "Гц")}</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Размах</span>
        <span class="mstack">
          <span class="mval" id="mv-vib-extent">—</span>
          <span class="mref">${fmtRangeRef(VIB_EXTENT_GOOD, "центов")}</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Регулярность</span>
        <span class="mstack">
          <span class="mval" id="mv-vib-reg">—</span>
          <span class="mref">норма ≥ ${VIB_REGULARITY_GOOD * 100} %</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Стаб. темпа</span>
        <span class="mstack">
          <span class="mval" id="mv-vib-pcv">—</span>
          <span class="mref">норма ≤ ${Math.round(VIB_PERIODCV_GOOD * 100)} %</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Ровный тон</span>
        <span class="mstack">
          <span class="mval" id="mv-vib-steady">—</span>
          <span class="mref">надёжно ≥ ${VIB_STEADY_TRUSTED_SEC} с</span>
        </span>
      </div>
      <p class="mhint" id="mv-vib-hint">Пойте одну ноту ≥ ${VIB_STEADY_TRUSTED_SEC} с без перерыва</p>
    </section>
    <section class="mcard" title="Эталонных значений нет: зависит от голосового типа и гласного">
      <h2>Тон</h2>
      <div class="mrow">
        <span class="mlabel">Медиана F0</span>
        <span class="mstack">
          <span class="mval" id="mv-tone-median">—</span>
          <span class="mref">индивидуальна</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Озвученность</span>
        <span class="mstack">
          <span class="mval" id="mv-tone-voiced">—</span>
          <span class="mref">информативная</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Окно анализа</span>
        <span class="mstack">
          <span class="mval" id="mv-tone-window">—</span>
          <span class="mref">скользящее</span>
        </span>
      </div>
    </section>
    <section class="mcard" title="Форманты зависят от гласного и типа голоса — диапазоны ориентировочные">
      <h2>Резонанс</h2>
      <div class="mrow">
        <span class="mlabel">F1</span>
        <span class="mstack">
          <span class="mval" id="mv-f1">—</span>
          <span class="mref">~${F1_RANGE[0]}–${F1_RANGE[1]} Гц</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">F2</span>
        <span class="mstack">
          <span class="mval" id="mv-f2">—</span>
          <span class="mref">~${F2_RANGE[0]}–${F2_RANGE[1]} Гц</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">F3</span>
        <span class="mstack">
          <span class="mval" id="mv-f3">—</span>
          <span class="mref">~${F3_RANGE[0]}–${F3_RANGE[1]} Гц</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Певч. форманта</span>
        <span class="mstack">
          <span class="mval" id="mv-singer">—</span>
          <span class="mref">пик ${SINGER_FORMANT_BAND[0] / 1000}–${SINGER_FORMANT_BAND[1] / 1000} кГц · норма ≥ ${SINGER_FORMANT_GOOD_DB} дБ</span>
        </span>
      </div>
    </section>
    <section class="mcard" title="Стабильность на ровном тоне; абсолютные значения зависят от микрофона — сравнивайте тренд">
      <h2>Стабильность</h2>
      <div class="mrow">
        <span class="mlabel">Jitter</span>
        <span class="mstack">
          <span class="mval" id="mv-jitter">—</span>
          <span class="mref">норма ≤ ${JITTER_GOOD_PCT} %</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Shimmer</span>
        <span class="mstack">
          <span class="mval" id="mv-shimmer">—</span>
          <span class="mref">норма ≤ ${SHIMMER_GOOD_DB} дБ</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">CPP</span>
        <span class="mstack">
          <span class="mval" id="mv-cpp">—</span>
          <span class="mref">ориентир ≥ ${CPP_GOOD_DB} дБ</span>
        </span>
      </div>
    </section>
    <section class="mcard" title="Эталонных значений нет: сравнивайте свой тренд между подходами">
      <h2>Спектр</h2>
      <div class="mrow">
        <span class="mlabel">H1−H2</span>
        <span class="mstack">
          <span class="mval" id="mv-spec-h1h2">—</span>
          <span class="mref">тренд</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">Центроид</span>
        <span class="mstack">
          <span class="mval" id="mv-spec-centroid">—</span>
          <span class="mref">тренд</span>
        </span>
      </div>
      <div class="mrow">
        <span class="mlabel">S/F баланс</span>
        <span class="mstack">
          <span class="mval" id="mv-spec-sf">—</span>
          <span class="mref">тренд</span>
        </span>
      </div>
    </section>
    <section class="mcard" title="Усреднённый спектр окна анализа: где сосредоточена энергия голоса">
      <h2>LTAS · спектр</h2>
      <canvas class="mltas" id="mv-ltas"></canvas>
      <p class="mhint" id="mv-ltas-hint">Появится после ~2 с звука выше порога гейта</p>
    </section>
  `;

  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const vibRate = el("mv-vib-rate");
  const vibExtent = el("mv-vib-extent");
  const vibReg = el("mv-vib-reg");
  const vibPcv = el("mv-vib-pcv");
  const vibSteady = el("mv-vib-steady");
  const vibHint = el("mv-vib-hint");
  const toneMedian = el("mv-tone-median");
  const toneVoiced = el("mv-tone-voiced");
  const toneWindow = el("mv-tone-window");
  const specH1h2 = el("mv-spec-h1h2");
  const specCentroid = el("mv-spec-centroid");
  const specSf = el("mv-spec-sf");
  const f1 = el("mv-f1");
  const f2 = el("mv-f2");
  const f3 = el("mv-f3");
  const singer = el("mv-singer");
  const jitter = el("mv-jitter");
  const shimmer = el("mv-shimmer");
  const cpp = el("mv-cpp");
  const ltasCanvas = root.querySelector<HTMLCanvasElement>("#mv-ltas")!;
  const ltasHint = el("mv-ltas-hint");

  function renderVibrato(v: VibratoResult | null): void {
    if (!v) {
      for (const el of [vibRate, vibExtent, vibReg, vibPcv, vibSteady]) {
        el.textContent = "—";
        setQuality(el, "");
      }
      vibHint.classList.remove("hidden");
      return;
    }
    vibRate.textContent = `${v.rate_hz.toFixed(2)} Гц`;
    setQuality(vibRate, vibRateLevel(v.rate_hz));
    vibExtent.textContent = `${Math.round(v.extent_cents_direct)} ¢`;
    setQuality(vibExtent, vibExtentLevel(v.extent_cents_direct));
    if (v.regularity == null) {
      vibReg.textContent = "—";
      setQuality(vibReg, "");
    } else {
      vibReg.textContent = `${Math.round(v.regularity * 100)} %`;
      setQuality(vibReg, vibRegularityLevel(v.regularity));
    }
    if (v.period_cv == null) {
      vibPcv.textContent = "—";
      setQuality(vibPcv, "");
    } else {
      vibPcv.textContent = `${Math.round(v.period_cv * 100)} %`;
      setQuality(vibPcv, vibPeriodCvLevel(v.period_cv));
    }
    vibSteady.textContent = `${v.steady_seconds.toFixed(1)} с${
      v.trusted ? " · надёжно" : ""
    }`;
    setQuality(vibSteady, vibSteadyLevel(v.steady_seconds, v.trusted));
    vibHint.classList.toggle("hidden", v.trusted);
  }

  return {
    update(metrics: MetricsSnapshot): void {
      renderVibrato(metrics.vibrato);
      toneMedian.textContent = metrics.f0_median_hz
        ? `${metrics.f0_median_hz.toFixed(1)} Гц · ${medianNoteLabel(metrics.f0_median_hz)}`
        : "—";
      toneVoiced.textContent = `${Math.round(metrics.voiced_share * 100)} %`;
      toneWindow.textContent = `${metrics.duration_s.toFixed(1)} с`;
      specH1h2.textContent = fmtDb(metrics.h1_h2_db);
      specCentroid.textContent =
        metrics.spectral_centroid_hz > 0
          ? `${Math.round(metrics.spectral_centroid_hz)} Гц`
          : "—";
      specSf.textContent = fmtDb(metrics.sf_balance_db);

      const fHz = [metrics.formants_hz[0], metrics.formants_hz[1], metrics.formants_hz[2]];
      const fEls = [f1, f2, f3];
      const fRanges = [F1_RANGE, F2_RANGE, F3_RANGE];
      for (let i = 0; i < 3; i++) {
        const hz = fHz[i];
        fEls[i]!.textContent = hz != null ? `${Math.round(hz)} Гц` : "—";
        setQuality(fEls[i]!, formantLevel(hz, fRanges[i]!));
      }

      if (metrics.singer_formant_hz != null && metrics.singer_formant_db != null) {
        singer.textContent =
          `${(metrics.singer_formant_hz / 1000).toFixed(2)} кГц · ` +
          `${metrics.singer_formant_db >= 0 ? "+" : ""}${metrics.singer_formant_db.toFixed(1)} дБ`;
        setQuality(singer, singerFormantLevel(metrics.singer_formant_db));
      } else {
        singer.textContent = "—";
        setQuality(singer, "");
      }

      if (metrics.jitter_pct != null) {
        jitter.textContent = `${metrics.jitter_pct.toFixed(2)} %`;
        setQuality(jitter, jitterLevel(metrics.jitter_pct));
      } else {
        jitter.textContent = "—";
        setQuality(jitter, "");
      }
      if (metrics.shimmer_db != null) {
        shimmer.textContent = `${metrics.shimmer_db.toFixed(2)} дБ`;
        setQuality(shimmer, shimmerLevel(metrics.shimmer_db));
      } else {
        shimmer.textContent = "—";
        setQuality(shimmer, "");
      }
      if (metrics.cpp_db != null) {
        cpp.textContent = `${metrics.cpp_db.toFixed(1)} дБ`;
        setQuality(cpp, cppLevel(metrics.cpp_db));
      } else {
        cpp.textContent = "—";
        setQuality(cpp, "");
      }
    },
    updateLtas(ltas: LtasSnapshot): void {
      const drawn = drawLtas(ltasCanvas, ltas);
      ltasHint.classList.toggle("hidden", drawn);
    },
    reset(): void {
      renderVibrato(null);
      for (const el of [
        toneMedian,
        toneVoiced,
        toneWindow,
        specH1h2,
        specCentroid,
        specSf,
        f1,
        f2,
        f3,
        singer,
        jitter,
        shimmer,
        cpp,
      ]) {
        el.textContent = "—";
        setQuality(el, "");
      }
      const ctx = ltasCanvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ltasCanvas.width, ltasCanvas.height);
      }
      ltasHint.classList.remove("hidden");
    },
  };
}
