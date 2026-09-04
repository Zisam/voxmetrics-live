// Self-contained plain JS: Vite inlines this worklet as a data: URL, so it
// must not import anything or use TypeScript-only syntax. Keep the channel
// selection semantics in sync with tests/capture-processor.test.ts.
// Small chunk (1024 ≈ 21 ms at 48 kHz) keeps the F0 pipeline latency low;
// the pitch curve arrives within ~a frame of the sung sound.
const CHUNK_SAMPLES = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CHUNK_SAMPLES);
    this.pos = 0;
    this.channel = "center";
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === "channel") {
        const v = e.data.value;
        this.channel = v === "left" || v === "right" ? v : "center";
      }
    };
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    if (channels.length > 1) {
      // stereo: C = downmix (L+R)/2 (default), L or R picks a side
      const a = channels[0];
      const b = channels[1];
      for (let i = 0; i < a.length; i++) {
        const v =
          this.channel === "center"
            ? (a[i] + b[i]) * 0.5
            : this.channel === "right"
              ? b[i]
              : a[i];
        this.write(v);
      }
      return true;
    }
    // mono devices fall back to [0]
    const input = channels[0];
    if (!input || input.length === 0) return true;

    for (let i = 0; i < input.length; i++) this.write(input[i]);
    return true;
  }

  write(v) {
    this.buf[this.pos++] = v;
    if (this.pos >= CHUNK_SAMPLES) {
      const chunk = this.buf.slice();
      this.port.postMessage(chunk, [chunk.buffer]);
      this.buf = new Float32Array(CHUNK_SAMPLES);
      this.pos = 0;
    }
  }
}

registerProcessor("capture-processor", CaptureProcessor);
