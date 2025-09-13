"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Vehicle = { year?: string | null; make?: string | null; model?: string | null };
type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

function mergeChunks(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  const a = prev[prev.length - 1] ?? "";
  const b = next[0] ?? "";
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
  return isWord(a) && isWord(b) ? prev + " " + next : prev + next;
}

// Preserve bullets/headings and fix common stream “glue” issues
function normalizeMarkdown(md: string): string {
  let s = md.replace(/\r/g, "");
  // ensure newline before headings ### / ## if glued
  s = s.replace(/([^\n])(\n)?(#{2,6}\s)/g, (_m, p1, _n, h) => `${p1}\n\n${h}`);
  // ensure list markers start on their own line
  s = s.replace(/([^\n])(\n)?([*-] |\d+\.\s)/g, (_m, p1, _n, m) => `${p1}\n${m}`);
  // collapse 3+ blank lines -> 2
  s = s.replace(/\n{3,}/g, "\n\n");
  // trim stray transport echoes
  s = s.replace(/\s*\b(event:\s*done|data:\s*\[DONE\])\b\s*$/i, "");
  return s.trim();
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void
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
        const obj = JSON.parse(line) as { choices?: Array<{ delta?: { content?: string }; text?: string }> };
        const piece = obj?.choices?.[0]?.delta?.content ?? obj?.choices?.[0]?.text ?? "";
        if (piece) onChunk(piece);
      } catch {
        onChunk(line);
      }
    }
  }
}

async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal });
}

export function useTechAssistant(opts?: AssistantOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem("ai_chat_messages") || "[]"); } catch { return []; }
  });
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(() => {
    try { return JSON.parse(localStorage.getItem("ai_vehicle") || "null") || undefined; } catch { return opts?.defaultVehicle; }
  });
  const [context, setContext] = useState<string>(() => localStorage.getItem("ai_context") || opts?.defaultContext || "");

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const canSend = useMemo(() => Boolean(vehicle?.year && vehicle?.make && vehicle?.model), [vehicle]);

  // persist
  useEffect(() => { localStorage.setItem("ai_chat_messages", JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem("ai_vehicle", JSON.stringify(vehicle ?? null)); }, [vehicle]);
  useEffect(() => { localStorage.setItem("ai_context", context); }, [context]);

  // seed default vehicle only if nothing restored
  useEffect(() => {
    if (opts?.defaultVehicle && (!vehicle || (!vehicle.year && !vehicle.make && !vehicle.model))) {
      setVehicle(opts.defaultVehicle);
    }
  }, [opts?.defaultVehicle, setVehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamToAssistant = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!canSend) { setError("Please provide vehicle info (year, make, model)."); return; }

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
        // micro-batch updates for smoother typing
        let batch = "";
        let timer: number | null = null;

        const flush = () => {
          if (!batch) return;
          setPartial((prev) => normalizeMarkdown(mergeChunks(prev, batch)));
          batch = "";
        };

        await readSseStream(res.body, (chunk) => {
          batch = mergeChunks(batch, chunk);
          accum = mergeChunks(accum, chunk);
          if (timer == null) {
            timer = window.setTimeout(() => {
              flush();
              timer = null;
            }, 48); // ~20fps
          }
        });

        if (timer != null) { window.clearTimeout(timer); timer = null; }
        if (batch) { setPartial((prev) => normalizeMarkdown(mergeChunks(prev, batch))); batch = ""; }

        const assistantMsg: ChatMessage = { role: "assistant", content: normalizeMarkdown(accum) };
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

  const sendChat = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    await streamToAssistant({});
  }, [streamToAssistant]);

  const sendDtc = useCallback(async (dtcCode: string, note?: string) => {
    const code = dtcCode.trim().toUpperCase();
    if (!code) return;
    setMessages((m) => [...m, { role: "user", content: `DTC: ${code}${note ? `\nNote: ${note}` : ""}` }]);
    await streamToAssistant({});
  }, [streamToAssistant]);

  const sendPhoto = useCallback(async (file: File, note?: string) => {
    if (!file) return;
    setMessages((m) => [...m, { role: "user", content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}` }]);
    const buf = await file.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const image_data = `data:${file.type || "image/jpeg"};base64,${b64}`;
    await streamToAssistant({ image_data });
  }, [streamToAssistant]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const resetConversation = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null;
    setMessages([]); setPartial(""); setError(null);
  }, []);

  const exportToWorkOrder = useCallback(async (workOrderLineId: string) => {
    if (!workOrderLineId) throw new Error("Missing work order line id.");
    if (!canSend) throw new Error("Provide vehicle info before exporting.");
    const res = await postJSON("/api/assistant/export", { vehicle, messages, workOrderLineId });
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Export failed.");
    return (await res.json()) as { cause: string; correction: string; estimatedLaborTime: number | null };
  }, [messages, vehicle, canSend]);

  return {
    vehicle, context, messages, partial,
    setVehicle, setContext, setMessages,
    sending, error,
    sendChat, sendDtc, sendPhoto,
    exportToWorkOrder, resetConversation, cancel,
  };
}