// Self-contained plain JS: Vite inlines this worklet as a data: URL, so it
// must not import anything or use TypeScript-only syntax. Keep the channel
// selection semantics in sync with tests/capture-processor.test.ts.
const CHUNK_SAMPLES = 4096;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CHUNK_SAMPLES);
    this.pos = 0;
    this.channel = "right";
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === "channel") {
        this.channel = e.data.value === "left" ? "left" : "right";
      }
    };
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    // stereo: right channel by default (mic); mono devices fall back to [0]
    const input =
      this.channel === "right" && channels.length > 1
        ? channels[1]
        : channels[0];
    if (!input || input.length === 0) return true;

    for (let i = 0; i < input.length; i++) {
      this.buf[this.pos++] = input[i];
      if (this.pos >= CHUNK_SAMPLES) {
        const chunk = this.buf.slice();
        this.port.postMessage(chunk, [chunk.buffer]);
        this.buf = new Float32Array(CHUNK_SAMPLES);
        this.pos = 0;
      }
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
