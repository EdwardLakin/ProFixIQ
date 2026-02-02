/* eslint-disable no-restricted-globals */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Copy the frame so the main thread always receives stable samples
    const channelData = input[0];
    const frame = new Float32Array(channelData); // copies
    this.port.postMessage(frame);

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);