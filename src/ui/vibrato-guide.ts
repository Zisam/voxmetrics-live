import uPlot from "uplot";

/** Reference vibrato profile derived from performer analysis (see guide). */
export const VIB_REF_HZ = 5.5;
/**
 * Sine amplitude in semitones: 150 cents peak-to-peak sweep (= ±75 cents),
 * riding the full corridor width edge to edge.
 */
export const VIB_REF_SEMI_AMPLITUDE = 0.75;
/** Corridor half-width in semitones: ±75 cents (150 cents total) around the note. */
export const VIB_CORRIDOR_SEMI = 0.75;

export interface VibratoGuide {
  /** Corridor band in midi units. */
  lo: number;
  hi: number;
  /** Reference sine: center + amplitude·sin(2π·hz·t). */
  center: number;
  hz: number;
  amplitude: number;
}

export function computeVibratoGuide(centerMidi: number): VibratoGuide {
  return {
    lo: centerMidi - VIB_CORRIDOR_SEMI,
    hi: centerMidi + VIB_CORRIDOR_SEMI,
    center: centerMidi,
    hz: VIB_REF_HZ,
    amplitude: VIB_REF_SEMI_AMPLITUDE,
  };
}

/** Median midi of voiced points visible on the chart (null when silent). */
export function visibleVoicedMedian(
  midi: (number | null)[],
): number | null {
  const vals: number[] = [];
  for (const v of midi) {
    if (v != null && !Number.isNaN(v)) vals.push(v);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0
    ? (vals[mid - 1]! + vals[mid]!) / 2
    : vals[mid]!;
}

/**
 * Draw the vibrato reference overlay under the pitch curve: a 150-cent
 * corridor around the held note (dashed bounds, faint fill) and a 5.5 Hz
 * sine with 150 cents peak-to-peak exactly filling the corridor.
 */
export function drawVibratoGuide(
  u: uPlot,
  guide: VibratoGuide | null,
): void {
  if (!guide) return;
  const { ctx } = u;
  const yScale = u.scales.y;
  if (yScale.min == null || yScale.max == null) return;
  // clip to visible range so the corridor never distorts the view
  const lo = Math.max(guide.lo, yScale.min);
  const hi = Math.min(guide.hi, yScale.max);
  if (hi <= lo) return;

  const left = u.bbox.left;
  const width = u.bbox.width;
  const yLo = u.valToPos(lo, "y", true);
  const yHi = u.valToPos(hi, "y", true);

  // corridor fill
  ctx.fillStyle = "rgba(240, 180, 90, 0.06)";
  ctx.fillRect(left, yHi, width, yLo - yHi);

  // corridor bounds
  ctx.strokeStyle = "rgba(240, 180, 90, 0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  for (const y of [yLo, yHi]) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
  }

  // reference sine: touches the corridor bounds at its extremes
  ctx.save();
  ctx.beginPath();
  ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
  ctx.clip();
  ctx.strokeStyle = "rgba(110, 231, 183, 0.55)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const steps = Math.max(64, Math.floor(width));
  for (let i = 0; i <= steps; i++) {
    const px = left + (width * i) / steps;
    const t = u.posToVal(px, "x", true);
    const midi =
      guide.center +
      guide.amplitude * Math.sin(2 * Math.PI * guide.hz * t);
    const y = u.valToPos(midi, "y", true);
    if (i === 0) ctx.moveTo(px, y);
    else ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);

  // label at the right edge (pxRatio-scaled font; save/restore so uPlot's
  // own axis font cache is not polluted)
  ctx.save();
  ctx.fillStyle = "rgba(110, 231, 183, 0.7)";
  ctx.font = `${10 * uPlot.pxRatio}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  const pad = 4 * uPlot.pxRatio;
  const labelY = Math.max(
    u.valToPos(Math.min(guide.hi, yScale.max), "y", true) + 12 * uPlot.pxRatio,
    12 * uPlot.pxRatio,
  );
  ctx.fillText(`${VIB_REF_HZ} Гц`, left + width - pad, labelY);
  ctx.restore();
}
