import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({
  connected: false,
  start: vi.fn(async () => undefined),
  pause: vi.fn(() => false),
  playAudio: vi.fn(async (_audio: ArrayBuffer) => undefined),
  stopAudio: vi.fn(),
  resume: vi.fn(() => false),
  stop: vi.fn(),
  onFinal: null as null | ((text: string) => void),
  onStateChange: null as null | ((state: "idle" | "connecting" | "listening" | "error") => void),
}));

vi.mock("@/features/copilot/technician/voice/useTechnicianRealtimeVoice", () => ({
  useTechnicianRealtimeVoice: (
    onFinal: (text: string) => void,
    _wake: (text: string) => string | null,
    options?: {
      onStateChange?: (
        state: "idle" | "connecting" | "listening" | "error",
      ) => void;
    },
  ) => {
    realtime.onFinal = onFinal;
    realtime.onStateChange = options?.onStateChange ?? null;
    return {
      start: realtime.start,
      pause: realtime.pause,
      playAudio: realtime.playAudio,
      stopAudio: realtime.stopAudio,
      resume: realtime.resume,
      stop: realtime.stop,
    };
  },
}));

import { useTechnicianInteractionGateway } from "@/features/copilot/technician/voice/useTechnicianInteractionGateway";

class FakeSpeechSynthesisUtterance {
  text: string;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const speech = {
  cancel: vi.fn(),
  resume: vi.fn(),
  speak: vi.fn((_utterance: SpeechSynthesisUtterance) => undefined),
  speaking: true,
  pending: false,
};

const generatedAudio = new Uint8Array([1, 2, 3, 4]).buffer;
const speechFetch = vi.fn();
const wakeLockRequest = vi.fn();
let wakeLockRelease = vi.fn(async () => undefined);
let generatedPlayback: ReturnType<typeof deferred<void>>;
let generatedPlaybackStarted = false;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("Technician CoPilot voice interaction gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.connected = false;
    realtime.onFinal = null;
    realtime.onStateChange = null;
    generatedPlayback = deferred<void>();
    generatedPlaybackStarted = false;
    speech.speaking = true;
    speech.pending = false;
    realtime.start.mockImplementation(async () => {
      realtime.connected = true;
      realtime.onStateChange?.("listening");
      return undefined;
    });
    realtime.pause.mockImplementation(() => realtime.connected);
    realtime.playAudio.mockImplementation(() => {
      generatedPlaybackStarted = true;
      return generatedPlayback.promise.finally(() => {
        generatedPlaybackStarted = false;
      });
    });
    realtime.stopAudio.mockImplementation(() => {
      if (generatedPlaybackStarted) generatedPlayback.resolve();
    });
    realtime.resume.mockImplementation(() => {
      if (!realtime.connected) return false;
      realtime.onStateChange?.("listening");
      return true;
    });
    realtime.stop.mockImplementation(() => {
      realtime.connected = false;
      realtime.onStateChange?.("idle");
    });

    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      FakeSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance,
    );
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: speech,
    });
    speechFetch.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => generatedAudio.slice(0),
    }));
    vi.stubGlobal("fetch", speechFetch);

    let wakeLockReleaseListener: (() => void) | null = null;
    const wakeLockSentinel = {
      released: false,
      release: vi.fn(async () => {
        wakeLockSentinel.released = true;
        wakeLockReleaseListener?.();
      }),
      addEventListener: vi.fn(
        (_type: "release", listener: () => void) => {
          wakeLockReleaseListener = listener;
        },
      ),
    };
    wakeLockRelease = wakeLockSentinel.release;
    wakeLockRequest.mockResolvedValue(wakeLockSentinel);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: wakeLockRequest },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "speechSynthesis");
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("starts one call automatically when voice access becomes available", async () => {
    const onUtterance = vi.fn(async () => ({ reply: null }));
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useTechnicianInteractionGateway({
          enabled,
          autoStart: true,
          onUtterance,
        }),
      { initialProps: { enabled: false } },
    );

    expect(realtime.start).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => {
      expect(result.current.phase).toBe("listening");
    });
    expect(realtime.start).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });
    expect(realtime.start).toHaveBeenCalledTimes(1);
  });

  it("pauses Realtime, plays generated speech through its audio context, then resumes it", async () => {
    const onUtterance = vi.fn(async (text: string) => ({
      reply: `Reply to ${text}`,
    }));
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("listening");
    expect(realtime.start).toHaveBeenCalledTimes(1);
    expect(realtime.resume).not.toHaveBeenCalled();

    act(() => {
      realtime.onFinal?.("Rear U-joint has play.");
    });

    await waitFor(() => {
      expect(onUtterance).toHaveBeenCalledWith("Rear U-joint has play.");
      expect(result.current.phase).toBe("speaking");
    });
    expect(realtime.pause).toHaveBeenCalledTimes(1);
    expect(realtime.stop).not.toHaveBeenCalled();
    expect(speechFetch).toHaveBeenCalledWith(
      "/api/copilot/technician/speech",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
    const speechRequest = speechFetch.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(JSON.parse(String(speechRequest?.body))).toEqual({
      text: "Reply to Rear U-joint has play.",
    });
    expect(realtime.playAudio).toHaveBeenCalledTimes(1);
    expect(realtime.playAudio.mock.calls[0]?.[0]).toBeInstanceOf(ArrayBuffer);
    expect(speech.speak).not.toHaveBeenCalled();

    act(() => {
      realtime.onFinal?.("Late buffered transcript");
    });
    expect(onUtterance).toHaveBeenCalledTimes(1);

    await act(async () => {
      generatedPlayback.resolve();
      await generatedPlayback.promise;
    });

    await waitFor(() => {
      expect(realtime.resume).toHaveBeenCalledTimes(1);
      expect(realtime.start).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("listening");
    });
  });

  it("returns to listening when a persisted CoPilot turn fails", async () => {
    const onUtterance = vi.fn(async () => {
      throw new Error("CoPilot took too long to respond. Please try again.");
    });
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      realtime.onFinal?.("What is my next job?");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("listening");
      expect(result.current.error).toContain("took too long");
    });
    expect(result.current.active).toBe(true);
    expect(realtime.resume).toHaveBeenCalledTimes(1);
    expect(realtime.stop).not.toHaveBeenCalled();
  });

  it("holds a screen wake lock while voice is active and releases it on stop", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => {
      expect(wakeLockRequest).toHaveBeenCalledWith("screen");
      expect(result.current.wakeLockSupported).toBe(true);
      expect(result.current.wakeLockActive).toBe(true);
    });

    act(() => result.current.stop());

    expect(wakeLockRelease).toHaveBeenCalledTimes(1);
    expect(result.current.wakeLockActive).toBe(false);
  });

  it("stops voice after a terminal CoPilot turn failure", async () => {
    const terminalFailure = Object.assign(
      new Error(
        "The active CoPilot repair context changed. Reload before continuing.",
      ),
      { recoverable: false },
    );
    const onUtterance = vi.fn(async () => {
      throw terminalFailure;
    });
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      realtime.onFinal?.("Complete this job.");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("error");
      expect(result.current.active).toBe(false);
    });
    expect(result.current.error).toContain("Reload before continuing");
    expect(result.current.heardTranscript).toBe("Complete this job.");
    expect(realtime.stop).toHaveBeenCalledTimes(1);
    expect(realtime.resume).not.toHaveBeenCalled();
  });

  it("recovers when iOS speech synthesis never emits a completion event", async () => {
    vi.useFakeTimers();
    try {
      speechFetch.mockResolvedValue({ ok: false });
      const onUtterance = vi.fn(async () => ({
        reply: "Your next assigned job is the Ford.",
      }));
      const { result } = renderHook(() =>
        useTechnicianInteractionGateway({ enabled: true, onUtterance }),
      );

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        realtime.onFinal?.("What is my next job?");
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.phase).toBe("speaking");
      expect(speech.speak).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_001);
      });

      expect(speech.cancel).toHaveBeenCalledTimes(1);
      expect(realtime.resume).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("listening");
      expect(result.current.error).toContain("spoken reply stalled");
      expect(result.current.active).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not truncate a maximum-length valid reply at 90 seconds", async () => {
    vi.useFakeTimers();
    try {
      speechFetch.mockResolvedValue({ ok: false });
      const { result } = renderHook(() =>
        useTechnicianInteractionGateway({
          enabled: true,
          onUtterance: vi.fn(async () => ({ reply: "x".repeat(2_000) })),
        }),
      );

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        realtime.onFinal?.("Read the full answer.");
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.phase).toBe("speaking");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_001);
      });

      expect(speech.cancel).not.toHaveBeenCalled();
      expect(result.current.phase).toBe("speaking");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(216_000);
      });
      expect(speech.cancel).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("listening");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to listening quickly when device speech never starts", async () => {
    vi.useFakeTimers();
    try {
      speechFetch.mockResolvedValue({ ok: false });
      speech.speaking = false;
      speech.pending = false;
      const { result } = renderHook(() =>
        useTechnicianInteractionGateway({
          enabled: true,
          onUtterance: vi.fn(async () => ({ reply: "The reply is ready." })),
        }),
      );

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        realtime.onFinal?.("Can you hear me?");
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.phase).toBe("speaking");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_501);
      });

      expect(result.current.phase).toBe("listening");
      expect(result.current.error).toContain("could not start");
      expect(result.current.active).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the technician interrupt a spoken reply and resume the same Realtime session", async () => {
    const onUtterance = vi.fn(async () => ({ reply: "Long spoken response" }));
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      realtime.onFinal?.("What have we figured out?");
    });
    await waitFor(() => {
      expect(result.current.phase).toBe("speaking");
      expect(realtime.playAudio).toHaveBeenCalledTimes(1);
    });
    realtime.stopAudio.mockClear();

    act(() => {
      result.current.interrupt();
    });

    expect(speech.cancel).toHaveBeenCalled();
    expect(realtime.stopAudio).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(realtime.resume).toHaveBeenCalledTimes(1);
      expect(realtime.start).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("listening");
    });
  });

  it("discards an old in-flight reply after voice is stopped and restarted", async () => {
    const firstTurn = deferred<{ reply: string }>();
    const onUtterance = vi.fn(() => firstTurn.promise);
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      realtime.onFinal?.("Old turn");
    });
    await waitFor(() => expect(result.current.phase).toBe("thinking"));

    act(() => {
      result.current.stop();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("listening");
    expect(realtime.start).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstTurn.resolve({ reply: "This reply is stale" });
      await firstTurn.promise;
    });

    expect(speech.speak).not.toHaveBeenCalled();
    expect(speechFetch).not.toHaveBeenCalled();
    expect(realtime.playAudio).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");
  });

  it("does not let stale startup A stop a replacement startup B", async () => {
    const startupA = deferred<void>();
    let startCall = 0;
    realtime.start.mockImplementation(async () => {
      startCall += 1;
      if (startCall === 1) {
        await startupA.promise;
        return;
      }
      realtime.connected = true;
      realtime.onStateChange?.("listening");
    });

    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    let staleStartPromise: Promise<void> | undefined;
    act(() => {
      staleStartPromise = result.current.start();
    });
    await waitFor(() => expect(result.current.phase).toBe("connecting"));

    act(() => result.current.stop());
    expect(realtime.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");
    expect(realtime.start).toHaveBeenCalledTimes(2);

    await act(async () => {
      startupA.resolve();
      await staleStartPromise;
    });

    expect(realtime.stop).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");
  });

  it("deactivates voice mode when the live Realtime transport closes unexpectedly", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");

    act(() => {
      realtime.connected = false;
      realtime.onStateChange?.("idle");
    });

    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toContain("Voice connection ended");
  });

  it("allows a fresh start after a current Realtime startup failure", async () => {
    realtime.start
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockImplementationOnce(async () => {
        realtime.connected = true;
        realtime.onStateChange?.("listening");
      });

    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("error");

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("listening");
    expect(realtime.start).toHaveBeenCalledTimes(2);
  });
});
