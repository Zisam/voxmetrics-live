import "./style.css";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type {
  F0Point,
  MetricsSnapshot,
  WorkerOutMessage,
} from "./types.ts";
import { noteName } from "./dsp/math.ts";
import { VIB_TRUSTED_SECONDS } from "./dsp/constants.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>voxmetrics live</h1>
    <p class="subtitle">Объективные замеры голоса в реальном времени. Аудио не покидает браузер.</p>
  </header>
  <div class="controls">
    <button id="toggle" type="button">Начать</button>
    <span id="status" class="status">Готов</span>
  </div>
  <section class="charts">
    <div class="panel">
      <h2>Отклонение высоты, центы</h2>
      <div id="pitch-chart"></div>
    </div>
    <div class="panel">
      <h2>LTAS</h2>
      <div id="ltas-chart"></div>
    </div>
  </section>
  <section class="metrics" id="metrics"></section>
  <footer>
    <a href="https://github.com/Zisam/voxmetrics-live">GitHub</a>
    · алгоритмы портированы из <a href="https://github.com/Zisam/voxmetrics">voxmetrics</a>
  </footer>
`;

const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const metricsEl = document.querySelector<HTMLDivElement>("#metrics")!;

const worker = new Worker(new URL("./worker/dsp.ts", import.meta.url), {
  type: "module",
});

let audioCtx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let stream: MediaStream | null = null;
let active = false;

const pitchTimes: number[] = [];
const pitchCents: number[] = [];
const WINDOW_SEC = 10;

function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(digits).replace(/\.?0+$/, "");
}

function renderMetrics(m: MetricsSnapshot): void {
  const v = m.vibrato;
  const vibratoStatus = !v
    ? "не обнаружено (нужна ровная нота ≥1 с)"
    : v.trusted
      ? "надёжно"
      : `ориентировочно (< ${VIB_TRUSTED_SECONDS} с)`;

  metricsEl.innerHTML = `
    <div class="card"><span class="label">F0</span><span class="value">${fmt(m.f0_median_hz, 1)} Гц (${noteName(m.f0_median_hz)})</span></div>
    <div class="card"><span class="label">Озвучено</span><span class="value">${Math.round(m.voiced_share * 100)}%</span></div>
    <div class="card"><span class="label">Вибрато</span><span class="value">${vibratoStatus}</span></div>
    <div class="card"><span class="label">Частота вибрато</span><span class="value">${v ? fmt(v.rate_hz) + " Гц" : "—"}</span></div>
    <div class="card"><span class="label">Размах</span><span class="value">${v ? fmt(v.extent_cents_direct, 1) + " ¢" : "—"}</span></div>
    <div class="card"><span class="label">Регулярность</span><span class="value">${v?.regularity ?? "—"}</span></div>
    <div class="card"><span class="label">Певч. форманта</span><span class="value">${fmt(m.sf_balance_db)} дБ</span></div>
    <div class="card"><span class="label">H1-H2</span><span class="value">${fmt(m.h1_h2_db)} дБ</span></div>
    <div class="card"><span class="label">Спектр. центр</span><span class="value">${fmt(m.spectral_centroid_hz, 1)} Гц</span></div>
    <div class="card wide"><span class="label">Форманты</span><span class="value">${m.formants_hz.length ? m.formants_hz.map((f, i) => `F${i + 1}=${f}`).join(", ") + " Гц" : "—"}</span></div>
  `;
}

const pitchPlot = new uPlot(
  {
    width: app.clientWidth - 48,
    height: 220,
    series: [{}, { label: "центы", stroke: "#5b8def", width: 1.5 }],
    axes: [
      { stroke: "#888", grid: { stroke: "#333" } },
      { stroke: "#888", grid: { stroke: "#333" } },
    ],
    scales: { x: { time: false } },
  },
  [[], []],
  document.querySelector("#pitch-chart")!,
);

const ltasPlot = new uPlot(
  {
    width: app.clientWidth - 48,
    height: 220,
    series: [{}, { label: "dB", stroke: "#e8a838", width: 1.5 }],
    axes: [
      { stroke: "#888", grid: { stroke: "#333" }, scale: "x" },
      { stroke: "#888", grid: { stroke: "#333" } },
    ],
    scales: { x: { distr: 3 } },
  },
  [[], []],
  document.querySelector("#ltas-chart")!,
);

function updatePitchChart(points: F0Point[]): void {
  for (const p of points) {
    if (!p.voiced || Number.isNaN(p.cents)) continue;
    pitchTimes.push(p.t);
    pitchCents.push(p.cents);
  }
  const latest = pitchTimes.length ? pitchTimes[pitchTimes.length - 1]! : 0;
  while (pitchTimes.length && pitchTimes[0]! < latest - WINDOW_SEC) {
    pitchTimes.shift();
    pitchCents.shift();
  }
  pitchPlot.setData([pitchTimes, pitchCents]);
}

function updateLtas(freqs: number[], db: number[]): void {
  const maskIdx: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i]! <= 8000) maskIdx.push(i);
  }
  const xf = maskIdx.map((i) => freqs[i]!);
  const yf = maskIdx.map((i) => db[i]!);
  ltasPlot.setData([xf, yf]);
}

worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
  const msg = ev.data;
  if (msg.type === "status") statusEl.textContent = msg.message;
  if (msg.type === "f0") updatePitchChart(msg.points);
  if (msg.type === "metrics") renderMetrics(msg.metrics);
  if (msg.type === "ltas") updateLtas(msg.freqs, msg.db);
  if (msg.type === "error") statusEl.textContent = `Ошибка: ${msg.message}`;
};

async function start(): Promise<void> {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    worker.postMessage({ type: "audio", samples: Float32Array.from(input) });
  };
  const silent = audioCtx.createGain();
  silent.gain.value = 0;
  source.connect(processor);
  processor.connect(silent);
  silent.connect(audioCtx.destination);
  worker.postMessage({ type: "start", sampleRate: audioCtx.sampleRate });
  toggleBtn.textContent = "Стоп";
  active = true;
}

function stop(): void {
  worker.postMessage({ type: "stop" });
  processor?.disconnect();
  processor = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  void audioCtx?.close();
  audioCtx = null;
  toggleBtn.textContent = "Начать";
  active = false;
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
      err instanceof Error ? err.message : "Не удалось получить доступ к микрофону";
  }
});

window.addEventListener("resize", () => {
  const w = app.clientWidth - 48;
  pitchPlot.setSize({ width: w, height: 220 });
  ltasPlot.setSize({ width: w, height: 220 });
});

renderMetrics({
  when: "",
  duration_s: 0,
  sample_rate: 44100,
  voiced_share: 0,
  f0_median_hz: null,
  vibrato: null,
  h1_h2_db: null,
  sf_balance_db: null,
  spectral_centroid_hz: 0,
  formants_hz: [],
});
