"use client";

import { useEffect, useRef } from "react";

export type InspectionVoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "error";
export type InspectionVoiceAutoStopReason = "max_duration" | "idle";

export type InspectionVoiceOptions = {
  onStateChange?: (state: InspectionVoiceState) => void;
  onPulse?: () => void;
  onError?: (message: string) => void;
  onAutoStop?: (reason: InspectionVoiceAutoStopReason) => void;
  maxStreamingMs?: number;
  idleTimeoutMs?: number;
  maxPausedMs?: number;
  debug?: boolean;
};

const SAMPLE_RATE = 24_000;
const DEFAULT_MAX_STREAMING_MS = 60 * 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;
const GUARD_TICK_MS = 1_000;
const CONNECTION_TIMEOUT_MS = 15_000;
const PENDING_CALL_STORAGE_KEY = "profixiq:inspection-voice-pending-call";
const PROVIDER_MAX_CALL_MS = 60 * 60_000;

type PendingCall = { key: string; startedAt: number };

function readPendingCall(): PendingCall | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_CALL_STORAGE_KEY) ?? "null") as PendingCall | null;
    return value && /^[0-9a-f-]{36}$/i.test(value.key) && Number.isFinite(value.startedAt)
      ? value : null;
  } catch { return null; }
}

function writePendingCall(value: PendingCall | null): void {
  try {
    if (value) sessionStorage.setItem(PENDING_CALL_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_CALL_STORAGE_KEY);
  } catch {}
}

type Session = {
  peer: RTCPeerConnection | null;
  events: RTCDataChannel | null;
  stream: MediaStream | null;
  outputStream: MediaStream | null;
  audio: AudioContext | null;
  worklet: AudioWorkletNode | null;
  abort: AbortController;
  paused: boolean;
  providerStartedAt: number | null;
  lastTranscriptAt: number;
  guard: ReturnType<typeof setInterval> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  speaking: boolean;
  usageKey: string | null;
  usageReported: boolean;
  dataChannelOpen: boolean;
};

type UsageReportOutcome = "closed" | "not_found" | "pending";

function sendUsageReport(usageKey: string, durationSeconds: number): Promise<UsageReportOutcome> {
  const payload = JSON.stringify({
    usageKey,
    durationSeconds: Math.max(0, durationSeconds),
  });
  const sendBeacon = () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        navigator.sendBeacon(
          "/api/openai/inspection-transcription-usage",
          new Blob([payload], { type: "application/json" }),
        );
      }
    } catch {}
  };
  const send = async (attempt: number): Promise<UsageReportOutcome> => {
    try {
      const response = await fetch(
        "/api/openai/inspection-transcription-usage",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (response.status === 204) return "closed";
      if (response.status === 403 &&
          (await response.json().catch(() => null))?.code === "inspection_voice_settlement_not_found") {
        return "not_found";
      }
    } catch {}

    if (attempt < 2 && typeof window !== "undefined") {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 500 * (attempt + 1));
      });
      return send(attempt + 1);
    } else {
      sendBeacon();
      return "pending";
    }
  };
  return send(0);
}

function reportUsage(session: Session): Promise<boolean> {
  if (session.usageReported || !session.usageKey) return Promise.resolve(false);
  session.usageReported = true;
  const durationMs = session.providerStartedAt
    ? Date.now() - session.providerStartedAt
    : 0;
  return sendUsageReport(session.usageKey, durationMs / 1_000).then((outcome) => outcome === "closed");
}

function stopStream(stream: MediaStream | null): void {
  try {
    stream?.getTracks().forEach((track) => track.stop());
  } catch {}
}

