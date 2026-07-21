// features/assistant/hooks/useAssistant.ts

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanonicalPartSuggestion } from "@/features/parts/types/partSuggestions";
import {
  dedupeAssistantBullets,
  dedupeAssistantText,
} from "@/features/assistant/lib/assistantText";
import type {
  AssistantAction,
  AssistantContext,
  AssistantConversationMessage,
  AssistantExecutionResult,
  AssistantNotification,
  AssistantPendingAction,
  AssistantResponse,
} from "../types/assistant";

type AssistantError = {
  error: string;
};

type ApiAnswerAction =
  | {
      type: "link";
      label: string;
      href: string;
    }
  | {
      type: "planner";
      label: string;
      goal: string;
      context?: Record<string, unknown>;
    };

type ApiAnswerLink = {
  label: string;
  href: string;
};

type ApiEntity = {
  type: string;
  id?: string;
  label: string;
  href?: string;
};

type ApiPendingAction = AssistantPendingAction;
type ApiExecutionResult = AssistantExecutionResult;

type ApiAnswer = {
  summary: string;
  bullets?: string[];
  links?: ApiAnswerLink[];
  entities?: ApiEntity[];
  actions?: ApiAnswerAction[];
  partSuggestions?: CanonicalPartSuggestion[];
  intent?: string;
  conversationId?: string;
  pendingAction?: ApiPendingAction;
  execution?: ApiExecutionResult;
  resolvedContext?: {
    workOrderId?: string;
    customerId?: string;
    vehicleId?: string;
    bookingId?: string;
    fleetUnitId?: string;
  };
};

type AskResponse =
  | {
      ok: true;
      answer: ApiAnswer;
    }
  | {
      ok: false;
      error: string;
    };

type AssistantSession = {
  workOrderId?: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  fleetUnitId?: string;
  lastIntent?: string;
};

type ConversationResponse = {
  ok: true;
  conversation: {
    id: string;
    context?: Record<string, unknown>;
    lastIntent?: string | null;
  };
  messages: AssistantConversationMessage[];
};

type ActionDecisionResponse =
  | {
      ok: true;
      conversationId: string;
      execution: AssistantExecutionResult;
    }
  | {
      ok?: false;
      error: string;
    };

function notificationLevelFromType(type?: string): AssistantNotification["level"] {
  if (type === "alert") return "warning";
  return "info";
}

function toPlannerPayload(
  action: Extract<ApiAnswerAction, { type: "planner" }>,
  fallbackContext?: AssistantContext,
): AssistantAction {
  const context = action.context ?? {};

  return {
    kind: "planner",
    label: action.label,
    plannerPayload: {
      planner:
        context.planner === "openai" ||
        context.planner === "simple" ||
        context.planner === "fleet" ||
        context.planner === "approvals"
          ? context.planner
          : "ops",
      goal: action.goal,
      workOrderId:
        typeof context.workOrderId === "string"
          ? context.workOrderId
          : fallbackContext?.workOrderId,
      bookingId:
        typeof context.bookingId === "string"
          ? context.bookingId
          : fallbackContext?.bookingId,
      customerId:
        typeof context.customerId === "string"
          ? context.customerId
          : fallbackContext?.customerId,
      vehicleId:
        typeof context.vehicleId === "string"
          ? context.vehicleId
          : fallbackContext?.vehicleId,
      customerQuery:
        typeof context.customerQuery === "string"
          ? context.customerQuery
          : undefined,
      plateOrVin:
        typeof context.plateOrVin === "string"
          ? context.plateOrVin
          : undefined,
      allowCreate:
        typeof context.allowCreate === "boolean" ? context.allowCreate : false,
      emailInvoiceTo:
        typeof context.emailInvoiceTo === "string"
          ? context.emailInvoiceTo
          : undefined,
      lane:
        context.lane === "parts_follow_up" ||
        context.lane === "low_inventory_reorder" ||
        context.lane === "fleet_follow_up" ||
        context.lane === "smart_match_readiness" ||
        context.lane === "menu_item_efficiency_review" ||
        context.lane === "inspection_template_efficiency_review" ||
        context.lane === "menu_item_draft" ||
        context.lane === "inspection_template_draft" ||
        context.lane === "service_bundle_draft"
          ? context.lane
          : undefined,
    },
  };
}

