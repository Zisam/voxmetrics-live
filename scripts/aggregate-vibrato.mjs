#!/usr/bin/env node
/**
 * Aggregate voxmetrics TSV session exports into a training-progress report.
 *
 * Usage:
 *   node aggregate-vibrato.mjs [dir] [--out report.md]
 *   dir defaults to ~/Downloads; scans voxmetrics-*.tsv recursively? No: flat dir.
 *
 * Output: per-day and overall statistics of vibrato rate (Hz), extent
 * (cents), tempo stability (period_cv), plus practice time and rows with
 * detected vibrato. Writes markdown to stdout and --out file.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
if (outIdx >= 0) args.splice(outIdx, 2);
const dir = args[0] ?? join(homedir(), "Downloads");

const files = readdirSync(dir)
  .filter((f) => /^voxmetrics-.*\.tsv$/.test(f))
  .sort();

const num = (v) => (v == null || v === "" ? null : Number(v));

/** Aggregate a single session file into row records. */
function parseFile(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split("\t");
  const idx = (name) => header.indexOf(name);
  const iTime = idx("time");
  const iRate = idx("vib_rate_hz");
  const iExt = idx("vib_extent_cents");
  const iReg = idx("vib_regularity_pct");
  const iPcv = idx("vib_period_cv");
  const iSteady = idx("vib_steady_s");
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = line.split("\t");
    rows.push({
      time: c[iTime] ?? "",
      rate: num(c[iRate]),
      extent: num(c[iExt]),
      regularity: num(c[iReg]),
      pcv: num(iPcv >= 0 ? c[iPcv] : ""),
      steady: num(iSteady >= 0 ? c[iSteady] : ""),
    });
  }
  return rows;
}

function stats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    n: values.length,
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: sorted[0],
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p90: q(0.9),
    max: sorted[sorted.length - 1],
  };
}

const f1 = (v) => (v == null ? "—" : v.toFixed(1));

// ---- per-day aggregation -------------------------------------------------
const days = new Map(); // date -> { rows, vibRows, rate[], ext[], reg[], pcv[], steady[] }
let totalRows = 0;
let totalVib = 0;
const skipped = [];

for (const f of files) {
  const path = join(dir, f);
  if (!statSync(path).isFile()) continue;
  let rows;
  try {
    rows = parseFile(path);
  } catch {
    skipped.push(f);
    continue;
  }
  if (!rows.length) {
    skipped.push(f);
    continue;
  }
  // session span: last-timestamp + one 2 s snapshot interval since first
  const t0 = new Date(rows[0].time).getTime();
  const t1 = new Date(rows[rows.length - 1].time).getTime() + 2000;
  const spanMin = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0
    ? (t1 - t0) / 60000
    : rows.length * (2 / 60);
  const vibRows = rows.filter((r) => r.rate != null && r.rate > 0);
  const day = (rows[0].time || "").slice(0, 10);

  const d = days.get(day) ?? {
    sessions: 0,
    minutes: 0,
    rows: 0,
    vibRows: 0,
    rate: [],
    ext: [],
    reg: [],
    pcv: [],
    steady: [],
    trustedRows: 0,
  };
  d.sessions += 1;
  d.minutes += spanMin;
  d.rows += rows.length;
  d.vibRows += vibRows.length;
  for (const r of vibRows) {
    d.rate.push(r.rate);
    if (r.extent != null) d.ext.push(r.extent);
    if (r.regularity != null) d.reg.push(r.regularity);
    if (r.pcv != null) d.pcv.push(r.pcv);
    if (r.steady != null && r.steady >= 4) d.trustedRows += 1;
  }
  days.set(day, d);
  totalRows += rows.length;
  totalVib += vibRows.length;
}

// ---- report --------------------------------------------------------------
const L = [];
L.push("# voxmetrics — прогресс вибрато");
L.push("");
L.push(`Файлов: ${files.length}${skipped.length ? ` (пропущено: ${skipped.length})` : ""}, строк метрик: ${totalRows}, с вибрато: ${totalVib}.`);
L.push("");

