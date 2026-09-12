// Shared OpenAI Realtime transcription transport.
//
// This is the one hardened implementation behind both the Technician CoPilot
// voice bridge (features/copilot/technician/voice/useTechnicianRealtimeVoice.ts)
// and inspection/dictation voice control
// (features/inspections/lib/inspection/useRealtimeVoice.ts) — both of those
// files are now thin re-exports of this hook under their own established
// names, so existing call sites and import paths never had to change.
//
// It started as two independently-maintained copies: the CoPilot fork added
// pause()/resume() (mute the mic without tearing down the WebSocket/token),
// playAudio()/stopAudio() (spoken-reply playback through the same audio
// graph), and generation-based startup/teardown safety, while inspection
// voice control kept the original simpler start()/stop() pair. Once that
// hardening was proven out, keeping two copies in sync was only a source of
// drift, so this file is the single source of truth going forward.
"use client";

import { useEffect, useRef } from "react";
import { getOpenAIRealtimeTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";

export type RealtimeTranscriptionState = "idle" | "connecting" | "listening" | "error";

export type RealtimeAutoStopReason = "max_duration" | "idle";

/**
 * Ceiling on cumulative *streaming* time — the audio actually sent upstream,
 * which is what Realtime bills for. Paused time is excluded because a paused
 * session sends no frames.
 */
export const DEFAULT_MAX_STREAMING_MS = 10 * 60_000;

/**
 * Auto-stop after this long with no speech detected while streaming. A handset
 * left face-up on a bench otherwise streams room noise until the tab closes.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

const GUARD_TICK_MS = 1_000;

type HandleTranscriptFn = (text: string) => void;

type RealtimeTranscriptionOptions = {
  onStateChange?: (state: RealtimeTranscriptionState) => void;
  onPulse?: () => void;
  onError?: (message: string) => void;
  audioPulseThreshold?: number;
  pulseDebounceMs?: number;
  debug?: boolean;
  /** Cumulative streaming ceiling in ms. <= 0 disables the cap. */
  maxStreamingMs?: number;
  /** Silence window in ms before auto-stop. <= 0 disables the cap. */
  idleTimeoutMs?: number;
  /** Fired after an automatic teardown, once the state has settled to idle. */
  onAutoStop?: (reason: RealtimeAutoStopReason) => void;
};

type RealtimeTokenResponse = {
  token?: string;
  transcriptionModel?: string;
};

type RealtimeTokenErrorResponse = {
  error?: string;
  code?: string;
};

type RealtimePlayback = {
  source: AudioBufferSourceNode;
  settle: (error?: unknown) => void;
};

type RealtimeSessionResources = {
  generation: number;
  ws: WebSocket | null;
  audioCtx: AudioContext | null;
  mediaStream: MediaStream | null;
  worklet: AudioWorkletNode | null;
  zeroGain: GainNode | null;
  playback: RealtimePlayback | null;
  paused: boolean;
  live: string;
  guardTimer: ReturnType<typeof setInterval> | null;
  /** Streaming time already banked from earlier unpaused stretches. */
  streamedMs: number;
  /** When the current unpaused stretch began, or null while paused. */
  streamingSince: number | null;
  /** Last upstream speech signal observed while streaming. */
  lastActivityAt: number;
};

/** Bank the open streaming stretch, if any. Safe to call repeatedly. */
function suspendStreamingClock(
  session: RealtimeSessionResources,
  now: number,
): void {
  if (session.streamingSince === null) return;
  session.streamedMs += Math.max(0, now - session.streamingSince);
  session.streamingSince = null;
}

/**
 * Open a streaming stretch. Resuming counts as activity in its own right, so
 * a session paused longer than the idle window is not torn down the instant
 * it comes back.
 */
function resumeStreamingClock(
  session: RealtimeSessionResources,
  now: number,
): void {
  if (session.streamingSince !== null) return;
  session.streamingSince = now;
  session.lastActivityAt = now;
}

function streamedTotalMs(
  session: RealtimeSessionResources,
  now: number,
): number {
  const open =
    session.streamingSince === null ? 0 : Math.max(0, now - session.streamingSince);
  return session.streamedMs + open;
}

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

function stopPlayback(session: RealtimeSessionResources): void {
  const playback = session.playback;
  session.playback = null;
  if (!playback) return;

  playback.source.onended = null;
  try {
    playback.source.stop();
  } catch {}
  playback.settle();
}

function cleanupSession(session: RealtimeSessionResources): void {
  stopPlayback(session);

  if (session.guardTimer !== null) {
    clearInterval(session.guardTimer);
    session.guardTimer = null;
  }

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
  session.streamingSince = null;
}

/**
 * Server VAD decides what counts as speech. Keying idle detection off these
 * upstream events rather than a local RMS gate keeps the audio we send
 * untouched, so `prefix_padding_ms` / `silence_duration_ms` still see the
 * lead-in they need to catch the start of an utterance.
 */
const SPEECH_ACTIVITY_TYPES = new Set<string>([
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.committed",
]);

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