function mapAnswerToResponse(
  answer: ApiAnswer,
  context?: AssistantContext,
): AssistantResponse {
  const summary = dedupeAssistantText(answer.summary);
  const bullets = dedupeAssistantBullets(summary, answer.bullets ?? []);
  const actions: AssistantAction[] = (answer.actions ?? [])
    .map((action) => {
      if (action.type === "planner") {
        return toPlannerPayload(action, context);
      }

      return {
        kind: "link" as const,
        label: action.label,
        href: action.href,
      };
    })
    .slice(0, 6);

  const relatedRecords = [
    ...(answer.links ?? []).map((item) => ({
      label: item.label,
      href: item.href,
      type: "link",
    })),
    ...(answer.entities ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      type: item.type,
    })),
  ].slice(0, 8);

  const notifications: AssistantNotification[] = relatedRecords
    .slice(0, 6)
    .map((item, index) => ({
      level: notificationLevelFromType(item.type),
      code: `record_${index + 1}`,
      title: item.label,
      message: item.type
        ? `Related ${item.type.replaceAll("_", " ")}`
        : "Related record",
      href: item.href,
      entityType: item.type,
      entityId: item.id,
    }));

  return {
    summary,
    bullets,
    actions,
    notifications,
    relatedRecords,
    partSuggestions: (answer.partSuggestions ?? []).slice(0, 5),
    conversationId: answer.conversationId,
    pendingAction: answer.pendingAction,
    execution: answer.execution,
  };
}

function transcriptContent(answer: ApiAnswer): string {
  const summary = dedupeAssistantText(answer.summary);
  return [summary, ...dedupeAssistantBullets(summary, answer.bullets ?? [])]
    .filter(Boolean)
    .join("\n");
}

function appendUniqueMessage(
  messages: AssistantConversationMessage[],
  message: AssistantConversationMessage,
): AssistantConversationMessage[] {
  const comparable = dedupeAssistantText(message.content).toLowerCase();
  const last = messages.at(-1);
  if (
    last?.role === message.role &&
    dedupeAssistantText(last.content).toLowerCase() === comparable
  ) {
    return messages;
  }
  return [...messages, message].slice(-50);
}

function sessionFromConversation(
  context: Record<string, unknown> | undefined,
  lastIntent?: string | null,
): AssistantSession {
  return {
    workOrderId:
      typeof context?.workOrderId === "string" ? context.workOrderId : undefined,
    customerId:
      typeof context?.customerId === "string" ? context.customerId : undefined,
    vehicleId:
      typeof context?.vehicleId === "string" ? context.vehicleId : undefined,
    bookingId:
      typeof context?.bookingId === "string" ? context.bookingId : undefined,
    fleetUnitId:
      typeof context?.fleetUnitId === "string" ? context.fleetUnitId : undefined,
    lastIntent: lastIntent ?? undefined,
  };
}

