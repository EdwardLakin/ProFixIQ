"use client";

import { useRef } from "react";

type HandleTranscriptFn = (text: string) => void;

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function safeBeep(
  ctx: AudioContext | null,
  opts?: { freq?: number; ms?: number; gain?: number },
) {
  try {
    const audioCtx = ctx ?? new AudioContext();
    // Some browsers start suspended until user gesture; this is called from a user-initiated start.
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => undefined);
    }

    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.value = opts?.freq ?? 880;

    g.gain.value = opts?.gain ?? 0.04;

    osc.connect(g);
    g.connect(audioCtx.destination);

    osc.start();

    const ms = opts?.ms ?? 120;
    window.setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
        g.disconnect();
      } catch {}
      // If we created a temporary AudioContext, close it.
      if (!ctx) {
        try {
          void audioCtx.close();
        } catch {}
      }
    }, ms);
  } catch {
    // noop
  }
}

function startsWithWakeWord(text: string): boolean {
  const lower = (text || "").trim().toLowerCase();
  if (!lower) return false;
  const prefixes = ["techy", "techie", "tekky", "teki"];
  return prefixes.some((p) => lower === p || lower.startsWith(p + " "));
}

export function useRealtimeVoice(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  const liveRef = useRef<string>("");

  async function start() {
    if (wsRef.current) return;

    // ✅ get EPHEMERAL token
    const r = await fetch("/api/openai/realtime-token", { method: "GET" });
    if (!r.ok) throw new Error("Failed to get realtime token");
    const { token } = (await r.json()) as { token?: string };
    if (!token) throw new Error("Missing realtime token");

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

    // ✅ Realtime transcription: audio/pcm @ 24kHz only
    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;

    await audioCtx.audioWorklet.addModule("/voice/pcm-processor.js");

    const source = audioCtx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletRef.current = worklet;
    source.connect(worklet);

    // WS connect
    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      ["realtime", `openai-insecure-api-key.${token}`],
    );
    wsRef.current = ws;

    ws.onopen = () => {
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

      // ✅ ready beep (WS connected + session configured)
      safeBeep(audioCtxRef.current, { freq: 880, ms: 120, gain: 0.04 });
    };

    // Send audio chunks
    worklet.port.onmessage = (e: MessageEvent) => {
      const float32 = e.data as Float32Array;

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

      // partial transcript
      if (msg.type === "conversation.item.input_audio_transcription.delta") {
        const delta = String(msg.delta ?? "");
        if (!delta) return;
        liveRef.current += delta;
        return;
      }

      // final transcript
      if (msg.type === "conversation.item.input_audio_transcription.completed") {
        const finalText = String(msg.transcript ?? "").trim();
        liveRef.current = "";

        if (!finalText) return;

        // If the user *said* the wake word, give a short confirmation beep.
        if (startsWithWakeWord(finalText)) {
          safeBeep(audioCtxRef.current, { freq: 1200, ms: 90, gain: 0.035 });
        }

        // IMPORTANT: your app currently requires wake word to forward commands
        const cmd = maybeHandleWakeWord(finalText);
        if (cmd) handleTranscript(cmd);

        return;
      }

      if (msg.type === "error") {
        // eslint-disable-next-line no-console
        console.error("[RealtimeVoice] error", msg);
      }
    };

    ws.onerror = (err) => {
      // eslint-disable-next-line no-console
      console.error("[RealtimeVoice] WS error", err);
      stop();
    };

    ws.onclose = () => {
      stop();
    };
  }

  function stop() {
    // disconnect worklet
    try {
      workletRef.current?.disconnect();
    } catch {}
    workletRef.current = null;

    // close WS
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    // stop mic
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // close audio context
    try {
      void audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;

    liveRef.current = "";
  }

  return { start, stop };
}