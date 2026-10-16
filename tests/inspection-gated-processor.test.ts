import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Processor = {
  state: string;
  port: { onmessage: ((event: { data: { type: string } }) => void) | null; postMessage: ReturnType<typeof vi.fn> };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

describe("inspection gated media track", () => {
  it("emits silence while idle, then retained lead-in and speech after provider buffer clear", () => {
    let registered: (new () => Processor) | null = null;
    class Base {
      port = { onmessage: null, postMessage: vi.fn() };
    }
    runInNewContext(readFileSync("public/voice/inspection-gated-processor.js", "utf8"), {
      AudioWorkletProcessor: Base,
      Float32Array,
      Math,
      sampleRate: 24_000,
      registerProcessor: (_name: string, ctor: new () => Processor) => { registered = ctor; },
    });
    expect(registered).not.toBeNull();
    const processor = new (registered as unknown as new () => Processor)();
    const tick = (level: number) => {
      const output = new Float32Array(128);
      processor.process([[new Float32Array(128).fill(level)]], [[output]]);
      return output;
    };
    for (let i = 0; i < 80; i++) expect(tick(0).some(Boolean)).toBe(false);
    for (let i = 0; i < 10; i++) expect(tick(0.01).some(Boolean)).toBe(false);
    expect(tick(0.2).some(Boolean)).toBe(false);
    expect(processor.port.postMessage).toHaveBeenCalledWith({ type: "start" });
    for (let i = 0; i < 10; i++) expect(tick(0.2).some(Boolean)).toBe(false);
    processor.port.onmessage?.({ data: { type: "open" } });
    let emittedSpeech = false;
    let emittedLeadIn = false;
    for (let i = 0; i < 130; i++) {
      const emitted = tick(0.2);
      if (emitted.some((sample) => sample > 0.1)) emittedSpeech = true;
      if (emitted.some((sample) => sample > 0.005 && sample < 0.02)) emittedLeadIn = true;
    }
    expect(emittedSpeech).toBe(true);
    expect(emittedLeadIn).toBe(true);
    for (let i = 0; i < 250 && processor.state !== "draining"; i++) tick(0);
    expect(processor.state).toBe("draining");
    for (let i = 0; i < 25; i++) tick(0.2);
    for (let i = 0; i < 200 && processor.state !== "awaitingCommit"; i++) tick(0);
    expect(processor.port.postMessage).toHaveBeenCalledWith({ type: "end" });
    expect(processor.state).toBe("awaitingCommit");
    expect(tick(0).some(Boolean)).toBe(false);
    processor.port.onmessage?.({ data: { type: "committed" } });
    expect(processor.state).toBe("pending");
    expect(processor.port.postMessage).toHaveBeenCalledWith({ type: "start" });
    processor.port.onmessage?.({ data: { type: "open" } });
    let replayedFollowUp = false;
    for (let i = 0; i < 220; i++) {
      if (tick(0).some((sample) => sample > 0.1)) replayedFollowUp = true;
    }
    expect(replayedFollowUp).toBe(true);
  });
});
