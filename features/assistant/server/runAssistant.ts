import OpenAI from "openai";

import type { AssistantResponse } from "../types/assistant";
import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";

type RunAssistantParams = {
  shopId: string;
  userId: string;
  role: string | null;
  query: string;
};

type LlmAssistantResponse = {
  summary: string;
  bullets?: string[];
  actions?: Array<{
    label: string;
    href: string;
  }>;
};

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildFallbackResponse(params: {
  query: string;
  summary: Awaited<ReturnType<typeof getRoleDailySummary>>;
}): AssistantResponse {
  const { summary } = params;

  return {
    summary: summary.summaryText,
    bullets: summary.actionItems.slice(0, 5),
    actions: summary.links.slice(0, 6),
    notifications: summary.notifications.slice(0, 4).map((item) => ({
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
    })),
  };
}

function normalizeLlmResponse(
  raw: LlmAssistantResponse,
  fallback: AssistantResponse,
): AssistantResponse {
  return {
    summary: raw.summary?.trim() || fallback.summary,
    bullets:
      Array.isArray(raw.bullets) && raw.bullets.length > 0
        ? raw.bullets
            .map((item) => item?.toString().trim())
            .filter((item): item is string => Boolean(item))
            .slice(0, 5)
        : fallback.bullets,
    actions:
      Array.isArray(raw.actions) && raw.actions.length > 0
        ? raw.actions
            .filter(
              (item): item is { label: string; href: string } =>
                Boolean(
                  item &&
                    typeof item.label === "string" &&
                    item.label.trim() &&
                    typeof item.href === "string" &&
                    item.href.trim(),
                ),
            )
            .map((item) => ({
              label: item.label.trim(),
              href: item.href.trim(),
            }))
            .slice(0, 6)
        : fallback.actions,
    notifications: fallback.notifications,
  };
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
    query: params.query,
    summary: dailySummary,
  });

  const client = getOpenAIClient();
  if (!client) {
    return fallback;
  }

  const prompt = [
    "You are the ProFixIQ AI Assistant for an automotive repair shop.",
    "Answer using ONLY the provided shop context.",
    "Do not invent customers, work orders, bookings, vehicles, or statuses.",
    "Keep the answer concise and operational.",
    "Return JSON with keys: summary, bullets, actions.",
    "bullets should be 0-5 short strings.",
    "actions should be 0-6 items with label and href.",
    "",
    `Role: ${dailySummary.role}`,
    `User question: ${params.query}`,
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
