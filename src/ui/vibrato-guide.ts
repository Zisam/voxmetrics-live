import uPlot from "uplot";

/**
 * Reference vibrato profile. The wave rate follows the metronome tempo:
 * 1 click = every 4th wave cycle, so BPM = Hz x 15 (82 BPM = 5.47 Hz ~
 * the 5.5 Hz performer target; default follows VIB_REF_HZ).
 */
export const VIB_REF_HZ = 5.5;
/** Sine amplitude in semitones: 150 cents peak-to-peak sweep (= ±75 cents). */
export const VIB_REF_SEMI_AMPLITUDE = 0.75;
/** Corridor half-width in semitones: ±75 cents (150 cents total) around the note. */
export const VIB_CORRIDOR_SEMI = 0.75;

/** Convert metronome BPM (click per 4 cycles) to wave Hz. */
export function bpmToVibHz(bpm: number): number {
  return (bpm / 60) * 4;
}

/** Convert wave Hz to metronome BPM. */
export function vibHzToBpm(hz: number): number {
  return (hz / 4) * 60;
}

export interface VibratoGuide {
  /** Corridor band in midi units. */
  lo: number;
  hi: number;
  /** Reference sine: center + amplitude·sin(2π·hz·t). */
  center: number;
  hz: number;
  amplitude: number;
}

export function computeVibratoGuide(
  centerMidi: number,
  waveHz = VIB_REF_HZ,
): VibratoGuide {
  return {
    lo: centerMidi - VIB_CORRIDOR_SEMI,
    hi: centerMidi + VIB_CORRIDOR_SEMI,
    center: centerMidi,
    hz: waveHz,
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
 * Phase lock of the reference sine to the metronome: chart x maps to wall
 * time via `nowWallSec - (windowSec - x)`; the sine's rising zero crossing
 * lands exactly on the metronome accent anchor.
 */
export interface SinePhaseLock {
  anchorWallSec: number;
  nowWallSec: number;
}

/**
 * Draw vertical click marks along the chart bottom edge: one per metronome
 * beat, accented every 4th (the count anchor). Grid derived from the same
 * anchor/interval as the audio clicks and the phase-locked sine.
 */
export function drawClickMarks(
  u: uPlot,
  anchorWallSec: number,
  beatIntervalSec: number,
  nowWallSec: number,
): void {
  const windowSec = u.scales.x.max ?? 0;
  if (windowSec <= 0 || beatIntervalSec <= 0) return;
  const { ctx } = u;
  const top = u.bbox.top;
  const bottom = u.bbox.top + u.bbox.height;

  ctx.save();
  ctx.lineWidth = 1.5 * uPlot.pxRatio;
  // chart x -> wall time: x = windowSec is "now"
  const wallAt = (x: number) => nowWallSec - (windowSec - x);

  // beats from the first accent at/behind the window start through now
  const firstBeat = Math.floor((wallAt(0) - anchorWallSec) / beatIntervalSec) - 1;
  for (let k = firstBeat; ; k++) {
    const wallT = anchorWallSec + k * beatIntervalSec;
    const x = windowSec - (nowWallSec - wallT);
    if (x > windowSec) break;
    if (x < 0) continue;
    const px = u.valToPos(x, "x", true);
    const strong = ((k % 4) + 4) % 4 === 0;
    ctx.strokeStyle = strong
      ? "rgba(110, 231, 183, 0.55)"
      : "rgba(110, 231, 183, 0.16)";
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the vibrato reference overlay under the pitch curve: a 150-cent
 * corridor around the held note (dashed bounds, faint fill) and a 150-cent
 * peak-to-peak sine exactly filling the corridor. With a phase lock the
 * wave visibly moves in time with the click instead of scrolling freely.
 */
export function drawVibratoGuide(
  u: uPlot,
  guide: VibratoGuide | null,
  phaseLock: SinePhaseLock | null = null,
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
  const windowSec = u.scales.x.max ?? 0;
  for (let i = 0; i <= steps; i++) {
    const px = left + (width * i) / steps;
    const t = u.posToVal(px, "x", true);
    // wall time of this chart position: NOW (x = windowSec) is nowWallSec
    const phaseT =
      phaseLock != null
        ? phaseLock.nowWallSec - (windowSec - t) - phaseLock.anchorWallSec
        : t;
    const midi =
      guide.center +
      guide.amplitude * Math.sin(2 * Math.PI * guide.hz * phaseT);
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
  ctx.fillText(`${(guide.hz).toFixed(1)} Гц`, left + width - pad, labelY);
  ctx.restore();
}
