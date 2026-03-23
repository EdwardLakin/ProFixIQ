import type { ToolContext } from "../../lib/toolTypes";
import { runGetBookings } from "../../tools/getBookings";
import { runGetCustomerVisitHistory } from "../../tools/getCustomerVisitHistory";
import { runGetShopCurrentStatus } from "../../tools/getShopCurrentStatus";
import { runGetStalledWorkOrders } from "../../tools/getStalledWorkOrders";
import { runGetTechCurrentWork } from "../../tools/getTechCurrentWork";
import { runGetVehicleHistory } from "../../tools/getVehicleHistory";

import type {
  AssistantAction,
  AssistantAnswer,
  AssistantAskRequest,
  AssistantEntity,
  AssistantLink,
} from "../types";

type AskParams = {
  shopId: string;
  userId: string;
  role: string | null;
  request: AssistantAskRequest;
};

type Citation = {
  label?: string;
  href?: string;
};

function normalizeQuestion(question: string): string {
  return question.trim();
}

function questionIncludes(question: string, values: string[]): boolean {
  const q = question.toLowerCase();
  return values.some((value) => q.includes(value));
}

function extractQuotedValue(question: string): string | null {
  const match = question.match(/"([^"]+)"/);
  return match?.[1]?.trim() ?? null;
}

