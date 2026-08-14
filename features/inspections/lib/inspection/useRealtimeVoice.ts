// /useRealtimeVoice.ts
// Shared OpenAI Realtime transcription transport used by inspections and the
// Technician CoPilot. Wake/command evaluation remains final-transcript only.

"use client";

import { useEffect, useRef } from "react";
import { getOpenAIRealtimeTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

type HandleTranscriptFn = (text: string) => void;

type RealtimeVoiceOptions = {
  /** Called when WS connects / stops / errors */
  onStateChange?: (state: VoiceState) => void;

  /** Called when we detect audio activity OR transcript delta. */
  onPulse?: () => void;

  /** Optional: surface error message to UI */
  onError?: (message: string) => void;

  /** RMS threshold for audio activity. */
  audioPulseThreshold?: number;

  /** Minimum ms between pulses. */
  pulseDebounceMs?: number;

  /** Optional debug logs. */
  debug?: boolean;
};

type RealtimeTokenResponse = {
  token?: string;
  transcriptionModel?: string;
};

type RealtimeTokenErrorResponse = {
  error?: string;
  code?: string;
};

async function getRealtimeTokenError(response: Response): Promise<string> {
  let body: RealtimeTokenErrorResponse | null = null;
  try {
    body = (await response.json()) as RealtimeTokenErrorResponse;
  } catch {
    // The status mapping below still gives the technician a useful message.
  }

  if (response.status === 401) {
    return "Your session expired. Sign in again, then retry voice.";
  }
  if (response.status === 403) {
    return "Voice is not available for this account.";
  }
  if (response.status === 429) {
    return "Voice is busy. Wait a moment and try again.";
  }

  switch (body?.code) {
    case "realtime_not_configured":
      return "Voice is not configured for this deployment.";
    case "realtime_upstream_timeout":
      return "Voice took too long to connect. Try again.";
    case "realtime_session_rejected":
    case "realtime_invalid_response":
    case "realtime_token_error":
      return "Voice could not start. Try again in a moment.";
    default:
      return body?.error?.trim() || "Voice could not start.";
  }
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function rms(float32: Float32Array): number {
  if (float32.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < float32.length; i++) {
    const v = float32[i];
    sum += v * v;
  }
  return Math.sqrt(sum / float32.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stopStream(stream: MediaStream | null | undefined): void {
  try {
    stream?.getTracks().forEach((track) => track.stop());
  } catch {}
}

const TRANSCRIPTION_DELTA_TYPES = new Set<string>([
  "conversation.item.input_audio_transcription.delta",
  "input_audio_transcription.delta",
  "input_audio_buffer.transcription.delta",
]);

const TRANSCRIPTION_COMPLETE_TYPES = new Set<string>([
  "conversation.item.input_audio_transcription.completed",
  "conversation.item.input_audio_transcription.done",
  "input_audio_transcription.completed",
  "input_audio_transcription.done",
  "input_audio_buffer.transcription.completed",
  "input_audio_buffer.transcription.done",
]);

function getStringField(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function useRealtimeVoice(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeVoiceOptions,
) {
  const transcriptionModel = getOpenAIRealtimeTranscriptionModel();
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const zeroGainRef = useRef<GainNode | null>(null);

  const lastPulseAtRef = useRef(0);
  const stoppedRef = useRef(true);
  const pausedRef = useRef(false);
  const startupGenerationRef = useRef(0);
  const liveRef = useRef("");

  const handleTranscriptRef = useRef<HandleTranscriptFn>(handleTranscript);
  const maybeHandleWakeWordRef = useRef<(text: string) => string | null>(
    maybeHandleWakeWord,
  );

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript;
  }, [handleTranscript]);

  useEffect(() => {
    maybeHandleWakeWordRef.current = maybeHandleWakeWord;
  }, [maybeHandleWakeWord]);

  const setState = (state: VoiceState) => {
    opts?.onStateChange?.(state);
  };

  const pulse = () => {
    const now = Date.now();
    const debounce =
      typeof opts?.pulseDebounceMs === "number" ? opts.pulseDebounceMs : 250;
    if (now - lastPulseAtRef.current < debounce) return;
    lastPulseAtRef.current = now;
    opts?.onPulse?.();
  };

  function cleanupResources(): void {
    try {
      workletRef.current?.disconnect();
    } catch {}
    workletRef.current = null;

    try {
      zeroGainRef.current?.disconnect();
    } catch {}
    zeroGainRef.current = null;

    const socket = wsRef.current;
    wsRef.current = null;
    try {
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }
    } catch {}

    stopStream(mediaStreamRef.current);
    mediaStreamRef.current = null;

    const audioContext = audioCtxRef.current;
    audioCtxRef.current = null;
    try {
      void audioContext?.close();
    } catch {}

    liveRef.current = "";
  }

  async function start(): Promise<void> {
    if (!stoppedRef.current || wsRef.current) return;

    const generation = startupGenerationRef.current + 1;
    startupGenerationRef.current = generation;
    stoppedRef.current = false;
    pausedRef.current = false;
    liveRef.current = "";
    setState("connecting");

    const startupIsCurrent = () =>
      !stoppedRef.current && startupGenerationRef.current === generation;

    let response: Response;
    try {
      response = await fetch("/api/openai/realtime-token", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      if (!startupIsCurrent()) return;
      const message = "Voice could not reach the server. Check your connection.";
      setState("error");
      opts?.onError?.(message);
      throw new Error(message);
    }

    if (!startupIsCurrent()) return;

    if (!response.ok) {
      const message = await getRealtimeTokenError(response);
      if (!startupIsCurrent()) return;
      setState("error");
      opts?.onError?.(message);
      throw new Error(message);
    }

    const tokenResp = (await response.json()) as RealtimeTokenResponse;
    if (!startupIsCurrent()) return;

    const token = typeof tokenResp.token === "string" ? tokenResp.token : "";
    const sessionTranscriptionModel =
      typeof tokenResp.transcriptionModel === "string" &&
      tokenResp.transcriptionModel.trim()
        ? tokenResp.transcriptionModel.trim()
        : transcriptionModel;
    if (!token) {
      const message = "Voice service returned an invalid token. Try again.";
      setState("error");
      opts?.onError?.(message);
      throw new Error(message);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (!startupIsCurrent()) {
      stopStream(stream);
      return;
    }
    mediaStreamRef.current = stream;

    if (!startupIsCurrent()) {
      cleanupResources();
      return;
    }

    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;

    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        // Keep going; AudioWorklet setup below will surface a real failure.
      }
      if (!startupIsCurrent()) {
        cleanupResources();
        return;
      }
    }

    await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");
    if (!startupIsCurrent()) {
      cleanupResources();
      return;
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletRef.current = worklet;

    const zeroGain = audioCtx.createGain();
    zeroGain.gain.value = 0;
    zeroGainRef.current = zeroGain;

    source.connect(worklet);
    worklet.connect(zeroGain);
    zeroGain.connect(audioCtx.destination);

    if (!startupIsCurrent()) {
      cleanupResources();
      return;
    }

    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", `openai-insecure-api-key.${token}`],
    );
    if (!startupIsCurrent()) {
      try {
        ws.close();
      } catch {}
      cleanupResources();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!startupIsCurrent()) return;

      if (!pausedRef.current) {
        setState("listening");
      }

      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                noise_reduction: { type: "near_field" },
                transcription: {
                  model: sessionTranscriptionModel,
                  language: "en",
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.45,
                  prefix_padding_ms: 650,
                  silence_duration_ms: 850,
                },
              },
            },
          },
        }),
      );
    };

    worklet.port.onmessage = (event: MessageEvent) => {
      if (!startupIsCurrent() || pausedRef.current) return;

      const data = event.data as unknown;
      if (!(data instanceof Float32Array)) return;

      const threshold =
        typeof opts?.audioPulseThreshold === "number"
          ? opts.audioPulseThreshold
          : 0.02;
      if (rms(data) >= threshold) pulse();

      const pcm16 = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const sample = Math.max(-1, Math.min(1, data[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      socket.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64FromArrayBuffer(pcm16.buffer),
        }),
      );
    };

    ws.onmessage = (event) => {
      if (!startupIsCurrent() || typeof event.data !== "string") return;

      let msgUnknown: unknown;
      try {
        msgUnknown = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isRecord(msgUnknown)) return;

      const type = String(msgUnknown.type ?? "");
      if (opts?.debug && type) {
        // eslint-disable-next-line no-console
        console.log("[RealtimeVoice] event:", type);
      }

      if (TRANSCRIPTION_DELTA_TYPES.has(type)) {
        const delta = getStringField(msgUnknown, ["delta", "transcript", "text"]);
        if (!delta) return;
        liveRef.current += delta;
        pulse();
        return;
      }

      if (TRANSCRIPTION_COMPLETE_TYPES.has(type)) {
        const finalText = getStringField(msgUnknown, [
          "transcript",
          "text",
          "final",
        ]).trim();
        liveRef.current = "";
        if (!finalText) return;

        const cmd = (maybeHandleWakeWordRef.current(finalText) ?? "").trim();
        if (!cmd) return;
        handleTranscriptRef.current(cmd);
        return;
      }

      if (type === "error") {
        const errObjUnknown = msgUnknown.error;
        const errObj = isRecord(errObjUnknown) ? errObjUnknown : null;
        const message =
          (errObj && typeof errObj.message === "string" && errObj.message) ||
          "Realtime voice error";

        // eslint-disable-next-line no-console
        console.error("[RealtimeVoice] error", msgUnknown);
        setState("error");
        opts?.onError?.(message);
        stop();
      }
    };

    ws.onerror = () => {
      if (!startupIsCurrent()) return;
      setState("error");
      opts?.onError?.("WebSocket error");
      stop();
    };

    ws.onclose = () => {
      if (!startupIsCurrent()) return;
      stop();
    };
  }

  function pause(): boolean {
    if (stoppedRef.current || !wsRef.current) return false;
    pausedRef.current = true;
    liveRef.current = "";
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}
    return true;
  }

  function resume(): boolean {
    const socket = wsRef.current;
    if (stoppedRef.current || !socket) return false;

    pausedRef.current = false;
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch {}

    if (socket.readyState === WebSocket.OPEN) {
      setState("listening");
    } else if (socket.readyState === WebSocket.CONNECTING) {
      setState("connecting");
    }
    return true;
  }

  function stop(): void {
    // Never early-return here. A previously requested getUserMedia()/AudioWorklet
    // startup can finish after Stop was pressed; unconditional cleanup ensures
    // any resource that reached a ref is still torn down.
    startupGenerationRef.current += 1;
    stoppedRef.current = true;
    pausedRef.current = false;
    cleanupResources();
    setState("idle");
  }

  useEffect(() => {
    return () => {
      startupGenerationRef.current += 1;
      stoppedRef.current = true;
      pausedRef.current = false;
      cleanupResources();
    };
  }, []);

  return { start, pause, resume, stop };
}
