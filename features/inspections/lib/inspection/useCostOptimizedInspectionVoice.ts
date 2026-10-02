"use client";

import { useEffect, useRef } from "react";

export type InspectionVoiceState = "idle" | "connecting" | "listening" | "error";
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
const PRE_ROLL_MS = 450;
const END_SILENCE_MS = 900;
const MAX_TURN_MS = 20_000;
const DEFAULT_MAX_STREAMING_MS = 60 * 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;
const GUARD_TICK_MS = 1_000;

type Session = {
  ws: WebSocket | null;
  stream: MediaStream | null;
  audio: AudioContext | null;
  worklet: AudioWorkletNode | null;
  zeroGain: GainNode | null;
  paused: boolean;
  sentAudioMs: number;
  lastTranscriptAt: number;
  guard: ReturnType<typeof setInterval> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  preRoll: Float32Array[];
  preRollMs: number;
  speaking: boolean;
  silenceMs: number;
  turnMs: number;
  noiseFloor: number;
  usageKey: string | null;
  usageReported: boolean;
};

function encodePcm(data: Float32Array): string {
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function level(data: Float32Array): number {
  if (!data.length) return 0;
  let sum = 0;
  for (const value of data) sum += value * value;
  return Math.sqrt(sum / data.length);
}

function reportUsage(session: Session): void {
  if (session.usageReported || !session.usageKey) return;
  session.usageReported = true;
  const payload = JSON.stringify({
    usageKey: session.usageKey,
    durationSeconds: Math.max(0, session.sentAudioMs / 1_000),
  });
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      if (
        navigator.sendBeacon(
          "/api/openai/inspection-transcription-usage",
          blob,
        )
      ) {
        return;
      }
    }
  } catch {}
  try {
    void fetch("/api/openai/inspection-transcription-usage", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {}
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
    session.zeroGain?.disconnect();
  } catch {}
  try {
    session.ws?.close();
  } catch {}
  stopStream(session.stream);
  try {
    void session.audio?.close();
  } catch {}
  session.ws = null;
  session.stream = null;
  session.audio = null;
  session.worklet = null;
  session.zeroGain = null;
  session.preRoll = [];
  session.preRollMs = 0;
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
  const handlerRef = useRef(handleTranscript);
  const wakeRef = useRef(maybeHandleWakeWord);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    handlerRef.current = handleTranscript;
  }, [handleTranscript]);
  useEffect(() => {
    wakeRef.current = maybeHandleWakeWord;
  }, [maybeHandleWakeWord]);

  const setState = (state: InspectionVoiceState) => opts?.onStateChange?.(state);

  function sendAudio(session: Session, frame: Float32Array): void {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    session.ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: encodePcm(frame),
      }),
    );
    session.sentAudioMs += (frame.length / SAMPLE_RATE) * 1_000;
  }

  function commit(session: Session): void {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    session.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    session.speaking = false;
    session.silenceMs = 0;
    session.turnMs = 0;
    session.preRoll = [];
    session.preRollMs = 0;
  }

  function stop(reason?: InspectionVoiceAutoStopReason): void {
    const session = activeRef.current;
    activeRef.current = null;
    if (session) {
      reportUsage(session);
      cleanup(session);
    }
    setState("idle");
    if (reason) opts?.onAutoStop?.(reason);
  }

  async function start(): Promise<void> {
    if (activeRef.current) return;
    setState("connecting");

    const response = await fetch("/api/openai/inspection-transcription-token", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    const tokenPayload = (await response.json().catch(() => null)) as
      | {
          token?: unknown;
          transcriptionModel?: unknown;
          usageKey?: unknown;
          error?: unknown;
        }
      | null;
    if (!response.ok || typeof tokenPayload?.token !== "string") {
      const message =
        typeof tokenPayload?.error === "string"
          ? tokenPayload.error
          : "Inspection voice could not start.";
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
    const audio = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (audio.state === "suspended") await audio.resume();
    await audio.audioWorklet.addModule("/voice/pcm-processor.js");

    const worklet = new AudioWorkletNode(audio, "pcm-processor");
    const zeroGain = audio.createGain();
    zeroGain.gain.value = 0;
    audio.createMediaStreamSource(stream).connect(worklet);
    worklet.connect(zeroGain);
    zeroGain.connect(audio.destination);

    const session: Session = {
      ws: null,
      stream,
      audio,
      worklet,
      zeroGain,
      paused: false,
      sentAudioMs: 0,
      lastTranscriptAt: Date.now(),
      guard: null,
      pauseTimer: null,
      preRoll: [],
      preRollMs: 0,
      speaking: false,
      silenceMs: 0,
      turnMs: 0,
      noiseFloor: 0.006,
      usageKey:
        typeof tokenPayload.usageKey === "string"
          ? tokenPayload.usageKey
          : null,
      usageReported: false,
    };
    activeRef.current = session;

    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", `openai-insecure-api-key.${tokenPayload.token}`],
    );
    session.ws = ws;

    ws.onopen = () => {
      if (activeRef.current !== session) return;
      setState("listening");
      session.lastTranscriptAt = Date.now();
      const maxStreamingMs = opts?.maxStreamingMs ?? DEFAULT_MAX_STREAMING_MS;
      const idleTimeoutMs = opts?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
      session.guard = setInterval(() => {
        if (activeRef.current !== session || session.paused) return;
        if (maxStreamingMs > 0 && session.sentAudioMs >= maxStreamingMs) {
          stop("max_duration");
          return;
        }
        if (
          idleTimeoutMs > 0 &&
          Date.now() - session.lastTranscriptAt >= idleTimeoutMs &&
          !session.speaking
        ) {
          stop("idle");
        }
      }, GUARD_TICK_MS);
    };

    worklet.port.onmessage = (event: MessageEvent) => {
      if (
        activeRef.current !== session ||
        session.paused ||
        !(event.data instanceof Float32Array)
      ) {
        return;
      }

      const frame = event.data as Float32Array;
      const frameMs = (frame.length / SAMPLE_RATE) * 1_000;
      const rms = level(frame);

      if (!session.speaking) {
        session.noiseFloor = session.noiseFloor * 0.97 + rms * 0.03;
        session.preRoll.push(frame.slice());
        session.preRollMs += frameMs;
        while (session.preRollMs > PRE_ROLL_MS && session.preRoll.length > 1) {
          const removed = session.preRoll.shift();
          if (removed) {
            session.preRollMs -= (removed.length / SAMPLE_RATE) * 1_000;
          }
        }
      }

      const threshold = Math.max(0.014, session.noiseFloor * 2.4);
      if (rms >= threshold) {
        opts?.onPulse?.();
        if (!session.speaking) {
          session.speaking = true;
          session.silenceMs = 0;
          session.turnMs = 0;
          for (const buffered of session.preRoll) sendAudio(session, buffered);
          session.preRoll = [];
          session.preRollMs = 0;
          // The current frame is already part of pre-roll; do not send it twice.
          session.turnMs += frameMs;
          return;
        }
      }

      if (!session.speaking) return;

      sendAudio(session, frame);
      session.turnMs += frameMs;
      if (rms < threshold) session.silenceMs += frameMs;
      else session.silenceMs = 0;

      if (
        session.silenceMs >= END_SILENCE_MS ||
        session.turnMs >= MAX_TURN_MS
      ) {
        commit(session);
      }
    };

    ws.onmessage = (event) => {
      if (activeRef.current !== session || typeof event.data !== "string") return;
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
        const text =
          error && typeof error.message === "string"
            ? error.message
            : "Inspection voice error";
        opts?.onError?.(text);
      }
    };

    ws.onerror = () => {
      if (activeRef.current !== session) return;
      reportUsage(session);
      cleanup(session);
      activeRef.current = null;
      setState("error");
      opts?.onError?.("Inspection voice connection failed.");
    };

    ws.onclose = () => {
      if (activeRef.current !== session) return;
      reportUsage(session);
      cleanup(session);
      activeRef.current = null;
      setState("idle");
    };
  }

  function pause(): boolean {
    const session = activeRef.current;
    if (!session || session.paused) return false;
    session.paused = true;
    session.stream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    if (session.speaking) commit(session);
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
  function speakText(): boolean {
    return false;
  }

  function stopAudio(): void {}

  useEffect(() => () => stop(), []);

  return { start, stop, pause, resume, speakText, stopAudio };
}
