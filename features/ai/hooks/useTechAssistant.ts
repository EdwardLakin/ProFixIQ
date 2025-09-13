"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

/** Stream reader for our plain-text SSE (lines like `data: <chunk>\n\n`) */
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

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!raw || raw.startsWith(":")) continue;

      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
      if (line === "[DONE]") return;

      // We stream plain text (already de-SSE'd server-side), so pass through
      onChunk(line);
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

/** Final pass to make the message render like ChatGPT-style Markdown */
function normalizeMarkdown(src: string): string {
  let s = src;

  // Remove any accidental transport markers
  s = s.replace(/^\s*(event:\s*done|data:\s*\[DONE\])\s*$/gmi, "");

  // Ensure a space after heading hashes and a blank line after headings
  // e.g. "###Summary" -> "### Summary\n\n"
  s = s.replace(/(#{1,6})([^\s#])/g, "$1 $2");
  s = s.replace(/^(#{1,6} .+)\s*$/gm, "$1\n");

  // Convert common bullets if the model used unicode bullets
  s = s.replace(/[•·]\s*/g, "- ");

  // Collapse triple+ newlines to at most double (clean but keeps spacing)
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
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
          // 🚫 no space-guessing: just append verbatim
          setPartial((prev) => prev + chunk);
          accum += chunk;
        });

        const final = normalizeMarkdown(accum);
        const assistantMsg: ChatMessage = { role: "assistant", content: final };
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
      // Show a lightweight anchor turn so the tech sees the upload in the flow
      setMessages((m) => [
        ...m,
        { role: "user", content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}` },
      ]);
      // Convert to data URL (base64) and pass as payload; route handles vision
      const buf = await file.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const mime = file.type || "image/jpeg";
      const image_data = `data:${mime};base64,${b64}`;
      await streamToAssistant({ image_data, note });
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