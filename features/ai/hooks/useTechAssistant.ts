"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

// Join streaming chunks while preserving natural spacing between words.
function mergeChunks(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  const last = prev[prev.length - 1] ?? "";
  const first = next[0] ?? "";
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
  return isWord(last) && isWord(first) ? prev + " " + next : prev + next;
}

// 🔹 NEW: a tiny nudge we’ll append to every user turn
const FOLLOWUP_NUDGE =
  "Format with headings + bullet/numbered lists and line breaks. If this is a follow-up, answer only the new question; do not repeat the entire prior procedure. Do not include transport markers like 'event: done'.";

function wrapUserQuestion(text: string): string {
  // keep it short so we don’t drown out the actual question
  return `Question:\n${text}\n\n${FOLLOWUP_NUDGE}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

/** Parse OpenAI native SSE (data: {choices:[{delta:{content}}]} / [DONE]) */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
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
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!raw || raw.startsWith(":")) continue;

      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
      if (line === "[DONE]") return;

      try {
        const obj = JSON.parse(line) as {
          choices?: Array<{ delta?: { content?: string }; text?: string }>;
        };
        const piece =
          obj?.choices?.[0]?.delta?.content ??
          obj?.choices?.[0]?.text ??
          "";
        if (piece) onChunk(piece);
      } catch {
        onChunk(line);
      }
    }
  }
}

async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

export function useTechAssistant(opts?: AssistantOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(opts?.defaultVehicle);
  const [context, setContext] = useState<string>(opts?.defaultContext ?? "");

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

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

      try {
        const res = await postJSON("/api/assistant/stream", body, ctrl.signal);
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Stream failed.");
        }

        let accum = "";
        await readSseStream(res.body, (chunk) => {
          setPartial((prev) => mergeChunks(prev, chunk));
          accum = mergeChunks(accum, chunk);
        });

        const assistantMsg: ChatMessage = { role: "assistant", content: accum.trim() };
        setMessages((m) => [...m, assistantMsg]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to stream assistant.";
        setError(msg);
      } finally {
        setSending(false);
        setPartial("");
        abortRef.current = null;
      }
    },
    [messages, vehicle, context, canSend],
  );

  /** Plain chat */
  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // 🔹 wrap the user's turn so follow-ups stay concise
      setMessages((m) => [...m, { role: "user", content: wrapUserQuestion(trimmed) }]);
      await streamToAssistant({});
    },
    [streamToAssistant],
  );

  /** DTC analysis */
  const sendDtc = useCallback(
    async (dtcCode: string, note?: string) => {
      const code = dtcCode.trim().toUpperCase();
      if (!code) return;
      const turn = `DTC: ${code}${note ? `\nNote: ${note}` : ""}\n\n${FOLLOWUP_NUDGE}`;
      setMessages((m) => [...m, { role: "user", content: turn }]);
      await streamToAssistant({});
    },
    [streamToAssistant],
  );

  /** Photo + optional note */
  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      const image_data = await fileToDataUrl(file);
      const turn = `Photo provided.${note ? `\nNote: ${note}` : ""}\n\n${FOLLOWUP_NUDGE}`;
      setMessages((m) => [...m, { role: "user", content: turn }]);
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