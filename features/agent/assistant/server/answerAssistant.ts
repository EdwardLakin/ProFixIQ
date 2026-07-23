import type { ToolContext } from "../../lib/toolTypes";
import { runGetBookings } from "../../tools/getBookings";
import { runGetCustomerVisitHistory } from "../../tools/getCustomerVisitHistory";
import { runGetShopCurrentStatus } from "../../tools/getShopCurrentStatus";
import { runGetStalledWorkOrders } from "../../tools/getStalledWorkOrders";
import { runGetTechCurrentWork } from "../../tools/getTechCurrentWork";
import { runGetVehicleHistory } from "../../tools/getVehicleHistory";
import { runGetWorkOrderStatusSummary } from "../../tools/getWorkOrderStatusSummary";
import { toolListPendingApprovals } from "../../tools/listPendingApprovals";
import { getServerSupabase } from "../../server/supabase";
import {
  buildInspectionTemplateEfficiencyRecommendations,
  buildMenuItemEfficiencyRecommendations,
  evaluateSmartMatchReadiness,
} from "../../server/opsRecommendations";
import { buildPartSuggestions } from "@/features/parts/server/buildPartSuggestions";
import {
  getOpenAIClient,
  isOpenAIConfigured,
} from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import type {
  AssistantAction,
  AssistantAnswer,
  AssistantAskRequest,
  AssistantConversationMessage,
  AssistantEntity,
  AssistantLink,
  AssistantResolvedContext,
} from "../types";
import {
  resolveTrustedAssistantAttachments,
  resolveTrustedAssistantContext,
  sanitizeAssistantPageContext,
} from "./trustedContext";

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
        row.type === "part" ||
        row.type === "purchase_order" ||
        row.type === "part_request" ||
        row.type === "menu_item" ||
        row.type === "inspection_template" ||
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
  partSuggestions?: AssistantAnswer["partSuggestions"];
}): AssistantAnswer {
  return {
    intent: params.intent,
    summary: params.summary,
    bullets: params.bullets ?? [],
    links: params.links ?? [],
    entities: params.entities ?? [],
    actions: params.actions ?? [],
    resolvedContext: params.resolvedContext,
    partSuggestions: params.partSuggestions,
  };
}

function buildAccessDeniedAnswer(
  resolvedContext: AssistantResolvedContext,
  area: string,
): AssistantAnswer {
  return buildAnswer({
    intent: "unknown",
    summary: `Your current role does not have access to ${area}.`,
    bullets: [
      "The assistant follows the same shop permissions as the rest of ProFixIQ.",
      "Ask an owner or manager if your role needs additional access.",
    ],
    resolvedContext,
  });
}

function dedupeStrings(
  values: Array<string | null | undefined>,
  limit = 6,
): string[] {
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
    "what next",
    "next step",
    "diagnosis steps",
    "diagnostic steps",
    "diagnosis path",
    "diagnostic path",
    "where is it",
    "where's it",
    "pinout",
    "expected voltage",
    "what should i check",
    "what do i check",
    "what now",
  ].some((token) => q.includes(token));
}

function extractDtc(value: string): string | null {
  return value.match(/\b([PBCU][0-9A-F]{4})\b/i)?.[1]?.toUpperCase() ?? null;
}

function getVehicleLabel(
  request: AssistantAskRequest,
  question: string,
): string | null {
  const fromRequest = [
    request.vehicle?.year,
    request.vehicle?.make,
    request.vehicle?.model,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (fromRequest) return fromRequest;

  const vehicleMatch = question.match(/vehicle:\s*([^\n]+)/i);
  return vehicleMatch?.[1]?.trim() || null;
}

function recentConversationText(request: AssistantAskRequest): string {
  return (request.messages ?? [])
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function getActiveDiagnosticTopic(
  request: AssistantAskRequest,
  question: string,
): { code: string | null; mentionCount: number } {
  const messages = request.messages ?? [];
  const code =
    extractDtc(question) ?? extractDtc(recentConversationText(request));
  const mentionCount = code
    ? messages.filter((message) => message.content.toUpperCase().includes(code))
        .length
    : 0;
  return { code, mentionCount };
}

function isDiagnosticQuestion(
  question: string,
  request: AssistantAskRequest,
): boolean {
  const q = question.toLowerCase();
  return Boolean(
    extractDtc(question) ||
    getActiveDiagnosticTopic(request, question).code ||
    questionIncludes(q, [
      "vehicle:",
      "dtc",
      "code",
      "p0",
      "p1",
      "b0",
      "c0",
      "u0",
      "no start",
      "misfire",
      "heater circuit",
      "diagnosis",
      "diagnostic",
      "pinout",
      "expected voltage",
    ]),
  );
}

function cleanConversationMessages(
  request: AssistantAskRequest,
): AssistantConversationMessage[] {
  const messages = Array.isArray(request.messages) ? request.messages : [];

  return messages
    .filter((message): message is AssistantConversationMessage =>
      Boolean(
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
      ),
    )
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 4000),
    }));
}

