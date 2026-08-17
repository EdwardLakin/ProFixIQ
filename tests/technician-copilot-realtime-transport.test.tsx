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
    } as unknown as MediaStream,
    track,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const sockets: FakeWebSocket[] = [];
const audioContexts: FakeAudioContext[] = [];
const audioSources: FakeAudioBufferSource[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly send = vi.fn();

  constructor() {
    sockets.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emit(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

class FakeAudioWorkletNode {
  readonly port = { onmessage: null as ((event: MessageEvent) => void) | null };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeAudioBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();

  finish() {
    this.onended?.();
  }
}

class FakeAudioContext {
  readonly state = "running" as AudioContextState;
  readonly destination = {} as AudioDestinationNode;
  readonly audioWorklet = {
    addModule: vi.fn(async () => undefined),
  } as unknown as AudioWorklet;
  readonly resume = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => undefined);
  readonly decodeAudioData = vi.fn(async () => ({
    duration: 1,
  } as AudioBuffer));

  constructor() {
    audioContexts.push(this);
  }

  createMediaStreamSource() {
    return { connect: vi.fn() } as unknown as MediaStreamAudioSourceNode;
  }

  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GainNode;
  }

  createBufferSource() {
    const source = new FakeAudioBufferSource();
    audioSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

describe("Technician CoPilot-owned Realtime transport", () => {
  const getUserMedia = vi.fn();
  const fetchToken = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      token: "ephemeral-token",
      transcriptionModel: "gpt-4o-mini-transcribe",
    }),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    sockets.splice(0, sockets.length);
    audioContexts.splice(0, audioContexts.length);
    audioSources.splice(0, audioSources.length);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("fetch", fetchToken);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns pause, resume, final transcripts, and dead-socket cleanup without touching inspection voice", async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const onFinalTranscript = vi.fn();
    const onStateChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useTechnicianRealtimeVoice(
        onFinalTranscript,
        (text) => text.trim(),
        { onStateChange },
      ),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(sockets).toHaveLength(1);
    act(() => sockets[0]?.open());
    expect(onStateChange).toHaveBeenLastCalledWith("listening");

    expect(result.current.pause()).toBe(true);
    expect(track.enabled).toBe(false);
    act(() => {
      sockets[0]?.emit({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "late buffered transcript",
      });
    });
    expect(onFinalTranscript).not.toHaveBeenCalled();

    expect(result.current.resume()).toBe(true);
    expect(track.enabled).toBe(true);
    act(() => {
      sockets[0]?.emit({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Rear U-joint has play.",
      });
    });
    expect(onFinalTranscript).toHaveBeenCalledWith("Rear U-joint has play.");

    expect(result.current.pause()).toBe(true);
    if (sockets[0]) sockets[0].readyState = FakeWebSocket.CLOSING;
    expect(result.current.resume()).toBe(false);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(onStateChange).not.toHaveBeenLastCalledWith("idle");
    unmount();
  });

  it("cleans only a cancelled startup and leaves its replacement transport alive", async () => {
    const startupA = deferred<MediaStream>();
    const first = fakeStream();
    const replacement = fakeStream();
    getUserMedia
      .mockImplementationOnce(() => startupA.promise)
      .mockResolvedValueOnce(replacement.stream);
    const { result, unmount } = renderHook(() =>
      useTechnicianRealtimeVoice(vi.fn(), (text) => text),
    );

    let staleStart!: Promise<void>;
    act(() => {
      staleStart = result.current.start();
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    act(() => result.current.stop());
    await act(async () => {
      await result.current.start();
    });
    expect(sockets).toHaveLength(1);
    act(() => sockets[0]?.open());

    await act(async () => {
      startupA.resolve(first.stream);
      await staleStart;
    });

    expect(first.track.stop).toHaveBeenCalledTimes(1);
    expect(replacement.track.stop).not.toHaveBeenCalled();
    expect(sockets[0]?.readyState).toBe(FakeWebSocket.OPEN);
    unmount();
  });

  it("decodes generated speech in the unlocked Realtime audio context and supports interruption", async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const { result, unmount } = renderHook(() =>
      useTechnicianRealtimeVoice(vi.fn(), (text) => text),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => sockets[0]?.open());
    expect(result.current.pause()).toBe(true);

    const firstPlayback = result.current.playAudio(
      new Uint8Array([1, 2, 3]).buffer,
    );
    await waitFor(() => expect(audioSources).toHaveLength(1));
    expect(audioContexts[0]?.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(audioSources[0]?.connect).toHaveBeenCalledWith(
      audioContexts[0]?.destination,
    );
    expect(audioSources[0]?.start).toHaveBeenCalledTimes(1);

    audioSources[0]?.finish();
    await expect(firstPlayback).resolves.toBeUndefined();

    const interruptedPlayback = result.current.playAudio(
      new Uint8Array([4, 5, 6]).buffer,
    );
    await waitFor(() => expect(audioSources).toHaveLength(2));
    result.current.stopAudio();
    await expect(interruptedPlayback).resolves.toBeUndefined();
    expect(audioSources[1]?.stop).toHaveBeenCalledTimes(1);

    expect(result.current.resume()).toBe(true);
    unmount();
  });

  it("resets a failed startup so a later start can succeed", async () => {
    const replacement = fakeStream();
    getUserMedia
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(replacement.stream);
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useTechnicianRealtimeVoice(vi.fn(), (text) => text, { onError }),
    );

    await act(async () => {
      await expect(result.current.start()).rejects.toThrow("permission denied");
    });
    expect(onError).toHaveBeenCalledWith("permission denied");

    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(1);
    unmount();
  });
});
