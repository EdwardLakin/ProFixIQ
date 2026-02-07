// /useRealtimeVoice.ts (FULL FILE REPLACEMENT)
// ✅ Patched (safe + minimal):
// 1) Removes SIDE-EFFECT wake handling from DELTAS (prevents “blocked / weird” wake behavior)
// 2) Uses a PURE wake detector during DELTAS (no toast / no wakeActive state changes)
// 3) Still uses your existing maybeHandleWakeWord() on COMPLETED (keeps your “Ready” UX + beep there)
// 4) Keeps your existing types + no `any`

"use client";

import { useEffect, useRef } from "react";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

type HandleTranscriptFn = (text: string) => void;

type RealtimeVoiceOptions = {
  /** Called when WS connects / stops / errors */
  onStateChange?: (state: VoiceState) => void;
  /**
   * Called when we detect audio activity OR transcript delta.
   * Use this to flash your "• audio" indicator.
   */
  onPulse?: () => void;
  /** Optional: surface error message to UI */
  onError?: (message: string) => void;

  /** RMS threshold for "audio activity" pulse */
  audioPulseThreshold?: number; // default 0.02-ish
  /** minimum ms between pulses */
  pulseDebounceMs?: number; // default 250

  /** Debounce for wake detection during DELTAS */
  wakeDebounceMs?: number; // default 350
};

type RealtimeTokenResponse = { token?: string };

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

// ✅ Realtime can emit different but valid event type names.
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
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/**
 * ✅ PURE wake detector (NO side effects).
 * Use this ONLY for DELTAS so we don't trigger toast/beep/state while partial text is streaming.
 */
const WAKE_PREFIXES = ["techy", "techie", "tekky", "teki"] as const;

