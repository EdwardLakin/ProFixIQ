import OpenAI from "openai";

import type {
  AssistantAction,
  AssistantContext,
  AssistantNotification,
  AssistantResponse,
  PlannerPayload,
} from "../types/assistant";
import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";

type RunAssistantParams = {
  shopId: string;
  userId: string;
  role: string | null;
  query: string;
  context?: AssistantContext;
};

type LlmAssistantAction =
  | {
      kind?: "link";
      label?: string;
      href?: string;
    }
  | {
      kind?: "planner";
      label?: string;
      plannerPayload?: PlannerPayload;
    };

type LlmAssistantResponse = {
  summary: string;
  bullets?: string[];
  actions?: LlmAssistantAction[];
};

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function extractPlannerPayloadFromNotification(
  item: AssistantNotification,
  context?: AssistantContext,
): PlannerPayload {
  const payload: PlannerPayload = {
    planner: "ops",
    allowCreate: false,
    goal: `Fix this issue: ${item.title}. ${item.message}`,
  };

  if (item.entityType === "work_order" && item.entityId) {
    payload.workOrderId = item.entityId;
  }

  if (!payload.workOrderId && context?.workOrderId) {
    payload.workOrderId = context.workOrderId;
  }

  if (!payload.bookingId && context?.bookingId) {
    payload.bookingId = context.bookingId;
  }

  const href = item.href ?? "";

  const bookingMatch = href.match(/bookings\/([^/?#]+)/i);
  if (bookingMatch?.[1]) {
    payload.bookingId = bookingMatch[1];
  }

  const workOrderMatch =
    href.match(/work-orders\/([^/?#]+)/i) ??
    href.match(/quote-review\/([^/?#]+)/i);

  if (workOrderMatch?.[1]) {
    payload.workOrderId = workOrderMatch[1];
  }

  return payload;
}

function buildFallbackActions(
  links: Array<{ label: string; href: string }>,
  notifications: AssistantNotification[],
  context?: AssistantContext,
): AssistantAction[] {
  const actions: AssistantAction[] = links.slice(0, 4).map((item) => ({
    kind: "link",
    label: item.label,
    href: item.href,
  }));

  const topAlert = notifications[0];
  if (topAlert) {
    actions.unshift({
      kind: "planner",
      label: "Fix in Planner",
      plannerPayload: extractPlannerPayloadFromNotification(topAlert, context),
    });
  } else if (context?.workOrderId) {
    actions.unshift({
      kind: "planner",
      label: "Open this in Planner",
      plannerPayload: {
        planner: "ops",
        allowCreate: false,
        workOrderId: context.workOrderId,
        goal: "Review and fix this work order",
      },
    });
  }

  return actions.slice(0, 6);
}

function buildFallbackResponse(params: {
  summary: Awaited<ReturnType<typeof getRoleDailySummary>>;
  context?: AssistantContext;
}): AssistantResponse {
  const { summary, context } = params;

  const notifications: AssistantNotification[] = summary.notifications
    .slice(0, 4)
    .map((item) => ({
      level:
        item.level === "urgent" || item.level === "warning"
          ? item.level
          : "info",
      code: item.code,
      title: item.title,
      message: item.message,
      href: item.href,
      entityType: item.entityType,
      entityId: item.entityId,
    }));

  return {
    summary: summary.summaryText,
    bullets: summary.actionItems.slice(0, 5),
    actions: buildFallbackActions(summary.links, notifications, context),
    notifications,
  };
}

function normalizeAction(action: LlmAssistantAction): AssistantAction | null {
  if (!action || typeof action !== "object") return null;

  if (action.kind === "planner") {
    const label =
      "label" in action && typeof action.label === "string"
        ? action.label.trim()
        : "";
    const plannerPayload =
      "plannerPayload" in action &&
      action.plannerPayload &&
      typeof action.plannerPayload === "object"
        ? action.plannerPayload
        : null;

    if (!label || !plannerPayload) return null;

    return {
      kind: "planner",
      label,
      plannerPayload,
    };
  }

  if (
    "label" in action &&
    typeof action.label === "string" &&
    "href" in action &&
    typeof action.href === "string" &&
    action.label.trim() &&
    action.href.trim()
  ) {
    return {
      kind: "link",
      label: action.label.trim(),
      href: action.href.trim(),
    };
  }

  return null;
}

function normalizeLlmResponse(
  raw: LlmAssistantResponse,
  fallback: AssistantResponse,
): AssistantResponse {
  const actions =
    Array.isArray(raw.actions) && raw.actions.length > 0
      ? raw.actions
          .map(normalizeAction)
          .filter((item): item is AssistantAction => Boolean(item))
          .slice(0, 6)
      : fallback.actions;

  return {
    summary: raw.summary?.trim() || fallback.summary,
    bullets:
      Array.isArray(raw.bullets) && raw.bullets.length > 0
        ? raw.bullets
            .map((item) => item?.toString().trim())
            .filter((item): item is string => Boolean(item))
            .slice(0, 5)
        : fallback.bullets,
    actions,
    notifications: fallback.notifications,
  };
}

function buildContextBlock(context?: AssistantContext): string {
  if (!context) return "No page context provided.";

  const lines: string[] = [];
  if (context.pageType) lines.push(`Page type: ${context.pageType}`);
  if (context.pageTitle) lines.push(`Page title: ${context.pageTitle}`);
  if (context.workOrderId) lines.push(`Current work order id: ${context.workOrderId}`);
  if (context.vehicleId) lines.push(`Current vehicle id: ${context.vehicleId}`);
  if (context.customerId) lines.push(`Current customer id: ${context.customerId}`);
  if (context.bookingId) lines.push(`Current booking id: ${context.bookingId}`);

  return lines.length > 0 ? lines.join("\n") : "No page context provided.";
}

export async function runAssistant(
  params: RunAssistantParams,
): Promise<AssistantResponse> {
  const dailySummary = await getRoleDailySummary({
    shopId: params.shopId,
    userId: params.userId,
    role: params.role,
  });

  const fallback = buildFallbackResponse({
    summary: dailySummary,
    context: params.context,
  });

  const client = getOpenAIClient();
  if (!client) {
    return fallback;
  }

  const prompt = [
    "You are the ProFixIQ AI Assistant for an automotive repair shop.",
    "Answer using ONLY the provided shop context.",
    "Do not invent customers, work orders, bookings, vehicles, or statuses.",
    'If the user says "this vehicle", "this work order", "this customer", or "this booking", use the provided page context.',
    "Keep the answer concise and operational.",
    "Return JSON with keys: summary, bullets, actions.",
    "bullets should be 0-5 short strings.",
    "actions should be 0-6 items.",
    'A link action format is: {"kind":"link","label":"Open work order","href":"/work-orders/123"}',
    'A planner action format is: {"kind":"planner","label":"Fix in Planner","plannerPayload":{"goal":"Fix this issue","workOrderId":"123","planner":"ops","allowCreate":false}}',
    "Use planner actions when the user is asking to fix, resolve, follow up, reschedule, create, or take action.",
    "",
    `Role: ${dailySummary.role}`,
    `User question: ${params.query}`,
    "",
    "Current page context:",
    buildContextBlock(params.context),
    "",
    "Daily summary context:",
    dailySummary.summaryText,
    "",
    "Action items:",
    ...dailySummary.actionItems.map((item) => `- ${item}`),
    "",
    "Quick links:",
    ...dailySummary.links.map((item) => `- ${item.label}: ${item.href}`),
    "",
    "Notifications:",
    ...dailySummary.notifications.map(
      (item) =>
        `- [${item.level}] ${item.title}: ${item.message}${
          item.href ? ` (${item.href})` : ""
        }`,
    ),
  ].join("\n");

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_ASSISTANT_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise shop operations assistant. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return fallback;
    }

    const parsed = JSON.parse(content) as LlmAssistantResponse;
    return normalizeLlmResponse(parsed, fallback);
  } catch {
    return fallback;
  }
}
