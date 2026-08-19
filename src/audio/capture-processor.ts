const CHUNK_SAMPLES = 4096;

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(CHUNK_SAMPLES);
  private pos = 0;

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
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
