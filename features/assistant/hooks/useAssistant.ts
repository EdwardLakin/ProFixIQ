// features/assistant/hooks/useAssistant.ts

"use client";

import { useState } from "react";
import type {
  AssistantAction,
  AssistantContext,
  AssistantNotification,
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

type ApiAnswer = {
  summary: string;
  bullets?: string[];
  links?: ApiAnswerLink[];
  entities?: ApiEntity[];
  actions?: ApiAnswerAction[];
  intent?: string;
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
        typeof context.customerQuery === "string" ? context.customerQuery : undefined,
      plateOrVin: typeof context.plateOrVin === "string" ? context.plateOrVin : undefined,
      allowCreate:
        typeof context.allowCreate === "boolean" ? context.allowCreate : false,
      emailInvoiceTo:
        typeof context.emailInvoiceTo === "string" ? context.emailInvoiceTo : undefined,
      lane:
        context.lane === "parts_follow_up" ||
        context.lane === "low_inventory_reorder" ||
        context.lane === "fleet_follow_up" ||
        context.lane === "menu_item_draft" ||
        context.lane === "inspection_template_draft" ||
        context.lane === "service_bundle_draft"
          ? context.lane
          : undefined,
    },
  };
}

function mapAnswerToResponse(answer: ApiAnswer, context?: AssistantContext): AssistantResponse {
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
      label: item.label,
      href: item.href,
      type: item.type,
    })),
  ].slice(0, 8);

  const notifications: AssistantNotification[] = relatedRecords.slice(0, 6).map((item, idx) => ({
    level: notificationLevelFromType(item.type),
    code: `record_${idx + 1}`,
    title: item.label,
    message: item.type ? `Related ${item.type.replaceAll("_", " ")}` : "Related record",
    href: item.href,
    entityType: item.type,
  }));

  return {
    summary: answer.summary,
    bullets: (answer.bullets ?? []).filter(Boolean).slice(0, 6),
    actions,
    notifications,
    relatedRecords,
  };
}

export function useAssistant() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssistantResponse | AssistantError | null>(null);
  const [session, setSession] = useState<AssistantSession>({});

  async function ask(query: string, context?: AssistantContext) {
    setLoading(true);
    setData(null);

    try {
      const res = await fetch("/api/assistant/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: query,
          context,
          session,
        }),
      });

      const json = (await res.json()) as AskResponse;

      if (!res.ok || !json.ok) {
        setData({ error: json.ok ? "Assistant request failed" : json.error });
        return;
      }

      const nextContext = json.answer.resolvedContext;
      setSession((prev) => ({
        ...prev,
        ...nextContext,
        lastIntent: json.answer.intent,
      }));

      setData(mapAnswerToResponse(json.answer, context));
    } catch {
      setData({ error: "Failed to fetch" });
    } finally {
      setLoading(false);
    }
  }

  return { ask, loading, data };
}
