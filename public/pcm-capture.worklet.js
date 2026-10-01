class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.rateAccumulator = 0;
    this.chunkSize = 2048;
    this.chunk = new Int16Array(this.chunkSize);
    this.chunkOffset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) output.fill(0);

    if (input) {
      const step = this.targetRate / sampleRate;
      for (let index = 0; index < input.length; index += 1) {
        this.rateAccumulator += step;
        if (this.rateAccumulator >= 1) {
          const sample = Math.max(-1, Math.min(1, input[index]));
          this.chunk[this.chunkOffset] =
            sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
          this.chunkOffset += 1;
          this.rateAccumulator -= 1;

          if (this.chunkOffset === this.chunkSize) {
            const completedChunk = this.chunk;
            this.port.postMessage(completedChunk.buffer, [completedChunk.buffer]);
            this.chunk = new Int16Array(this.chunkSize);
            this.chunkOffset = 0;
          }
        }
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
