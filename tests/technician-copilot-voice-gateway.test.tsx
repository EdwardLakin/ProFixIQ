import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({
  connected: false,
  start: vi.fn(async () => undefined),
  pause: vi.fn(() => false),
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
  speak: vi.fn((_utterance: SpeechSynthesisUtterance) => undefined),
};

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
    realtime.start.mockImplementation(async () => {
      realtime.connected = true;
      realtime.onStateChange?.("listening");
      return undefined;
    });
    realtime.pause.mockImplementation(() => realtime.connected);
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "speechSynthesis");
  });

  it("pauses the live Realtime session for a CoPilot turn, speaks the persisted reply, then resumes it", async () => {
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
    expect(speech.speak).toHaveBeenCalledTimes(1);

    act(() => {
      realtime.onFinal?.("Late buffered transcript");
    });
    expect(onUtterance).toHaveBeenCalledTimes(1);

    const utterance = speech.speak.mock.calls[0]?.[0] as unknown as
      | FakeSpeechSynthesisUtterance
      | undefined;
    expect(utterance?.text).toBe("Reply to Rear U-joint has play.");

    act(() => {
      utterance?.onend?.();
    });

    await waitFor(() => {
      expect(realtime.resume).toHaveBeenCalledTimes(1);
      expect(realtime.start).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("listening");
    });
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
    await waitFor(() => expect(result.current.phase).toBe("speaking"));

    act(() => {
      result.current.interrupt();
    });

    expect(speech.cancel).toHaveBeenCalled();
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

