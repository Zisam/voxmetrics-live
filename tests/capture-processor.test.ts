import { describe, expect, it, vi, beforeEach } from "vitest";

interface Registration {
  name: string;
  ctor: new () => unknown;
}

const registered: Registration[] = [];
const posted: Float32Array[] = [];

class StubWorkletBase {
  port = {
    postMessage: (msg: Float32Array) => posted.push(msg),
    onmessage: null as unknown,
  };
}

const workletUrl = new URL(
  "../src/audio/capture-processor.js",
  import.meta.url,
).href;

async function loadWorklet(): Promise<Registration> {
  vi.stubGlobal("AudioWorkletProcessor", StubWorkletBase);
  vi.stubGlobal("registerProcessor", (name: string, ctor: new () => unknown) => {
    registered.push({ name, ctor });
  });
  await import(/* @vite-ignore */ workletUrl);
  expect(registered.length).toBeGreaterThanOrEqual(1);
  return registered[0]!;
}

function newInstance(reg: Registration): InstanceType<Registration["ctor"]> & {
  process(inputs: Float32Array[][]): boolean;
  port: StubWorkletBase["port"];
} {
  // construct through the stub base (gives us `port`), then re-point the
  // prototype so the worklet's own methods (process) are reachable
  const proc = Reflect.construct(
    reg.ctor,
    [],
    StubWorkletBase as unknown as new () => unknown,
  ) as object;
  Object.setPrototypeOf(proc, reg.ctor.prototype);
  return proc as never;
}

describe("capture-processor worklet", () => {
  beforeEach(() => {
    vi.resetModules();
    registered.length = 0;
    posted.length = 0;
  });

  it("registers under the expected name", async () => {
    const reg = await loadWorklet();
    expect(reg.name).toBe("capture-processor");
  });

  it("captures the right channel by default on stereo input", async () => {
    const reg = await loadWorklet();
    const proc = newInstance(reg);
    const left = new Float32Array(4096).fill(-1);
    const right = new Float32Array(4096);
    for (let i = 0; i < right.length; i++) right[i] = i;
    proc.process([[left, right]]);
    expect(posted.length).toBe(1);
    expect(Array.from(posted[0]!)).toEqual(Array.from(right));
  });

  it("switches to the left channel via port message", async () => {
    const reg = await loadWorklet();
    const proc = newInstance(reg);
    (proc.port.onmessage as (e: unknown) => void)({
      data: { type: "channel", value: "left" },
    });
    const left = new Float32Array(4096).fill(7);
    const right = new Float32Array(4096).fill(9);
    proc.process([[left, right]]);
    expect(posted.length).toBe(1);
    expect(posted[0]!.every((v) => v === 7)).toBe(true);
  });

  it("falls back to the single channel on mono input", async () => {
    const reg = await loadWorklet();
    const proc = newInstance(reg);
    const mono = new Float32Array(4096).fill(3);
    proc.process([[mono]]);
    expect(posted.length).toBe(1);
    expect(posted[0]!.every((v) => v === 3)).toBe(true);
  });

  it("batches samples into 4096-sample chunks across process calls", async () => {
    const reg = await loadWorklet();
    const proc = newInstance(reg);
    proc.process([[new Float32Array(1000).fill(1)]]);
    expect(posted.length).toBe(0);
    proc.process([[new Float32Array(1000).fill(1)]]);
    expect(posted.length).toBe(0);
    proc.process([[new Float32Array(3000).fill(1)]]);
    expect(posted.length).toBe(1);
    expect(posted[0]!.length).toBe(4096);
    expect(posted[0]!.every((v) => v === 1)).toBe(true);
  });

  it("keeps running on empty input", async () => {
    const reg = await loadWorklet();
    const proc = newInstance(reg);
    expect(proc.process([])).toBe(true);
    expect(proc.process([[]])).toBe(true);
    expect(posted.length).toBe(0);
  });
});