function normalizeForWake(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripOptionalHey(s: string): string {
  return s.startsWith("hey ") ? s.slice(4).trim() : s;
}

function detectWakeCommandFromDelta(
  textSoFar: string,
): { remainder: string } | null {
  const normalized = normalizeForWake(textSoFar);
  if (!normalized) return null;

  const withoutHey = stripOptionalHey(normalized);

  for (const prefix of WAKE_PREFIXES) {
    if (withoutHey === prefix) {
      // wake word only, no command yet
      return { remainder: "" };
    }
    if (withoutHey.startsWith(prefix + " ")) {
      return { remainder: withoutHey.slice(prefix.length).trimStart() };
    }
  }

  return null;
}

export function useRealtimeVoice(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeVoiceOptions,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  // Keep the graph alive on iOS by connecting to destination (muted)
  const zeroGainRef = useRef<GainNode | null>(null);

  const lastPulseAtRef = useRef<number>(0);
  const stoppedRef = useRef<boolean>(false);

  const liveRef = useRef<string>("");

  // ✅ Avoid stale closures: keep latest callbacks in refs
  const handleTranscriptRef = useRef<HandleTranscriptFn>(handleTranscript);
  const maybeHandleWakeWordRef = useRef<(text: string) => string | null>(
    maybeHandleWakeWord,
  );

  // ✅ Wake arming across DELTAS (pure detector)
  const pendingCmdRef = useRef<string | null>(null);
  const lastWakeAtRef = useRef<number>(0);

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript;
  }, [handleTranscript]);

  useEffect(() => {
    maybeHandleWakeWordRef.current = maybeHandleWakeWord;
  }, [maybeHandleWakeWord]);

  const setState = (s: VoiceState) => {
    opts?.onStateChange?.(s);
  };

  const pulse = () => {
    const now = Date.now();
    const debounce =
      typeof opts?.pulseDebounceMs === "number" ? opts.pulseDebounceMs : 250;
    if (now - lastPulseAtRef.current < debounce) return;
    lastPulseAtRef.current = now;
    opts?.onPulse?.();
  };

  const armWakeIfPresent = (textSoFar: string) => {
    const now = Date.now();
    const debounce =
      typeof opts?.wakeDebounceMs === "number" ? opts.wakeDebounceMs : 350;

    if (now - lastWakeAtRef.current < debounce) return;

    const detected = detectWakeCommandFromDelta(textSoFar);
    if (!detected) return;

    // Only store a command if there is one (wake-only is allowed but doesn't arm a command)
    const remainder = detected.remainder.trim();
    pendingCmdRef.current = remainder.length > 0 ? remainder : null;

    lastWakeAtRef.current = now;
  };

  async function start(): Promise<void> {
    if (wsRef.current) return;

    stoppedRef.current = false;
    pendingCmdRef.current = null;
    liveRef.current = "";
    setState("connecting");

    // ✅ get EPHEMERAL token
    const r = await fetch("/api/openai/realtime-token", { method: "GET" });
    if (!r.ok) {
      setState("error");
      opts?.onError?.("Failed to get realtime token");
      throw new Error("Failed to get realtime token");
    }

    const tokenResp = (await r.json()) as RealtimeTokenResponse;
    const token = typeof tokenResp.token === "string" ? tokenResp.token : "";
    if (!token) {
      setState("error");
      opts?.onError?.("Missing realtime token");
      throw new Error("Missing realtime token");
    }

    // Mic
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;

    // WebAudio (24kHz)
    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;

    // iOS can start suspended even after user gesture in some cases
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        // keep going; we still try
      }
    }

    await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");

    const source = audioCtx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletRef.current = worklet;

    // ✅ CRITICAL: keep audio graph alive by connecting to destination (muted)
    const zeroGain = audioCtx.createGain();
    zeroGain.gain.value = 0;
    zeroGainRef.current = zeroGain;

    source.connect(worklet);
    worklet.connect(zeroGain);
    zeroGain.connect(audioCtx.destination);

    // WS connect
    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", `openai-insecure-api-key.${token}`],
    );
    wsRef.current = ws;

    ws.onopen = () => {
      if (stoppedRef.current) return;

      setState("listening");

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
                  model: "gpt-4o-mini-transcribe",
                  language: "en",
                },
                // ✅ slightly more forgiving for bay noise + short commands
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

    // Send audio chunks
    worklet.port.onmessage = (e: MessageEvent) => {
      if (stoppedRef.current) return;

      const data = e.data as unknown;
      if (!(data instanceof Float32Array)) return;

      const float32 = data;
      const level = rms(float32);

      const threshold =
        typeof opts?.audioPulseThreshold === "number"
          ? opts.audioPulseThreshold
          : 0.02;

      if (level >= threshold) {
        pulse();
      }

      // Float32 [-1,1] -> PCM16
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const sock = wsRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;

      sock.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64FromArrayBuffer(pcm16.buffer),
        }),
      );
    };

    ws.onmessage = (evt) => {
      if (stoppedRef.current) return;
      if (typeof evt.data !== "string") return;

      let msgUnknown: unknown;
      try {
        msgUnknown = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (!isRecord(msgUnknown)) return;
      const type = String(msgUnknown.type ?? "");

      // ✅ DELTAS
      if (TRANSCRIPTION_DELTA_TYPES.has(type)) {
        const delta = getStringField(msgUnknown, ["delta", "transcript", "text"]);
        if (!delta) return;

        liveRef.current += delta;
        pulse();

        // ✅ PURE wake arming (no side effects)
        armWakeIfPresent(liveRef.current);

        return;
      }

      // ✅ COMPLETED
      if (TRANSCRIPTION_COMPLETE_TYPES.has(type)) {
        const finalText = getStringField(msgUnknown, [
          "transcript",
          "text",
          "final",
        ]).trim();

        // reset live buffer either way
        liveRef.current = "";

        if (!finalText) {
          pendingCmdRef.current = null;
          return;
        }

        // Prefer armed command from DELTAS; if none, fall back to side-effect wake handler
        const armed = pendingCmdRef.current;
        pendingCmdRef.current = null;

        // If we armed a remainder during DELTAS, use it.
        // Otherwise call your existing wake handler (this is where READY toast/beep/state happen).
        const cmd = (
          armed ??
          maybeHandleWakeWordRef.current(finalText) ??
          ""
        ).trim();

        if (!cmd) return;

        handleTranscriptRef.current(cmd);
        return;
      }

      if (type === "error") {
        const errObjUnknown = msgUnknown.error;
        const errObj = isRecord(errObjUnknown) ? errObjUnknown : null;
        const msgText =
          (errObj && typeof errObj.message === "string" && errObj.message) ||
          "Realtime voice error";

        // eslint-disable-next-line no-console
        console.error("[RealtimeVoice] error", msgUnknown);

        setState("error");
        opts?.onError?.(msgText);

        stop();
      }
    };

    ws.onerror = () => {
      if (stoppedRef.current) return;
      setState("error");
      opts?.onError?.("WebSocket error");
      stop();
    };

    ws.onclose = () => {
      if (stoppedRef.current) return;
      stop();
    };
  }

  function stop(): void {
    if (stoppedRef.current) return;
    stoppedRef.current = true;

    try {
      workletRef.current?.disconnect();
    } catch {}
    workletRef.current = null;

    try {
      zeroGainRef.current?.disconnect();
    } catch {}
    zeroGainRef.current = null;

    const sock = wsRef.current;
    wsRef.current = null;
    try {
      if (
        sock &&
        (sock.readyState === WebSocket.OPEN ||
          sock.readyState === WebSocket.CONNECTING)
      ) {
        sock.close();
      }
    } catch {}

    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    mediaStreamRef.current = null;

    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    try {
      ctx?.close();
    } catch {}

    liveRef.current = "";
    pendingCmdRef.current = null;
    setState("idle");
  }

  return { start, stop };
}