export function useRealtimeTranscription(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeTranscriptionOptions,
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

  const setState = (state: RealtimeTranscriptionState) => {
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

  function markActivity(session: RealtimeSessionResources): void {
    session.lastActivityAt = Date.now();
  }

  /**
   * Settle to `idle` rather than `error`: an exhausted cap is an ordinary end
   * of session, and consumers already treat an unsolicited idle as "transport
   * ended, offer restart" because an upstream socket close does the same.
   */
  function autoStopSession(
    session: RealtimeSessionResources,
    reason: RealtimeAutoStopReason,
  ): void {
    if (!detachCurrentSession(session)) {
      cleanupSession(session);
      return;
    }
    cleanupSession(session);
    setState("idle");
    opts?.onAutoStop?.(reason);
  }

  function startGuardTimer(session: RealtimeSessionResources): void {
    const maxStreamingMs =
      typeof opts?.maxStreamingMs === "number"
        ? opts.maxStreamingMs
        : DEFAULT_MAX_STREAMING_MS;
    const idleTimeoutMs =
      typeof opts?.idleTimeoutMs === "number"
        ? opts.idleTimeoutMs
        : DEFAULT_IDLE_TIMEOUT_MS;

    if (maxStreamingMs <= 0 && idleTimeoutMs <= 0) return;
    if (session.guardTimer !== null) return;

    session.guardTimer = setInterval(() => {
      if (!sessionIsCurrent(session)) return;

      const now = Date.now();

      // Neither cap advances while paused. No frames are being sent, so no
      // spend accrues, and tearing down mid-pause would strand a consumer
      // that pauses deliberately to play a spoken reply.
      if (session.paused) {
        suspendStreamingClock(session, now);
        return;
      }

      resumeStreamingClock(session, now);

      if (maxStreamingMs > 0 && streamedTotalMs(session, now) >= maxStreamingMs) {
        autoStopSession(session, "max_duration");
        return;
      }

      if (idleTimeoutMs > 0 && now - session.lastActivityAt >= idleTimeoutMs) {
        autoStopSession(session, "idle");
      }
    }, GUARD_TICK_MS);
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
      playback: null,
      paused: false,
      live: "",
      guardTimer: null,
      streamedMs: 0,
      streamingSince: null,
      lastActivityAt: Date.now(),
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
          resumeStreamingClock(session, Date.now());
        }
        startGuardTimer(session);

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
        if (
          !sessionIsCurrent(session) ||
          session.paused ||
          typeof event.data !== "string"
        ) {
          return;
        }

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
          console.log("[RealtimeTranscription] event:", type);
        }

        if (SPEECH_ACTIVITY_TYPES.has(type)) {
          markActivity(session);
          return;
        }

        if (TRANSCRIPTION_DELTA_TYPES.has(type)) {
          const delta = getStringField(msgUnknown, ["delta", "transcript", "text"]);
          if (!delta) return;
          markActivity(session);
          session.live += delta;
          pulse();
          return;
        }

        if (TRANSCRIPTION_COMPLETE_TYPES.has(type)) {
          markActivity(session);
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
          console.error("[RealtimeTranscription] error", msgUnknown);
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
    suspendStreamingClock(session, Date.now());
    try {
      session.mediaStream?.getTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}
    return true;
  }

  async function playAudio(encodedAudio: ArrayBuffer): Promise<void> {
    const session = activeSessionRef.current;
    const audioContext = session?.audioCtx ?? null;
    if (
      stoppedRef.current ||
      !session ||
      !audioContext ||
      !session.paused ||
      encodedAudio.byteLength === 0
    ) {
      throw new Error("Realtime audio output is not ready.");
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    if (!sessionIsCurrent(session) || session.audioCtx !== audioContext) {
      throw new Error("Realtime audio output was interrupted.");
    }

    const decoded = await audioContext.decodeAudioData(encodedAudio.slice(0));
    if (!sessionIsCurrent(session) || session.audioCtx !== audioContext) {
      throw new Error("Realtime audio output was interrupted.");
    }

    stopPlayback(session);

    await new Promise<void>((resolve, reject) => {
      const source = audioContext.createBufferSource();
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        source.onended = null;
        try {
          source.disconnect();
        } catch {}
        if (session.playback?.source === source) {
          session.playback = null;
        }
        if (error) reject(error);
        else resolve();
      };

      source.buffer = decoded;
      source.connect(audioContext.destination);
      source.onended = () => settle();
      session.playback = { source, settle };

      try {
        source.start();
      } catch (error) {
        settle(error);
      }
    });
  }

  function stopAudio(): void {
    const session = activeSessionRef.current;
    if (session) stopPlayback(session);
  }

  function resume(): boolean {
    const session = activeSessionRef.current;
    const socket = session?.ws ?? null;
    if (stoppedRef.current || !session || !socket) return false;

    if (
      socket.readyState !== WebSocket.OPEN &&
      socket.readyState !== WebSocket.CONNECTING
    ) {
      detachCurrentSession(session);
      cleanupSession(session);

      // A dead paused socket is a recoverable transport replacement signal.
      // Do not emit terminal `idle` here: the caller is already in
      // `connecting` and will immediately establish a replacement transport
      // after resume() returns false. Emitting idle synchronously would
      // incorrectly revoke ownership while the replacement starts.
      return false;
    }

    session.paused = false;
    resumeStreamingClock(session, Date.now());
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

  return { start, pause, playAudio, stopAudio, resume, stop };
}