function extractNameLikeValue(question: string): string | null {
  const quoted = extractQuotedValue(question);
  if (quoted) return quoted;

  const forMatch = question.match(
    /\b(?:for|about|on|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
  );
  if (forMatch?.[1]) return forMatch[1].trim();

  const lastTimeMatch = question.match(
    /\b(?:customer|vehicle|tech|technician)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
  );
  if (lastTimeMatch?.[1]) return lastTimeMatch[1].trim();

  return null;
}

function extractPlateOrVin(question: string): string | null {
  const quoted = extractQuotedValue(question);
  if (quoted && /^[A-Z0-9-]{5,17}$/i.test(quoted)) return quoted;

  const vinMatch = question.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
  if (vinMatch?.[1]) return vinMatch[1].toUpperCase();

  const plateMatch = question.match(/\b([A-Z0-9-]{5,10})\b/i);
  if (plateMatch?.[1]) return plateMatch[1].toUpperCase();

  return null;
}

function toLinks(value: unknown): AssistantLink[] {
  if (!Array.isArray(value)) return [];

  const out: AssistantLink[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const row = item as Citation;
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    const href = typeof row?.href === "string" ? row.href.trim() : "";
    if (!label || !href) continue;

    const key = `${label.toLowerCase()}::${href.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ label, href });
    if (out.length >= 6) break;
  }

  return out;
}

function firstSentence(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return text;
}

function buildAnswer(params: {
  intent: AssistantAnswer["intent"];
  summary: string;
  bullets?: string[];
  links?: AssistantLink[];
  entities?: AssistantEntity[];
  actions?: AssistantAction[];
}): AssistantAnswer {
  return {
    intent: params.intent,
    summary: params.summary,
    bullets: params.bullets ?? [],
    links: params.links ?? [],
    entities: params.entities ?? [],
    actions: params.actions ?? [],
  };
}

export async function answerAssistant({
  shopId,
  userId,
  role,
  request,
}: AskParams): Promise<AssistantAnswer> {
  const question = normalizeQuestion(request.question);
  const q = question.toLowerCase();

  const ctx: ToolContext = {
    shopId,
    userId,
  };

  const customerName = extractNameLikeValue(question);
  const plateOrVin = extractPlateOrVin(question);

  if (
    questionIncludes(q, [
      "last time",
      "last visit",
      "customer history",
      "when did",
      "what did we do",
    ]) &&
    customerName
  ) {
    const result = await runGetCustomerVisitHistory(
      { customerQuery: customerName, limit: 5 },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 3).map((item) => item.label);

    return buildAnswer({
      intent: "customer_visit_history",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        `I found the recent visit history for ${customerName}.`,
      bullets,
      links,
      actions: [
        {
          type: "planner",
          label: "Open in Ops Planner",
          goal: `Review customer history for ${customerName} and prepare next action`,
          context: {
            customerQuery: customerName,
          },
        },
      ],
    });
  }

  if (
    questionIncludes(q, [
      "vehicle history",
      "history for this vehicle",
      "show vehicle history",
      "what has been done to this vehicle",
    ]) &&
    (customerName || plateOrVin)
  ) {
    const result = await runGetVehicleHistory(
      {
        customerQuery: customerName ?? undefined,
        plateOrVin: plateOrVin ?? undefined,
        limit: 8,
      },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 4).map((item) => item.label);

    return buildAnswer({
      intent: "vehicle_history",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        "I found the vehicle history.",
      bullets,
      links,
      actions: [
        {
          type: "planner",
          label: "Open in Ops Planner",
          goal: "Review this vehicle history and suggest next steps",
          context: {
            customerQuery: customerName ?? undefined,
            plateOrVin: plateOrVin ?? undefined,
          },
        },
      ],
    });
  }

  if (
    questionIncludes(q, [
      "what is",
      "working on",
      "what's mike working on",
      "what is mike working on",
      "what is this tech working on",
      "current work",
    ])
  ) {
    const techIdCandidate =
      role && ["tech", "technician", "mechanic"].includes(role.toLowerCase())
        ? userId
        : undefined;

    const result = await runGetTechCurrentWork(
      { techId: techIdCandidate },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 3).map((item) => item.label);

    return buildAnswer({
      intent: "tech_current_work",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        "I checked the technician's current work.",
      bullets,
      links,
      actions: links[0]
        ? [
            {
              type: "link",
              label: "Open work order",
              href: links[0].href,
            },
          ]
        : [],
    });
  }

  if (
    questionIncludes(q, [
      "on hold",
      "stalled",
      "waiting too long",
      "queued too long",
      "what needs attention",
      "stale work orders",
    ])
  ) {
    const result = await runGetStalledWorkOrders({}, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 5).map((item) => item.label);

    return buildAnswer({
      intent: "stalled_work_orders",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        "I found work orders that need attention.",
      bullets,
      links,
      actions: links[0]
        ? [
            {
              type: "link",
              label: "Open most urgent",
              href: links[0].href,
            },
            {
              type: "planner",
              label: "Fix in Ops Planner",
              goal: "Review stalled work orders and suggest corrective actions",
            },
          ]
        : [
            {
              type: "planner",
              label: "Open in Ops Planner",
              goal: "Review stalled work orders and suggest corrective actions",
            },
          ],
    });
  }

  if (
    questionIncludes(q, [
      "appointments",
      "bookings",
      "what is booked",
      "what's booked",
      "today's schedule",
      "todays schedule",
    ])
  ) {
    const result = await runGetBookings({ limit: 10 }, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 5).map((item) => item.label);

    return buildAnswer({
      intent: "bookings",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        "I checked the current bookings.",
      bullets,
      links,
      actions: [
        {
          type: "planner",
          label: "Open in Ops Planner",
          goal: "Review bookings and reschedule if needed",
        },
      ],
    });
  }

  if (
    questionIncludes(q, [
      "shop status",
      "current status",
      "what is going on",
      "what's going on",
      "give me status",
      "shop snapshot",
    ])
  ) {
    const result = await runGetShopCurrentStatus({}, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = links.slice(0, 5).map((item) => item.label);

    return buildAnswer({
      intent: "shop_status",
      summary:
        firstSentence((result as { summary?: string }).summary) ||
        "I pulled the current shop status.",
      bullets,
      links,
      actions: [
        {
          type: "planner",
          label: "Open in Ops Planner",
          goal: "Review current shop status and suggest next actions",
        },
      ],
    });
  }

  return buildAnswer({
    intent: "unknown",
    summary:
      "I can help with customer visit history, vehicle history, bookings, shop status, stalled work orders, and technician work. Try asking a more specific shop question.",
    bullets: [
      '“When was the last time John Smith visited?”',
      '“Give me vehicle history for plate 8ABC123.”',
      '“What is Mike working on right now?”',
      '“What work orders are on hold too long?”',
    ],
    links: [],
    actions: [
      {
        type: "planner",
        label: "Open in Ops Planner",
        goal: question || "Review current shop operations",
      },
    ],
  });
}
