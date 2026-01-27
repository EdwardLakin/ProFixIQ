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

    // ✅ Realtime transcription: audio/pcm @ 24kHz only  [oai_citation:4‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime-transcription)
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
      // browser auth via subprotocol token
      ["realtime", `openai-insecure-api-key.${token}`],
    );
    wsRef.current = ws;

    ws.onopen = () => {
      // ✅ configure transcription + server VAD  [oai_citation:5‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime-transcription)
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

      // ✅ partial transcript event  [oai_citation:6‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime-transcription)
      if (msg.type === "conversation.item.input_audio_transcription.delta") {
        const delta = String(msg.delta ?? "");
        if (!delta) return;
        liveRef.current += delta;
        return;
      }

      // ✅ final transcript event  [oai_citation:7‡OpenAI Platform](https://platform.openai.com/docs/guides/realtime-transcription)
      if (
        msg.type === "conversation.item.input_audio_transcription.completed"
      ) {
        const finalText = String(msg.transcript ?? "").trim();
        liveRef.current = "";

        if (!finalText) return;

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
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    liveRef.current = "";
  }

  return { start, stop };
}