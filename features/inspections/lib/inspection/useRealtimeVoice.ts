// /useRealtimeVoice.ts
// Shared OpenAI Realtime transcription transport used by inspections and the
// Technician CoPilot. Wake/command evaluation remains final-transcript only.

"use client";

import { useEffect, useRef } from "react";
import { getOpenAIRealtimeTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

type HandleTranscriptFn = (text: string) => void;

type RealtimeVoiceOptions = {
  onStateChange?: (state: VoiceState) => void;
  onPulse?: () => void;
  onError?: (message: string) => void;
  audioPulseThreshold?: number;
  pulseDebounceMs?: number;
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

type RealtimeSessionResources = {
  generation: number;
  ws: WebSocket | null;
  audioCtx: AudioContext | null;
  mediaStream: MediaStream | null;
  worklet: AudioWorkletNode | null;
  zeroGain: GainNode | null;
  paused: boolean;
  live: string;
};

async function getRealtimeTokenError(response: Response): Promise<string> {
  let body: RealtimeTokenErrorResponse | null = null;
  try {
    body = (await response.json()) as RealtimeTokenErrorResponse;
  } catch {}

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

function cleanupSession(session: RealtimeSessionResources): void {
  try {
    session.worklet?.disconnect();
  } catch {}
  session.worklet = null;

  try {
    session.zeroGain?.disconnect();
  } catch {}
  session.zeroGain = null;

  const socket = session.ws;
  session.ws = null;
  try {
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close();
    }
  } catch {}

  stopStream(session.mediaStream);
  session.mediaStream = null;

  const audioContext = session.audioCtx;
  session.audioCtx = null;
  try {
    void audioContext?.close().catch(() => undefined);
  } catch {}

  session.live = "";
  session.paused = false;
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
  const activeSessionRef = useRef<RealtimeSessionResources | null>(null);
  const lastPulseAtRef = useRef(0);
  const stoppedRef = useRef(true);
  const startupGenerationRef = useRef(0);

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

  function sessionIsCurrent(session: RealtimeSessionResources): boolean {
    return (
      !stoppedRef.current &&
      activeSessionRef.current === session &&
      startupGenerationRef.current === session.generation
    );
  }

  function detachCurrentSession(session: RealtimeSessionResources): boolean {
    if (activeSessionRef.current !== session) return false;
    activeSessionRef.current = null;
    stoppedRef.current = true;
    startupGenerationRef.current += 1;
    return true;
  }

  function failCurrentSession(
    session: RealtimeSessionResources,
    message: string,
  ): void {
    if (!detachCurrentSession(session)) {
      cleanupSession(session);
      return;
    }
    cleanupSession(session);
    setState("error");
    opts?.onError?.(message);
  }

  async function start(): Promise<void> {
    if (!stoppedRef.current || activeSessionRef.current) return;

    const generation = startupGenerationRef.current + 1;
    startupGenerationRef.current = generation;
    stoppedRef.current = false;

    const session: RealtimeSessionResources = {
      generation,
      ws: null,
      audioCtx: null,
      mediaStream: null,
      worklet: null,
      zeroGain: null,
      paused: false,
      live: "",
    };
    activeSessionRef.current = session;
    setState("connecting");

    try {
      const response = await fetch("/api/openai/realtime-token", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      if (!response.ok) {
        throw new Error(await getRealtimeTokenError(response));
      }

      const tokenResp = (await response.json()) as RealtimeTokenResponse;
      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      const token = typeof tokenResp.token === "string" ? tokenResp.token : "";
      const sessionTranscriptionModel =
        typeof tokenResp.transcriptionModel === "string" &&
        tokenResp.transcriptionModel.trim()
          ? tokenResp.transcriptionModel.trim()
          : transcriptionModel;
      if (!token) {
        throw new Error("Voice service returned an invalid token. Try again.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      session.mediaStream = stream;
      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      session.audioCtx = audioCtx;

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
        if (!sessionIsCurrent(session)) {
          cleanupSession(session);
          return;
        }
      }

      await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");
      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
      session.worklet = worklet;

      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      session.zeroGain = zeroGain;

      source.connect(worklet);
      worklet.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);

      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      const ws = new WebSocket(
        "wss://api.openai.com/v1/realtime?intent=transcription",
        ["realtime", `openai-insecure-api-key.${token}`],
      );
      session.ws = ws;
      if (!sessionIsCurrent(session)) {
        cleanupSession(session);
        return;
      }

      ws.onopen = () => {
        if (!sessionIsCurrent(session)) return;

        if (!session.paused) {
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
        if (!sessionIsCurrent(session) || session.paused) return;

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

        const socket = session.ws;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        socket.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64FromArrayBuffer(pcm16.buffer),
          }),
        );
      };

      ws.onmessage = (event) => {
        if (!sessionIsCurrent(session) || typeof event.data !== "string") return;

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
          session.live += delta;
          pulse();
          return;
        }

        if (TRANSCRIPTION_COMPLETE_TYPES.has(type)) {
          const finalText = getStringField(msgUnknown, [
            "transcript",
            "text",
            "final",
          ]).trim();
          session.live = "";
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
          failCurrentSession(session, message);
        }
      };

      ws.onerror = () => {
        if (!sessionIsCurrent(session)) return;
        failCurrentSession(session, "WebSocket error");
      };

      ws.onclose = () => {
        if (!sessionIsCurrent(session)) return;
        detachCurrentSession(session);
        cleanupSession(session);
        setState("idle");
      };
    } catch (caught) {
      const stillCurrent = activeSessionRef.current === session;
      if (stillCurrent) {
        activeSessionRef.current = null;
        stoppedRef.current = true;
        startupGenerationRef.current += 1;
      }
      cleanupSession(session);

      // A stop/restart can replace this startup while an await is pending. The
      // stale startup owns only `session`, so cleanup above cannot dismantle the
      // replacement transport and should not surface an error into its UI.
      if (!stillCurrent) return;

      const message =
        caught instanceof Error
          ? caught.message
          : "Voice could not start. Try again.";
      setState("error");
      opts?.onError?.(message);
      throw caught instanceof Error ? caught : new Error(message);
    }
  }

  function pause(): boolean {
    const session = activeSessionRef.current;
    if (stoppedRef.current || !session) return false;
    session.paused = true;
    session.live = "";
    try {
      session.mediaStream?.getTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}
    return true;
  }

  function resume(): boolean {
    const session = activeSessionRef.current;
    const socket = session?.ws ?? null;
    if (stoppedRef.current || !session || !socket) return false;

    if (
      socket.readyState !== WebSocket.OPEN &&
      socket.readyState !== WebSocket.CONNECTING
    ) {
      const wasCurrent = detachCurrentSession(session);
      cleanupSession(session);
      if (wasCurrent) setState("idle");
      return false;
    }

    session.paused = false;
    try {
      session.mediaStream?.getTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch {}

    if (socket.readyState === WebSocket.OPEN) {
      setState("listening");
    } else {
      setState("connecting");
    }
    return true;
  }

  function stop(): void {
    startupGenerationRef.current += 1;
    stoppedRef.current = true;
    const session = activeSessionRef.current;
    activeSessionRef.current = null;
    if (session) cleanupSession(session);
    setState("idle");
  }

  useEffect(() => {
    return () => {
      startupGenerationRef.current += 1;
      stoppedRef.current = true;
      const session = activeSessionRef.current;
      activeSessionRef.current = null;
      if (session) cleanupSession(session);
    };
  }, []);

  return { start, pause, resume, stop };
}
