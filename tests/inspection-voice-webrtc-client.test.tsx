import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCostOptimizedInspectionVoice } from "@/features/inspections/lib/inspection/useCostOptimizedInspectionVoice";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({ auth }),
}));

const operationKey = "a1000000-0000-4000-8000-000000000001";
const secondKey = "a1000000-0000-4000-8000-000000000002";

class FakeTrack {
  enabled = true;
  stop = vi.fn();
}

class FakeStream {
  track = new FakeTrack();
  getAudioTracks = () => [this.track];
  getTracks = () => [this.track];
}

class FakeNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class FakeWorklet extends FakeNode {
  port: { onmessage: ((event: MessageEvent) => void) | null; postMessage: ReturnType<typeof vi.fn> } = {
    onmessage: null,
    postMessage: vi.fn(),
  };
}

class FakeAudioContext {
  state = "running";
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  source = new FakeNode();
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } });
  outputStream = new FakeStream();
  createMediaStreamDestination = vi.fn(() => Object.assign(new FakeNode(), { stream: this.outputStream }));
  createMediaStreamSource = vi.fn(() => this.source);
  createGain = vi.fn(() => this.gain);
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

class FakeDataChannel {
  readyState = "connecting";
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = "closed";
  });
}

class FakePeerConnection {
  static instance: FakePeerConnection | null = null;
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  channel = new FakeDataChannel();
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  sender = { replaceTrack: vi.fn().mockResolvedValue(undefined) };
  addTransceiver = vi.fn(() => ({ sender: this.sender }));
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi
    .fn()
    .mockResolvedValue({ type: "offer", sdp: "v=0\r\no=offer" });
  setLocalDescription = vi.fn(async (offer: RTCSessionDescriptionInit) => {
    this.localDescription = offer;
  });
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);

  constructor() {
    FakePeerConnection.instance = this;
  }
}