function requestContextSummary(
  request: AssistantAskRequest,
  resolvedContext: AssistantResolvedContext,
): string {
  const vehicleLabel =
    [request.vehicle?.year, request.vehicle?.make, request.vehicle?.model]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") || "Not provided";

  return [
    `Vehicle: ${vehicleLabel}`,
    `Work order id: ${resolvedContext.workOrderId ?? "Not provided"}`,
    `Customer id: ${resolvedContext.customerId ?? "Not provided"}`,
    `Vehicle id: ${resolvedContext.vehicleId ?? "Not provided"}`,
    `Fleet unit id: ${resolvedContext.fleetUnitId ?? "Not provided"}`,
    `Page: ${request.context?.pageTitle ?? request.context?.pageType ?? "Not provided"}`,
    `Previous intent: ${request.session?.lastIntent ?? "Not provided"}`,
  ].join("\n");
}

function buildDiagnosticState(
  request: AssistantAskRequest,
  question: string,
): string {
  const transcript = recentConversationText(request);
  const { code, mentionCount } = getActiveDiagnosticTopic(request, question);

  return [
    `Active DTC/topic: ${code ?? "Infer from conversation and latest technician finding"}`,
    `DTC mention count in transcript: ${mentionCount}`,
    `Latest technician finding/request: ${question}`,
    transcript
      ? `Recent transcript:\n${transcript}`
      : "Recent transcript: Not provided",
  ].join("\n");
}

function wantsKnowledgeMode(question: string): boolean {
  const q = question.toLowerCase();
  return questionIncludes(q, [
    "write an article",
    "article",
    "explain generally",
    "summary",
    "summarize",
    "what does this code mean",
    "training",
    "knowledge base",
    "overview",
  ]);
}

function buildDiagnosticMessages(args: {
  question: string;
  request: AssistantAskRequest;
  resolvedContext: AssistantResolvedContext;
}): ChatCompletionMessageParam[] {
  const conversation = cleanConversationMessages(args.request);
  const hasCurrentMessage = conversation.some(
    (message) =>
      message.role === "user" &&
      message.content.trim() === args.question.trim(),
  );

  const images = (args.request.imageAttachments ?? [])
    .filter((image) => typeof image.url === "string" && image.url.trim().length > 0)
    .slice(-3);
  const latestUserContent: ChatCompletionMessageParam = images.length > 0
    ? {
        role: "user",
        content: [
          { type: "text", text: args.question },
          ...images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: image.url as string, detail: "low" as const },
          })),
        ],
      }
    : { role: "user", content: args.question };

  return [
    {
      role: "system",
      content: [
        "You are ProFixIQ Technician AI for professional automotive, heavy-duty, and fleet repair shops.",
        "Default mode is Diagnostic Conversation Mode: persistent, conversational, context-aware, and minimal repetition.",
        "NEVER restart the diagnosis.",
        "NEVER repeat previous diagnostic steps unless the technician asks for a recap or knowledge article.",
        "Continue from the latest technician finding.",
        "Treat every new user message as an update to the active diagnostic session.",
        "Ask for the next measurement only if required.",
        "Build a natural decision tree from the proven-good/proven-bad evidence.",
        "Do not tell the technician to replace parts until circuit evidence supports it.",
        "If the technician gives a measurement, interpret whether it is expected, then give the next branch.",
      ].join("\n"),
    },
    {
      role: "system",
      content: `Current vehicle / work order context:\n${requestContextSummary(args.request, args.resolvedContext)}\n\nCurrent diagnostic state:\n${buildDiagnosticState(args.request, args.question)}`,
    },
    ...conversation.map(
      (message): ChatCompletionMessageParam => ({
        role: message.role,
        content: message.content,
      }),
    ),
    ...(hasCurrentMessage ? [] : [latestUserContent]),
    {
      role: "system",
      content:
        images.length > 0
          ? "Current request: Continue diagnosing from the latest technician finding. Inspect the attached image(s) as visual diagnostic evidence, but mention uncertainty when the image is not conclusive. Return only the technician-facing response."
          : "Current request: Continue diagnosing from the latest technician finding. Return only the technician-facing response.",
    },
  ];
}

