"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

/* ---------- PERSISTENCE KEYS ---------- */
const LS_KEYS = {
  messages: "profixiq.tech.messages.v1",
  vehicle: "profixiq.tech.vehicle.v1",
  context: "profixiq.tech.context.v1",
} as const;

/* Small helpers for safe LS access (guard SSR) */
function lsGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota/serialize errors */
  }
}
function lsRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

/* ---------- FILE → data URL ---------- */
async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

/* ---------- Read OpenAI SSE ---------- */
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

/* ---------- POST JSON ---------- */
async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

export function useTechAssistant(opts?: AssistantOptions) {
  /* State (seeded from localStorage on mount) */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(undefined);
  const [context, setContext] = useState<string>("");

  /* UI state */
  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  /* Refs */
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false); // prevent saving before we load

  /* ---------- Hydrate from LS once ---------- */
  useEffect(() => {
    const savedMessages = lsGet<ChatMessage[]>(LS_KEYS.messages);
    const savedVehicle = lsGet<Vehicle>(LS_KEYS.vehicle);
    const savedContext = lsGet<string>(LS_KEYS.context);

    if (savedMessages && Array.isArray(savedMessages)) {
      setMessages(savedMessages);
    }
    if (savedVehicle && (savedVehicle.year || savedVehicle.make || savedVehicle.model)) {
      setVehicle(savedVehicle);
    } else if (opts?.defaultVehicle) {
      setVehicle(opts.defaultVehicle);
    }
    if (typeof savedContext === "string") {
      setContext(savedContext);
    } else if (opts?.defaultContext) {
      setContext(opts.defaultContext);
    }

    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Persist on change (debounced) ---------- */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      lsSet(LS_KEYS.messages, messages);
      lsSet(LS_KEYS.vehicle, vehicle ?? {});
      lsSet(LS_KEYS.context, context ?? "");
    }, 200);
    return () => clearTimeout(t);
  }, [messages, vehicle, context]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  /* ---------- Stream to assistant ---------- */
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
          setPartial((prev) => prev + chunk);
          accum += chunk;
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

  /* ---------- Public send helpers ---------- */
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

  /* ---------- Cancel / Reset ---------- */
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);

    // Clear persisted cache
    lsRemove(LS_KEYS.messages);
    // keep vehicle/context unless you also want them cleared:
    // lsRemove(LS_KEYS.vehicle);
    // lsRemove(LS_KEYS.context);
  }, []);

  /* ---------- Export ---------- */
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