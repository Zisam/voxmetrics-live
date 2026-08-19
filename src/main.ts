import "./style.css";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { F0Point, WorkerOutMessage } from "./types.ts";
import { midiToNoteLabel } from "./dsp/math.ts";
import {
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
} from "./ui/pitch-buffer.ts";
import {
  acceptWorkerStreamMessage,
} from "./ui/session.ts";
import {
  clearMetricsStore,
  setLatestLtas,
  setLatestMetrics,
} from "./ui/metrics-store.ts";
import {
  createFrameScheduler,
  resetYRangeCache,
  yRangeWithHysteresis,
} from "./ui/chart-frame.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="toolbar">
    <div class="toolbar-left">
      <h1>voxmetrics live</h1>
      <button id="toggle" type="button">Начать</button>
      <span id="status" class="status">Готов</span>
      <span class="privacy">Аудио не покидает браузер</span>
    </div>
    <div class="hud" id="hud">
      <span class="hud-note" id="current-note">—</span>
      <span class="hud-cents" id="current-cents"></span>
      <span class="hud-hz" id="current-hz"></span>
    </div>
  </header>
  <main class="pitch-view">
    <div id="pitch-chart"></div>
  </main>
  <footer class="footer">
    <a href="https://github.com/Zisam/voxmetrics-live">GitHub</a>
    · алгоритмы из <a href="https://github.com/Zisam/voxmetrics">voxmetrics</a>
  </footer>
`;

const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const currentNoteEl = document.querySelector<HTMLSpanElement>("#current-note")!;
const currentCentsEl = document.querySelector<HTMLSpanElement>("#current-cents")!;
const currentHzEl = document.querySelector<HTMLSpanElement>("#current-hz")!;
const pitchChartEl = document.querySelector<HTMLDivElement>("#pitch-chart")!;
const pitchViewEl = document.querySelector<HTMLElement>(".pitch-view")!;

const worker = new Worker(new URL("./worker/dsp.ts", import.meta.url), {
  type: "module",
});

let audioCtx: AudioContext | null = null;
let captureNode: AudioWorkletNode | null = null;
let stream: MediaStream | null = null;
let active = false;

const pitchX: number[] = [];
const pitchMidi: (number | null)[] = [];
const scrollState = createScrollState();
let pendingF0Batches: F0Point[][] = [];
let pendingHud: F0Point | null | undefined;
let chartLoopActive = false;

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
          yRangeWithHysteresis(computeYRange(pitchMidi), performance.now()),
      },
    },
    axes: [
      {
        stroke: "#666",
        grid: { show: true, stroke: "#1e2230" },
        ticks: { show: true, stroke: "#444" },
        values: (_u, vals) =>
          vals.map((v) => (Number.isInteger(v) ? `${v} с` : "")),
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

function clearChart(): void {
  stopChartLoop();
  resetScrollState(scrollState);
  resetYRangeCache();
  clearPitchSeries(pitchX, pitchMidi);
  pendingF0Batches = [];
  pendingHud = undefined;
  pitchPlot.setData([[], []]);
  applyHud(null);
  clearMetricsStore();
}

function updatePitchChart(points: F0Point[]): void {
  if (!points.length) return;
  pendingF0Batches.push(points);
  chartFrame.schedule();
}

function dispatchWorkerMessage(
  msg: Exclude<WorkerOutMessage, { type: "batch" }>,
): void {
  if (!acceptWorkerStreamMessage(msg.type, active)) return;
  if (msg.type === "status") statusEl.textContent = msg.message;
  if (msg.type === "f0") updatePitchChart(msg.points);
  if (msg.type === "metrics") setLatestMetrics(msg.metrics);
  if (msg.type === "ltas") setLatestLtas({ freqs: msg.freqs, db: msg.db });
  if (msg.type === "error") statusEl.textContent = `Ошибка: ${msg.message}`;
}

worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
  const msg = ev.data;
  if (msg.type === "batch") {
    for (const part of msg.messages) {
      if (part.type === "batch") continue;
      dispatchWorkerMessage(part);
    }
    return;
  }
  dispatchWorkerMessage(msg);
};

worker.onerror = (ev) => {
  statusEl.textContent = `Ошибка worker: ${ev.message}`;
  stop();
};

async function start(): Promise<void> {
  clearChart();
  active = false;

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  stream.getAudioTracks()[0]?.addEventListener("ended", () => stop());

  audioCtx = new AudioContext();
  await audioCtx.resume();

  await audioCtx.audioWorklet.addModule(
    new URL("./audio/capture-processor.ts", import.meta.url),
  );

  worker.postMessage({ type: "start", sampleRate: audioCtx.sampleRate });
  active = true;
  startChartLoop();

  captureNode = new AudioWorkletNode(audioCtx, "capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const samples = e.data;
    worker.postMessage({ type: "audio", samples }, [samples.buffer]);
  };

  const source = audioCtx.createMediaStreamSource(stream);
  const silent = audioCtx.createGain();
  silent.gain.value = 0;
  source.connect(captureNode);
  captureNode.connect(silent);
  silent.connect(audioCtx.destination);
  toggleBtn.textContent = "Стоп";
}

function stop(): void {
  if (!active) return;
  active = false;
  worker.postMessage({ type: "stop" });
  captureNode?.port.close();
  captureNode?.disconnect();
  captureNode = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void audioCtx?.close();
  audioCtx = null;
  toggleBtn.textContent = "Начать";
  clearChart();
}

toggleBtn.addEventListener("click", async () => {
  if (active) {
    stop();
    return;
  }
  try {
    await start();
  } catch (err) {
    statusEl.textContent =
      err instanceof Error
        ? err.message
        : "Не удалось получить доступ к микрофону";
  }
});

function resizeChart(): void {
  pitchPlot.setSize(chartSize());
}

new ResizeObserver(resizeChart).observe(pitchViewEl);
resizeChart();
