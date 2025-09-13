"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

/** Merge streaming chunks while preserving natural spacing (ChatGPT-like). */
function mergeChunks(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;

  const last = prev.at(-1) ?? "";
  const first = next[0] ?? "";
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);

  // word join
  if (isWord(last) && isWord(first)) return prev + " " + next;
  // "###Summary" / "##Heading" join
  if ((prev.endsWith("###") || prev.endsWith("##") || prev.endsWith("#")) && isWord(first))
    return prev + " " + next;
  // "-Step" or "*Note"
  if ((last === "-" || last === "*") && isWord(first)) return prev + " " + next;
  // sentence continuation
  if (last === "." && isWord(first)) return prev + " " + next;

  return prev + next;
}

/** Final tidy pass so Markdown renders like ChatGPT output. */
function normalizeMarkdown(s: string): string {
  let out = s;
  // Ensure space after headings: "###Summary" -> "### Summary"
  out = out.replace(/(#{1,6})([A-Za-z0-9])/g, "$1 $2");
  // Ensure "-Step"/"*Step" -> "- Step"
  out = out.replace(/(^|\n)([\-\*])([A-Za-z0-9])/g, "$1$2 $3");
  // Blank line before headings
  out = out.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");
  return out;
}

/** Parse OpenAI native SSE lines and surface delta text */
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
          const mergedLive = mergeChunks(partial.length ? partial : "", chunk);
          setPartial(normalizeMarkdown(mergedLive));
          accum = normalizeMarkdown(mergeChunks(accum, chunk));
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
    [messages, vehicle, context, canSend, partial],
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
      setMessages((m) => [
        ...m,
        { role: "user", content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}` },
      ]);
      const image_data = await fileToDataUrl(file);
      setMessages((m) => [...m, { role: "user", content: `[image sent]\n${note ?? ""}` }]);
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