L.push("| Дата | Сесс. | Мин | Строк | Vib | Rate min→p50→max (Hz) | Rate p90 | Extent min→p50→max (¢) | Reg p50 (%) | periodCV p50 |");
L.push("|---|---|---|---|---|---|---|---|---|---|");
const allRate = [];
const allExt = [];
const allReg = [];
const allPcv = [];
let totalMin = 0;
for (const [day, d] of [...days.entries()].sort()) {
  totalMin += d.minutes;
  const sRate = stats(d.rate);
  const sExt = stats(d.ext);
  const sReg = stats(d.reg);
  const sPcv = stats(d.pcv);
  allRate.push(...d.rate);
  allExt.push(...d.ext);
  allReg.push(...d.reg);
  allPcv.push(...d.pcv);
  L.push(
    `| ${day} | ${d.sessions} | ${d.minutes.toFixed(0)} | ${d.rows} | ${d.vibRows} | ` +
      `${sRate ? `${sRate.min.toFixed(2)} → ${sRate.p50.toFixed(2)} → ${sRate.max.toFixed(2)}` : "—"} | ` +
      `${sRate ? sRate.p90.toFixed(2) : "—"} | ` +
      `${sExt ? `${sExt.min.toFixed(0)} → ${sExt.p50.toFixed(0)} → ${sExt.max.toFixed(0)}` : "—"} | ` +
      `${sReg ? sReg.p50.toFixed(0) : "—"} | ${sPcv ? sPcv.p50.toFixed(2) : "—"} |`,
  );
}

const sRate = stats(allRate);
const sExt = stats(allExt);
const sReg = stats(allReg);
const sPcv = stats(allPcv);
L.push("");
L.push("## Итог по всем дням");
L.push("");
L.push(`- Практика: ${days.size} дн., ~${totalMin.toFixed(0)} мин, ${days.size ? (totalMin / days.size).toFixed(0) : 0} мин/день`);
if (sRate) {
  L.push(`- Частота: медиана **${sRate.p50.toFixed(2)} Hz**, диапазон ${sRate.min.toFixed(2)}–${sRate.max.toFixed(2)} (p25–p75: ${sRate.p25.toFixed(2)}–${sRate.p75.toFixed(2)}, p90: ${sRate.p90.toFixed(2)}) — цель 5.5 Hz`);
}
if (sExt) {
  L.push(`- Размах: медиана **${sExt.p50.toFixed(0)} ¢**, диапазон ${sExt.min.toFixed(0)}–${sExt.max.toFixed(0)} — рабочая зона 130–190 ¢`);
}
if (sReg) {
  L.push(`- Регулярность: медиана ${sReg.p50.toFixed(0)} % (цель ≥ 60 %)`);
}
if (sPcv) {
  L.push(`- Стабильность темпа: медиана periodCV ${sPcv.p50.toFixed(2)} (цель ≤ 0.10; Makenai 0.07, M. Shadows 0.13–0.16)`);
}

// trend: first vs last day — median AND sustained top (p90, robust to a
// single lucky row: 10 % of the day's voiced snapshots must reach it)
const dayKeys = [...days.keys()].sort();
if (dayKeys.length >= 2) {
  const first = stats(days.get(dayKeys[0]).rate);
  const last = stats(days.get(dayKeys[dayKeys.length - 1]).rate);
  if (first && last) {
    const dMed = last.p50 - first.p50;
    const dTop = last.p90 - first.p90;
    L.push("");
    L.push(`## Тренд`);
    L.push("");
    L.push(`- Rate p50: ${dayKeys[0]} → ${dayKeys[dayKeys.length - 1]}: **${first.p50.toFixed(2)} → ${last.p50.toFixed(2)} Hz** (${dMed >= 0 ? "+" : ""}${dMed.toFixed(2)})`);
    L.push(`- Устойчивый верх (p90): **${first.p90.toFixed(2)} → ${last.p90.toFixed(2)} Hz** (${dTop >= 0 ? "+" : ""}${dTop.toFixed(2)}) — по нему видно рост лестницы`);
    L.push(`- Вершина дня: ${first.max.toFixed(2)} → ${last.max.toFixed(2)} Hz`);
  }
}

const report = L.join("\n");
console.log(report);
if (outPath) {
  writeFileSync(outPath, report, "utf8");
  console.error(`\nwritten: ${outPath}`);
}
