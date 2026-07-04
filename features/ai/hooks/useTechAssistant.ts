"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTabState } from "@/features/shared/hooks/useTabState";
import type { AssistantAnswer, AssistantAskResponse, AssistantImageAttachment } from "@/features/agent/assistant/types";

export type ChatMessage = { role: "user" | "assistant"; content: string; attachments?: AssistantImageAttachment[] };

export type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type AssistantOptions = { defaultVehicle?: Vehicle; defaultContext?: string; workOrderLineId?: string; workOrderId?: string };

type AnswerPayload = Record<string, unknown> & {
  question?: string;
  messages?: ChatMessage[];
};

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

  const usefulEntities = answer.entities.filter((entity) => entity.type !== "vehicle" && Boolean(entity.href));
  const linkKeys = new Set(answer.links.map((link) => `${link.label.toLowerCase()}::${link.href.toLowerCase()}`));
  const linkHrefs = new Set(answer.links.map((link) => link.href.toLowerCase()));
  const entityRows = usefulEntities
    .filter((entity) => {
      const href = entity.href ?? "";
      return !linkKeys.has(`${entity.label.toLowerCase()}::${href.toLowerCase()}`) && !linkHrefs.has(href.toLowerCase());
    })
    .map((entity) => `- [${entity.label}](${entity.href})`);

  if (entityRows.length > 0) {
    sections.push(["### Related records", ...entityRows].join("\n"));
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
  const [uploading, setUploading] = useState(false);
  const [partial, setPartial] = useState<string>("");
  const [error, setError]     = useState<string | null>(null);

  const lastImageRef = useRef<AssistantImageAttachment | null>(null);
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
          imageAttachments: lastImageRef.current ? [lastImageRef.current] : [],
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
      if (!opts?.workOrderLineId && !opts?.workOrderId) {
        setError("Open the assistant from a work order line before attaching evidence photos.");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        if (note?.trim()) form.append("note", note.trim());
        if (opts?.workOrderLineId) form.append("workOrderLineId", opts.workOrderLineId);
        if (opts?.workOrderId) form.append("workOrderId", opts.workOrderId);

        const res = await fetch("/api/assistant/attachments", { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Photo upload failed.");
        const data = (await res.json()) as { ok?: boolean; error?: string; attachment?: AssistantImageAttachment };
        if (!data.ok || !data.attachment) throw new Error(data.error || "Photo upload failed.");

        lastImageRef.current = data.attachment;
        const userContent = `Uploaded photo: ${data.attachment.fileName ?? file.name}.${note ? `\nNote: ${note}` : ""}`;
        const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userContent, attachments: [data.attachment] }];
        setMessages(nextMessages);
        await ask({ question: note?.trim() || "Review the uploaded vehicle photo and provide technician guidance.", messages: nextMessages });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [ask, messages, opts?.workOrderId, opts?.workOrderLineId, setMessages],
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
    uploading,
    error,
    sendChat,
    sendPhoto,
    exportToWorkOrder,
    resetConversation,
    cancel,
  };
}
