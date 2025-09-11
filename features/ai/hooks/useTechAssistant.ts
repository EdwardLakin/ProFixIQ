// features/ai/hooks/useTechAssistant.ts
"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/** Minimal chat message shape used by the UI and API */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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

/** Small helper: convert a File → data URL (base64) */
async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
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

    // Process complete SSE events (double newline–separated)
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const eventBlock = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      if (!eventBlock) continue;
      // Ignore SSE comments:
      // : keepalive
      if (eventBlock.startsWith(":")) continue;

      // Prefer "data:" if present; fall back to whole block
      const line = eventBlock.startsWith("data:")
        ? eventBlock.slice(5).trim()
        : eventBlock;

      if (!line) continue;

      // Ignore OpenAI end-of-stream sentinel and explicit event headers
      if (line === "[DONE]") return;
      if (line.startsWith("event:")) continue;

      // If backend emits JSON envelope {type, content}, handle it
      try {
        const payload = JSON.parse(line) as
          | { type: "chunk"; content: string }
          | { type: "done" }
          | { type: "error"; error: string };

        if ((payload as any).type === "chunk") {
          onChunk((payload as any).content ?? "");
          continue;
        }
        if ((payload as any).type === "error") {
          throw new Error((payload as any).error || "Stream error");
        }
        if ((payload as any).type === "done") {
          return;
        }
        // If it was JSON but not our envelope, fall through to append raw
      } catch {
        // Not JSON → treat as raw assistant token
      }

      onChunk(line);
    }
  }
}

export function useTechAssistant(opts?: AssistantOptions) {
  // Conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(
    opts?.defaultVehicle,
  );
  const [context, setContext] = useState<string>(opts?.defaultContext ?? "");

  // UI state
  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
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

      const body = {
        ...payload,
        vehicle,
        context,
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

        let accum = "";
        await readSseStream(res.body, (chunk) => {
          setPartial((prev) => prev + chunk);
          accum += chunk;
        });

        const assistantMsg: ChatMessage = { role: "assistant", content: accum };
        setMessages((m) => [...m, assistantMsg]);
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.name === "AbortError") {
            setError("Request cancelled.");
          } else {
            setError(err.message || "Failed to stream assistant.");
          }
        } else if (typeof err === "string") {
          setError(err);
        } else {
          setError("Failed to stream assistant.");
        }
      } finally {
        setSending(false);
        setPartial("");
        abortRef.current = null;
      }
    },
    [messages, vehicle, context, canSend],
  );

  /** Public: send plain chat text */
  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      await streamToAssistant({ prompt: trimmed });
    },
    [streamToAssistant],
  );

  /** Public: send a DTC for the assistant to analyze */
  const sendDtc = useCallback(
    async (dtcCode: string, note?: string) => {
      const code = (dtcCode || "").trim().toUpperCase();
      if (!code) return;
      setMessages((m) => [
        ...m,
        { role: "user", content: `DTC: ${code}\n${note ? `Note: ${note}` : ""}` },
      ]);
      await streamToAssistant({ dtcCode: code });
    },
    [streamToAssistant],
  );

  /** Public: send a photo (image file) + optional note */
  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      setMessages((m) => [
        ...m,
        {
          role: "user",
          content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}`,
        },
      ]);
      const image_data = await fileToDataUrl(file);
      await streamToAssistant({ image_data });
    },
    [streamToAssistant],
  );

  /** Cancel an in-flight request */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Reset conversation */
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);
  }, []);

  /** Summarize and export to work order line */
  const exportToWorkOrder = useCallback(
    async (workOrderLineId: string) => {
      if (!workOrderLineId) throw new Error("Missing work order line id.");
      if (!canSend) throw new Error("Provide vehicle info before exporting.");

      const res = await postJSON("/api/assistant/export", {
        vehicle,
        messages,
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