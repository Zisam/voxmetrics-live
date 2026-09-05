import "./style.css";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { F0Point, WorkerOutMessage } from "./types.ts";
import { midiToNoteLabel } from "./dsp/math.ts";
import { createNotch } from "./dsp/notch.ts";
import { createGate, type NoiseGate } from "./dsp/gate.ts";
import {
  DEFAULT_Y_RANGE,
  panYRange,
  appendScrollingPitchPoints,
  clearPitchSeries,
  computeYRange,
  createScrollState,
  hudFromPoint,
  nowMarker,
  pitchXRange,
  resetScrollState,
  resolveHudPoint,
  tickWallScroll,
  zoomYRange,
} from "./ui/pitch-buffer.ts";
import {
  acceptWorkerStreamMessage,
} from "./ui/session.ts";
import { createMetricsPanel, type LtasSnapshot } from "./ui/metrics-panel.ts";
import { computeCoachHints } from "./ui/coach.ts";
import { renderGuide } from "./ui/guide.ts";
import {
  bpmToVibHz,
  computeVibratoGuide,
  drawClickMarks,
  drawVibratoGuide,
  VIB_REF_HZ,
  vibHzToBpm,
  visibleVoicedMedian,
} from "./ui/vibrato-guide.ts";
import { SessionLog, tsvFilename } from "./ui/session-log.ts";
import { metrikaGoal, metrikaParams } from "./ui/metrika.ts";
import { createMetronome, type Metronome } from "./ui/metronome.ts";
import {
  createFrameScheduler,
  resetYRangeCache,
  yRangeWithHysteresis,
} from "./ui/chart-frame.ts";

import {
  getLocale,
  LOCALES,
  LOCALE_LABELS,
  setLocale,
  storedLocale,
  t,
  fmt,
  type Locale,
} from "./ui/i18n.ts";
import { coachText, type CoachKey } from "./ui/coach.ts";

setLocale(storedLocale());

