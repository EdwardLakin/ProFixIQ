"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTabState } from "@/features/shared/hooks/useTabState";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

// ---- Helpers ---------------------------------------------------------------

// Browser-safe: turn a File into a data URL (no Buffer usage)
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error("Failed to read file"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}

async function postJSON(url: string, data: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
}

// ---- Hook ------------------------------------------------------------------
export function useTechAssistant(opts?: AssistantOptions) {
  // Per-tab persisted state (scoped by route via useTabsScopedStorageKey inside useTabState)
  const [vehicle, setVehicle] = useTabState<Vehicle>("assistant:vehicle", opts?.defaultVehicle ?? {});
  const [context, setContext] = useTabState<string>("assistant:context", opts?.defaultContext ?? "");
  const [messages, setMessages] = useTabState<ChatMessage[]>("assistant:messages", []);

  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>(""); // typing bubble
  const [error, setError] = useState<string | null>(null);

  const lastImageRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Seed defaults only if this tab has nothing yet.
  useEffect(() => {
    const emptyVehicle =
      !vehicle?.year && !vehicle?.make && !vehicle?.model && !!opts?.defaultVehicle;
    if (emptyVehicle) setVehicle(opts!.defaultVehicle!);

    if (!context && opts?.defaultContext) setContext(opts.defaultContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

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
    [messages, vehicle, context, canSend, setMessages],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      await ask();
    },
    [ask, setMessages],
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
    [ask, setMessages],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // Clear only messages for this tab; keep vehicle/context
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPartial("");
    setError(null);
    lastImageRef.current = null;
  }, [setMessages]);

  const canExport = canSend && messages.length > 0;

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
    canExport,
  };
}