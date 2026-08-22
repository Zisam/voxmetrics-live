/**
 * Click-track metronome riding the app's AudioContext.
 *
 * Clicks are scheduled on the AUDIO clock with lookahead (the "two
 * clocks" pattern): a 25 ms timer only tops up a schedule buffer, while
 * every click lands at an exact grid time t0 + k·interval — immune to
 * main-thread jitter and interval quantization. The visual anchor is
 * derived from getOutputTimestamp() when available so the chart marks
 * and the phase-locked sine land on the HEARD click, not the scheduled
 * one.
 */
export interface Metronome {
  start(bpm: number): void;
  stop(): void;
  isOn(): boolean;
  /** Beats per minute; 0 when stopped. */
  getBpm(): number;
  /**
   * Wall-clock second (performance.now()/1000) when the first grid click
   * is HEARD — the visual anchor for click marks and the sine. Null when
   * stopped.
   */
  anchorWallSec(): number | null;
  /** Accent interval in seconds; null when stopped. */
  beatIntervalSec(): number | null;
}

const ACCENT_HZ = 1568;
const BEAT_HZ = 1046.5;
/** How far ahead clicks are scheduled on the audio clock (s). */
const LOOKAHEAD_SEC = 0.15;
/** Schedule-buffer top-up interval (ms). */
const TICK_MS = 25;
/** First click delay from start (s) — gives the buffer a head start. */
const FIRST_CLICK_DELAY_SEC = 0.05;

export function createMetronome(ctx: AudioContext): Metronome {
  let timer: ReturnType<typeof setInterval> | null = null;
  let bpm = 0;
  let beat = 0;
  /** Audio-clock time of the next grid click. */
  let nextGridT = 0;
  let anchor: number | null = null;

  function click(accent: boolean, at: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;
    osc.type = "sine";
    gain.gain.setValueAtTime(accent ? 0.5 : 0.3, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }

  /**
   * Map an audio-clock time to the wall-clock second when it is HEARD.
   * Prefers getOutputTimestamp (browser's own audio→performance mapping
   * including its latency estimate); falls back to currentTime +
   * outputLatency.
   */
  function heardWallSec(audioT: number): number {
    const ts = ctx.getOutputTimestamp?.();
    const contextTime = ts?.contextTime ?? 0;
    const performanceTime = ts?.performanceTime ?? 0;
    if (contextTime > 0 && performanceTime > 0) {
      return performanceTime / 1000 + (audioT - contextTime);
    }
    return (
      performance.now() / 1000 + (audioT - ctx.currentTime) +
      (ctx.outputLatency ?? 0)
    );
  }

  function tick(): void {
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    while (nextGridT < horizon) {
      click(beat === 0, nextGridT);
      beat = (beat + 1) % 4;
      nextGridT += 60 / bpm;
    }
  }

  return {
    start(nextBpm: number): void {
      this.stop();
      if (nextBpm <= 0) return;
      bpm = nextBpm;
      beat = 0;
      nextGridT = ctx.currentTime + FIRST_CLICK_DELAY_SEC;
      anchor = heardWallSec(nextGridT);
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      bpm = 0;
      anchor = null;
    },
    isOn(): boolean {
      return timer !== null;
    },
    getBpm(): number {
      return bpm;
    },
    anchorWallSec(): number | null {
      return anchor;
    },
    beatIntervalSec(): number | null {
      return bpm > 0 ? 60 / bpm : null;
    },
  };
}