function toolbarHtml(d: ReturnType<typeof t>): string {
  return `
  <header class="toolbar">
    <div class="toolbar-left">
      <h1>voxmetrics live</h1>
      <button id="toggle" type="button">${d.startBtn}</button>
      <button id="guide-btn" type="button" class="guide-btn">${d.guideBtn}</button>
      <button id="metronome-btn" type="button" class="vib-guide-btn">${d.metronomeBtn}</button>
      <label class="gate-control">
        <span class="gate-label" id="tempo-label">${d.tempoLabel}</span>
        <input type="range" id="bpm" min="55" max="95" step="1" value="83" />
        <span class="gate-value" id="bpm-value">83 BPM · 5.5 ${d.hzUnit}</span>
      </label>
      <select id="locale" class="channel-select" title="Language / 言語">
        ${LOCALES.map((l) => `<option value="${l}">${LOCALE_LABELS[l]}</option>`).join("")}
      </select>
      <button id="toolbar-more-btn" type="button" class="toolbar-toggle" title="${d.moreBtn}" aria-label="${d.moreBtn}" aria-expanded="false">⋯</button>
      <div class="toolbar-extra" id="toolbar-extra">
        <select id="channel" class="channel-select">
          <option value="center">${d.channelCenter}</option>
          <option value="left">${d.channelLeft}</option>
          <option value="right">${d.channelRight}</option>
        </select>
        <label class="gate-control">
          <span class="gate-label" id="gate-label">${d.gateLabel}</span>
          <input type="range" id="gate" min="-90" max="-20" step="1" value="-50" />
          <span class="gate-value" id="gate-value">-50 ${d.dbUnit}</span>
        </label>
        <button id="vib-guide-btn" type="button" class="vib-guide-btn">${d.refBtn}</button>
        <label class="gate-control">
          <span class="gate-label" id="shift-label">${d.shiftLabel}</span>
          <input type="range" id="latency" min="0" max="300" step="5" value="120" />
          <span class="gate-value" id="latency-value">120 ${d.msUnit}</span>
        </label>
        <span id="status" class="status">${d.statusReady}</span>
        <span class="privacy" id="privacy">${d.privacy}</span>
      </div>
    </div>
  </header>
  <main class="stage">
    <div class="pitch-view">
      <div id="pitch-chart"></div>
      <div class="coach-banner" id="coach-banner"></div>
      <div class="hud" id="hud">
        <span class="hud-note" id="current-note">—</span>
        <span class="hud-cents" id="current-cents"></span>
        <span class="hud-hz" id="current-hz"></span>
      </div>
    </div>
    <aside class="metrics-panel" id="metrics-panel"></aside>
  </main>
  <div class="guide" id="guide" hidden></div>
  <footer class="footer">
    <button id="export-tsv" type="button" class="export-btn">${d.exportBtn}</button>
    <a href="https://github.com/Zisam/voxmetrics-live" target="_blank" rel="noreferrer">GitHub</a>
  </footer>`;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = toolbarHtml(t());

const channelSelectEl =
  document.querySelector<HTMLSelectElement>("#channel")!;
const gateSliderEl = document.querySelector<HTMLInputElement>("#gate")!;
const gateValueEl = document.querySelector<HTMLSpanElement>("#gate-value")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const currentNoteEl = document.querySelector<HTMLSpanElement>("#current-note")!;
const currentCentsEl = document.querySelector<HTMLSpanElement>("#current-cents")!;
const currentHzEl = document.querySelector<HTMLSpanElement>("#current-hz")!;
const pitchChartEl = document.querySelector<HTMLDivElement>("#pitch-chart")!;
const pitchViewEl = document.querySelector<HTMLElement>(".pitch-view")!;
const metricsPanelEl = document.querySelector<HTMLElement>("#metrics-panel")!;
let metricsPanel = createMetricsPanel(metricsPanelEl);
const toolbarEl = document.querySelector<HTMLElement>(".toolbar")!;
const moreBtnEl =
  document.querySelector<HTMLButtonElement>("#toolbar-more-btn")!;

function setToolbarExpanded(expanded: boolean, persist = true): void {
  toolbarEl.classList.toggle("expanded", expanded);
  moreBtnEl.setAttribute("aria-expanded", String(expanded));
  if (persist) {
    localStorage.setItem("voxmetrics.toolbar", expanded ? "1" : "0");
  }
}

if (localStorage.getItem("voxmetrics.toolbar") === "1") setToolbarExpanded(true);

moreBtnEl.addEventListener("click", () => {
  setToolbarExpanded(!toolbarEl.classList.contains("expanded"));
});

const SHEET_MIN_H = 56;
const footerEl = document.querySelector<HTMLElement>(".footer")!;

function footerH(): number {
  return footerEl.offsetHeight || 33;
}

function clampSheetH(h: number): number {
  const maxH = Math.max(SHEET_MIN_H, window.innerHeight - footerH() - 64);
  return Math.min(maxH, Math.max(SHEET_MIN_H, Math.round(h)));
}

function applySheetH(h: number): void {
  metricsPanelEl.style.setProperty("--sheet-h", `${clampSheetH(h)}px`);
}

function bindSheetHandle(): void {
  const handle = metricsPanelEl.querySelector<HTMLElement>("#sheet-handle");
  if (!handle) return;
  handle.setAttribute("aria-label", t().sheetResize);
  let startY = 0;
  let startH = 0;
  let dragging = false;
  const end = () => {
    if (!dragging) return;
    dragging = false;
    metricsPanelEl.classList.remove("dragging");
    localStorage.setItem(
      "voxmetrics.sheetH",
      String(metricsPanelEl.getBoundingClientRect().height),
    );
  };
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startH = metricsPanelEl.getBoundingClientRect().height;
    metricsPanelEl.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    applySheetH(startH + (startY - e.clientY));
  });
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

const savedSheetH = Number.parseFloat(
  localStorage.getItem("voxmetrics.sheetH") ?? "",
);
if (Number.isFinite(savedSheetH)) applySheetH(savedSheetH);
bindSheetHandle();

function syncSheetToViewport(): void {
  metricsPanelEl.style.setProperty("--sheet-bottom", `${footerH()}px`);
  applySheetH(metricsPanelEl.getBoundingClientRect().height);
}

syncSheetToViewport();
window.addEventListener("resize", syncSheetToViewport);
const coachBannerEl = document.querySelector<HTMLElement>("#coach-banner")!;
const guideEl = document.querySelector<HTMLElement>("#guide")!;
const guideBtnEl = document.querySelector<HTMLButtonElement>("#guide-btn")!;
const vibGuideBtnEl =
  document.querySelector<HTMLButtonElement>("#vib-guide-btn")!;
const metronomeBtnEl =
  document.querySelector<HTMLButtonElement>("#metronome-btn")!;
