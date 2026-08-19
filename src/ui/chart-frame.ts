export const CHART_TARGET_FPS = 60;
export const CHART_MIN_FRAME_MS = 1000 / CHART_TARGET_FPS;
export const Y_RANGE_REFRESH_MS = 400;

export type FrameCallback = (time: number) => void;

/** Coalesce callbacks to display refresh rate. */
export function createFrameScheduler(onFrame: FrameCallback): {
  schedule: () => void;
  cancel: () => void;
} {
  let rafId = 0;

  const schedule = () => {
    if (rafId) return;
    rafId = requestAnimationFrame((time) => {
      rafId = 0;
      onFrame(time);
    });
  };

  const cancel = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  return { schedule, cancel };
}

let cachedYRange: [number, number] | null = null;
let yRangeAt = 0;

export function yRangeWithHysteresis(
  next: [number, number],
  now: number,
  refreshMs = Y_RANGE_REFRESH_MS,
): [number, number] {
  if (!cachedYRange || now - yRangeAt >= refreshMs) {
    cachedYRange = next;
    yRangeAt = now;
    return next;
  }
  if (next[0] < cachedYRange[0] || next[1] > cachedYRange[1]) {
    cachedYRange = next;
    yRangeAt = now;
  }
  return cachedYRange;
}

export function resetYRangeCache(): void {
  cachedYRange = null;
  yRangeAt = 0;
}
