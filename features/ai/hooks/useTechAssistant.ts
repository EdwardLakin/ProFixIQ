"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/** Minimal chat message shape used by the UI and API */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string | (TextPart | ImagePart)[];
};

/** Vehicle shape (permissive so you can pass partials/undefineds) */
export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = {
  /** Seed the hook with an initial vehicle (optional) */
  defaultVehicle?: Vehicle;
  /** Seed the hook with an initial context/complaint/notes (optional) */
  defaultContext?: string;
};

/** OpenAI-compatible message parts for multimodal */
type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };

/** Browser-safe: File → data URL */
async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  const p = new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
  });
  reader.readAsDataURL(file);
  return p;
}

/** Read our server-sent events stream and invoke callbacks */
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

    // Process SSE lines separated by \n\n
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      if (!raw || raw.startsWith(":")) continue; // keepalive/comment

      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
      if (!line) continue;

      try {
        const payload = JSON.parse(line) as
          | { type: "chunk"; content: string }
          | { type: "done" }
          | { type: "error"; error: string };

        if ("type" in payload) {
          if (payload.type === "chunk") onChunk(payload.content);
          if (payload.type === "error") throw new Error(payload.error);
          if (payload.type === "done") return;
          continue;
        }
      } catch {
        // Not JSON? treat as raw chunk
      }
      onChunk(line);
    }
  }
}

/** POST JSON helper with abort support */
async function postJSON(
  url: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

/**
 * Unified assistant hook: chat, DTC, photo — with streaming.
 * Also provides an `exportToWorkOrder` helper to summarize the whole
 * conversation and update a work order line on the server.
 */
export function useTechAssistant(opts?: AssistantOptions) {
  // Conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(
    opts?.defaultVehicle,
  );
  const [context, setContext] = useState<string>(opts?.defaultContext ?? "");

  // UI state
  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>(""); // streaming buffer
  const [error, setError] = useState<string | null>(null);

  // Abort controller for cancel
  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(() => {
    return Boolean(vehicle?.year && vehicle?.make && vehicle?.model);
  }, [vehicle]);

  /** internal: open SSE stream and append an assistant message as it arrives */
  const streamToAssistant = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!canSend) {
        setError("Please provide vehicle info (year, make, model).");
        return;
      }

      setError(null);
      setSending(true);
      setPartial("");

      // include conversation + context + vehicle in the payload
      const body = {
        ...payload,
        vehicle,
        messages,
      };

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await postJSON("/api/assistant/stream", body, ctrl.signal);
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Stream failed.");
        }

        // Begin streaming & buffering
        let accum = "";
        await readSseStream(res.body, (chunk) => {
          setPartial((prev) => prev + chunk);
          accum += chunk;
        });

        // Commit the full assistant message
        const assistantMsg: ChatMessage = { role: "assistant", content: accum };
        setMessages((m) => [...m, assistantMsg]);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          setError("Request cancelled.");
        } else {
          setError(e?.message || "Failed to stream assistant.");
        }
      } finally {
        setSending(false);
        setPartial("");
        abortRef.current = null;
      }
    },
    [messages, vehicle, canSend],
  );

  /** Public: send plain chat text */
  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      // push user message locally first
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      await streamToAssistant({ prompt: trimmed, context });
    },
    [streamToAssistant, context],
  );

  /** Public: send a DTC for the assistant to analyze */
  const sendDtc = useCallback(
    async (dtcCode: string, note?: string) => {
      const code = (dtcCode || "").trim().toUpperCase();
      if (!code) return;
      setMessages((m) => [
        ...m,
        { role: "user", content: `DTC: ${code}${note ? `\nNote: ${note}` : ""}` },
      ]);
      await streamToAssistant({ dtcCode: code, context });
    },
    [streamToAssistant, context],
  );

  /** Public: send a photo (image file) + optional note */
  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      const image_data = await fileToDataUrl(file);

      // Push a multimodal user message: optional text + image
      setMessages((m) => [
        ...m,
        {
          role: "user",
          content: [
            ...(note?.trim()
              ? [{ type: "text", text: `Photo note: ${note.trim()}` } as const]
              : []),
            { type: "image_url", image_url: { url: image_data } } as const,
          ],
        },
      ]);

      // No extra payload needed—the server reads the multimodal message we just appended
      await streamToAssistant({ context });
    },
    [streamToAssistant],
  );

  /** Cancel an in-flight request (if any) */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Reset conversation and any partial stream */
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);
  }, []);

  /**
   * Summarize the full conversation and export to a work order line.
   * The backend will:
   *  - Summarize the chat into cause/correction + estimated labor
   *  - Update the given work_order_line
   *  - Return { cause, correction, estimatedLaborTime }
   */
  const exportToWorkOrder = useCallback(
    async (workOrderLineId: string) => {
      if (!workOrderLineId) throw new Error("Missing work order line id.");
      if (!canSend) throw new Error("Provide vehicle info before exporting.");

      const res = await postJSON("/api/assistant/export", {
        vehicle,
        messages,
        context,
        workOrderLineId,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Export failed.");
      }
      return (await res.json()) as {
        cause: string;
        correction: string;
        estimatedLaborTime: number | null;
      };
    },
    [messages, vehicle, canSend, context],
  );

  return {
    // data
    vehicle,
    context,
    messages,
    partial,

    // setters
    setVehicle,
    setContext,
    setMessages,

    // status
    sending,
    error,

    // actions
    sendChat,
    sendDtc,
    sendPhoto,
    exportToWorkOrder,
    resetConversation,
    cancel,
  };
}