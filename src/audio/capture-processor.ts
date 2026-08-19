const CHUNK_SAMPLES = 4096;

import { pickChannel, type ChannelSelection } from "./channel-select.ts";

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(CHUNK_SAMPLES);
  private pos = 0;
  private channel: ChannelSelection = "right";

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "channel") {
        this.channel = e.data.value === "left" ? "left" : "right";
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = pickChannel(inputs[0], this.channel);
    if (!input?.length) return true;

    for (let i = 0; i < input.length; i++) {
      this.buf[this.pos++] = input[i]!;
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

export {};
