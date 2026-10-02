"use client";

import { useEffect, useRef } from "react";

export type RealtimeTranscriptionState =
  | "idle"
  | "connecting"
  | "listening"
  | "error";

export type RealtimeAutoStopReason = "max_duration" | "idle";
export type VoiceSurface = "technician_copilot" | "inspection";
export type HandleTranscriptFn = (
  text: string,
  delegationId?: string,
) => void | Promise<unknown>;

export type RealtimeTranscriptionOptions = {
  onStateChange?: (state: RealtimeTranscriptionState) => void;
  onPulse?: () => void;
  onError?: (message: string) => void;
  debug?: boolean;
  maxStreamingMs?: number;
  idleTimeoutMs?: number;
  maxPausedMs?: number;
  onAutoStop?: (reason: RealtimeAutoStopReason) => void;
  onOutputStateChange?: (speaking: boolean) => void;
  surface?: VoiceSurface;
};

export const DEFAULT_MAX_STREAMING_MS = 10 * 60_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

const GUARD_TICK_MS = 1_000;
const ICE_GATHER_TIMEOUT_MS = 10_000;

type TranscriptTurn = {
  text: string;
  endMs: number;
};

type LiveResources = {
  generation: number;
  peer: RTCPeerConnection | null;
  events: RTCDataChannel | null;
  mediaStream: MediaStream | null;
  audio: HTMLAudioElement | null;
  paused: boolean;
  guardTimer: ReturnType<typeof setInterval> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  streamedMs: number;
  streamingSince: number | null;
  lastActivityAt: number;
  completedTranscriptTurns: TranscriptTurn[];
  currentTranscript: string;
  currentTranscriptEndMs: number;
  lastDelegationOffsetMs: number;
  latestDelegationId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function suspendStreamingClock(session: LiveResources, now: number): void {
  if (session.streamingSince === null) return;
  session.streamedMs += Math.max(0, now - session.streamingSince);
  session.streamingSince = null;
}

function resumeStreamingClock(session: LiveResources, now: number): void {
  if (session.streamingSince !== null) return;
  session.streamingSince = now;
  session.lastActivityAt = now;
}

function streamedTotalMs(session: LiveResources, now: number): number {
  return (
    session.streamedMs +
    (session.streamingSince === null
      ? 0
      : Math.max(0, now - session.streamingSince))
  );
}

function stopStream(stream: MediaStream | null): void {
  try {
    stream?.getTracks().forEach((track) => track.stop());
  } catch {}
}

function sendEvent(
  session: LiveResources,
  event: Record<string, unknown>,
): boolean {
  const channel = session.events;
  if (!channel || channel.readyState !== "open") return false;
  channel.send(JSON.stringify(event));
  return true;
}

async function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Voice connection timed out while gathering ICE candidates."));
    }, ICE_GATHER_TIMEOUT_MS);
    const onState = () => {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}

function cleanupSession(session: LiveResources): void {
  if (session.guardTimer) clearInterval(session.guardTimer);
  if (session.pauseTimer) clearTimeout(session.pauseTimer);
  session.guardTimer = null;
  session.pauseTimer = null;

  try {
    session.events?.close();
  } catch {}
  session.events = null;

  try {
    session.peer?.close();
  } catch {}
  session.peer = null;

  stopStream(session.mediaStream);
  session.mediaStream = null;

  if (session.audio) {
    try {
      session.audio.pause();
    } catch {}
    session.audio.srcObject = null;
  }
  session.audio = null;
  session.paused = false;
  session.streamingSince = null;
  session.completedTranscriptTurns = [];
  session.currentTranscript = "";
  session.currentTranscriptEndMs = 0;
  session.latestDelegationId = null;
}

