/**
 * Click-track metronome riding the app's AudioContext. Emphasises the
 * downbeat so the "click on every 4th wave cycle" guide scheme stays
 * countable: accented beat 1, softer beats 2-4.
 */
export interface Metronome {
  start(bpm: number): void;
  stop(): void;
  isOn(): boolean;
  /** Beats per minute; 0 when stopped. */
  getBpm(): number;
}

const ACCENT_HZ = 1568;
const BEAT_HZ = 1046.5;

export function createMetronome(ctx: AudioContext): Metronome {
  let timer: ReturnType<typeof setInterval> | null = null;
  let bpm = 0;
  let beat = 0;

  function click(accent: boolean): void {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;
    osc.type = "sine";
    gain.gain.setValueAtTime(accent ? 0.5 : 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  return {
    start(nextBpm: number): void {
      this.stop();
      if (nextBpm <= 0) return;
      bpm = nextBpm;
      beat = 0;
      click(true);
      timer = setInterval(() => {
        beat = (beat + 1) % 4;
        click(beat === 0);
      }, 60000 / bpm);
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      bpm = 0;
    },
    isOn(): boolean {
      return timer !== null;
    },
    getBpm(): number {
      return bpm;
    },
  };
}
