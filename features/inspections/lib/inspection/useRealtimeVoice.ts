"use client";

import { useEffect, useRef } from "react";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

type HandleTranscriptFn = (text: string) => void;

type RealtimeVoiceOptions = {
  onStateChange?: (state: VoiceState) => void;
  onPulse?: () => void;
  onError?: (message: string) => void;
  audioPulseThreshold?: number;
  pulseDebounceMs?: number;
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

function pickBestFinal(args: { completed: string; live: string }): string {
  const completed = args.completed.trim();
  const live = args.live.trim();

  if (!completed && !live) return "";
  if (!completed) return live;
  if (!live) return completed;

  // ✅ Some event variants send only the last token in "completed"
  // while live contains the full transcript. Prefer the longer one.
  if (live.length >= completed.length) return live;
  return completed;
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

  const zeroGainRef = useRef<GainNode | null>(null);

  const lastPulseAtRef = useRef<number>(0);
  const stoppedRef = useRef<boolean>(false);

  // ✅ live delta accumulation
  const liveRef = useRef<string>("");

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

  async function start(): Promise<void> {
    if (wsRef.current) return;

    stoppedRef.current = false;
    setState("connecting");

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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;

    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        // ignore
      }
    }

    await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");

    const source = audioCtx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletRef.current = worklet;

    const zeroGain = audioCtx.createGain();
    zeroGain.gain.value = 0;
    zeroGainRef.current = zeroGain;

    source.connect(worklet);
    worklet.connect(zeroGain);
    zeroGain.connect(audioCtx.destination);

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
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.45,
                  prefix_padding_ms: 500,
                  silence_duration_ms: 700,
                },
              },
            },
          },
        }),
      );
    };

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

      if (level >= threshold) pulse();

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

      if (TRANSCRIPTION_DELTA_TYPES.has(type)) {
        const delta = getStringField(msgUnknown, ["delta", "transcript", "text"]);
        if (!delta) return;

        // ✅ accumulate full phrase from deltas
        liveRef.current += delta;
        pulse();
        return;
      }

      if (TRANSCRIPTION_COMPLETE_TYPES.has(type)) {
        // ✅ completed text might be partial; compare with live buffer
        const completedText = getStringField(msgUnknown, [
          "transcript",
          "text",
          "final",
        ]);

        const liveText = liveRef.current;

        const finalText = pickBestFinal({
          completed: completedText,
          live: liveText,
        }).trim();

        // clear AFTER pick
        liveRef.current = "";

        if (!finalText) return;

        const cmdRaw = maybeHandleWakeWordRef.current(finalText);
        const cmd = typeof cmdRaw === "string" ? cmdRaw.trim() : "";
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
    setState("idle");
  }

  return { start, stop };
}