function fallbackDiagnosticConversationAnswer(args: {
  question: string;
  request: AssistantAskRequest;
  resolvedContext: AssistantResolvedContext;
}): AssistantAnswer {
  const { code } = getActiveDiagnosticTopic(args.request, args.question);
  const q = args.question.toLowerCase();
  const vehicleLabel = getVehicleLabel(args.request, args.question);
  const subject =
    [vehicleLabel, code].filter(Boolean).join(" • ") ||
    "this diagnostic session";

  if (
    code === "P0141" &&
    /5\s*v|5\s*volt|five\s*volt/.test(q) &&
    q.includes("ground")
  ) {
    return buildAnswer({
      intent: "unknown",
      summary:
        "Do not restart at the definition of P0141. Your latest measurement changes the branch: about 5 V on the heater feed with a good ground points away from the sensor and toward the heater power supply/control path.",
      bullets: [
        "The O2 heater B+ feed is typically battery voltage KOEO, not about 5 V, unless service information shows this circuit is PCM duty-cycle/PWM controlled at that test point.",
        "Check the O2 heater fuse and verify battery voltage on both sides of the fuse under load.",
        "Backprobe the heater feed at the sensor connector and then upstream toward the fuse/relay/splice to find the voltage drop or open/high-resistance section.",
        "Verify whether the PCM controls the heater on the ground side or power side before condemning the PCM.",
        "Do not replace the sensor yet; your measurement indicates a supply/control circuit problem that must be proven first.",
      ],
      actions: [],
      resolvedContext: args.resolvedContext,
    });
  }

  return buildAnswer({
    intent: "unknown",
    summary: `Continue ${subject} from the latest finding instead of restarting the diagnostic.`,
    bullets: [
      "Separate what is already proven good from what is still unproven.",
      "Use the latest measurement to choose the next branch: verify the expected value at that exact pin, then test upstream/downstream under load.",
      "Tell me the measured voltage/current/resistance at the next connector or fuse and I will continue the decision tree.",
    ],
    actions: [],
    resolvedContext: args.resolvedContext,
  });
}

async function answerDiagnosticConversation(args: {
  question: string;
  request: AssistantAskRequest;
  resolvedContext: AssistantResolvedContext;
}): Promise<AssistantAnswer> {
  if (!isOpenAIConfigured()) {
    return fallbackDiagnosticConversationAnswer(args);
  }

  const completion = await getOpenAIClient().chat.completions.create({
    model: getOpenAIModelForPurpose("reasoning"),
    messages: buildDiagnosticMessages(args),
    ...openAITemperatureParam(getOpenAIModelForPurpose("reasoning"), 0.2),
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) return fallbackDiagnosticConversationAnswer(args);

  return buildAnswer({
    intent: "unknown",
    summary: content,
    bullets: [],
    actions: [],
    resolvedContext: args.resolvedContext,
  });
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
      next.workOrderId =
        extractIdFromHref(link.href, "work-orders") ?? next.workOrderId;
    }
    if (!next.bookingId) {
      next.bookingId =
        extractIdFromHref(link.href, "bookings") ?? next.bookingId;
    }
  }

  return next;
}

function looksLikePartsQuestion(q: string): boolean {
  return questionIncludes(q, [
    "low stock",
    "low inventory",
    "reorder",
    "po",
    "purchase order",
    "receiving",
    "parts waiting",
    "waiting on parts",
    "blocked because of parts",
    "do we have this part",
    "in stock",
    "parts tied",
    "fitment",
    "part number",
    "did we already order",
    "used on this vehicle",
    "blocked jobs",
  ]);
}

function looksLikeFleetQuestion(q: string): boolean {
  return questionIncludes(q, [
    "fleet unit",
    "service request",
    "pre-trip",
    "pretrip",
    "overdue fleet",
    "unit history",
    "fleet follow",
    "work orders tied to this unit",
  ]);
}

