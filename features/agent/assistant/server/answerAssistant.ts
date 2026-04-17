import type { ToolContext } from "../../lib/toolTypes";
import { runGetBookings } from "../../tools/getBookings";
import { runGetCustomerVisitHistory } from "../../tools/getCustomerVisitHistory";
import { runGetShopCurrentStatus } from "../../tools/getShopCurrentStatus";
import { runGetStalledWorkOrders } from "../../tools/getStalledWorkOrders";
import { runGetTechCurrentWork } from "../../tools/getTechCurrentWork";
import { runGetVehicleHistory } from "../../tools/getVehicleHistory";
import { runGetWorkOrderStatusSummary } from "../../tools/getWorkOrderStatusSummary";
import { toolListPendingApprovals } from "../../tools/listPendingApprovals";

import type {
  AssistantAction,
  AssistantAnswer,
  AssistantAskRequest,
  AssistantEntity,
  AssistantLink,
  AssistantResolvedContext,
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
  id?: string;
  type?: string;
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

  const whoMatch = question.match(
    /\b(?:is|was)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:working|assigned)/,
  );
  if (whoMatch?.[1]) return whoMatch[1].trim();

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
    if (out.length >= 8) break;
  }

  return out;
}

function toEntities(value: unknown): AssistantEntity[] {
  if (!Array.isArray(value)) return [];

  const out: AssistantEntity[] = [];

  for (const item of value) {
    const row = item as Citation;
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    if (!label) continue;

    out.push({
      type:
        row.type === "work_order" ||
        row.type === "vehicle" ||
        row.type === "customer" ||
        row.type === "booking" ||
        row.type === "inspection" ||
        row.type === "invoice" ||
        row.type === "fleet_unit" ||
        row.type === "technician"
          ? row.type
          : "alert",
      id: typeof row.id === "string" ? row.id : undefined,
      label,
      href: typeof row.href === "string" ? row.href : undefined,
    });

    if (out.length >= 8) break;
  }

  return out;
}

function buildAnswer(params: {
  intent: AssistantAnswer["intent"];
  summary: string;
  bullets?: string[];
  links?: AssistantLink[];
  entities?: AssistantEntity[];
  actions?: AssistantAction[];
  resolvedContext?: AssistantResolvedContext;
}): AssistantAnswer {
  return {
    intent: params.intent,
    summary: params.summary,
    bullets: params.bullets ?? [],
    links: params.links ?? [],
    entities: params.entities ?? [],
    actions: params.actions ?? [],
    resolvedContext: params.resolvedContext,
  };
}