const gateLabelEl = document.querySelector<HTMLSpanElement>("#gate-label")!;
const tempoLabelEl = document.querySelector<HTMLSpanElement>("#tempo-label")!;
const shiftLabelEl = document.querySelector<HTMLSpanElement>("#shift-label")!;
const privacyEl = document.querySelector<HTMLSpanElement>("#privacy")!;
const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle")!;
const exportBtnEl = document.querySelector<HTMLButtonElement>("#export-tsv")!;
const sessionLog = new SessionLog();

// --- language switcher ---------------------------------------------------
const localeSelectEl = document.querySelector<HTMLSelectElement>("#locale")!;
localeSelectEl.value = getLocale();

/**
 * Update every text surface in place (no innerHTML swap: the uPlot canvas
 * and all listeners must survive). Rebuilds only the metrics panel and the
 * guide, which render their own markup.
 */
function applyLocale(locale: Locale): void {
  setLocale(locale);
  localStorage.setItem("voxmetrics.locale", locale);
  const d = t();

  toggleBtn.textContent = active ? d.stopBtn : d.startBtn;
  exportBtnEl.textContent = d.exportBtn;
  statusEl.textContent = d.statusReady;
  privacyEl.textContent = d.privacy;

  const channelOpts = channelSelectEl.options;
  channelOpts[0]!.textContent = d.channelCenter;
  channelOpts[1]!.textContent = d.channelLeft;
  channelOpts[2]!.textContent = d.channelRight;

  gateLabelEl.textContent = d.gateLabel;
  tempoLabelEl.textContent = d.tempoLabel;
  shiftLabelEl.textContent = d.shiftLabel;
  moreBtnEl.title = d.moreBtn;
  moreBtnEl.setAttribute("aria-label", d.moreBtn);
  refBtnEl.textContent = d.refBtn;
  metronomeBtnEl.textContent = d.metronomeBtn;
  guideBtnEl.textContent = d.guideBtn;

  applyGateThreshold();
  syncBpmLabel();
  applyLatency();

  metricsPanel = createMetricsPanel(metricsPanelEl);
  bindSheetHandle();
  renderGuide(guideEl);
  bindGuideClose();
  hideCoachBanner();
  pitchPlot.setData([pitchX, pitchMidi]);
}

localeSelectEl.addEventListener("change", (e) => {
  const locale = (e.target as HTMLSelectElement).value as Locale;
  applyLocale(locale);
  metrikaParams({ locale });
});

function setStatusRevealed(text: string): void {
  statusEl.textContent = text;
  if (!toolbarEl.classList.contains("expanded")) setToolbarExpanded(true, false);
}