function looksLikeAuthoringQuestion(q: string): boolean {
  return questionIncludes(q, [
    "menu item",
    "inspection template",
    "bundle",
    "package",
    "repeated custom",
    "should this become",
    "similar menu",
  ]);
}

function looksLikeOpsIntelligenceQuestion(q: string): boolean {
  return questionIncludes(q, [
    "smart match",
    "smart-match",
    "ready for conservative",
    "ready for full",
    "menu items should we create",
    "repeated work",
    "repeated jobs",
    "reusable menu",
    "inspection templates should we add",
    "should be templated",
    "manual complaint lines",
    "operational recommendations",
  ]);
}

async function answerOpsIntelligenceDomain(args: {
  shopId: string;
  q: string;
  resolvedContext: AssistantResolvedContext;
}): Promise<AssistantAnswer | null> {
  if (!looksLikeOpsIntelligenceQuestion(args.q)) return null;

  const [smartMatch, menuItemRecs, inspectionTemplateRecs] = await Promise.all([
    evaluateSmartMatchReadiness(args.shopId),
    buildMenuItemEfficiencyRecommendations(args.shopId),
    buildInspectionTemplateEfficiencyRecommendations(args.shopId),
  ]);

  const bullets = dedupeStrings([
    smartMatch.summary,
    ...smartMatch.evidence.slice(0, 4),
    menuItemRecs[0]
      ? `Top menu-item opportunity: ${menuItemRecs[0].suggestedTitle} (${menuItemRecs[0].sourceRecords.length} evidence record(s) in sample).`
      : "No menu item opportunity passed the repeat threshold in the sampled window.",
    inspectionTemplateRecs[0]
      ? `Top inspection-template opportunity: ${inspectionTemplateRecs[0].suggestedTemplateTitle} (${inspectionTemplateRecs[0].sourceRecords.length} evidence record(s) in sample).`
      : "No inspection-template opportunity passed the repeat threshold in the sampled window.",
  ]);

  const links: AssistantLink[] = [
    {
      label: "Review in Planner: Smart Match readiness",
      href: "/agent/planner?planner=ops&lane=smart_match_readiness&allowCreate=0&goal=Review%20Smart%20Match%20readiness%20with%20evidence",
    },
    {
      label: "Review in Planner: Menu item efficiency",
      href: "/agent/planner?planner=ops&lane=menu_item_efficiency_review&allowCreate=0&goal=Review%20repeated%20manual%20work%20for%20menu%20item%20drafts",
    },
    {
      label: "Review in Planner: Inspection template efficiency",
      href: "/agent/planner?planner=ops&lane=inspection_template_efficiency_review&allowCreate=0&goal=Review%20repeated%20inspection%20patterns%20for%20template%20drafts",
    },
  ];

  return buildAnswer({
    intent: "shop_status",
    summary: `Operational intelligence is ready for review. Smart Match is currently ${smartMatch.state.replaceAll("_", " ")}; menu item opportunities: ${menuItemRecs.length}; inspection template opportunities: ${inspectionTemplateRecs.length}.`,
    bullets,
    links,
    entities: [
      ...menuItemRecs.slice(0, 2).map((item) => ({
        type: "menu_item" as const,
        label: `Candidate menu item: ${item.suggestedTitle}`,
        href: "/menu",
      })),
      ...inspectionTemplateRecs.slice(0, 2).map((item) => ({
        type: "inspection_template" as const,
        label: `Candidate template: ${item.suggestedTemplateTitle}`,
        href: "/inspection/templates",
      })),
    ],
    actions: [
      {
        type: "planner",
        label: "Review Smart Match readiness proposal",
        goal: "Build Smart Match readiness recommendation with evidence and review warnings",
        context: {
          planner: "ops",
          lane: "smart_match_readiness",
          allowCreate: false,
        },
      },
      {
        type: "planner",
        label: "Review menu item efficiency proposals",
        goal: "Build review-first menu item efficiency recommendations from repeated manual work",
        context: {
          planner: "ops",
          lane: "menu_item_efficiency_review",
          allowCreate: false,
        },
      },
      {
        type: "planner",
        label: "Review inspection template efficiency proposals",
        goal: "Build review-first inspection template recommendations from repeated inspection behavior",
        context: {
          planner: "ops",
          lane: "inspection_template_efficiency_review",
          allowCreate: false,
        },
      },
    ],
    resolvedContext: args.resolvedContext,
  });
}

