"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

type PersistedThread = {
  vehicle?: Vehicle;
  context?: string;
  messages?: ChatMessage[];
};

const THREAD_KEY = "assistant:thread";

function saveThread(state: PersistedThread) {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function loadThread(): PersistedThread | null {
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedThread;
  } catch {
    return null;
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line no-undef
  const b64 = Buffer.from(buf).toString("base64");
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

export function useTechAssistant(opts?: AssistantOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | undefined>(opts?.defaultVehicle);
  const [context, setContext] = useState<string>(opts?.defaultContext ?? "");

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>(""); // kept for typing bubble parity
  const [error, setError] = useState<string | null>(null);

  const lastImageRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial restore
  useEffect(() => {
    const restored = loadThread();
    if (restored) {
      if (restored.vehicle) setVehicle(restored.vehicle);
      if (typeof restored.context === "string") setContext(restored.context);
      if (Array.isArray(restored.messages)) setMessages(restored.messages);
    }
    // Seed defaults only if nothing restored
    if (!restored && opts?.defaultVehicle) setVehicle(opts.defaultVehicle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change
  useEffect(() => {
    saveThread({ vehicle, context, messages });
  }, [vehicle, context, messages]);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  const ask = useCallback(
    async (payload: Record<string, unknown> = {}) => {
      if (!canSend) {
        setError("Please provide vehicle info (year, make, model).");
        return;
      }
      setError(null);
      setSending(true);
      setPartial("Assistant is thinking…");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const body = {
          vehicle,
          context,
          messages,
          image_data: lastImageRef.current ?? null,
          ...payload,
        };

        const res = await postJSON("/api/assistant/answer", body, ctrl.signal);
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Request failed.");
        }

        const data = (await res.json()) as { text?: string; error?: string };
        if (data.error) throw new Error(data.error);

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: (data.text ?? "").trim(),
        };
        setMessages((m) => [...m, assistantMsg]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Assistant failed.";
        setError(msg);
      } finally {
        setSending(false);
        setPartial("");
        lastImageRef.current = null;
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
      await ask();
    },
    [ask],
  );

  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      const image_data = await fileToDataUrl(file);
      lastImageRef.current = image_data;
      setMessages((m) => [
        ...m,
        { role: "user", content: `Uploaded a photo.${note ? `\nNote: ${note}` : ""}` },
      ]);
      await ask();
    },
    [ask],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);
    lastImageRef.current = null;
    saveThread({ vehicle, context, messages: [] }); // keep vehicle/context, clear messages
  }, [vehicle, context]);

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
    sendPhoto,
    exportToWorkOrder,
    resetConversation,
    cancel,
  };
}