function cleanup(session: Session): void {
  if (session.guard) clearInterval(session.guard);
  if (session.pauseTimer) clearTimeout(session.pauseTimer);
  session.guard = null;
  session.pauseTimer = null;
  try {
    session.worklet?.disconnect();
  } catch {}
  try {
    session.events?.close();
  } catch {}
  try {
    session.peer?.close();
  } catch {}
  stopStream(session.stream);
  stopStream(session.outputStream);
  try {
    void session.audio?.close();
  } catch {}
  session.events = null;
  session.peer = null;
  session.stream = null;
  session.outputStream = null;
  session.audio = null;
  session.worklet = null;
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      reject(new Error("Inspection voice connection setup timed out."));
    }, 5_000);
    const onStateChange = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeoutId);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function transcriptText(message: Record<string, unknown>): string {
  for (const key of ["transcript", "text", "final"]) {
    const value = message[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const COMPLETE_TYPES = new Set([
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.done",
  "input_audio_transcription.completed",
  "input_audio_transcription.done",
  "input_audio_buffer.transcription.completed",
  "input_audio_buffer.transcription.done",
]);

export function useCostOptimizedInspectionVoice(
  handleTranscript: (text: string) => void | Promise<unknown>,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: InspectionVoiceOptions,
) {
  const activeRef = useRef<Session | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const startGenerationRef = useRef(0);
  const pendingCallRef = useRef<PendingCall | null>(null);
  const handlerRef = useRef(handleTranscript);
  const wakeRef = useRef(maybeHandleWakeWord);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    handlerRef.current = handleTranscript;
  }, [handleTranscript]);
  useEffect(() => {
    wakeRef.current = maybeHandleWakeWord;
  }, [maybeHandleWakeWord]);

  const setState = (state: InspectionVoiceState) =>
    opts?.onStateChange?.(state);

  const clearPendingCall = (key: string) => {
    if (pendingCallRef.current?.key !== key) return;
    pendingCallRef.current = null;
    writePendingCall(null);
  };

  const finishReport = (session: Session) =>
    reportUsage(session).then((closed) => {
      if (closed && session.usageKey) clearPendingCall(session.usageKey);
    });

  function commit(session: Session): void {
    if (!session.events || session.events.readyState !== "open") return;
    session.events.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    session.worklet?.port.postMessage({ type: "committed" });
    session.speaking = false;
  }

  function stop(reason?: InspectionVoiceAutoStopReason): void {
    startGenerationRef.current += 1;
    startPromiseRef.current = null;
    const session = activeRef.current;
    activeRef.current = null;
    if (session) {
      session.abort.abort();
      // Keep the provider call alive long enough for the server to hang up
      // that exact call. Mute locally at once and clean up after bounded
      // report attempts; an unconfirmed closure retains its budget hold.
      session.stream?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      void finishReport(session).finally(() => cleanup(session));
    }
    setState("idle");
    if (reason) opts?.onAutoStop?.(reason);
  }

  async function startSession(operationKey: string): Promise<void> {
    if (activeRef.current) return;
    setState("connecting");

    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let worklet: AudioWorkletNode | null = null;
    let peer: RTCPeerConnection | null = null;
    let events: RTCDataChannel | null = null;

    peer = new RTCPeerConnection();
    events = peer.createDataChannel("oai-events");
    const sender = peer.addTransceiver("audio", { direction: "sendrecv" }).sender;

    const session: Session = {
      peer,
      events,
      stream,
      outputStream: null,
      audio,
      worklet,
      abort: new AbortController(),
      paused: false,
      providerStartedAt: null,
      lastTranscriptAt: Date.now(),
      guard: null,
      pauseTimer: null,
      speaking: false,
      usageKey: null,
      usageReported: false,
      dataChannelOpen: false,
    };
    activeRef.current = session;
    const ensureActive = () => {
      if (activeRef.current !== session) throw new Error("Inspection voice start cancelled.");
    };

    const failConnection = () => {
      if (activeRef.current !== session) return;
      session.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      void finishReport(session).finally(() => cleanup(session));
      activeRef.current = null;
      setState("error");
      opts?.onError?.("Inspection voice connection failed.");
    };

    const installGuard = () => {
      if (session.guard) return;
      const maxStreamingMs = opts?.maxStreamingMs ?? DEFAULT_MAX_STREAMING_MS;
      const idleTimeoutMs = opts?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
      session.guard = setInterval(() => {
        if (activeRef.current !== session) return;
        if (
          maxStreamingMs > 0 &&
          session.providerStartedAt &&
          Date.now() - session.providerStartedAt >= maxStreamingMs
        ) {
          stop("max_duration");
          return;
        }
        if (!session.dataChannelOpen) {
          if (session.providerStartedAt &&
              Date.now() - session.providerStartedAt >= CONNECTION_TIMEOUT_MS) {
            failConnection();
          }
          return;
        }
        if (session.paused) return;
        if (
          idleTimeoutMs > 0 &&
          Date.now() - session.lastTranscriptAt >= idleTimeoutMs &&
          !session.speaking
        ) {
          stop("idle");
        }
      }, GUARD_TICK_MS);
    };
    events.onopen = () => {
      if (activeRef.current !== session || !session.stream || session.dataChannelOpen) return;
      session.dataChannelOpen = true;
      setState("listening");
      if (session.speaking) {
        events?.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        session.worklet?.port.postMessage({ type: "open" });
      }
      session.lastTranscriptAt = Date.now();
      installGuard();
    };

    events.onmessage = (event) => {
      if (activeRef.current !== session || typeof event.data !== "string")
        return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const message = parsed as Record<string, unknown>;
      const type = String(message.type ?? "");
      if (opts?.debug && type) {
        // eslint-disable-next-line no-console
        console.log("[InspectionVoice]", type);
      }
      if (COMPLETE_TYPES.has(type)) {
        const finalText = transcriptText(message);
        if (!finalText) return;
        session.lastTranscriptAt = Date.now();
        const command = (wakeRef.current(finalText) ?? "").trim();
        if (!command) return;
        queueRef.current = queueRef.current
          .then(() => handlerRef.current(command))
          .catch((caught) => {
            // eslint-disable-next-line no-console
            console.error("[InspectionVoice] command failed", caught);
          });
        return;
      }
      if (type === "error") {
        const error =
          message.error && typeof message.error === "object"
            ? (message.error as Record<string, unknown>)
            : null;
        const errorMessage =
          error && typeof error.message === "string"
            ? error.message
            : "Inspection voice error";
        stop();
        opts?.onError?.(errorMessage);
      }
    };

    events.onerror = failConnection;
    events.onclose = () => {
      if (activeRef.current !== session) return;
      void finishReport(session);
      activeRef.current = null;
      cleanup(session);
      setState("idle");
    };
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === "failed") failConnection();
    };

    const onAudioFrame = (event: MessageEvent<{ type?: string }>) => {
      if (activeRef.current !== session) return;
      if (session.paused && event.data?.type !== "end") {
        // A start already put the processor in pending. Drain/commit that turn
        // while the microphone is disabled so resume can open the next turn.
        if (event.data?.type === "start") session.worklet?.port.postMessage({ type: "finish" });
        return;
      }
      if (event.data?.type === "start") {
        session.speaking = true;
        opts?.onPulse?.();
        if (session.events?.readyState === "open") {
          session.events.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          session.worklet?.port.postMessage({ type: "open" });
        }
      } else if (event.data?.type === "pulse") {
        opts?.onPulse?.();
      } else if (event.data?.type === "end") {
        // Let the final media frames reach the provider before the data-channel commit.
        window.setTimeout(() => {
          if (activeRef.current === session) commit(session);
        }, 300);
      }
    };

    try {
      const preflight = await fetch("/api/openai/inspection-transcription-token?protocol=server-webrtc", {
        method: "GET", cache: "no-store", credentials: "same-origin",
        signal: session.abort.signal,
      });
      ensureActive();
      if (!preflight.ok) {
        const body = await preflight.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Inspection voice could not start.");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (activeRef.current !== session) {
        stopStream(stream);
        return;
      }
      session.stream = stream;
      audio = new AudioContext({ sampleRate: SAMPLE_RATE });
      session.audio = audio;
      if (audio.state === "suspended") await audio.resume();
      ensureActive();
      await audio.audioWorklet.addModule("/voice/inspection-gated-processor.js");
      ensureActive();
      worklet = new AudioWorkletNode(audio, "inspection-gated-processor");
      const output = audio.createMediaStreamDestination();
      worklet.connect(output);
      session.worklet = worklet;
      session.outputStream = output.stream;
      worklet.port.onmessage = onAudioFrame;
      await sender.replaceTrack(output.stream.getAudioTracks()[0]);
      ensureActive();
      const offer = await peer.createOffer();
      ensureActive();
      await peer.setLocalDescription(offer);
      ensureActive();
      await waitForIceGathering(peer);
      ensureActive();
      const offerSdp = peer.localDescription?.sdp;
      if (!offerSdp)
        throw new Error("Inspection voice offer could not be created.");

      session.usageKey = operationKey;
      const pendingCall = { key: operationKey, startedAt: Date.now() };
      pendingCallRef.current = pendingCall;
      writePendingCall(pendingCall);
      const response = await fetch(
        "/api/openai/inspection-transcription-token",
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-profixiq-operation-key": operationKey,
          },
          body: JSON.stringify({ sdp: offerSdp }),
          signal: session.abort.signal,
        },
      );
      ensureActive();
      const sessionPayload = (await response.json().catch(() => null)) as {
        sdp?: unknown;
        transcriptionModel?: unknown;
        usageKey?: unknown;
        error?: unknown;
        code?: unknown;
      } | null;
      ensureActive();
      if (!response.ok || typeof sessionPayload?.sdp !== "string") {
        if (sessionPayload?.code === "inspection_voice_rejected" ||
            sessionPayload?.code === "inspection_voice_reservation_released" ||
            sessionPayload?.code === "ai_budget_exceeded") {
          clearPendingCall(operationKey);
        }
        throw new Error(
          typeof sessionPayload?.error === "string"
            ? sessionPayload.error
            : "Inspection voice could not start.",
        );
      }

      if (sessionPayload.usageKey !== operationKey) {
        throw new Error("Inspection voice operation receipt did not match its request.");
      }
      session.providerStartedAt = Date.now();
      installGuard();
      await peer.setRemoteDescription({
        type: "answer",
        sdp: sessionPayload.sdp,
      });
      ensureActive();
      audio.createMediaStreamSource(stream).connect(worklet);
      if (events.readyState === "open") events.onopen?.(new Event("open"));
    } catch (caught) {
      if (activeRef.current !== session) return;
      if (activeRef.current === session) {
        session.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
        void finishReport(session).finally(() => cleanup(session));
        activeRef.current = null;
        setState("error");
        const message =
          caught instanceof Error
            ? caught.message
            : "Inspection voice could not start.";
        opts?.onError?.(message);
      }
      throw caught;
    }
  }

  async function start(): Promise<void> {
    if (activeRef.current) return;
    if (startPromiseRef.current) return startPromiseRef.current;
    const generation = ++startGenerationRef.current;
    const starting = (async () => {
      const pending = pendingCallRef.current ?? readPendingCall();
      if (pending) {
        pendingCallRef.current = pending;
        if (Date.now() - pending.startedAt >= PROVIDER_MAX_CALL_MS + 60_000) {
          clearPendingCall(pending.key);
        } else {
          const outcome = await sendUsageReport(pending.key, 0);
          if (outcome === "closed") {
            clearPendingCall(pending.key);
          } else if (outcome === "not_found") {
            // The first POST may never have reached the server. Reuse its
            // idempotency key; an existing hold rejects replay before OpenAI.
            if (generation !== startGenerationRef.current) return;
            await startSession(pending.key);
            return;
          } else {
            throw new Error("The previous inspection voice call is still closing. Try again shortly.");
          }
        }
      }
      if (generation !== startGenerationRef.current) return;
      await startSession(globalThis.crypto.randomUUID());
    })();
    startPromiseRef.current = starting;
    try {
      await starting;
    } finally {
      if (startPromiseRef.current === starting) startPromiseRef.current = null;
    }
  }

  function pause(): boolean {
    const session = activeRef.current;
    if (!session || session.paused) return false;
    session.paused = true;
    session.stream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    if (session.speaking) session.worklet?.port.postMessage({ type: "finish" });
    const maxPausedMs = opts?.maxPausedMs ?? 0;
    if (maxPausedMs > 0) {
      session.pauseTimer = setTimeout(() => resume(), maxPausedMs);
    }
    return true;
  }

  function resume(): boolean {
    const session = activeRef.current;
    if (!session || !session.paused) return false;
    if (session.pauseTimer) clearTimeout(session.pauseTimer);
    session.pauseTimer = null;
    session.paused = false;
    session.stream?.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    setState("listening");
    return true;
  }

  // Inspection feedback intentionally does not use premium GPT-Live output.
  // Returning false sends the existing screen down its local speech fallback.
  function speakText(_text: string): boolean {
    return false;
  }

  function stopAudio(): void {}

  useEffect(() => () => stop(), []);

  return { start, stop, pause, resume, speakText, stopAudio };
}
