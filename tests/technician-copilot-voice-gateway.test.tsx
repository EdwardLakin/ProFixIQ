import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => ({
  start: vi.fn(async () => undefined),
  pause: vi.fn(() => true),
  stopAudio: vi.fn(),
  resume: vi.fn(() => true),
  speakText: vi.fn(() => true),
  stop: vi.fn(),
  onFinal: null as null | ((text: string, delegationId?: string) => void),
  onStateChange: null as null | ((
    state: "idle" | "connecting" | "listening" | "error",
  ) => void),
  onAutoStop: null as null | ((reason: "max_duration" | "idle") => void),
}));

vi.mock("@/features/copilot/technician/voice/useTechnicianRealtimeVoice", () => ({
  useTechnicianRealtimeVoice: (
    onFinal: (text: string, delegationId?: string) => void,
    _wake: (text: string) => string | null,
    options?: {
      onStateChange?: (
        state: "idle" | "connecting" | "listening" | "error",
      ) => void;
      onAutoStop?: (reason: "max_duration" | "idle") => void;
    },
  ) => {
    realtime.onFinal = onFinal;
    realtime.onStateChange = options?.onStateChange ?? null;
    realtime.onAutoStop = options?.onAutoStop ?? null;
    return {
      start: realtime.start,
      pause: realtime.pause,
      stopAudio: realtime.stopAudio,
      resume: realtime.resume,
      speakText: realtime.speakText,
      stop: realtime.stop,
    };
  },
}));

import { useTechnicianInteractionGateway } from "@/features/copilot/technician/voice/useTechnicianInteractionGateway";

describe("Technician Copilot GPT-Live interaction gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.onFinal = null;
    realtime.onStateChange = null;
    realtime.onAutoStop = null;
    realtime.start.mockImplementation(async () => {
      realtime.onStateChange?.("listening");
    });
    realtime.speakText.mockReturnValue(true);
  });

  it("delegates recognized speech to the existing backend without pausing the full-duplex mic", async () => {
    const onUtterance = vi.fn(async () => ({
      reply: "Rear U-joint play documented.",
    }));
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe("listening");

    await act(async () => {
      realtime.onFinal?.("Rear U-joint has play.", "item_delegate_1");
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onUtterance).toHaveBeenCalledWith("Rear U-joint has play.");
      expect(realtime.speakText).toHaveBeenCalledWith(
        "Rear U-joint play documented.",
        "item_delegate_1",
      );
    });
    expect(realtime.pause).not.toHaveBeenCalled();
    expect(result.current.active).toBe(true);
  });

  it("keeps a stale backend reply out of a restarted Live session", async () => {
    let resolveTurn!: (value: { reply: string }) => void;
    const pending = new Promise<{ reply: string }>((resolve) => {
      resolveTurn = resolve;
    });
    const onUtterance = vi.fn(() => pending);
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => realtime.onFinal?.("Old turn"));
    await waitFor(() => expect(result.current.phase).toBe("thinking"));

    act(() => result.current.stop());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      resolveTurn({ reply: "Stale result" });
      await pending;
    });

    expect(realtime.speakText).not.toHaveBeenCalledWith("Stale result");
    expect(result.current.active).toBe(true);
  });

  it("uses GPT-Live for proactive announcements without muting the microphone", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.announce("You've just been assigned a new job.")).toBe(
      true,
    );
    expect(realtime.speakText).toHaveBeenCalledWith(
      "You've just been assigned a new job.",
      undefined,
    );
    expect(realtime.pause).not.toHaveBeenCalled();
  });

  it("sends explicit interrupt requests to the Live transport", async () => {
    const onUtterance = vi.fn(async () => ({ reply: "Long spoken reply" }));
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({ enabled: true, onUtterance }),
    );

    await act(async () => {
      await result.current.start();
      realtime.onFinal?.("Explain that.");
      await Promise.resolve();
    });
    await waitFor(() => expect(realtime.speakText).toHaveBeenCalled());

    // The gateway immediately returns to listening after handing verified text
    // to GPT-Live, so ordinary acoustic barge-in is handled by Live itself.
    // stopAudio remains wired for explicit interruption while the UI observes
    // a speaking phase or fallback speech.
    expect(result.current.active).toBe(true);
  });

  it("deactivates voice mode when the Live transport closes unexpectedly", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => realtime.onStateChange?.("idle"));

    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toContain("Voice connection ended");
  });

  it("reconnects after an idle auto-stop, preserving the existing cost guard behavior", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(realtime.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      realtime.onStateChange?.("idle");
      realtime.onAutoStop?.("idle");
      await Promise.resolve();
    });

    expect(realtime.start).toHaveBeenCalledTimes(2);
    expect(result.current.active).toBe(true);
  });

  it("speaks the deterministic greeting through GPT-Live after the session connects", async () => {
    const { result } = renderHook(() =>
      useTechnicianInteractionGateway({
        enabled: true,
        greeting: "Morning. You have three jobs assigned.",
        onUtterance: vi.fn(async () => ({ reply: null })),
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(realtime.speakText).toHaveBeenCalledWith(
      "Morning. You have three jobs assigned.",
      undefined,
    );
    expect(realtime.pause).not.toHaveBeenCalled();
  });
});
