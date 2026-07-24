import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VoiceDictationButton from "@/features/shared/voice/VoiceDictationButton";

const realtime = vi.hoisted(() => ({
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
}));

vi.mock("@/features/inspections/lib/inspection/useRealtimeVoice", () => ({
  useRealtimeVoice: () => realtime,
}));

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: Event & { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.latest = this;
  }
}

describe("VoiceDictationButton", () => {
  beforeEach(() => {
    FakeSpeechRecognition.latest = null;
    realtime.start.mockClear();
    realtime.stop.mockClear();
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: FakeSpeechRecognition,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "SpeechRecognition");
  });

  it("uses native browser dictation and emits final transcript text", async () => {
    const onTranscript = vi.fn();
    render(
      <VoiceDictationButton
        idleLabel="Dictate note"
        listeningLabel="Stop"
        onTranscript={onTranscript}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Dictate note" }),
    );

    const recognition = FakeSpeechRecognition.latest;
    expect(recognition?.start).toHaveBeenCalledTimes(1);
    expect(realtime.start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    recognition?.onresult?.({
      resultIndex: 0,
      results: {
        0: {
          0: { transcript: "Checked front brakes", confidence: 0.98 },
          isFinal: true,
          length: 1,
        },
        length: 1,
      },
    } as unknown as SpeechRecognitionEvent);

    expect(onTranscript).toHaveBeenCalledWith("Checked front brakes");

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(recognition?.stop).toHaveBeenCalledTimes(1);
  });
});