function dedupeStrings(values: Array<string | null | undefined>, limit = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const clean = (value ?? "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }

  return out;
}

function isFollowUp(question: string): boolean {
  const q = question.toLowerCase().trim();
  return [
    "who worked on it",
    "open that",
    "open it",
    "open that work order",
    "plan follow-up",
    "plan follow up",
    "what about this",
    "what about that",
  ].some((token) => q.includes(token));
}

function resolveContext(request: AssistantAskRequest): AssistantResolvedContext {
  return {
    workOrderId: request.context?.workOrderId ?? request.session?.workOrderId,
    customerId: request.context?.customerId ?? request.session?.customerId,
    vehicleId: request.context?.vehicleId ?? request.session?.vehicleId,
    bookingId: request.context?.bookingId ?? request.session?.bookingId,
  };
}

function extractIdFromHref(href: string, segment: string): string | undefined {
  const match = href.match(new RegExp(`/${segment}/([^/?#]+)`, "i"));
  return match?.[1];
}

function withResolvedContext(
  resolvedContext: AssistantResolvedContext,
  links: AssistantLink[],
): AssistantResolvedContext {
  const next = { ...resolvedContext };

  for (const link of links) {
    if (!next.workOrderId) {
      next.workOrderId = extractIdFromHref(link.href, "work-orders") ?? next.workOrderId;
    }
    if (!next.bookingId) {
      next.bookingId = extractIdFromHref(link.href, "bookings") ?? next.bookingId;
    }
  }

  return next;
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

  const nameCandidate = extractNameLikeValue(question);
  const plateOrVin = extractPlateOrVin(question);
  const resolvedContext = resolveContext(request);

  if (
    questionIncludes(q, [
      "approval",
      "awaiting decision",
      "awaiting customer",
      "quote waiting",
      "waiting on approval",
    ])
  ) {
    const result = await toolListPendingApprovals.run({ limit: 20 }, ctx);

    if (result.items.length === 0) {
      return buildAnswer({
        intent: "pending_approvals",
        summary: "There are no work order lines awaiting approval right now.",
        bullets: ["No pending advisor/customer approval lines were found in this shop."],
        actions: [
          {
            type: "planner",
            label: "Prepare approval follow-up",
            goal: "Review approval queues and prepare customer follow-up",
            context: {
              planner: "approvals",
            },
          },
        ],
        resolvedContext,
      });
    }

    const links = result.items.slice(0, 6).map((item) => ({
      label: `${item.customId ? `WO #${item.customId}` : item.workOrderId.slice(0, 8)} • ${item.customerName ?? "Customer"} • ${item.lines.length} line(s) pending`,
      href: `/work-orders/${item.workOrderId}/quote-review`,
    }));

    const bullets = dedupeStrings(
      result.items.slice(0, 5).map((item) => {
        const total = item.estimatedTotal != null ? ` • est $${item.estimatedTotal.toFixed(2)}` : "";
        return `${item.customId ? `WO #${item.customId}` : item.workOrderId.slice(0, 8)} • ${item.vehicleSummary ?? "Vehicle unknown"}${total}`;
      }),
      5,
    );

    const nextContext = withResolvedContext(resolvedContext, links);

    return buildAnswer({
      intent: "pending_approvals",
      summary: `There are ${result.items.length} work order(s) with pending approvals right now.`,
      bullets,
      links,
      entities: links.map((link) => ({ type: "work_order", label: link.label, href: link.href })),
      actions: [
        {
          type: "link",
          label: "Open top approval",
          href: links[0]?.href ?? "/work-orders",
        },
        {
          type: "planner",
          label: "Prepare advisor approval actions",
          goal: "Prepare advisor approval actions for pending work orders",
          context: {
            planner: "approvals",
            workOrderId: nextContext.workOrderId,
          },
        },
      ],
      resolvedContext: nextContext,
    });
  }

  if (
    resolvedContext.workOrderId &&
    (questionIncludes(q, ["blocking", "blocked", "on hold", "this work order", "what happened on this work order"]) ||
      (isFollowUp(question) && request.session?.lastIntent === "work_order_status"))
  ) {
    const result = await runGetWorkOrderStatusSummary(
      { workOrderId: resolvedContext.workOrderId },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...((result as { notifications?: Array<{ message?: string }> }).notifications ?? []).map(
        (item) => item.message,
      ),
    ]);

    return buildAnswer({
      intent: "work_order_status",
      summary:
        (result as { summary?: string }).summary ??
        "I checked that work order and found its current status.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: [
        links[0]
          ? {
              type: "link",
              label: "Open related work order",
              href: links[0].href,
            }
          : {
              type: "link",
              label: "Open work orders",
              href: "/work-orders",
            },
        {
          type: "planner",
          label: "Plan next steps",
          goal: "Plan follow-up for blockers on this work order",
          context: {
            workOrderId: resolvedContext.workOrderId,
          },
        },
      ],
      resolvedContext,
    });
  }

  if (
    questionIncludes(q, [
      "last time",
      "last visit",
      "customer history",
      "issue came back",
      "what was repaired",
      "what did we do",
    ])
  ) {
    const result = await runGetCustomerVisitHistory(
      {
        customerId: resolvedContext.customerId,
        customerQuery: nameCandidate ?? undefined,
        plateOrVin: plateOrVin ?? undefined,
        limit: 8,
      },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 4).map((item) => item.label),
    ]);

    const nextContext: AssistantResolvedContext = withResolvedContext(
      {
        ...resolvedContext,
        customerId: (result as { customerId?: string }).customerId ?? resolvedContext.customerId,
        vehicleId: (result as { vehicleId?: string }).vehicleId ?? resolvedContext.vehicleId,
      },
      links,
    );

    return buildAnswer({
      intent: "customer_visit_history",
      summary:
        (result as { summary?: string }).summary ??
        "I found recent visit history for that customer.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: [
        links[0]
          ? { type: "link", label: "Open related work order", href: links[0].href }
          : { type: "link", label: "See customer history", href: "/work-orders/history" },
        {
          type: "planner",
          label: "Plan follow-up for repeat issue",
          goal: "Plan follow-up for this repeat customer complaint",
          context: {
            customerId: nextContext.customerId,
            vehicleId: nextContext.vehicleId,
            workOrderId: nextContext.workOrderId,
          },
        },
      ],
      resolvedContext: nextContext,
    });
  }

  if (
    questionIncludes(q, [
      "vehicle history",
      "history for this vehicle",
      "show vehicle history",
      "what has been done to this vehicle",
      "fleet unit",
      "unit history",
    ]) ||
    ((questionIncludes(q, ["who worked on it", "who worked last time"]) || isFollowUp(question)) &&
      Boolean(resolvedContext.vehicleId || resolvedContext.customerId))
  ) {
    const result = await runGetVehicleHistory(
      {
        vehicleId: resolvedContext.vehicleId,
        customerQuery: nameCandidate ?? undefined,
        plateOrVin: plateOrVin ?? undefined,
        limit: 8,
      },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 4).map((item) => item.label),
    ]);

    const nextContext: AssistantResolvedContext = withResolvedContext(
      {
        ...resolvedContext,
        customerId: (result as { customerId?: string }).customerId ?? resolvedContext.customerId,
        vehicleId: (result as { vehicleId?: string }).vehicleId ?? resolvedContext.vehicleId,
      },
      links,
    );

    return buildAnswer({
      intent: "vehicle_history",
      summary:
        (result as { summary?: string }).summary ?? "I found vehicle history for this unit.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: [
        links[0]
          ? { type: "link", label: "Open related work order", href: links[0].href }
          : { type: "link", label: "Open vehicles", href: "/vehicles" },
        {
          type: "planner",
          label: "Create next-step work order",
          goal: "Create next-step work order for this vehicle concern",
          context: {
            vehicleId: nextContext.vehicleId,
            customerId: nextContext.customerId,
          },
        },
      ],
      resolvedContext: nextContext,
    });
  }

  if (
    questionIncludes(q, [
      "what job is",
      "working on",
      "what is this tech working on",
      "current work",
      "assigned right now",
    ])
  ) {
    const techIdCandidate =
      role && ["tech", "technician", "mechanic"].includes(role.toLowerCase())
        ? userId
        : undefined;

    const result = await runGetTechCurrentWork(
      { techId: techIdCandidate, techName: techIdCandidate ? undefined : nameCandidate ?? undefined },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 4).map((item) => item.label),
    ]);

    return buildAnswer({
      intent: "tech_current_work",
      summary:
        (result as { summary?: string }).summary || "I checked the technician's current work.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: links[0]
        ? [
            {
              type: "link",
              label: "Open related work order",
              href: links[0].href,
            },
            {
              type: "planner",
              label: "Plan next steps",
              goal: "Plan next steps for this technician's active jobs",
            },
          ]
        : [],
      resolvedContext: withResolvedContext(resolvedContext, links),
    });
  }

  if (
    questionIncludes(q, [
      "on hold",
      "stalled",
      "waiting too long",
      "queued too long",
      "what needs attention",
      "what is blocking",
      "stale work orders",
    ])
  ) {
    const result = await runGetStalledWorkOrders({}, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 5).map((item) => item.label),
    ]);

    const nextContext = withResolvedContext(resolvedContext, links);

    return buildAnswer({
      intent: "stalled_work_orders",
      summary:
        (result as { summary?: string }).summary ||
        "I found work orders that need attention.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: links[0]
        ? [
            {
              type: "link",
              label: "Open most urgent work order",
              href: links[0].href,
            },
            {
              type: "planner",
              label: "Plan corrective actions",
              goal: "Review stalled work orders and create corrective next steps",
              context: {
                workOrderId: nextContext.workOrderId,
              },
            },
          ]
        : [
            {
              type: "planner",
              label: "Open in Planner",
              goal: "Review stalled work orders and suggest corrective actions",
            },
          ],
      resolvedContext: nextContext,
    });
  }

  if (
    questionIncludes(q, [
      "appointments",
      "bookings",
      "what is booked",
      "what's booked",
      "today",
      "tomorrow",
      "scheduled",
      "appointment moved",
    ])
  ) {
    const result = await runGetBookings(
      {
        customerId: resolvedContext.customerId,
        customerQuery: nameCandidate ?? undefined,
        plateOrVin: plateOrVin ?? undefined,
        limit: 10,
      },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 5).map((item) => item.label),
    ]);

    return buildAnswer({
      intent: "bookings",
      summary:
        (result as { summary?: string }).summary || "I checked the current bookings.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: [
        {
          type: "planner",
          label: "Reschedule and notify customer",
          goal: "Reschedule this booking and notify the customer",
          context: {
            bookingId: resolvedContext.bookingId,
            customerId: resolvedContext.customerId,
          },
        },
      ],
      resolvedContext: withResolvedContext(resolvedContext, links),
    });
  }

  if (
    questionIncludes(q, [
      "shop status",
      "current status",
      "what is going on",
      "what's going on",
      "give me status",
      "vehicles are in the shop",
      "shop snapshot",
    ])
  ) {
    const result = await runGetShopCurrentStatus({}, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 5).map((item) => item.label),
    ]);

    return buildAnswer({
      intent: "shop_status",
      summary:
        (result as { summary?: string }).summary || "I pulled the current shop status.",
      bullets,
      links,
      entities: toEntities((result as { citations?: unknown }).citations),
      actions: [
        {
          type: "planner",
          label: "Plan next steps",
          goal: "Review current shop status and plan next operational actions",
        },
      ],
      resolvedContext: withResolvedContext(resolvedContext, links),
    });
  }

  return buildAnswer({
    intent: "unknown",
    summary:
      "I can answer shop operations questions across work orders, approvals, bookings, technician activity, and customer or vehicle history. Ask a specific operational question and I will ground it in current records.",
    bullets: [
      '"What job is Lucas working on right now?"',
      '"What is blocking this work order?"',
      '"What did we do last time on this vehicle?"',
      '"What approvals are waiting right now?"',
    ],
    actions: [
      {
        type: "planner",
        label: "Open in Ops Planner",
        goal: question || "Review current shop operations",
        context: {
          workOrderId: resolvedContext.workOrderId,
          customerId: resolvedContext.customerId,
          vehicleId: resolvedContext.vehicleId,
          bookingId: resolvedContext.bookingId,
        },
      },
    ],
    resolvedContext,
  });
}