function downloadTsv(): void {
  if (sessionLog.size() === 0) {
    setStatusRevealed(t().noMetricsYet);
    return;
  }
  const blob = new Blob([sessionLog.toTsv()], {
    type: "text/tab-separated-values",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = tsvFilename();
  document.body.append(a);
  a.click();
  a.remove();
  // revoke late: Safari/Firefox process the download async and abort on
  // immediate revocation
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  metrikaGoal("tsv-export");
  statusEl.textContent = fmt(t().downloadedRows, { n: sessionLog.size() });
}

exportBtnEl.addEventListener("click", downloadTsv);

const bpmSliderEl = document.querySelector<HTMLInputElement>("#bpm")!;
const bpmValueEl = document.querySelector<HTMLSpanElement>("#bpm-value")!;

const refBtnEl = vibGuideBtnEl;
const latencySliderEl =
  document.querySelector<HTMLInputElement>("#latency")!;
const latencyValueEl =
  document.querySelector<HTMLSpanElement>("#latency-value")!;

/** Pitch-trace latency compensation (s): leads the curve off the right
 * edge by the capture/processing delay so it aligns with wall-clock
 * overlays (click marks, sine). */
let voiceLatencySec = 0.06;

function storedLatencyMs(): number {
  const v = Number.parseFloat(
    localStorage.getItem("voxmetrics.latency") ?? "",
  );
  // default calibrated on MOTU M4 (worklet chunk + WASAPI shared-mode
  // input buffers): ~21 + ~100 ms
  if (!Number.isFinite(v)) return 120;
  return Math.min(300, Math.max(0, Math.round(v)));
}

function applyLatency(): void {
  const ms = Number.parseInt(latencySliderEl.value, 10);
  voiceLatencySec = ms / 1000;
  latencyValueEl.textContent = `${ms} ${t().msUnit}`;
  localStorage.setItem("voxmetrics.latency", String(ms));
}

latencySliderEl.value = String(storedLatencyMs());
latencySliderEl.addEventListener("input", applyLatency);
voiceLatencySec = storedLatencyMs() / 1000;
latencyValueEl.textContent = `${storedLatencyMs()} мс`;

/** Wave tempo in Hz — shared by the reference sine and the metronome. */
let refVibHz = VIB_REF_HZ;
let metronome: Metronome | null = null;

function storedBpm(): number {
  const v = Number.parseFloat(localStorage.getItem("voxmetrics.bpm") ?? "");
  if (!Number.isFinite(v)) return Math.round(vibHzToBpm(VIB_REF_HZ));
  return Math.min(95, Math.max(55, Math.round(v)));
}

function formatBpmLabel(bpm: number): string {
  return `${bpm} BPM · ${bpmToVibHz(bpm).toFixed(1)} ${t().hzUnit}`;
}

function applyBpm(restartMetronome: boolean): void {
  const bpm = Number.parseInt(bpmSliderEl.value, 10);
  refVibHz = bpmToVibHz(bpm);
  bpmValueEl.textContent = formatBpmLabel(bpm);
  localStorage.setItem("voxmetrics.bpm", String(bpm));
  if (restartMetronome && metronome?.isOn()) metronome.start(bpm);
  pitchPlot.setData([pitchX, pitchMidi]);
}

function syncBpmLabel(): void {
  bpmValueEl.textContent = formatBpmLabel(storedBpm());
}

function applyMetronomeState(): void {
  metronomeBtnEl.classList.toggle("on", metronome?.isOn() ?? false);
}

metronomeBtnEl.addEventListener("click", () => {
  if (!audioCtx || audioCtx.state === "closed") {
    setStatusRevealed(t().startMetronomeFirst);
    return;
  }
  if (!metronome) metronome = createMetronome(audioCtx);
  if (metronome.isOn()) {
    metronome.stop();
  } else {
    const bpm = Number.parseInt(bpmSliderEl.value, 10);
    metronome.start(bpm);
    metrikaGoal("metronome-on", { bpm });
  }
  applyMetronomeState();
});

bpmSliderEl.value = String(storedBpm());
// live-drag: retune the sine instantly; the metronome only restarts once
// the drag settles (change event) to avoid machine-gunning accent clicks
bpmSliderEl.addEventListener("input", () => applyBpm(false));
bpmSliderEl.addEventListener("change", () => applyBpm(true));
refVibHz = bpmToVibHz(storedBpm());
syncBpmLabel();

let vibGuideOn =
  localStorage.getItem("voxmetrics.vibguide") !== "0";

function applyVibGuideState(): void {
  vibGuideBtnEl.classList.toggle("on", vibGuideOn);
  localStorage.setItem("voxmetrics.vibguide", vibGuideOn ? "1" : "0");
}

vibGuideBtnEl.addEventListener("click", () => {
  vibGuideOn = !vibGuideOn;
  applyVibGuideState();
  pitchPlot.setData([pitchX, pitchMidi]);
});
applyVibGuideState();

renderGuide(guideEl);
function bindGuideClose(): void {
  guideEl
    .querySelector<HTMLButtonElement>(".guide-close")!
    .addEventListener("click", hideGuide);
}
bindGuideClose();
guideBtnEl.addEventListener("click", () => {
  guideEl.hidden ? showGuide() : hideGuide();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideGuide();
});

function showGuide(): void {
  guideEl.hidden = false;
  guideBtnEl.textContent = t().closeBtn;
}

function hideGuide(): void {
  guideEl.hidden = true;
  guideBtnEl.textContent = t().guideBtn;
}
let coachBannerText = "";
let coachBannerTimer: ReturnType<typeof setTimeout> | null = null;

function showCoachBanner(text: string, level: "good" | "warn" | "info"): void {
  if (text === coachBannerText) return;
  coachBannerText = text;
  coachBannerEl.textContent = text;
  coachBannerEl.className = "coach-banner";
  void coachBannerEl.offsetWidth;
  coachBannerEl.classList.add(level, "show");
  if (coachBannerTimer !== null) clearTimeout(coachBannerTimer);
  coachBannerTimer = setTimeout(() => {
    // allow the same hint to pop again while the problem persists
    coachBannerText = "";
    coachBannerTimer = null;
  }, 2800);
}

function hideCoachBanner(): void {
  coachBannerText = "";
  if (coachBannerTimer !== null) {
    clearTimeout(coachBannerTimer);
    coachBannerTimer = null;
  }
  coachBannerEl.className = "coach-banner";
  coachBannerEl.textContent = "";
}

const dspWorker = new Worker(new URL("./worker/dsp.ts", import.meta.url), {
  type: "module",
});
const analyserWorker = new Worker(
  new URL("./worker/analyser.ts", import.meta.url),
  { type: "module" },
);

let audioCtx: AudioContext | null = null;
let captureNode: AudioWorkletNode | null = null;
let stream: MediaStream | null = null;
let active = false;
let starting = false;
let notch: ((x: Float32Array) => Float32Array) | null = null;
let gate: NoiseGate | null = null;

type Channel = "left" | "right" | "center";

function normalizeChannel(v: string | null): Channel {
  return v === "left" || v === "right" || v === "center" ? v : "center";
}

function storedChannel(): Channel {
  return normalizeChannel(localStorage.getItem("voxmetrics.channel"));
}

channelSelectEl.value = storedChannel();

function applyChannelSelection(): void {
  const value = normalizeChannel(channelSelectEl.value);
  localStorage.setItem("voxmetrics.channel", value);
  captureNode?.port.postMessage({ type: "channel", value });
}

channelSelectEl.addEventListener("change", applyChannelSelection);

function storedGateDb(): number {
  const v = Number.parseFloat(localStorage.getItem("voxmetrics.gate") ?? "");
  if (!Number.isFinite(v)) return -50;
  return Math.min(-20, Math.max(-90, v));
}

function applyGateThreshold(): void {
  const db = Number.parseFloat(gateSliderEl.value);
  localStorage.setItem("voxmetrics.gate", String(db));
  gateValueEl.textContent = `${db} ${t().dbUnit}`;
  gate?.setThresholdDb(db);
}

gateSliderEl.value = String(storedGateDb());
gateSliderEl.addEventListener("input", applyGateThreshold);
applyGateThreshold();

const pitchX: number[] = [];
const pitchMidi: (number | null)[] = [];
const scrollState = createScrollState();
let pendingF0Batches: F0Point[][] = [];
let pendingHud: F0Point | null | undefined;
let chartLoopActive = false;

/** Manual Y view set by touch panning; null = auto-follow the voice. */
let manualY: [number, number] | null = null;

function renderChartFrame(): void {
  const wallSec = performance.now() / 1000;
  tickWallScroll(scrollState, pitchX, pitchMidi, wallSec);

  if (pendingF0Batches.length > 0) {
    const batches = pendingF0Batches;
    pendingF0Batches = [];
    let result = { hudPoint: null as F0Point | null, silenceBatch: true };
    for (const batch of batches) {
      result = appendScrollingPitchPoints(
        scrollState,
        pitchX,
        pitchMidi,
        batch,
        undefined,
        wallSec,
        voiceLatencySec,
      );
    }
    pendingHud = resolveHudPoint(result);
  }

  pitchPlot.setData([pitchX, pitchMidi]);
  if (pendingHud !== undefined) {
    applyHud(pendingHud);
    pendingHud = undefined;
  }
}

const chartFrame = createFrameScheduler(() => {
  renderChartFrame();
  if (chartLoopActive) chartFrame.schedule();
});

function startChartLoop(): void {
  chartLoopActive = true;
  chartFrame.schedule();
}

function stopChartLoop(): void {
  chartLoopActive = false;
  chartFrame.cancel();
}

function chartSize(): { width: number; height: number } {
  return {
    width: pitchViewEl.clientWidth,
    height: pitchViewEl.clientHeight,
  };
}

function drawNoteGrid(u: uPlot): void {
  const metAnchor = metronome?.isOn() ? metronome.anchorWallSec() : null;
  const metInterval = metronome?.isOn() ? metronome.beatIntervalSec() : null;
  if (metAnchor != null && metInterval != null) {
    drawClickMarks(u, metAnchor, metInterval, performance.now() / 1000);
  }
  if (vibGuideOn) {
    const center = visibleVoicedMedian(pitchMidi);
    drawVibratoGuide(
      u,
      center == null ? null : computeVibratoGuide(center, refVibHz),
      metAnchor != null
        ? { anchorWallSec: metAnchor, nowWallSec: performance.now() / 1000 }
        : null,
    );
  }
  const { ctx } = u;
  const yScale = u.scales.y;
  if (yScale.min == null || yScale.max == null) return;

  const left = u.bbox.left;
  const right = left + u.bbox.width;
  const lo = Math.ceil(yScale.min);
  const hi = Math.floor(yScale.max);

  for (let m = lo; m <= hi; m++) {
    const y = u.valToPos(m, "y", true);
    const isC = m % 12 === 0;
    ctx.strokeStyle = isC ? "#3d4455" : "#252a36";
    ctx.lineWidth = isC ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}

function drawNowMarker(u: uPlot): void {
  const marker = nowMarker(u.data[1] as (number | null)[]);
  if (!marker) return;

  const x = u.valToPos(marker.t, "x", true);
  const y = u.valToPos(marker.midi, "y", true);
  const { ctx } = u;

  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#6ee7b7";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
}

const pitchPlot = new uPlot(
  {
    ...chartSize(),
    // the inline legend table overflows the plot box and buries the footer
    // under it (intercepting clicks); it is redundant for a single series
    legend: { show: false },
    series: [
      {},
      {
        label: "высота",
        stroke: "#5b8def",
        width: 2,
        spanGaps: false,
      },
    ],
    scales: {
      x: { time: false, range: pitchXRange() },
      y: {
        range: (_u, _min, _max) =>
          manualY ??
          yRangeWithHysteresis(computeYRange(pitchMidi), performance.now()),
      },
    },
    axes: [
      {
        stroke: "#666",
        grid: { show: true, stroke: "#1e2230" },
        ticks: { show: true, stroke: "#444" },
        values: (_u, vals) =>
          vals.map((v) => (Number.isInteger(v) ? `${v} s` : "")),
      },
      {
        stroke: "#888",
        grid: { show: false },
        ticks: { show: false },
        size: 52,
        values: (_u, vals) =>
          vals.map((v) => {
            const rounded = Math.round(v);
            return Math.abs(v - rounded) < 0.01 ? midiToNoteLabel(rounded) : "";
          }),
        splits: (_u, _idx, min, max) => {
          const lo = Math.ceil(min);
          const hi = Math.floor(max);
          const splits: number[] = [];
          for (let m = lo; m <= hi; m++) splits.push(m);
          return splits;
        },
      },
    ],
    hooks: {
      drawClear: [(u) => drawNoteGrid(u)],
      draw: [(u) => drawNowMarker(u)],
    },
  },
  [[], []],
  pitchChartEl,
);

function applyHud(point: F0Point | null): void {
  const hud = hudFromPoint(point);
  currentNoteEl.textContent = hud.note;
  currentCentsEl.textContent = hud.cents;
  currentCentsEl.className = hud.centsClass;
  currentHzEl.textContent = hud.hz;
}

/** Return the chart to voice auto-follow (double-tap, session restart). */
function resetManualY(): void {
  manualY = null;
  resetYRangeCache();
  pitchPlot.setData([pitchX, pitchMidi]);
}

/** Touch drag pans the Y view; a two-finger pinch zooms it. */
function bindChartTouchGestures(): void {
  const PAN_SLOP_PX = 6;
  const DOUBLE_TAP_MS = 300;
  /** A gesture that moved the view less than this doesn't engage manual mode. */
  const MANUAL_ENGAGE_SEMITONES = 0.5;
  const touches = new Map<number, { x: number; y: number }>();
  let panPointerId: number | null = null;
  let panStartY = 0;
  let panStartRange: [number, number] | null = null;
  let pinchStartRange: [number, number] | null = null;
  let pinchStartDist = 0;
  let lastTapAt = 0;
  // per-gesture bookkeeping (first fingerdown → last fingerup)
  let tapEligible = false;
  let gestureDownY = 0;
  let gestureStartRange: [number, number] | null = null;
  let gestureStartManual = false;

  const currentYRange = (): [number, number] => {
    const s = pitchPlot.scales.y;
    return [s.min ?? DEFAULT_Y_RANGE[0], s.max ?? DEFAULT_Y_RANGE[1]];
  };

  const pinchDist = (): number => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const startPan = (pointerId: number): void => {
    panPointerId = pointerId;
    panStartY = touches.get(pointerId)!.y;
    panStartRange = currentYRange();
  };

  const startPinch = (): void => {
    panPointerId = null;
    panStartRange = null;
    pinchStartRange = currentYRange();
    pinchStartDist = pinchDist();
    tapEligible = false;
  };

  pitchViewEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    pitchViewEl.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) startPinch();
    else if (touches.size === 1) {
      tapEligible = true;
      gestureDownY = e.clientY;
      gestureStartRange = currentYRange();
      gestureStartManual = manualY != null;
      startPan(e.pointerId);
    }
  });

  pitchViewEl.addEventListener("pointermove", (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;

    if (pinchStartRange != null && touches.size >= 2) {
      if (pinchStartDist > 0) {
        // .u-over is positioned exactly over the plot area in CSS px
        const rect = pitchPlot.over.getBoundingClientRect();
        const [a, b] = [...touches.values()];
        const midY = (a.y + b.y) / 2;
        const anchorFromTop =
          rect.height > 0
            ? Math.min(1, Math.max(0, (midY - rect.top) / rect.height))
            : 0.5;
        manualY = zoomYRange(
          pinchStartRange,
          pinchDist() / pinchStartDist,
          anchorFromTop,
        );
        pitchPlot.setData([pitchX, pitchMidi]);
      }
      return;
    }

    if (e.pointerId === panPointerId && panStartRange != null) {
      const dy = t.y - panStartY;
      if (Math.abs(dy) <= PAN_SLOP_PX && manualY == null) return;
      tapEligible = false;
      // uPlot bbox is in canvas px; dy is in CSS px — match the units
      const plotCssH = pitchPlot.bbox.height / (window.devicePixelRatio || 1);
      manualY = panYRange(panStartRange, dy, plotCssH);
      pitchPlot.setData([pitchX, pitchMidi]);
    }
  });

  const end = (e: PointerEvent) => {
    if (!touches.delete(e.pointerId)) return;
    if (e.type === "pointercancel") {
      tapEligible = false;
      lastTapAt = 0;
    }
    if (touches.size >= 2) {
      // re-base the pinch on the remaining pair of fingers
      startPinch();
    } else if (touches.size === 1) {
      // pinch → pan handoff with the remaining finger
      pinchStartRange = null;
      const [id] = touches.keys();
      startPan(id);
    } else {
      panPointerId = null;
      panStartRange = null;
      pinchStartRange = null;
      if (tapEligible && Math.abs(e.clientY - gestureDownY) <= PAN_SLOP_PX) {
        // double-tap is the only way back to auto-follow: the manual view
        // persists after pan/zoom instead of auto-resuming
        if (manualY != null && e.timeStamp - lastTapAt <= DOUBLE_TAP_MS) {
          lastTapAt = 0;
          resetManualY();
        } else {
          lastTapAt = e.timeStamp;
        }
      } else if (
        !gestureStartManual &&
        manualY != null &&
        gestureStartRange != null &&
        Math.max(
          Math.abs(manualY[0] - gestureStartRange[0]),
          Math.abs(manualY[1] - gestureStartRange[1]),
        ) < MANUAL_ENGAGE_SEMITONES
      ) {
        // a sloppy tap (or a two-finger tap without zoom) must not silently
        // strand the chart in manual mode
        resetManualY();
      }
      tapEligible = false;
      gestureStartRange = null;
    }
  };

  pitchViewEl.addEventListener("pointerup", end);
  pitchViewEl.addEventListener("pointercancel", end);
  // safety net if a captured pointer is dropped without up/cancel
  pitchViewEl.addEventListener("lostpointercapture", end);
}

