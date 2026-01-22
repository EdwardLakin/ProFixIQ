"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type CommandStatus = "ok" | "fail" | "na";

type VoiceCommand =
  | {
      command: "update_status";
      section?: string;
      item?: string;
      side?: "left" | "right";
      status: CommandStatus;
      note?: string;
    }
  | {
      command: "update_value";
      section?: string;
      item?: string;
      side?: "left" | "right";
      value: number | string;
      unit?: string;
      note?: string;
    }
  | {
      command: "add_note";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
    }
  | {
      command: "add_part";
      section?: string;
      item?: string;
      side?: "left" | "right";
      partName: string;
      quantity?: number;
    }
  | {
      command: "add_labor";
      section?: string;
      item?: string;
      side?: "left" | "right";
      hours: number;
      label?: string;
    }
  | {
      command: "add_recommended_line";
      label: string;
      hours?: number;
      note?: string;
    }
  | { command: "pause_inspection" }
  | { command: "finish_inspection" };

type VoiceRunResponse = {
  transcript: string;
  commands: VoiceCommand[];
};

export default function VoiceRunPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [commands, setCommands] = useState<VoiceCommand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const canRecord = useMemo(() => {
    return typeof window !== "undefined" && !!navigator?.mediaDevices?.getUserMedia;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    setCommands([]);

    if (!canRecord) {
      setError("This browser cannot access the microphone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // stop tracks
        for (const track of stream.getTracks()) track.stop();

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "voice.webm", { type: "audio/webm" });

        try {
          const form = new FormData();
          form.append("audio", file);

          const res = await fetch("/api/voice/run", {
            method: "POST",
            body: form,
          });

          if (!res.ok) {
            setError(`Request failed: ${res.status}`);
            return;
          }

          const data = (await res.json()) as VoiceRunResponse;
          setTranscript(data.transcript ?? "");
          setCommands(Array.isArray(data.commands) ? data.commands : []);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic permission denied.");
    }
  }, [canRecord]);

  const stop = useCallback(() => {
    setError(null);
    try {
      recorderRef.current?.stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop recording.");
    } finally {
      setIsRecording(false);
      recorderRef.current = null;
    }
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Voice Debug Runner</h1>
      <p style={{ opacity: 0.8, marginTop: 6 }}>
        Record a command like: “Techy, mark right tie rod end as failed…”
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          onClick={start}
          disabled={isRecording}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            cursor: isRecording ? "not-allowed" : "pointer",
          }}
        >
          Start
        </button>
        <button
          onClick={stop}
          disabled={!isRecording}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            cursor: !isRecording ? "not-allowed" : "pointer",
          }}
        >
          Stop
        </button>

        <div style={{ alignSelf: "center", opacity: 0.85 }}>
          Status:{" "}
          <b>{isRecording ? "Recording…" : "Idle"}</b>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,0,0,0.35)",
            color: "rgba(255,170,170,0.95)",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Transcript</h2>
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            whiteSpace: "pre-wrap",
            minHeight: 56,
          }}
        >
          {transcript || <span style={{ opacity: 0.6 }}>—</span>}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Commands</h2>
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            whiteSpace: "pre-wrap",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 13,
            minHeight: 120,
          }}
        >
          {commands.length ? JSON.stringify(commands, null, 2) : <span style={{ opacity: 0.6 }}>—</span>}
        </div>
      </div>
    </div>
  );
}