async function answerPartsDomain(args: {
  shopId: string;
  q: string;
  resolvedContext: AssistantResolvedContext;
}): Promise<AssistantAnswer | null> {
  if (!looksLikePartsQuestion(args.q)) return null;

  const supabase = getServerSupabase();

  const [stockRes, poRes, requestRes, requestItemsRes, woRes, partUsageRes] =
    await Promise.all([
      supabase
        .from("part_stock")
        .select(
          "part_id, qty_on_hand, reorder_point, reorder_qty, parts(name, sku, low_stock_threshold)",
        )
        .eq("parts.shop_id", args.shopId)
        .limit(300),
      supabase
        .from("purchase_orders")
        .select("id, status, created_at, expected_at, total")
        .eq("shop_id", args.shopId)
        .in("status", ["draft", "sent", "partially_received", "receiving"])
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("part_requests")
        .select("id, status, work_order_id, created_at")
        .eq("shop_id", args.shopId)
        .in("status", [
          "requested",
          "quoted",
          "approved",
          "ordered",
          "partially_received",
        ])
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("part_request_items")
        .select(
          "id, request_id, part_id, po_id, qty_approved, qty_received, work_order_id, work_order_line_id, description",
        )
        .eq("shop_id", args.shopId)
        .order("updated_at", { ascending: false })
        .limit(80),
      supabase
        .from("work_orders")
        .select("id, custom_id, status, vehicle_id, customer_id")
        .eq("shop_id", args.shopId)
        .order("created_at", { ascending: false })
        .limit(180),
      supabase
        .from("work_order_parts")
        .select(
          "id, work_order_id, work_order_line_id, part_id, part_number, part_name, quantity",
        )
        .eq("shop_id", args.shopId)
        .order("created_at", { ascending: false })
        .limit(280),
    ]);

  if (
    stockRes.error ||
    poRes.error ||
    requestRes.error ||
    requestItemsRes.error ||
    woRes.error ||
    partUsageRes.error
  ) {
    throw new Error(
      stockRes.error?.message ??
        poRes.error?.message ??
        requestRes.error?.message ??
        requestItemsRes.error?.message ??
        woRes.error?.message ??
        partUsageRes.error?.message ??
        "Failed to load parts context",
    );
  }

  const stockRows = (stockRes.data ?? []) as Array<{
    part_id: string;
    qty_on_hand: number;
    reorder_point: number | null;
    reorder_qty: number | null;
    parts?: {
      name?: string | null;
      sku?: string | null;
      low_stock_threshold?: number | null;
    } | null;
  }>;

  const lowStock = stockRows
    .map((row) => {
      const threshold =
        row.reorder_point ?? row.parts?.low_stock_threshold ?? null;
      if (threshold == null) return null;
      if (row.qty_on_hand > threshold) return null;
      const suggested =
        row.reorder_qty ?? Math.max(1, threshold - row.qty_on_hand + 1);
      return { ...row, threshold, suggested };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.qty_on_hand - b.qty_on_hand);

  const workOrders = (woRes.data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    status: string | null;
    vehicle_id: string | null;
    customer_id: string | null;
  }>;
  const workOrderById = new Map(
    workOrders.map((row) => [row.id, row] as const),
  );

  const partsUsed = (partUsageRes.data ?? []) as Array<{
    part_id: string | null;
    part_number: string | null;
    part_name: string | null;
    quantity: number | null;
    work_order_id: string | null;
  }>;

  const requestItems = (requestItemsRes.data ?? []) as Array<{
    id: string;
    request_id: string;
    part_id: string | null;
    po_id: string | null;
    qty_approved: number;
    qty_received: number;
    work_order_id: string | null;
    work_order_line_id: string | null;
    description: string;
  }>;

  const pendingReceiving = requestItems.filter(
    (item) => item.qty_approved > 0 && item.qty_received < item.qty_approved,
  );

  const blockedWorkOrderIds = Array.from(
    new Set(
      pendingReceiving
        .map((item) => item.work_order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const searchPartTokenMatch = args.q.match(/\b([A-Z0-9-]{4,})\b/i);
  const searchPartToken = searchPartTokenMatch?.[1]?.toLowerCase() ?? null;

  const matchingStock =