"use client";

import { useRef } from "react";

type HandleTranscriptFn = (text: string) => void;

export type VoiceState = "idle" | "connecting" | "listening" | "error";

type RealtimeVoiceOpts = {
  /** flips your UI pill: idle/connecting/listening/error */
  onStateChange?: (s: VoiceState) => void;
  /** quick “we heard audio / got delta” pulse */
  onPulse?: () => void;
  /** surface a readable error */
  onError?: (msg: string) => void;
};

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Unknown error";
}

export function useRealtimeVoice(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeVoiceOpts,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  const liveRef = useRef<string>("");

  const setState = (s: VoiceState) => {
    opts?.onStateChange?.(s);
  };

  const pulse = () => {
    opts?.onPulse?.();
  };

  async function start() {
    if (wsRef.current) return;

    setState("connecting");

    try {
      // ✅ EPHEMERAL token
      const r = await fetch("/api/openai/realtime-token", { method: "GET" });
      if (!r.ok) throw new Error("Failed to get realtime token");
      const { token } = (await r.json()) as { token?: string };
      if (!token) throw new Error("Missing realtime token");

      // ✅ Mic permission (will prompt on iOS)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // ✅ iOS Safari: AudioContext often starts suspended until resume() inside user gesture
      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");

      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletRef.current = worklet;

      // ✅ IMPORTANT: connect to destination or worklet may not “run” on Safari/iOS
      const silent = audioCtx.createGain();
      silent.gain.value = 0;
      silentGainRef.current = silent;

      source.connect(worklet);
      worklet.connect(silent);
      silent.connect(audioCtx.destination);

      // WS connect
      const ws = new WebSocket(
        "wss://api.openai.com/v1/realtime?intent=transcription",
        ["realtime", `openai-insecure-api-key.${token}`],
      );
      wsRef.current = ws;

      // fail fast if WS never opens
      const openTimeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          opts?.onError?.("Voice socket did not open (timeout).");
          setState("error");
          stop();
        }
      }, 8000);

      ws.onopen = () => {
        window.clearTimeout(openTimeout);

        // ✅ configure transcription + server VAD
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
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                  },
                },
              },
            },
          }),
        );

        setState("listening");
        pulse();
      };

      // Send audio chunks
      worklet.port.onmessage = (e: MessageEvent) => {
        const float32 = e.data as Float32Array;
        if (!float32 || float32.length === 0) return;

        // Float32 [-1,1] -> PCM16
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64FromArrayBuffer(pcm16.buffer),
            }),
          );
        }
      };

      ws.onmessage = (evt) => {
        if (typeof evt.data !== "string") return;

        let msg: any;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        if (msg.type === "conversation.item.input_audio_transcription.delta") {
          const delta = String(msg.delta ?? "");
          if (!delta) return;
          liveRef.current += delta;
          pulse(); // ✅ show “we’re receiving something”
          return;
        }

        if (msg.type === "conversation.item.input_audio_transcription.completed") {
          const finalText = String(msg.transcript ?? "").trim();
          liveRef.current = "";

          if (!finalText) return;

          // wake word gate
          const cmd = maybeHandleWakeWord(finalText);
          if (cmd) handleTranscript(cmd);
          pulse();
          return;
        }

        if (msg.type === "error") {
          // eslint-disable-next-line no-console
          console.error("[RealtimeVoice] error", msg);
          const m = String(msg?.error?.message ?? "Realtime voice error");
          opts?.onError?.(m);
          setState("error");
        }
      };

      ws.onerror = (err) => {
        // eslint-disable-next-line no-console
        console.error("[RealtimeVoice] WS error", err);
        opts?.onError?.("WebSocket error");
        setState("error");
        stop();
      };

      ws.onclose = () => {
        stop();
      };
    } catch (e: unknown) {
      const m = errMsg(e);
      opts?.onError?.(m);
      setState("error");
      stop();
      throw e;
    }
  }

  function stop() {
    // disconnect worklet graph
    try {
      workletRef.current?.disconnect();
    } catch {}
    workletRef.current = null;

    try {
      silentGainRef.current?.disconnect();
    } catch {}
    silentGainRef.current = null;

    // close WS
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    // stop mic
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // close audio context
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    liveRef.current = "";
    setState("idle");
  }

  return { start, stop };
}