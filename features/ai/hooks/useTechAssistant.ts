"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTabState } from "@/features/shared/hooks/useTabState";
import type { AssistantAnswer, AssistantAskResponse } from "@/features/agent/assistant/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string };

type AnswerPayload = Record<string, unknown> & {
  question?: string;
  messages?: ChatMessage[];
};

// Browser-safe: convert File → data URL using FileReader
async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
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

function compactVehicle(vehicle?: Vehicle): string {
  return [vehicle?.year, vehicle?.make, vehicle?.model]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}

function withVehicleContext(question: string, vehicle?: Vehicle, context?: string): string {
  const trimmed = question.trim();
  const vehicleText = compactVehicle(vehicle);
  const contextText = context?.trim();
  const lines: string[] = [];

  if (vehicleText && !trimmed.toLowerCase().includes("vehicle:")) {
    lines.push(`Vehicle: ${vehicleText}`);
  }
  if (contextText && !trimmed.toLowerCase().includes("shop notes / complaint:")) {
    lines.push(`Shop notes / complaint: ${contextText}`);
  }
  lines.push(`Question: ${trimmed.replace(/^question:\s*/i, "")}`);

  return lines.join("\n\n");
}

function formatPartSuggestion(part: NonNullable<AssistantAnswer["partSuggestions"]>[number]): string {
  const label = part.title || part.sku || "Suggested part";
  const details = [
    part.sku ? `SKU ${part.sku}` : null,
    `qty ${part.quantitySuggestion} ${part.unit}`,
    part.fitmentConfidence.replaceAll("_", " "),
    part.reviewRecommendation,
  ].filter(Boolean);

  return details.length ? `${label} — ${details.join("; ")}` : label;
}

export function formatAssistantAnswer(answer?: AssistantAnswer, fallbackText?: string): string {
  if (!answer) return (fallbackText ?? "").trim();

  const sections: string[] = [];
  if (answer.summary?.trim()) sections.push(answer.summary.trim());

  if (answer.bullets.length > 0) {
    sections.push(answer.bullets.map((item) => `- ${item}`).join("\n"));
  }

  if (answer.partSuggestions?.length) {
    sections.push([
      "### Part suggestions",
      ...answer.partSuggestions.slice(0, 5).map((part) => `- ${formatPartSuggestion(part)}`),
    ].join("\n"));
  }

  if (answer.entities.length > 0) {
    sections.push([
      "### Related records",
      ...answer.entities.map((entity) => `- ${entity.href ? `[${entity.label}](${entity.href})` : entity.label}`),
    ].join("\n"));
  }

  if (answer.links.length > 0) {
    sections.push([
      "### Links",
      ...answer.links.map((link) => `- [${link.label}](${link.href})`),
    ].join("\n"));
  }

  return sections.join("\n\n").trim();
}

export function hasConversationTranscript(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.content.trim() && (message.role === "user" || message.role === "assistant"));
}

export function useTechAssistant(opts?: AssistantOptions) {
  // 🔒 Route-scoped persistence (per tab) — these survive tab switches:
  const [vehicle, setVehicle]   = useTabState<Vehicle | undefined>("assistant:vehicle", opts?.defaultVehicle);
  const [context, setContext]   = useTabState<string>("assistant:context", opts?.defaultContext ?? "");
  const [messages, setMessages] = useTabState<ChatMessage[]>("assistant:messages", []);

  // Ephemeral UI state
  const [sending, setSending] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError]     = useState<string | null>(null);

  const lastImageRef = useRef<string | null>(null);
  const abortRef     = useRef<AbortController | null>(null);

  const canSend = useMemo(
    () => Boolean(vehicle?.year && vehicle?.make && vehicle?.model),
    [vehicle],
  );

  const ask = useCallback(
    async (payload: AnswerPayload = {}) => {
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
          question: withVehicleContext(payload.question ?? "", vehicle, context),
        };

        const res = await postJSON("/api/assistant/answer", body, ctrl.signal);
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || "Request failed.");
        }
        const data = (await res.json()) as AssistantAskResponse & { text?: string };
        if (!data.ok) throw new Error(data.error);

        const content = formatAssistantAnswer(data.answer, data.text);
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: content || "I could not produce an assistant response for that question.",
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
      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMessages);
      await ask({ question: trimmed, messages: nextMessages });
    },
    [ask, messages, setMessages],
  );

  const sendPhoto = useCallback(
    async (file: File, note?: string) => {
      if (!file) return;
      const image_data = await fileToDataUrl(file);
      lastImageRef.current = image_data;
      const userContent = `Uploaded a photo.${note ? `\nNote: ${note}` : ""}`;
      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userContent }];
      setMessages(nextMessages);
      await ask({ question: note?.trim() || "Review the uploaded vehicle photo and provide technician guidance.", messages: nextMessages });
    },
    [ask, messages, setMessages],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // Clear just the thread; keep vehicle/context (and keep them persisted)
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);     // persisted per tab → immediately clears on this route
    setPartial("");
    setError(null);
    lastImageRef.current = null;
  }, [setMessages]);

  const exportToWorkOrder = useCallback(
    async (workOrderLineId: string) => {
      if (!workOrderLineId) throw new Error("Missing work order line id.");
      if (!canSend) throw new Error("Provide vehicle info before exporting.");
      if (!hasConversationTranscript(messages)) {
        throw new Error("Ask the assistant a question before exporting.");
      }

      const res = await postJSON("/api/assistant/export", { vehicle, context, messages, workOrderLineId });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Export failed.");

      return (await res.json()) as {
        cause: string;
        correction: string;
        estimatedLaborTime: number | null;
      };
    },
    [messages, vehicle, context, canSend],
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
