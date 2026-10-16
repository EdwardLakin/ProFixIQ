/* eslint-disable no-restricted-globals */
// Keep inspection audio local until the VAD identifies a turn. The media track
// carries silence outside turns; the retained lead-in is emitted before speech.
class InspectionGatedProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = "idle";
    this.frames = [];
    this.nextFrames = [];
    this.nextSpeech = false;
    this.noiseFloor = 0.006;
    this.silenceMs = 0;
    this.turnMs = 0;
    this.port.onmessage = ({ data }) => {
      if (data?.type === "open" && this.state === "pending") {
        this.state = "ready";
        this.clearLeadFrames = Math.ceil(sampleRate * 0.2 / 128);
      }
      if (data?.type === "finish" && this.state !== "idle") this.state = "draining";
      if (data?.type === "committed" && this.state === "awaitingCommit") {
        this.frames = this.nextFrames;
        this.nextFrames = [];
        if (this.nextSpeech) {
          this.state = "pending";
          this.port.postMessage({ type: "start" });
        } else {
          this.state = "idle";
          while (this.frames.length > Math.ceil(sampleRate * 0.3 / 128)) this.frames.shift();
        }
        this.nextSpeech = false;
        this.silenceMs = 0;
        this.turnMs = 0;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);
    if (!input) return true;

    const frame = new Float32Array(input);
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const rms = Math.sqrt(energy / frame.length);
    const threshold = Math.max(0.014, this.noiseFloor * 2.4);
    const frameMs = frame.length / sampleRate * 1000;

    if (this.state === "draining" || this.state === "awaitingCommit") {
      this.nextFrames.push(frame);
      while (this.nextFrames.length > Math.ceil(sampleRate / frame.length)) this.nextFrames.shift();
      if (rms >= threshold) this.nextSpeech = true;
      if (this.state === "awaitingCommit") return true;
      const next = this.frames.shift();
      if (next) output.set(next);
      if (this.frames.length === 0) {
        this.state = "awaitingCommit";
        this.port.postMessage({ type: "end" });
      }
      return true;
    }

    if (this.state === "idle") {
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03;
      this.frames.push(frame);
      // At most 300 ms of speech lead-in, including the triggering frame.
      while (this.frames.length > Math.ceil(sampleRate * 0.3 / frame.length)) {
        this.frames.shift();
      }
      if (rms >= threshold) {
        this.state = "pending";
        this.silenceMs = 0;
        this.turnMs = 0;
        this.port.postMessage({ type: "start" });
      }
      return true;
    }

    this.frames.push(frame);
    // If the data channel is late, keep only one second of pending audio.
    if (this.state === "pending" || this.state === "ready") {
      while (this.frames.length > Math.ceil(sampleRate / frame.length)) this.frames.shift();
      if (this.state === "ready" && --this.clearLeadFrames <= 0) this.state = "active";
      return true;
    }
    this.turnMs += frameMs;
    this.silenceMs = rms < threshold ? this.silenceMs + frameMs : 0;
    if (rms >= threshold && this.turnMs % 100 < frameMs) {
      this.port.postMessage({ type: "pulse" });
    }
    if (this.silenceMs >= 900 || this.turnMs >= 20_000) this.state = "draining";

    const next = this.frames.shift();
    if (next) output.set(next);
    if (this.state === "draining" && this.frames.length === 0) {
      this.state = "awaitingCommit";
      this.port.postMessage({ type: "end" });
    }
    return true;
  }
}

registerProcessor("inspection-gated-processor", InspectionGatedProcessor);
