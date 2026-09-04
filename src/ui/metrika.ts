export const METRIKA_ID = 112296336;

declare global {
  function ym(counterId: number, method: string, ...args: unknown[]): void;
}

function metrika(method: string, ...args: unknown[]): void {
  try {
    ym(METRIKA_ID, method, ...args);
  } catch {}
}

export function metrikaGoal(
  goal: string,
  params?: Record<string, unknown>,
): void {
  metrika("reachGoal", goal, params ?? {});
}

export function metrikaParams(params: Record<string, unknown>): void {
  metrika("params", params);
}