export function useRealtimeTranscription(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeTranscriptionOptions,
) {
  const activeSessionRef = useRef<LiveResources | null>(null);
  const stoppedRef = useRef(true);
  const startupGenerationRef = useRef(0);
  const handleTranscriptRef = useRef(handleTranscript);
  const maybeHandleWakeWordRef = useRef(maybeHandleWakeWord);
  const transcriptQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingTranscriptsRef = useRef(0);

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript;
  }, [handleTranscript]);

  useEffect(() => {
    maybeHandleWakeWordRef.current = maybeHandleWakeWord;
  }, [maybeHandleWakeWord]);

  const setState = (state: RealtimeTranscriptionState) => {
    opts?.onStateChange?.(state);
  };

  const isCurrent = (session: LiveResources): boolean =>
    !stoppedRef.current &&
    activeSessionRef.current === session &&
    startupGenerationRef.current === session.generation;

  const detach = (session: LiveResources): boolean => {
    if (activeSessionRef.current !== session) return false;
    activeSessionRef.current = null;
    stoppedRef.current = true;
    startupGenerationRef.current += 1;
    return true;
  };

  const fail = (session: LiveResources, message: string): void => {
    const current = detach(session);
    cleanupSession(session);
    if (!current) return;
    setState("error");
    opts?.onError?.(message);
  };

  const autoStop = (
    session: LiveResources,
    reason: RealtimeAutoStopReason,
  ): void => {
    if (!detach(session)) {
      cleanupSession(session);
      return;
    }
    sendEvent(session, {
      type: "session.close",
      event_id: `profix_autostop_${Date.now()}`,
    });
    cleanupSession(session);
    setState("idle");
    opts?.onAutoStop?.(reason);
  };

  const startGuardTimer = (session: LiveResources): void => {
    const maxStreamingMs =
      typeof opts?.maxStreamingMs === "number"
        ? opts.maxStreamingMs
        : DEFAULT_MAX_STREAMING_MS;
    const idleTimeoutMs =
      typeof opts?.idleTimeoutMs === "number"
        ? opts.idleTimeoutMs
        : DEFAULT_IDLE_TIMEOUT_MS;
    if (maxStreamingMs <= 0 && idleTimeoutMs <= 0) return;

    session.guardTimer = setInterval(() => {
      if (!isCurrent(session)) return;
      const now = Date.now();
      if (session.paused) {
        suspendStreamingClock(session, now);
        return;
      }
      resumeStreamingClock(session, now);

      if (maxStreamingMs > 0 && streamedTotalMs(session, now) >= maxStreamingMs) {
        autoStop(session, "max_duration");
        return;
      }
      if (idleTimeoutMs > 0 && now - session.lastActivityAt >= idleTimeoutMs) {
        autoStop(session, "idle");
      }
    }, GUARD_TICK_MS);
  };

  const dispatchDelegation = (
    session: LiveResources,
    delegationId: string,
    offsetMs: number,
  ): void => {
    const collect = (attempt: number): void => {
      window.setTimeout(() => {
        if (!isCurrent(session)) return;

        const candidates = session.completedTranscriptTurns.filter(
          (turn) =>
            turn.endMs > session.lastDelegationOffsetMs &&
            turn.endMs <= offsetMs + 500,
        );
        if (session.currentTranscript.trim()) {
          candidates.push({
            text: session.currentTranscript.trim(),
            endMs: session.currentTranscriptEndMs || offsetMs,
          });
        }
        const selected = candidates
          .filter((turn) => turn.endMs <= offsetMs + 500)
          .sort((a, b) => b.endMs - a.endMs)[0];

        if (!selected && attempt < 3) {
          collect(attempt + 1);
          return;
        }

        session.lastDelegationOffsetMs = Math.max(
          session.lastDelegationOffsetMs,
          offsetMs,
        );
        session.completedTranscriptTurns = session.completedTranscriptTurns.filter(
          (turn) => turn.endMs > session.lastDelegationOffsetMs,
        );
        if (!selected?.text.trim()) return;

        const command = (
          maybeHandleWakeWordRef.current(selected.text) ?? ""
        ).trim();
        if (!command) return;

        const invoke = (): Promise<unknown> => {
          try {
            session.latestDelegationId = delegationId;
            return Promise.resolve(
              handleTranscriptRef.current(command, delegationId),
            );
          } catch (caught) {
            return Promise.reject(caught);
          }
        };
        const run =
          pendingTranscriptsRef.current === 0
            ? invoke()
            : transcriptQueueRef.current.then(invoke);
        pendingTranscriptsRef.current += 1;
        transcriptQueueRef.current = run
          .catch((caught) => {
            // eslint-disable-next-line no-console
            console.error("[GPTLive] delegated transcript handler failed", caught);
          })
          .finally(() => {
            pendingTranscriptsRef.current -= 1;
          });
      }, attempt === 0 ? 300 : 200);
    };

    collect(0);
  };

  async function start(): Promise<void> {
    if (!stoppedRef.current || activeSessionRef.current) return;
    if (
      typeof window === "undefined" ||
      typeof RTCPeerConnection === "undefined"
    ) {
      throw new Error("This browser does not support GPT-Live voice.");
    }

    const generation = startupGenerationRef.current + 1;
    startupGenerationRef.current = generation;
    stoppedRef.current = false;

    const session: LiveResources = {
      generation,
      peer: null,
      events: null,
      mediaStream: null,
      audio: null,
      paused: false,
      guardTimer: null,
      pauseTimer: null,
      streamedMs: 0,
      streamingSince: null,
      lastActivityAt: Date.now(),
      completedTranscriptTurns: [],
      currentTranscript: "",
      currentTranscriptEndMs: 0,
      lastDelegationOffsetMs: 0,
      latestDelegationId: null,
    };
    activeSessionRef.current = session;
    setState("connecting");

    try {
      const peer = new RTCPeerConnection();
      session.peer = peer;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      session.audio = audio;

      peer.addEventListener("track", (event) => {
        if (!isCurrent(session)) return;
        const stream =
          event.streams[0] ?? new MediaStream([event.track]);
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      });

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      session.mediaStream = microphone;
      if (!isCurrent(session)) {
        cleanupSession(session);
        return;
      }
      for (const track of microphone.getAudioTracks()) {
        peer.addTrack(track, microphone);
      }

      const events = peer.createDataChannel("oai-events");
      session.events = events;

      events.addEventListener("message", (event) => {
        if (!isCurrent(session) || typeof event.data !== "string") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isRecord(parsed)) return;

        const type = getString(parsed.type);
        if (opts?.debug && type) {
          // eslint-disable-next-line no-console
          console.log("[GPTLive] event:", type);
        }

        if (type === "session.started") {
          session.lastActivityAt = Date.now();
          session.streamingSince = Date.now();
          setState("listening");
          startGuardTimer(session);
          return;
        }

        if (type === "session.input_transcript.delta") {
          const delta = getString(parsed.delta);
          if (!delta) return;
          session.currentTranscript += delta;
          session.currentTranscriptEndMs =
            typeof parsed.end_ms === "number" ? parsed.end_ms : Date.now();
          session.lastActivityAt = Date.now();
          opts?.onPulse?.();
          return;
        }

        if (
          type === "session.input_transcript.done" ||
          type === "session.input_transcript.completed"
        ) {
          const text =
            getString(parsed.transcript).trim() ||
            session.currentTranscript.trim();
          const endMs =
            typeof parsed.end_ms === "number"
              ? parsed.end_ms
              : session.currentTranscriptEndMs || Date.now();
          if (text) {
            session.completedTranscriptTurns.push({ text, endMs });
            if (session.completedTranscriptTurns.length > 8) {
              session.completedTranscriptTurns.splice(
                0,
                session.completedTranscriptTurns.length - 8,
              );
            }
          }
          session.currentTranscript = "";
          session.currentTranscriptEndMs = 0;
          return;
        }

        if (type === "session.delegation.created") {
          const delegation = isRecord(parsed.delegation)
            ? parsed.delegation
            : null;
          if (
            !delegation ||
            delegation.target !== "client" ||
            typeof delegation.id !== "string"
          ) {
            return;
          }
          const offsetMs =
            typeof parsed.offset_ms === "number"
              ? parsed.offset_ms
              : session.lastDelegationOffsetMs + 1;
          dispatchDelegation(session, delegation.id, offsetMs);
          return;
        }

        if (
          type === "session.output_transcript.delta" ||
          type === "session.output_audio.started"
        ) {
          session.lastActivityAt = Date.now();
          opts?.onOutputStateChange?.(true);
          return;
        }

        if (
          type === "session.output_transcript.done" ||
          type === "session.output_transcript.completed" ||
          type === "session.output_audio.done"
        ) {
          session.lastActivityAt = Date.now();
          opts?.onOutputStateChange?.(false);
          return;
        }

        if (type === "session.closed") {
          const current = detach(session);
          cleanupSession(session);
          if (current) setState("idle");
          return;
        }

        if (type === "error") {
          const error = isRecord(parsed.error) ? parsed.error : null;
          fail(
            session,
            error && typeof error.message === "string"
              ? error.message
              : "GPT-Live voice error",
          );
        }
      });

      events.addEventListener("close", () => {
        if (!isCurrent(session)) return;
        const current = detach(session);
        cleanupSession(session);
        if (current) setState("idle");
      });

      peer.addEventListener("connectionstatechange", () => {
        if (!isCurrent(session)) return;
        if (peer.connectionState === "failed") {
          fail(session, "GPT-Live voice connection failed.");
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      if (!isCurrent(session)) {
        cleanupSession(session);
        return;
      }

      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Voice connection did not produce an SDP offer.");

      const response = await fetch("/api/openai/realtime-token", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp,
          surface: opts?.surface ?? "inspection",
        }),
      });
      if (!response.ok) {
        let message = "Voice could not start.";
        try {
          const payload = (await response.json()) as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) {
            message = payload.error.trim();
          }
        } catch {}
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        transport?: { sdp?: unknown };
      };
      const answerSdp =
        typeof payload.transport?.sdp === "string"
          ? payload.transport.sdp
          : "";
      if (!answerSdp) {
        throw new Error("Voice service returned an invalid WebRTC answer.");
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (caught) {
      const current = activeSessionRef.current === session;
      if (current) detach(session);
      cleanupSession(session);
      if (!current) return;

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
    if (!session || stoppedRef.current || session.paused) return false;
    session.paused = true;
    suspendStreamingClock(session, Date.now());
    try {
      session.mediaStream?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}
    sendEvent(session, {
      type: "session.input_audio.mute",
      event_id: `profix_mute_${Date.now()}`,
    });

    const maxPausedMs = opts?.maxPausedMs ?? 0;
    if (maxPausedMs > 0) {
      session.pauseTimer = setTimeout(() => {
        if (activeSessionRef.current === session && session.paused) resume();
      }, maxPausedMs);
    }
    return true;
  }

  function resume(): boolean {
    const session = activeSessionRef.current;
    if (!session || stoppedRef.current || !session.paused) return false;
    if (session.pauseTimer) clearTimeout(session.pauseTimer);
    session.pauseTimer = null;
    session.paused = false;
    try {
      session.mediaStream?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch {}
    sendEvent(session, {
      type: "session.input_audio.unmute",
      event_id: `profix_unmute_${Date.now()}`,
    });
    resumeStreamingClock(session, Date.now());
    return true;
  }

  function speakText(
    text: string,
    delegationId?: string | null,
  ): boolean {
    const session = activeSessionRef.current;
    const content = text.trim();
    if (!session || stoppedRef.current || !content) return false;
    if (session.audio) {
      session.audio.muted = false;
      void session.audio.play().catch(() => undefined);
    }
    return sendEvent(session, {
      type: "session.commentary.append",
      event_id: `profix_commentary_${Date.now()}`,
      delegation_id:
        delegationId === undefined ? session.latestDelegationId : delegationId,
      content,
    });
  }

  function stopAudio(): void {
    const session = activeSessionRef.current;
    if (!session) return;
    if (session.audio) session.audio.muted = true;
    sendEvent(session, {
      type: "session.instructions.append",
      event_id: `profix_interrupt_${Date.now()}`,
      delegation_id: null,
      content: "Stop speaking now and listen to the technician.",
    });
    window.setTimeout(() => {
      if (activeSessionRef.current === session && session.audio) {
        session.audio.muted = false;
      }
    }, 500);
  }

  function stop(): void {
    const session = activeSessionRef.current;
    if (!session) return;
    detach(session);
    sendEvent(session, {
      type: "session.close",
      event_id: `profix_close_${Date.now()}`,
    });
    cleanupSession(session);
    setState("idle");
  }

  useEffect(() => {
    return () => {
      startupGenerationRef.current += 1;
      stoppedRef.current = true;
      const session = activeSessionRef.current;
      activeSessionRef.current = null;
      if (session) {
        sendEvent(session, {
          type: "session.close",
          event_id: `profix_unmount_${Date.now()}`,
        });
        cleanupSession(session);
      }
    };
  }, []);

  return {
    start,
    stop,
    pause,
    resume,
    stopAudio,
    speakText,
  };
}
