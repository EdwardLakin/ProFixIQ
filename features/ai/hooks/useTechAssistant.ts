"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

/* ---------- small utils ---------- */

const STORE_KEY = "tech-asst:v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Only insert a space if alphanumerics are touching across chunk boundary
function mergeChunks(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  const last = prev.charAt(prev.length - 1);
  const first = next.charAt(0);
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
  return isWord(last) && isWord(first) ? prev + " " + next : prev + next;
}

// Final Markdown tidy pass (very conservative)
function normalizeMarkdown(s: string): string {
  let out = s;

  // Remove any transport leftovers
  out = out.replace(/\b(?:event:\s*done|data:\s*\[DONE\])\b/gi, "");

  // Ensure headings start on their own line
  out = out.replace(/([^\n])\s*(#{2,4}\s+)/g, (_m, a, h) => `${a}\n\n${h}`);

  // Convert inline " - " list items smashed by streaming into real bullets
  out = out.replace(/([^\n])\s*-\s+/g, (_m, a) => `${a}\n- `);

  // When numbers got glued into text, nudge them to a new line list
  out = out.replace(/(\n|^)\s*(\d+)\.\s*(?=[A-Za-z])/g, (_m, _nl, n) => `\n${n}. `);

  // Collapse 3+ newlines to 2
  out = out.replace(/\n{3,}/g, "\n\n");

  // Trim trailing whitespace
  return out.trim();
}

// Read OpenAI-ish "plain text SSE": lines like `data: <text>\n\n`
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (txt: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const packet = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!packet || packet.startsWith(":")) continue;

      // Accept either "data: ..." or plain text
      const line = packet.startsWith("data:") ? packet.slice(5).trim() : packet;
      if (line === "[DONE]" || /event:\s*done/i.test(packet)) return;
      onChunk(line);
    }
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(buf).toString("base64")
    : btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

/* ---------- the hook ---------- */

export function useTechAssistant(opts?: AssistantOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(opts?.defaultVehicle);
  const [context, setContext] = useState<string>(opts?.defaultContext ?? "");

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- load persisted session once ----
  useEffect(() => {
    const boot = safeParse<{ v?: Vehicle; c?: string; m?: ChatMessage[] }>(
      typeof window !== "undefined" ? localStorage.getItem(STORE_KEY) : null,
      {},
    );
    if (boot.m?.length) setMessages(boot.m);
    if (boot.c != null) setContext(boot.c);
    if (boot.v && (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))) {
      setVehicle(boot.v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persist session (debounced-ish) ----
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ v: vehicle, c: context, m: messages }),
        );
      } catch { /* ignore quota */ }
    }, 200);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [vehicle, context, messages]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  // ---- micro-batch streaming → smoother typing bubble ----
  const streamToAssistant = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!canSend) {
        setError("Please provide vehicle info (year, make, model).");
        return;
      }
      setError(null);
      setSending(true);
      setPartial("");

      const body = { ...payload, vehicle, context, messages };
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // micro-batch state
      let accum = "";
      let liveBuf = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          setPartial((p) => mergeChunks(p, liveBuf));
          liveBuf = "";
          flushTimer = null;
        }, 40); // ~25fps feel
      };

      try {
        const res = await postJSON("/api/assistant/stream", body, ctrl.signal);
        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Stream failed.");
        }

        await readSseStream(res.body, (chunk) => {
          // collect into micro-batch buffer for smoother UI
          liveBuf = mergeChunks(liveBuf, chunk);
          scheduleFlush();
          // keep full transcript, with same spacing guard
          accum = mergeChunks(accum, chunk);
        });

        // do a final flush of the micro-batch
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (liveBuf) {
          setPartial((p) => mergeChunks(p, liveBuf));
          liveBuf = "";
        }

        // Final tidy for the saved assistant message
        const finalMsg: ChatMessage = {
          role: "assistant",
          content: normalizeMarkdown(accum),
        };
        setMessages((m) => [...m, finalMsg]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to stream assistant.";
        setError(msg);
      } finally {
        setSending(false);
        setPartial(""); // collapse typing bubble
        abortRef.current = null;
      }
    },
    [messages, vehicle, context, canSend],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      await streamToAssistant({});
    },
    [streamToAssistant],
  );

  const sendDtc = useCallback(
    async (dtcCode: string, note?: string) => {
      const code = dtcCode.trim().toUpperCase();
      if (!code) return;
      setMessages((m) => [
        ...m,
        { role: "user", content: `DTC: ${code}${note ? `\nNote: ${note}` : ""}` },
      ]);
      await streamToAssistant({});
    },
    [streamToAssistant],
  );

  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      // drop a small anchor message for the transcript
      setMessages((m) => [
        ...m,
        { role: "user", content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}` },
      ]);
      const image_data = await fileToDataUrl(file);
      await streamToAssistant({ image_data });
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
  }, []);

  const exportToWorkOrder = useCallback(
    async (workOrderLineId: string) => {
      if (!workOrderLineId) throw new Error("Missing work order line id.");
      if (!canSend) throw new Error("Provide vehicle info before exporting.");
      const res = await postJSON("/api/assistant/export", { vehicle, messages, workOrderLineId });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Export failed.");
      return (await res.json()) as {
        cause: string;
        correction: string;
        estimatedLaborTime: number | null;
      };
    },
    [messages, vehicle, canSend],
  );

  return {
    vehicle, context, messages, partial,
    setVehicle, setContext, setMessages,
    sending, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder, resetConversation, cancel,
  };
}