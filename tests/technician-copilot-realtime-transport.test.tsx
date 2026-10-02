import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTechnicianRealtimeVoice } from "@/features/copilot/technician/voice/useTechnicianRealtimeVoice";

type FakeTrack = MediaStreamTrack & {
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
};

function fakeStream() {
  const track = {
    enabled: true,
    stop: vi.fn(),
  } as unknown as FakeTrack;
  return {
    stream: {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream,
    track,
  };
}

class FakeDataChannel {
  readyState: RTCDataChannelState = "open";
  readonly send = vi.fn();
  private listeners = new Map<string, Array<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emit(message: Record<string, unknown>) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }

  close() {
    this.readyState = "closed";
    for (const listener of this.listeners.get("close") ?? []) listener({});
  }
}

const peers: FakePeerConnection[] = [];
const channels: FakeDataChannel[] = [];

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "connected";
  localDescription: RTCSessionDescriptionInit | null = null;
  readonly addTrack = vi.fn();
  readonly close = vi.fn();
  readonly setRemoteDescription = vi.fn(async () => undefined);
  private listeners = new Map<string, Array<(event: any) => void>>();

  constructor() {
    peers.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  createDataChannel() {
    const channel = new FakeDataChannel();
    channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "offer-sdp" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
}

describe("Technician CoPilot GPT-Live WebRTC transport", () => {
  const getUserMedia = vi.fn();
  const fetchSession = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      session: { id: "live_123" },
      transport: { type: "webrtc", sdp: "answer-sdp" },
    }),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    peers.splice(0, peers.length);
    channels.splice(0, channels.length);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("fetch", fetchSession);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startVoice(
    onTranscript = vi.fn(),
    options: Parameters<typeof useTechnicianRealtimeVoice>[2] = {},
  ) {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const rendered = renderHook(() =>
      useTechnicianRealtimeVoice(onTranscript, (text) => text.trim(), options),
    );
    await act(async () => {
      await rendered.result.current.start();
    });
    act(() => {
      channels[0]?.emit({
        type: "session.started",
        session: { id: "live_123" },
      });
    });
    return { ...rendered, track };
  }

  it("creates a WebRTC Live session for the Technician Copilot surface", async () => {
    const onStateChange = vi.fn();
    const { unmount } = await startVoice(vi.fn(), { onStateChange });

    expect(peers).toHaveLength(1);
    expect(channels).toHaveLength(1);
    expect(fetchSession).toHaveBeenCalledWith(
      "/api/openai/realtime-token",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
    const request = fetchSession.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      sdp: "offer-sdp",
      surface: "technician_copilot",
    });
    expect(peers[0]?.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(onStateChange).toHaveBeenLastCalledWith("listening");
    unmount();
  });

  it("delegates a transcript to the existing backend and speaks verified commentary through Live", async () => {
    vi.useFakeTimers();
    try {
      const onTranscript = vi.fn();
      const { result, unmount } = await startVoice(onTranscript);

      act(() => {
        channels[0]?.emit({
          type: "session.input_transcript.delta",
          delta: "Rear U-joint has play.",
          start_ms: 100,
          end_ms: 900,
        });
        channels[0]?.emit({
          type: "session.delegation.created",
          offset_ms: 950,
          delegation: {
            id: "item_delegate_1",
            type: "delegation",
            target: "client",
          },
        });
        vi.advanceTimersByTime(200);
      });

      expect(onTranscript).toHaveBeenCalledWith("Rear U-joint has play.");

      expect(result.current.speakText("Documented rear U-joint play.")).toBe(true);
      const sent = channels[0]?.send.mock.calls.map(([payload]) =>
        JSON.parse(String(payload)) as Record<string, unknown>,
      );
      expect(sent).toContainEqual(
        expect.objectContaining({
          type: "session.commentary.append",
          delegation_id: "item_delegate_1",
          content: "Documented rear U-joint play.",
        }),
      );
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mutes and resumes the microphone without ending the Live session", async () => {
    const { result, track, unmount } = await startVoice();

    expect(result.current.pause()).toBe(true);
    expect(track.enabled).toBe(false);
    expect(
      channels[0]?.send.mock.calls.some(
        ([payload]) => JSON.parse(String(payload)).type === "session.input_audio.mute",
      ),
    ).toBe(true);

    expect(result.current.resume()).toBe(true);
    expect(track.enabled).toBe(true);
    expect(
      channels[0]?.send.mock.calls.some(
        ([payload]) => JSON.parse(String(payload)).type === "session.input_audio.unmute",
      ),
    ).toBe(true);
    unmount();
  });

  it("stops an idle Live session at the spend guard", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const onAutoStop = vi.fn();
      const onStateChange = vi.fn();
      const { unmount } = await startVoice(vi.fn(), {
        idleTimeoutMs: 5_000,
        maxStreamingMs: 60_000,
        onAutoStop,
        onStateChange,
      });

      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });

      expect(onAutoStop).toHaveBeenCalledWith("idle");
      expect(onStateChange).toHaveBeenLastCalledWith("idle");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets a failed startup so a later start can succeed", async () => {
    const replacement = fakeStream();
    getUserMedia
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(replacement.stream);
    const onError = vi.fn();
    const rendered = renderHook(() =>
      useTechnicianRealtimeVoice(vi.fn(), (text) => text, { onError }),
    );

    await act(async () => {
      await expect(rendered.result.current.start()).rejects.toThrow(
        "permission denied",
      );
    });
    expect(onError).toHaveBeenCalledWith("permission denied");

    await act(async () => {
      await rendered.result.current.start();
    });
    await waitFor(() => expect(peers).toHaveLength(2));
    rendered.unmount();
  });
});