describe("inspection voice WebRTC client", () => {
  beforeEach(() => { auth.getUser.mockResolvedValue({ data: { user: { id: "actor_1" } }, error: null }); });
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakePeerConnection.instance = null;
  });

  it("uses one idempotent server-created peer session and preserves transcript commands", async () => {
    const stream = new FakeStream();
    const worklet = new FakeWorklet();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("inspection-transcription-usage")) {
          return new Response(null, { status: 204 });
        }
        if (init?.method === "GET") return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify({
            sdp: "answer-sdp",
            transcriptionModel: "gpt-live-transcribe",
            usageKey: operationKey,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    function AudioWorkletNodeMock() {
      return worklet;
    }
    vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeMock);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      operationKey,
    );
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockImplementation(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/openai/inspection-transcription-token?protocol=server-webrtc", expect.objectContaining({ method: "GET" }),
        );
        expect(fetchMock).not.toHaveBeenCalledWith(
          "/api/openai/inspection-transcription-token", expect.objectContaining({ method: "POST" }),
        );
        return Promise.resolve(stream);
      }) },
    });

    const handleTranscript = vi.fn();
    const { result } = renderHook(() =>
      useCostOptimizedInspectionVoice(handleTranscript, (text) =>
        text.replace(/^profix\s+/i, ""),
      ),
    );

    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    const peer = FakePeerConnection.instance;
    expect(peer).not.toBeNull();
    expect(peer?.addTransceiver).toHaveBeenCalledWith("audio", { direction: "sendrecv" });
    expect(peer?.sender.replaceTrack).toHaveBeenCalledWith(expect.any(FakeTrack));
    expect(peer?.sender.replaceTrack).not.toHaveBeenCalledWith(stream.track);
    expect(peer?.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openai/inspection-transcription-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sdp: "v=0\r\no=offer" }),
        headers: {
          "Content-Type": "application/json",
          "x-profixiq-operation-key": "a1000000-0000-4000-8000-000000000001",
          "x-profixiq-actor-id": "actor_1",
        },
      }),
    );
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("inspection-transcription-token"),
      ),
      ).toHaveLength(2);

    peer!.channel.readyState = "open";
    act(() => peer!.channel.onopen?.());
    expect(peer!.channel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.clear" }),
    );
    act(() => {
      worklet.port.onmessage?.({ data: { type: "start" } } as MessageEvent);
    });
    expect(peer!.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.clear" }),
    );
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "open" });
    act(() => worklet.port.onmessage?.({ data: { type: "end" } } as MessageEvent));
    await vi.waitFor(() => expect(peer!.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    ));
    expect(peer!.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    );
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "committed" });
    act(() => {
      peer!.channel.onmessage?.({
        data: JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "ProFix mark brakes failed",
        }),
      } as MessageEvent);
    });
    await vi.waitFor(() => {
      expect(handleTranscript).toHaveBeenCalledWith("mark brakes failed");
    });

    expect(result.current.pause()).toBe(true);
    expect(stream.track.enabled).toBe(false);
    expect(result.current.resume()).toBe(true);
    expect(stream.track.enabled).toBe(true);

    now = 31_000;
    act(() => result.current.stop());
    await vi.waitFor(() => {
      expect(peer?.channel.close).toHaveBeenCalledTimes(1);
      expect(peer?.close).toHaveBeenCalledTimes(1);
      expect(stream.track.stop).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      const usageCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes("inspection-transcription-usage"),
      );
      expect(usageCall).toBeDefined();
      expect(JSON.parse(String(usageCall?.[1]?.body))).toEqual({
        usageKey: operationKey,
        durationSeconds: 30,
      });
    });
  });

  it("stops a pending setup without surfacing an error and permits immediate restart", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(operationKey).mockReturnValueOnce(secondKey);
    let finishFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "GET"
        ? Promise.resolve(new Response(null, { status: 204 }))
        : String(_input).includes("inspection-transcription-usage")
          ? Promise.resolve(new Response(null, { status: 204 }))
        : firstResponse,
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useCostOptimizedInspectionVoice(vi.fn(), (text) => text, { onError }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.start();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
    act(() => result.current.stop());
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === "GET"
        ? new Response(null, { status: 204 })
        : String(_input).includes("inspection-transcription-usage")
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ sdp: "answer", usageKey: secondKey }), { status: 200 })),
    );
    await act(async () => result.current.start());
    finishFirst(new Response(JSON.stringify({ sdp: "old", usageKey: operationKey })));
    await act(async () => pending);
    expect(onError).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([input, init]) =>
      String(input).includes("inspection-transcription-token") && init?.method === "POST",
    )).toHaveLength(2);
    act(() => result.current.stop());
  });

  it("counts elapsed provider time, including silence and pause, for the usage report", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("inspection-transcription-usage")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const { result } = renderHook(() =>
      useCostOptimizedInspectionVoice(vi.fn(), (text) => text),
    );
    await act(async () => result.current.start());
    now += 120_000;
    act(() => result.current.pause());
    now += 30_000;
    act(() => result.current.stop());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openai/inspection-transcription-usage",
      expect.objectContaining({ body: JSON.stringify({ usageKey: operationKey, durationSeconds: 150 }) }),
    );
  });

  it("mutes immediately but keeps WebRTC open until server completion resolves", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    let finishUsage!: (response: Response) => void;
    const usageResponse = new Promise<Response>((resolve) => { finishUsage = resolve; });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) =>
      String(input).includes("inspection-transcription-usage")
        ? usageResponse
        : Promise.resolve(new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 })),
    ));
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const stream = new FakeStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => result.current.start());
    const peer = FakePeerConnection.instance!;
    act(() => result.current.stop());
    expect(stream.track.enabled).toBe(false);
    expect(peer.close).not.toHaveBeenCalled();
    finishUsage(new Response(null, { status: 204 }));
    await vi.waitFor(() => expect(peer.close).toHaveBeenCalledTimes(1));
  });

  it("does not create a billable call while microphone permission is pending", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    let grant!: (stream: FakeStream) => void;
    const permission = new Promise<FakeStream>((resolve) => { grant = resolve; });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === "GET"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn(() => permission) },
    });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.start(); await vi.waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()); });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/openai/inspection-transcription-token", expect.objectContaining({ method: "POST" }),
    );
    act(() => result.current.stop());
    const stream = new FakeStream();
    grant(stream);
    await act(async () => pending);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
  });

  it("ends an active call when the provider reports an error", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === "GET" || String(_input).includes("inspection-transcription-usage")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text, { onError }));
    await act(async () => result.current.start());
    const peer = FakePeerConnection.instance!;
    act(() => peer.channel.onmessage?.({ data: JSON.stringify({ type: "error", error: { message: "provider failed" } }) } as MessageEvent));
    expect(onError).toHaveBeenCalledWith("provider failed");
    await vi.waitFor(() => expect(peer.close).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/openai/inspection-transcription-usage", expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps an ambiguous POST key until closure succeeds before issuing a new call", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(operationKey).mockReturnValueOnce(secondKey);
    let postCount = 0;
    let usageCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(null, { status: 204 });
      if (String(input).includes("inspection-transcription-usage")) {
        usageCount += 1;
        return new Response(null, { status: usageCount <= 3 ? 503 : 204 });
      }
      postCount += 1;
      if (postCount === 1) throw new Error("response lost after provider accepted call");
      return new Response(JSON.stringify({ sdp: "answer", usageKey: secondKey }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => { await expect(result.current.start()).rejects.toThrow("response lost"); });
    expect(JSON.parse(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_1")!)).toEqual({
      actorId: "actor_1", key: operationKey, startedAt: expect.any(Number),
    });
    await vi.waitFor(() => expect(usageCount).toBeGreaterThanOrEqual(3), { timeout: 3_000 });
    await act(async () => result.current.start());
    expect(fetchMock.mock.calls.findIndex(([input]) => String(input).includes("inspection-transcription-usage")))
      .toBeLessThan(fetchMock.mock.calls.findLastIndex(([input, init]) =>
        String(input).includes("inspection-transcription-token") && init?.method === "POST"));
    expect(postCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-usage",
      expect.objectContaining({ body: JSON.stringify({ usageKey: operationKey, durationSeconds: 0 }) }));
    act(() => result.current.stop());
  });

  it.each(["inspection_voice_operation_recovery_required", "inspection_voice_rate_receipt_unavailable"])(
    "retains the original key on %s until its issuing call closes", async (code) => {
      sessionStorage.setItem("profixiq:inspection-voice-pending-call:actor_1", JSON.stringify({ actorId: "actor_1", key: operationKey, startedAt: Date.now() }));
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(secondKey);
      let originalReceiptReady = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "GET") return new Response(null, { status: 204 });
        if (String(input).includes("inspection-transcription-usage")) {
          if (originalReceiptReady) return new Response(null, { status: 204 });
          return new Response(JSON.stringify({ code: "inspection_voice_settlement_not_found" }), { status: 403 });
        }
        if (JSON.parse(init!.body as string).sdp && !originalReceiptReady) {
          return new Response(JSON.stringify({ code, error: "Original call is pending" }), { status: 409 });
        }
        return new Response(JSON.stringify({ sdp: "answer", usageKey: secondKey }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      vi.stubGlobal("AudioContext", FakeAudioContext);
      vi.stubGlobal("AudioWorkletNode", FakeWorklet);
      vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
      });
      const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
      await act(async () => { await expect(result.current.start()).rejects.toThrow("Original call is pending"); });
      expect(JSON.parse(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_1")!).key).toBe(operationKey);
      expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-token", expect.objectContaining({
        headers: expect.objectContaining({ "x-profixiq-operation-key": operationKey }),
      }));
      originalReceiptReady = true;
      await act(async () => result.current.start());
      expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-usage", expect.objectContaining({
        body: JSON.stringify({ usageKey: operationKey, durationSeconds: 0 }),
      }));
      expect(fetchMock).toHaveBeenLastCalledWith("/api/openai/inspection-transcription-token", expect.objectContaining({
        headers: expect.objectContaining({ "x-profixiq-operation-key": secondKey }),
      }));
      act(() => result.current.stop());
    },
  );

  it("keeps each signed-in user's pending credential separate across account switches", async () => {
    const thirdKey = "a1000000-0000-4000-8000-000000000003";
    sessionStorage.setItem("profixiq:inspection-voice-pending-call:actor_1", JSON.stringify({ actorId: "actor_1", key: operationKey, startedAt: Date.now() }));
    let actorId = "actor_2";
    auth.getUser.mockImplementation(async () => ({ data: { user: { id: actorId } }, error: null }));
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(secondKey).mockReturnValueOnce(thirdKey);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET" || String(input).includes("inspection-transcription-usage")) return new Response(null, { status: 204 });
      const key = (init!.headers as Record<string, string>)["x-profixiq-operation-key"];
      return new Response(JSON.stringify({ sdp: "answer", usageKey: key }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) } });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => result.current.start());
    expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-token", expect.objectContaining({
      headers: expect.objectContaining({ "x-profixiq-operation-key": secondKey, "x-profixiq-actor-id": "actor_2" }),
    }));
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("inspection-transcription-usage"))).toBe(false);
    expect(JSON.parse(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_1")!).key).toBe(operationKey);
    act(() => result.current.stop());
    await vi.waitFor(() => expect(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_2")).toBeNull());
    actorId = "actor_1";
    await act(async () => result.current.start());
    expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-usage", expect.objectContaining({
      body: JSON.stringify({ usageKey: operationKey, durationSeconds: 0 }),
    }));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/openai/inspection-transcription-token", expect.objectContaining({
      headers: expect.objectContaining({ "x-profixiq-operation-key": thirdKey, "x-profixiq-actor-id": "actor_1" }),
    }));
    act(() => result.current.stop());
  });

  it("clears a known pre-provider failure key before the next start", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(operationKey).mockReturnValueOnce(secondKey);
    let postCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET" || String(input).includes("inspection-transcription-usage")) {
        return new Response(null, { status: 204 });
      }
      postCount += 1;
      if (postCount === 1) return new Response(JSON.stringify({
        code: "inspection_voice_rate_receipt_unavailable", error: "Rate receipt unavailable",
      }), { status: 503 });
      return new Response(JSON.stringify({ sdp: "answer", usageKey: secondKey }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => { await expect(result.current.start()).rejects.toThrow("Rate receipt unavailable"); });
    expect(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_1")).toBeNull();
    await act(async () => result.current.start());
    expect(postCount).toBe(2);
    act(() => result.current.stop());
  });

  it("retries the same key when the first token POST never reached the server", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(operationKey);
    let postCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(null, { status: 204 });
      if (String(input).includes("inspection-transcription-usage")) {
        return new Response(JSON.stringify({ code: "inspection_voice_settlement_not_found" }), { status: 403 });
      }
      postCount += 1;
      if (postCount === 1) throw new Error("request never reached server");
      return new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => { await expect(result.current.start()).rejects.toThrow("request never reached server"); });
    await act(async () => result.current.start());
    expect(postCount).toBe(2);
    expect(fetchMock.mock.calls.filter(([input, init]) =>
      String(input).includes("inspection-transcription-token") && init?.method === "POST")
      .map(([, init]) => (init?.headers as Record<string, string>)["x-profixiq-operation-key"]))
      .toEqual([operationKey, operationKey]);
    act(() => result.current.stop());
  });

  it("closes a provider-accepted call if its data channel never opens", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "GET" || String(_input).includes("inspection-transcription-usage")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) },
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text, { onError }));
    vi.useFakeTimers();
    await act(async () => result.current.start());
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    expect(onError).toHaveBeenCalledWith("Inspection voice connection failed.");
    expect(fetchMock).toHaveBeenCalledWith("/api/openai/inspection-transcription-usage",
      expect.objectContaining({ method: "POST" }));
    expect(FakePeerConnection.instance?.close).toHaveBeenCalledTimes(1);
  });
  it.each(["stop", "unmount"])("honors %s during pending-key recovery", async (cancel) => {
    sessionStorage.setItem("profixiq:inspection-voice-pending-call:actor_1", JSON.stringify({ actorId: "actor_1", key: operationKey, startedAt: Date.now() }));
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    const { result, unmount } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    let starting!: Promise<void>;
    await act(async () => { starting = result.current.start(); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); });
    act(() => { if (cancel === "stop") result.current.stop(); else unmount(); });
    await act(async () => {
      finish(new Response(JSON.stringify({ code: "inspection_voice_settlement_not_found" }), { status: 403 }));
      await starting;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakePeerConnection.instance).toBeNull();
  });

  it("retires a released replay key after receiptless recovery", async () => {
    sessionStorage.setItem("profixiq:inspection-voice-pending-call:actor_1", JSON.stringify({ actorId: "actor_1", key: operationKey, startedAt: Date.now() }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ code: String(input).includes("inspection-transcription-usage")
        ? "inspection_voice_settlement_not_found" : "inspection_voice_reservation_released", error: "Session already released" }), { status: String(input).includes("inspection-transcription-usage") ? 403 : 409 });
    }));
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeWorklet);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) } });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    await act(async () => { await expect(result.current.start()).rejects.toThrow("Session already released"); });
    expect(sessionStorage.getItem("profixiq:inspection-voice-pending-call:actor_1")).toBeNull();
  });

  it("resynchronizes a VAD start delivered while paused before resuming speech", async () => {
    const worklet = new FakeWorklet();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "GET" || String(input).includes("inspection-transcription-usage")
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ sdp: "answer", usageKey: operationKey }), { status: 200 })));
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", function () { return worklet; });
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(new FakeStream()) } });
    const { result } = renderHook(() => useCostOptimizedInspectionVoice(vi.fn(), (text) => text));
    vi.useFakeTimers();
    await act(async () => result.current.start());
    const channel = FakePeerConnection.instance!.channel;
    channel.readyState = "open";
    act(() => channel.onopen?.());
    act(() => result.current.pause());
    act(() => worklet.port.onmessage?.({ data: { type: "start" } } as MessageEvent));
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "finish" });
    act(() => worklet.port.onmessage?.({ data: { type: "end" } } as MessageEvent));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "committed" });
    act(() => result.current.resume());
    act(() => worklet.port.onmessage?.({ data: { type: "start" } } as MessageEvent));
    expect(worklet.port.postMessage).toHaveBeenCalledWith({ type: "open" });
    act(() => result.current.stop());
  });

});