export function useAssistant(resetKey?: string) {
  const storageKey = `profixiq:shop-assistant:conversation:${resetKey ?? "global"}`;
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [data, setData] = useState<AssistantResponse | AssistantError | null>(null);
  const [session, setSession] = useState<AssistantSession>({});
  const [messages, setMessages] = useState<AssistantConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesRef = useRef<AssistantConversationMessage[]>([]);
  const sessionRef = useRef<AssistantSession>({});
  const conversationIdRef = useRef<string | null>(null);
  const requestInFlight = useRef(false);

  const replaceMessages = useCallback(
    (
      next:
        | AssistantConversationMessage[]
        | ((current: AssistantConversationMessage[]) => AssistantConversationMessage[]),
    ) => {
      setMessages((current) => {
        const value = typeof next === "function" ? next(current) : next;
        messagesRef.current = value;
        return value;
      });
    },
    [],
  );

  const replaceSession = useCallback(
    (next: AssistantSession | ((current: AssistantSession) => AssistantSession)) => {
      setSession((current) => {
        const value = typeof next === "function" ? next(current) : next;
        sessionRef.current = value;
        return value;
      });
    },
    [],
  );

  const rememberConversation = useCallback(
    (id: string | null) => {
      conversationIdRef.current = id;
      setConversationId(id);
      if (typeof window === "undefined") return;
      if (id) window.localStorage.setItem(storageKey, id);
      else window.localStorage.removeItem(storageKey);
    },
    [storageKey],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const storedId =
      typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;

    setData(null);
    replaceSession({});
    replaceMessages([]);
    conversationIdRef.current = null;
    setConversationId(null);
    if (!storedId) {
      setHydrating(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setHydrating(true);
    void fetch(`/api/assistant/conversations/${encodeURIComponent(storedId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Conversation unavailable");
        return (await response.json()) as ConversationResponse;
      })
      .then((json) => {
        if (cancelled || !json.ok) return;
        rememberConversation(json.conversation.id);
        replaceMessages(json.messages.slice(-50));
        replaceSession(
          sessionFromConversation(
            json.conversation.context,
            json.conversation.lastIntent,
          ),
        );
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        window.localStorage.removeItem(storageKey);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rememberConversation, replaceMessages, replaceSession, storageKey]);

  const ask = useCallback(
    async (query: string, context?: AssistantContext) => {
      const question = query.trim();
      if (!question || requestInFlight.current) return;

      requestInFlight.current = true;
      setLoading(true);
      setData(null);

      const requestId = crypto.randomUUID();
      const optimisticUserMessage: AssistantConversationMessage = {
        id: requestId,
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };
      const conversation = appendUniqueMessage(
        messagesRef.current,
        optimisticUserMessage,
      );
      replaceMessages(conversation);

      try {
        const response = await fetch("/api/assistant/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question,
            surface: "shop",
            conversationId: conversationIdRef.current,
            clientRequestId: requestId,
            context,
            session: sessionRef.current,
            messages: conversation.slice(-20).map(({ role, content }) => ({
              role,
              content,
            })),
          }),
        });

        const json = (await response.json()) as AskResponse;
        if (!response.ok || !json.ok) {
          setData({
            error: json.ok ? "Assistant request failed" : json.error,
          });
          return;
        }

        if (json.answer.conversationId) {
          rememberConversation(json.answer.conversationId);
        }

        replaceSession((previous) => ({
          ...previous,
          ...json.answer.resolvedContext,
          lastIntent: json.answer.intent,
        }));

        setData(mapAnswerToResponse(json.answer, context));
        replaceMessages((current) =>
          appendUniqueMessage(current, {
            id: `${requestId}:assistant`,
            role: "assistant",
            content: transcriptContent(json.answer),
            createdAt: new Date().toISOString(),
          }),
        );
      } catch {
        setData({ error: "Failed to fetch" });
      } finally {
        requestInFlight.current = false;
        setLoading(false);
      }
    },
    [rememberConversation, replaceMessages, replaceSession],
  );

  const decideAction = useCallback(
    async (actionId: string, decision: "confirm" | "cancel") => {
      if (actionLoading) return;
      setActionLoading(actionId);

      try {
        const response = await fetch(
          `/api/assistant/actions/${encodeURIComponent(actionId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision }),
          },
        );
        const json = (await response.json()) as ActionDecisionResponse;
        if (!response.ok || !json.ok) {
          setData({ error: "error" in json ? json.error : "Action request failed" });
          return;
        }

        rememberConversation(json.conversationId);
        setData((current) => {
          const base = current && !("error" in current) ? current : null;
          return {
            summary: json.execution.summary,
            bullets: json.execution.details,
            actions: base?.actions ?? [],
            notifications: base?.notifications ?? [],
            relatedRecords: json.execution.affectedRecords,
            partSuggestions: base?.partSuggestions,
            conversationId: json.conversationId,
            execution: json.execution,
          };
        });
        replaceMessages((current) =>
          appendUniqueMessage(current, {
            id: `action:${actionId}:${json.execution.status}`,
            role: "assistant",
            content: [
              json.execution.summary,
              ...json.execution.details,
            ].join("\n"),
            createdAt: new Date().toISOString(),
          }),
        );
      } catch {
        setData({ error: "Failed to process the assistant action" });
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, rememberConversation, replaceMessages],
  );

  const confirmAction = useCallback(
    (actionId: string) => decideAction(actionId, "confirm"),
    [decideAction],
  );

  const cancelAction = useCallback(
    (actionId: string) => decideAction(actionId, "cancel"),
    [decideAction],
  );

  const clearConversation = useCallback(async () => {
    const id = conversationIdRef.current;
    setData(null);
    replaceSession({});
    replaceMessages([]);
    rememberConversation(null);

    if (!id) return;
    await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, [rememberConversation, replaceMessages, replaceSession]);

  return {
    ask,
    loading,
    hydrating,
    actionLoading,
    data,
    session,
    messages,
    conversationId,
    confirmAction,
    cancelAction,
    clearConversation,
  };
}