bindChartTouchGestures();

function clearChart(): void {
  stopChartLoop();
  resetScrollState(scrollState);
  resetYRangeCache();
  manualY = null;
  clearPitchSeries(pitchX, pitchMidi);
  pendingF0Batches = [];
  pendingHud = undefined;
  pitchPlot.setData([[], []]);
  applyHud(null);
  metricsPanel.reset();
  hideCoachBanner();
}

function updatePitchChart(points: F0Point[]): void {
  if (!points.length) return;
  pendingF0Batches.push(points);
  chartFrame.schedule();
}

function handleWorkerOut(msg: WorkerOutMessage): void {
  if (msg.type === "batch") {
    for (const part of msg.messages) {
      if (part.type === "batch") continue;
      handleWorkerOut(part);
    }
    return;
  }
  if (!acceptWorkerStreamMessage(msg.type, active)) return;
  if (msg.type === "status") {
    // worker sends dict keys, not display text
    const d = t() as unknown as Record<string, string>;
    statusEl.textContent = msg.message in d ? d[msg.message]! : msg.message;
  }
  if (msg.type === "f0") updatePitchChart(msg.points);
  if (msg.type === "metrics") {
    metricsPanel.update(msg.metrics);
    if (active) sessionLog.add(msg.metrics);
    const [top] = computeCoachHints(msg.metrics, 2, {
      targetWaveHz: metronome?.isOn()
        ? bpmToVibHz(Number.parseInt(bpmSliderEl.value, 10))
        : undefined,
    });
    if (top) {
      showCoachBanner(coachText(top.key as CoachKey, getLocale()), top.level);
    }
  }
  if (msg.type === "ltas") {
    const ltas: LtasSnapshot = { freqs: msg.freqs, db: msg.db };
    metricsPanel.updateLtas(ltas);
  }
  if (msg.type === "error") setStatusRevealed(`Ошибка: ${msg.message}`);
}

