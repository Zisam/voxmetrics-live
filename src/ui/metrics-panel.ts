import type { MetricsSnapshot, VibratoResult } from "../types.ts";
import { hzToMidi, midiToNoteLabel } from "../dsp/math.ts";

export interface LtasSnapshot {
  freqs: Float64Array;
  db: Float64Array;
}

export type QualityLevel = "" | "ok" | "good" | "warn";

export function vibRateLevel(hz: number): QualityLevel {
  if (hz >= 4.5 && hz <= 7.5) return "good";
  if (hz >= 3.5 && hz <= 9.5) return "ok";
  return "warn";
}

export function vibExtentLevel(cents: number): QualityLevel {
  if (cents >= 40 && cents <= 250) return "good";
  if (cents >= 20 && cents <= 400) return "ok";
  return "warn";
}

export function vibRegularityLevel(v: number): QualityLevel {
  if (v >= 0.6) return "good";
  if (v >= 0.35) return "ok";
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

function drawLtas(canvas: HTMLCanvasElement, ltas: LtasSnapshot): void {
  const cssW = canvas.clientWidth || 260;
  const cssH = canvas.clientHeight || 64;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const { freqs, db } = ltas;
  if (freqs.length < 3 || freqs.length !== db.length) return;

  const fMin = Math.max(freqs[1]!, 50);
  const fMax = freqs[freqs.length - 1]!;
  if (!(fMax > fMin)) return;
  const lMin = Math.log10(fMin);
  const lMax = Math.log10(fMax);

  let dMin = Infinity;
  let dMax = -Infinity;
  for (const v of db) {
    if (v < dMin) dMin = v;
    if (v > dMax) dMax = v;
  }
  if (!(dMax > dMin)) return;

  const toX = (f: number) =>
    ((Math.log10(Math.max(f, fMin)) - lMin) / (lMax - lMin)) * (cssW - 2) + 1;
  const toY = (v: number) =>
    cssH - 2 - ((v - dMin) / (dMax - dMin)) * (cssH - 6);

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
}

export function createMetricsPanel(root: HTMLElement): MetricsPanelHandle {
  root.innerHTML = `
    <section class="mcard">
      <h2>Вибрато</h2>
      <div class="mrow"><span class="mlabel">Частота</span><span class="mval" id="mv-vib-rate">—</span></div>
      <div class="mrow"><span class="mlabel">Размах</span><span class="mval" id="mv-vib-extent">—</span></div>
      <div class="mrow"><span class="mlabel">Регулярность</span><span class="mval" id="mv-vib-reg">—</span></div>
      <div class="mrow"><span class="mlabel">Ровный тон</span><span class="mval" id="mv-vib-steady">—</span></div>
      <p class="mhint" id="mv-vib-hint">Пойте одну ноту ≥ 4 с без перерыва</p>
    </section>
    <section class="mcard">
      <h2>Тон</h2>
      <div class="mrow"><span class="mlabel">Медиана F0</span><span class="mval" id="mv-tone-median">—</span></div>
      <div class="mrow"><span class="mlabel">Озвученность</span><span class="mval" id="mv-tone-voiced">—</span></div>
      <div class="mrow"><span class="mlabel">Окно анализа</span><span class="mval" id="mv-tone-window">—</span></div>
    </section>
    <section class="mcard">
      <h2>Спектр</h2>
      <div class="mrow"><span class="mlabel">H1−H2</span><span class="mval" id="mv-spec-h1h2">—</span></div>
      <div class="mrow"><span class="mlabel">Центроид</span><span class="mval" id="mv-spec-centroid">—</span></div>
      <div class="mrow"><span class="mlabel">S/F баланс</span><span class="mval" id="mv-spec-sf">—</span></div>
    </section>
    <section class="mcard">
      <h2>LTAS</h2>
      <canvas class="mltas" id="mv-ltas"></canvas>
    </section>
  `;

  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const vibRate = el("mv-vib-rate");
  const vibExtent = el("mv-vib-extent");
  const vibReg = el("mv-vib-reg");
  const vibSteady = el("mv-vib-steady");
  const vibHint = el("mv-vib-hint");
  const toneMedian = el("mv-tone-median");
  const toneVoiced = el("mv-tone-voiced");
  const toneWindow = el("mv-tone-window");
  const specH1h2 = el("mv-spec-h1h2");
  const specCentroid = el("mv-spec-centroid");
  const specSf = el("mv-spec-sf");
  const ltasCanvas = root.querySelector<HTMLCanvasElement>("#mv-ltas")!;

  function renderVibrato(v: VibratoResult | null): void {
    if (!v) {
      for (const el of [vibRate, vibExtent, vibReg, vibSteady]) {
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
    vibSteady.textContent = `${v.steady_seconds.toFixed(1)} с${
      v.trusted ? " · надёжно" : ""
    }`;
    setQuality(vibSteady, v.trusted ? "good" : "ok");
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
    },
    updateLtas(ltas: LtasSnapshot): void {
      drawLtas(ltasCanvas, ltas);
    },
    reset(): void {
      renderVibrato(null);
      for (const el of [toneMedian, toneVoiced, toneWindow, specH1h2, specCentroid, specSf]) {
        el.textContent = "—";
      }
      const ctx = ltasCanvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ltasCanvas.width, ltasCanvas.height);
      }
    },
  };
}
