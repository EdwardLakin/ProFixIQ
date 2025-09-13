// features/ai/hooks/useTechAssistant.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = {
  defaultVehicle?: Vehicle;
  defaultContext?: string;
};

/* ---------- Helpers ---------- */

// Merge chunks while keeping natural spacing (no “wor d” or missing breaks)
function mergeChunks(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  const last = prev.at(-1) ?? "";
  const first = next[0] ?? "";
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
  if (isWord(last) && isWord(first)) return prev + " " + next;
  return prev + next;
}

// Final cleanup for Markdown readability
function tidyMarkdown(s: string): string {
  let out = s;
  // Normalize CRLF
  out = out.replace(/\r\n/g, "\n");
  // Remove stray control tokens
  out = out.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");
  // Avoid “### Heading” glued to previous text
  out = out.replace(/([^\n])\s*(#{2,3}\s+)/g, "$1\n\n$2");
  // Ensure list items have newlines
  out = out.replace(/([^\n])\s*([-*]\s+)/g, "$1\n$2");
  // Collapse >2 blank lines
  out = out.replace(/\n{3,}/g, "\n\n");
  // Trim
  return out.trim();
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

// Read our SSE: server emits "data: <text>\n\n" and an "event: done"
async function readSse(
  body: ReadableStream<Uint8Array>,
  onText: (t: string) => void,
  onDone: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!raw) continue;

      // "event: ..." or "data: ..."
      if (raw.startsWith("event:")) {
        const e = raw.slice(6).trim();
        if (e.toLowerCase() === "done") onDone();
        continue;
      }
      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
      if (!line) continue;
      onText(line);
    }
  }
  onDone();
}

async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

/* ---------- Hook ---------- */

export function useTechAssistant(opts?: AssistantOptions) {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("ta_msgs") : null;
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  });
  const [vehicle, setVehicleState] = useState<Vehicle | undefined>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("ta_vehicle") : null;
    return raw ? (JSON.parse(raw) as Vehicle) : opts?.defaultVehicle;
  });
  const [context, setContextState] = useState<string>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("ta_ctx") : null;
    return raw ?? (opts?.defaultContext ?? "");
  });

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // micro-batch buffer
  const batchRef = useRef<string>("");
  const flushTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  // Persist small bits
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta_msgs", JSON.stringify(messages));
  }, [messages]);
  useEffect(() => {
    if (typeof window !== "undefined" && vehicle)
      localStorage.setItem("ta_vehicle", JSON.stringify(vehicle));
  }, [vehicle]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta_ctx", context);
  }, [context]);

  // Guard defaultVehicle: only seed if current is empty
  useEffect(() => {
    if (
      opts?.defaultVehicle &&
      (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))
    ) {
      setVehicle(opts.defaultVehicle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.defaultVehicle]);

  const setVehicle = useCallback((v: Vehicle | undefined) => {
    setVehicleState(v);
  }, []);
  const setContext = useCallback((s: string) => setContextState(s), []);

  // Micro-batch flusher: reduces “one character at a time” flicker
  const startFlusher = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setInterval(() => {
      if (!batchRef.current) return;
      setPartial((prev) => mergeChunks(prev, batchRef.current));
      batchRef.current = "";
    }, 50);
  }, []);
  const stopFlusher = useCallback(() => {
    if (flushTimer.current !== null) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
  }, []);

  const streamToAssistant = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!canSend) {
        setError("Please provide vehicle info (year, make, model).");
        return;
      }

      setError(null);
      setSending(true);
      setPartial("");
      batchRef.current = "";
      startFlusher();

      const body = { ...payload, vehicle, context, messages };
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await postJSON("/api/assistant/stream", body, ctrl.signal);
        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Stream failed.");
        }

        let accum = "";
        await readSse(
          res.body,
          (chunk) => {
            // collect chunk into batch; flusher handles setPartial
            batchRef.current = mergeChunks(batchRef.current, chunk);
            accum = mergeChunks(accum, chunk);
          },
          () => {
            // done
          },
        );

        stopFlusher();
        // flush any tail
        if (batchRef.current) {
          setPartial((prev) => mergeChunks(prev, batchRef.current));
          batchRef.current = "";
        }

        const finalText = tidyMarkdown(accum);
        setPartial("");
        setMessages((m) => [...m, { role: "assistant", content: finalText }]);
      } catch (e) {
        stopFlusher();
        batchRef.current = "";
        const msg = e instanceof Error ? e.message : "Failed to stream assistant.";
        setError(msg);
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [messages, vehicle, context, canSend, startFlusher, stopFlusher],
  );

  // Public actions
  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Prefix follow-up hint to steer away from repeating prior sections
      const isFollowUp = messages.length > 0;
      const turn = isFollowUp ? `Follow-up: ${trimmed}` : trimmed;

      setMessages((m) => [...m, { role: "user", content: turn }]);
      await streamToAssistant({});
    },
    [messages, streamToAssistant],
  );

  const sendDtc = useCallback(
    async (dtcCode: string, note?: string) => {
      const code = dtcCode.trim().toUpperCase();
      if (!code) return;
      const turn = `Follow-up: Analyze DTC ${code}${note ? `\nNote: ${note}` : ""}`;
      setMessages((m) => [...m, { role: "user", content: turn }]);
      await streamToAssistant({});
    },
    [streamToAssistant],
  );

  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      const img = await fileToDataUrl(file);
      setMessages((m) => [
        ...m,
        { role: "user", content: `Follow-up: Consider this photo.${note ? `\nNote: ${note}` : ""}` },
      ]);
      await streamToAssistant({ image_data: img });
    },
    [streamToAssistant],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("ta_msgs");
    }
  }, []);

  const exportToWorkOrder = useCallback(
    async (workOrderLineId: string) => {
      if (!workOrderLineId) throw new Error("Missing work order line id.");
      if (!canSend) throw new Error("Provide vehicle info before exporting.");

      const res = await postJSON("/api/assistant/export", { vehicle, messages, workOrderLineId });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Export failed.");
      }
      return (await res.json()) as {
        cause: string;
        correction: string;
        estimatedLaborTime: number | null;
      };
    },
    [messages, vehicle, canSend],
  );

  return {
    vehicle,
    context,
    messages,
    partial,

    setVehicle,
    setContext,
    setMessages,

    sending,
    error,

    sendChat,
    sendDtc,
    sendPhoto,
    exportToWorkOrder,
    resetConversation,
    cancel,
  };
}