for (const worker of [dspWorker, analyserWorker]) {
  worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
    handleWorkerOut(ev.data);
  };
  worker.onerror = (ev) => {
    setStatusRevealed(
      `Ошибка worker: ${ev.message || "неизвестная ошибка"}`,
    );
    stop();
  };
}

function releasePartialStart(): void {
  captureNode?.port.close();
  captureNode?.disconnect();
  captureNode = null;
  notch = null;
  gate = null;
  metronome?.stop();
  metronome = null;
  dspWorker.postMessage({ type: "stop" });
  analyserWorker.postMessage({ type: "stop" });
  stopChartLoop();
  void audioCtx?.close();
  audioCtx = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function start(): Promise<void> {
  if (active || starting) return;
  starting = true;
  try {
    clearChart();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // mic granted: the previous session's exportable data is no longer needed
    sessionLog.clear();

    try {
      audioCtx = new AudioContext();
      await audioCtx.resume();

      await audioCtx.audioWorklet.addModule(
        new URL("./audio/capture-processor.js", import.meta.url),
      );

      dspWorker.postMessage({ type: "start", sampleRate: audioCtx.sampleRate });
      analyserWorker.postMessage({
        type: "start",
        sampleRate: audioCtx.sampleRate,
      });

      captureNode = new AudioWorkletNode(audioCtx, "capture-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      captureNode.port.postMessage({ type: "channel", value: storedChannel() });
      notch = createNotch(50, audioCtx.sampleRate);
      gate = createGate(audioCtx.sampleRate, storedGateDb());
      captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!notch || !gate) return;
        const samples = gate.process(notch(e.data));
        const copy = samples.slice();
        dspWorker.postMessage({ type: "audio", samples }, [samples.buffer]);
        analyserWorker.postMessage({ type: "audio", samples: copy }, [copy.buffer]);
      };

      const source = audioCtx.createMediaStreamSource(stream);
      const silent = audioCtx.createGain();
      silent.gain.value = 0;
      source.connect(captureNode);
      captureNode.connect(silent);
      silent.connect(audioCtx.destination);

      active = true;
      metrikaGoal("session-start");
      startChartLoop();
      stream.getAudioTracks()[0]?.addEventListener("ended", () => stop());
      toggleBtn.textContent = t().stopBtn;
    } catch (err) {
      releasePartialStart();
      throw err;
    }
  } finally {
    starting = false;
  }
}

function stop(): void {
  if (!active) return;
  active = false;
  notch = null;
  gate = null;
  metronome?.stop();
  metronome = null;
  applyMetronomeState();
  dspWorker.postMessage({ type: "stop" });
  analyserWorker.postMessage({ type: "stop" });
  captureNode?.port.close();
  captureNode?.disconnect();
  captureNode = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void audioCtx?.close();
  audioCtx = null;
  toggleBtn.textContent = t().startBtn;
  clearChart();
}

toggleBtn.addEventListener("click", async () => {
  if (active || starting) {
    if (active) stop();
    return;
  }
  try {
    await start();
  } catch (err) {
    setStatusRevealed(err instanceof Error ? err.message : t().micError);
  }
});

function resizeChart(): void {
  pitchPlot.setSize(chartSize());
}

new ResizeObserver(resizeChart).observe(pitchViewEl);
resizeChart();
