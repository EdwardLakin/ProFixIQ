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

  const matchingStock = searchPartToken
    ? lowStock.filter((row) =>
        [row.parts?.name, row.parts?.sku, row.part_id]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(searchPartToken),
          ),
      )
    : [];

  const matchingPriorUse = searchPartToken
    ? partsUsed.filter((row) =>
        [row.part_number, row.part_name, row.part_id]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(searchPartToken),
          ),
      )
    : [];

  const links: AssistantLink[] = [];
  const entities: AssistantEntity[] = [];
  const bullets: string[] = [];

  for (const row of lowStock.slice(0, 4)) {
    const name = row.parts?.name ?? row.parts?.sku ?? row.part_id;
    const shortage = Math.max(0, row.threshold - row.qty_on_hand);
    bullets.push(
      `${name}: on-hand ${row.qty_on_hand}, threshold ${row.threshold}, suggested reorder ${Math.max(
        row.suggested,
        shortage,
      )}`,
    );
    entities.push({
      type: "part",
      id: row.part_id,
      label: name,
      href: `/parts/inventory?part=${row.part_id}`,
    });
  }

  const poRows = (poRes.data ?? []) as Array<{
    id: string;
    status: string;
    total: number | null;
  }>;
  for (const po of poRows.slice(0, 3)) {
    links.push({
      label: `PO ${po.id.slice(0, 8)} • ${po.status}`,
      href: `/parts/po/${po.id}`,
    });
    entities.push({
      type: "purchase_order",
      id: po.id,
      label: `PO ${po.id.slice(0, 8)} • ${po.status}`,
      href: `/parts/po/${po.id}`,
    });
  }

  for (const woId of blockedWorkOrderIds.slice(0, 3)) {
    const wo = workOrderById.get(woId);
    const woLabel = wo?.custom_id
      ? `WO #${wo.custom_id}`
      : `WO ${woId.slice(0, 8)}`;
    links.push({
      label: `${woLabel} blocked by parts • ${wo?.status ?? "status unknown"}`,
      href: `/work-orders/${woId}`,
    });
  }

  const partsLinkedToActiveWork = requestItems
    .filter((item) => item.work_order_id && item.part_id)
    .slice(0, 4);
  for (const item of partsLinkedToActiveWork) {
    entities.push({
      type: "part_request",
      id: item.id,
      label: `${item.description || item.part_id} • pending ${Math.max(0, item.qty_approved - item.qty_received)}`,
      href: item.work_order_id
        ? `/work-orders/${item.work_order_id}`
        : undefined,
    });
  }

  if (searchPartToken) {
    bullets.push(
      matchingStock.length > 0
        ? `Inventory match for "${searchPartTokenMatch?.[1]}": ${matchingStock.length} matching stock record(s).`
        : `Inventory match for "${searchPartTokenMatch?.[1]}": none found in stock snapshot.`,
    );
    bullets.push(
      matchingPriorUse.length > 0
        ? `Prior-use history: ${matchingPriorUse.length} matching usage record(s) across recent work orders.`
        : "Prior-use history: no matching usage records in the sampled history.",
    );
    bullets.push(
      "Fitment confidence: this response uses inventory and prior-use evidence only; fitment catalog confirmation is still required.",
    );
  }

  const suggestions = await buildPartSuggestions({
    supabase,
    shopId: args.shopId,
    workOrderId: args.resolvedContext.workOrderId ?? null,
    vehicle: undefined,
    description: args.q,
    notes: null,
    topK: 5,
  });

  const summary =
    `Parts snapshot: ${lowStock.length} low-stock SKU(s), ${poRows.length} open purchase order(s), and ${pendingReceiving.length} receiving item(s) still pending.` +
    (blockedWorkOrderIds.length > 0
      ? ` ${blockedWorkOrderIds.length} work order(s) appear blocked by parts receiving.`
      : " No active jobs are currently flagged as blocked by pending receiving items.");

  return buildAnswer({
    intent:
      args.q.includes("po") ||
      args.q.includes("purchase") ||
      args.q.includes("receiving")
        ? "parts_purchasing"
        : blockedWorkOrderIds.length > 0
          ? "parts_blockers"
          : "parts_inventory",
    summary,
    bullets: dedupeStrings(bullets, 6),
    links,
    entities: entities.slice(0, 8),
    actions: [
      {
        type: "planner",
        label: "Prepare low-inventory reorder plan",
        goal: "Prepare low-inventory reorder plan with critical parts, open POs, and receiving blockers",
        context: {
          planner: "ops",
          lane: "low_inventory_reorder",
          allowCreate: false,
          workOrderId: args.resolvedContext.workOrderId,
        },
      },
      {
        type: "planner",
        label: "Prepare parts follow-up for blocked jobs",
        goal: "Prepare parts follow-up for jobs blocked by pending part requests or receiving",
        context: {
          planner: "ops",
          lane: "parts_follow_up",
          allowCreate: false,
          workOrderId:
            blockedWorkOrderIds[0] ?? args.resolvedContext.workOrderId,
        },
      },
      {
        type: "planner",
        label: "Prepare receiving follow-up list",
        goal: "Prepare receiving follow-up list for open POs and pending received quantities",
        context: {
          planner: "ops",
          lane: "parts_follow_up",
          allowCreate: false,
          vehicleId: args.resolvedContext.vehicleId,
          customerId: args.resolvedContext.customerId,
          workOrderId: args.resolvedContext.workOrderId,
        },
      },
      {
        type: "link",
        label: "Open receiving inbox",
        href: "/parts/receiving",
      },
    ],
    resolvedContext: args.resolvedContext,
    partSuggestions: suggestions,
  });
}

async function answerFleetDomain(args: {
  shopId: string;
  q: string;
  resolvedContext: AssistantResolvedContext;
  plateOrVin: string | null;
}): Promise<AssistantAnswer | null> {
  if (!looksLikeFleetQuestion(args.q)) return null;

  const supabase = getServerSupabase();

  let vehicleId = args.resolvedContext.vehicleId ?? null;
  if (!vehicleId && args.plateOrVin) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id")
      .or(`license_plate.eq.${args.plateOrVin},vin.eq.${args.plateOrVin}`)
      .maybeSingle();
    vehicleId = vehicle?.id ?? null;
  }

  if (!vehicleId) {
    return buildAnswer({
      intent: "fleet_history",
      summary:
        "I need a fleet unit context (vehicle id, plate, or VIN) to load fleet history and service requests.",
      bullets: [
        "Try asking with a plate/VIN, or open this from a fleet unit record.",
      ],
      resolvedContext: args.resolvedContext,
    });
  }

  const [requestsRes, workOrdersRes, inspectionsRes] = await Promise.all([
    supabase
      .from("fleet_service_requests")
      .select(
        "id, status, severity, title, summary, scheduled_for_date, work_order_id, created_at",
      )
      .eq("shop_id", args.shopId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, created_at, source_fleet_service_request_id",
      )
      .eq("shop_id", args.shopId)
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("inspections")
      .select("id, status, created_at, inspection_type, work_order_id")
      .eq("shop_id", args.shopId)
      .eq("vehicle_id", vehicleId)
      .eq("is_canonical", true)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (requestsRes.error || workOrdersRes.error || inspectionsRes.error) {
    throw new Error(
      requestsRes.error?.message ??
        workOrdersRes.error?.message ??
        inspectionsRes.error?.message ??
        "Failed to load fleet records",
    );
  }

  const requests = (requestsRes.data ?? []) as Array<{
    id: string;
    status: string;
    severity: string;
    title: string;
    summary: string;
    work_order_id: string | null;
  }>;
  const openRequests = requests.filter(
    (row) => row.status !== "completed" && row.status !== "closed",
  );
  const overdue = requests.filter(
    (row) =>
      row.status !== "completed" &&
      row.status !== "closed" &&
      row.status !== "scheduled",
  );
  const workOrders = (workOrdersRes.data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    status: string | null;
  }>;
  const inspections = (inspectionsRes.data ?? []) as Array<{
    id: string;
    status: string | null;
    inspection_type: string | null;
  }>;

  const links: AssistantLink[] = [
    ...openRequests.slice(0, 3).map((row) => ({
      label: `Fleet request • ${row.title || row.summary} • ${row.status}`,
      href: `/fleet/service-requests`,
    })),
    ...workOrders.slice(0, 3).map((row) => ({
      label: row.custom_id
        ? `WO #${row.custom_id} • ${row.status ?? "status unknown"}`
        : `WO ${row.id.slice(0, 8)} • ${row.status ?? "status unknown"}`,
      href: `/work-orders/${row.id}`,
    })),
  ];

  const bullets = dedupeStrings([
    `Open service requests: ${openRequests.length}`,
    overdue.length > 0
      ? `Overdue or unscheduled fleet follow-ups: ${overdue.length}`
      : "No overdue fleet requests in the current unit scope.",
    `Recent work orders tied to this unit: ${workOrders.length}`,
    `Recent inspections/pre-trips tied to this unit: ${inspections.length}`,
    ...openRequests
      .slice(0, 3)
      .map(
        (row) =>
          `${row.title || row.summary} • ${row.severity} • ${row.status}`,
      ),
  ]);

  return buildAnswer({
    intent: openRequests.length > 0 ? "fleet_requests" : "fleet_history",
    summary: `Fleet unit snapshot: ${openRequests.length} open service request(s), ${workOrders.length} recent work order(s), and ${inspections.length} recent inspection/pre-trip record(s).`,
    bullets,
    links,
    entities: [
      ...openRequests.slice(0, 4).map((row) => ({
        type: "fleet_unit" as const,
        id: vehicleId,
        label: row.title || row.summary,
        href: "/fleet/service-requests",
      })),
      ...workOrders.slice(0, 2).map((row) => ({
        type: "work_order" as const,
        id: row.id,
        label: row.custom_id
          ? `WO #${row.custom_id}`
          : `WO ${row.id.slice(0, 8)}`,
        href: `/work-orders/${row.id}`,
      })),
    ],
    actions: [
      {
        type: "planner",
        label: "Prepare fleet follow-up",
        goal: "Prepare fleet follow-up plan for this unit, including open requests and overdue items",
        context: {
          planner: "fleet",
          lane: "fleet_follow_up",
          vehicleId,
          allowCreate: false,
        },
      },
      {
        type: "planner",
        label: "Create next-step work order for this unit",
        goal: "Create next-step work order proposal for this fleet unit and summarize scope before execution",
        context: {
          planner: "fleet",
          lane: "fleet_follow_up",
          vehicleId,
          allowCreate: false,
        },
      },
    ],
    resolvedContext: {
      ...args.resolvedContext,
      vehicleId,
      fleetUnitId: args.resolvedContext.fleetUnitId ?? vehicleId,
    },
  });
}

async function answerAuthoringDomain(args: {
  shopId: string;
  q: string;
  resolvedContext: AssistantResolvedContext;
}): Promise<AssistantAnswer | null> {
  if (!looksLikeAuthoringQuestion(args.q)) return null;

  const supabase = getServerSupabase();

  const [menuRes, templateRes, repeatLinesRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, category, inspection_template_id, created_at")
      .eq("shop_id", args.shopId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("inspection_templates")
      .select("id, template_name, vehicle_type, updated_at")
      .eq("shop_id", args.shopId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("work_order_lines")
      .select(
        "id, description, complaint, created_at, work_order_id, work_orders!inner(shop_id)",
      )
      .eq("work_orders.shop_id", args.shopId)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (menuRes.error || templateRes.error || repeatLinesRes.error) {
    throw new Error(
      menuRes.error?.message ??
        templateRes.error?.message ??
        repeatLinesRes.error?.message ??
        "Failed to load authoring context",
    );
  }

  const menuItems = (menuRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    category: string | null;
    inspection_template_id: string | null;
  }>;
  const templates = (templateRes.data ?? []) as Array<{
    id: string;
    template_name: string;
    vehicle_type: string | null;
  }>;
  const lines = (repeatLinesRes.data ?? []) as Array<{
    description: string | null;
    complaint: string | null;
  }>;

  const counts = new Map<string, number>();
  for (const row of lines) {
    const label = (row.description ?? row.complaint ?? "").trim().toLowerCase();
    if (!label || label.length < 6) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const repeats = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topRepeat = repeats[0]?.[0] ?? null;
  const duplicateMenu = topRepeat
    ? menuItems
        .filter((item) =>
          (item.name ?? "").toLowerCase().includes(topRepeat.slice(0, 18)),
        )
        .slice(0, 3)
    : [];

  const duplicateTemplates = topRepeat
    ? templates
        .filter((item) =>
          item.template_name.toLowerCase().includes(topRepeat.slice(0, 18)),
        )
        .slice(0, 3)
    : [];

  const templateIntent =
    args.q.includes("inspection") || args.q.includes("template");
  const bundleIntent = args.q.includes("bundle") || args.q.includes("package");

  const summary = bundleIntent
    ? "I can prepare a service bundle draft proposal from repeated jobs and existing menu items. I will stage it for review first, and only create a true package if your package domain exists."
    : templateIntent
      ? "I found inspection-template authoring signals from repeated findings and existing templates. Planner can draft sections/items for review before any create."
      : "I found repeated custom work that may deserve a reusable menu item. Planner can draft title, labor, and pricing hints with duplicate checks before create.";

  return buildAnswer({
    intent: bundleIntent
      ? "authoring_bundle_draft"
      : templateIntent
        ? "authoring_inspection_template"
        : "authoring_menu_item",
    summary,
    bullets: dedupeStrings([
      repeats.length > 0
        ? `Top repeated custom line: "${repeats[0][0]}" (${repeats[0][1]} occurrences in sampled history)`
        : "No repeated custom-line cluster cleared the draft threshold in the recent sample.",
      `Existing menu items sampled: ${menuItems.length}`,
      `Existing inspection templates sampled: ${templates.length}`,
      duplicateMenu.length > 0
        ? `Potential menu duplicates: ${duplicateMenu.map((item) => item.name ?? item.id.slice(0, 8)).join(", ")}`
        : "No immediate menu duplicates detected for the top repeated pattern.",
      duplicateTemplates.length > 0
        ? `Potential template duplicates: ${duplicateTemplates.map((item) => item.template_name).join(", ")}`
        : "No immediate inspection-template duplicates detected for the top repeated pattern.",
      bundleIntent
        ? "Bundle/package note: this response is a draft proposal lane and does not assume a live authored package domain."
        : null,
    ]),
    links: [
      ...menuItems.slice(0, 2).map((item) => ({
        label: item.name ?? `Menu item ${item.id.slice(0, 8)}`,
        href: `/menu/item/${item.id}`,
      })),
      ...templates.slice(0, 2).map((item) => ({
        label: item.template_name,
        href: "/inspection/templates",
      })),
    ],
    entities: [
      ...menuItems.slice(0, 3).map((item) => ({
        type: "menu_item" as const,
        id: item.id,
        label: item.name ?? `Menu item ${item.id.slice(0, 8)}`,
        href: `/menu/item/${item.id}`,
      })),
      ...templates.slice(0, 2).map((item) => ({
        type: "inspection_template" as const,
        id: item.id,
        label: item.template_name,
        href: "/inspection/templates",
      })),
    ],
    actions: [
      {
        type: "planner",
        label: "Create menu item draft",
        goal: "Draft a menu item from repeated custom lines, include duplicate checks, and require review before create",
        context: {
          planner: "ops",
          lane: "menu_item_draft",
          allowCreate: false,
          vehicleId: args.resolvedContext.vehicleId,
        },
      },
      {
        type: "planner",
        label: "Create inspection template draft",
        goal: "Draft an inspection template from repeated findings and historical forms, with review before create",
        context: {
          planner: "ops",
          lane: "inspection_template_draft",
          allowCreate: false,
        },
      },
      {
        type: "planner",
        label: "Create service bundle/package draft",
        goal: "Draft a service bundle/package proposal with included menu items and duplicate checks; create only if package domain exists",
        context: {
          planner: "ops",
          lane: "service_bundle_draft",
          allowCreate: false,
        },
      },
    ],
    resolvedContext: args.resolvedContext,
  });
}

export async function answerAssistant({
  shopId,
  userId,
  role,
  request: rawRequest,
}: AskParams): Promise<AssistantAnswer> {
  const supabase = getServerSupabase();
  const trusted = await resolveTrustedAssistantContext({
    supabase,
    shopId,
    context: rawRequest.context,
    session: rawRequest.session,
  });
  const resolvedContext = trusted.context;
  const trustedAttachments = await resolveTrustedAssistantAttachments({
    supabase,
    shopId,
    context: resolvedContext,
    attachments: rawRequest.imageAttachments,
  });
  const pageContext = sanitizeAssistantPageContext(rawRequest.context);
  const request: AssistantAskRequest = {
    ...rawRequest,
    context: { ...pageContext, ...resolvedContext },
    session: {
      ...resolvedContext,
      lastIntent: rawRequest.session?.lastIntent,
    },
    vehicle: trusted.vehicle ?? rawRequest.vehicle,
    imageAttachments: trustedAttachments,
  };
  const question = normalizeQuestion(request.question);
  const q = question.toLowerCase();
  const actor = getActorCapabilities({ role });

  const ctx: ToolContext = {
    shopId,
    userId,
  };

  const nameCandidate = extractNameLikeValue(question);
  const plateOrVin = extractPlateOrVin(question);
  if (
    questionIncludes(q, [
      "approval",
      "awaiting decision",
      "awaiting customer",
      "quote waiting",
      "waiting on approval",
    ])
  ) {
    if (!actor.canAuthorizeQuotes) {
      return buildAccessDeniedAnswer(resolvedContext, "pending approval records");
    }
    const result = await toolListPendingApprovals.run({ limit: 20 }, ctx);

    if (result.items.length === 0) {
      return buildAnswer({
        intent: "pending_approvals",
        summary: "There are no work order lines awaiting approval right now.",
        bullets: [
          "No pending advisor/customer approval lines were found in this shop.",
        ],
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
        const total =
          item.estimatedTotal != null
            ? ` • est $${item.estimatedTotal.toFixed(2)}`
            : "";
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
      entities: links.map((link) => ({
        type: "work_order",
        label: link.label,
        href: link.href,
      })),
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

  if (looksLikePartsQuestion(q)) {
    if (!actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "shop-wide parts records");
    }
    const partsAnswer = await answerPartsDomain({ shopId, q, resolvedContext });
    if (partsAnswer) return partsAnswer;
  }

  if (looksLikeFleetQuestion(q)) {
    if (!actor.canViewShopWideData && !actor.canViewFleetOnlyData) {
      return buildAccessDeniedAnswer(resolvedContext, "fleet records");
    }
    const fleetAnswer = await answerFleetDomain({ shopId, q, resolvedContext, plateOrVin });
    if (fleetAnswer) return fleetAnswer;
  }

  if (looksLikeOpsIntelligenceQuestion(q)) {
    if (!actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "shop-wide operational intelligence");
    }
    const opsIntelligenceAnswer = await answerOpsIntelligenceDomain({ shopId, q, resolvedContext });
    if (opsIntelligenceAnswer) return opsIntelligenceAnswer;
  }

  if (looksLikeAuthoringQuestion(q)) {
    if (!actor.canManageBranding) {
      return buildAccessDeniedAnswer(resolvedContext, "AI-assisted shop authoring");
    }
    const authoringAnswer = await answerAuthoringDomain({ shopId, q, resolvedContext });
    if (authoringAnswer) return authoringAnswer;
  }

  if (
    resolvedContext.workOrderId &&
    (questionIncludes(q, [
      "blocking",
      "blocked",
      "on hold",
      "this work order",
      "what happened on this work order",
    ]) ||
      (isFollowUp(question) &&
        request.session?.lastIntent === "work_order_status"))
  ) {
    if (!actor.canManageWorkOrders && !actor.canRunInspections && !actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "this work order");
    }
    const result = await runGetWorkOrderStatusSummary(
      { workOrderId: resolvedContext.workOrderId },
      ctx,
    );

    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...(
        (result as { notifications?: Array<{ message?: string }> })
          .notifications ?? []
      ).map((item) => item.message),
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
    if (!actor.canManageWorkOrders && !actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "customer visit history");
    }
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
        customerId:
          (result as { customerId?: string }).customerId ??
          resolvedContext.customerId,
        vehicleId:
          (result as { vehicleId?: string }).vehicleId ??
          resolvedContext.vehicleId,
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
          ? {
              type: "link",
              label: "Open related work order",
              href: links[0].href,
            }
          : {
              type: "link",
              label: "See customer history",
              href: "/work-orders/history",
            },
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
    ((questionIncludes(q, ["who worked on it", "who worked last time"]) ||
      isFollowUp(question)) &&
      Boolean(resolvedContext.vehicleId || resolvedContext.customerId))
  ) {
    if (!actor.canManageWorkOrders && !actor.canViewShopWideData && !actor.canViewFleetOnlyData) {
      return buildAccessDeniedAnswer(resolvedContext, "vehicle history");
    }
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
        customerId:
          (result as { customerId?: string }).customerId ??
          resolvedContext.customerId,
        vehicleId:
          (result as { vehicleId?: string }).vehicleId ??
          resolvedContext.vehicleId,
      },
      links,
    );

    return buildAnswer({
      intent: "vehicle_history",
      summary:
        (result as { summary?: string }).summary ??
        "I found vehicle history for this unit.",
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

    if (!actor.canViewShopWideData && !techIdCandidate) {
      return buildAccessDeniedAnswer(resolvedContext, "other technicians' current work");
    }

    const result = await runGetTechCurrentWork(
      {
        techId: techIdCandidate,
        techName: techIdCandidate ? undefined : (nameCandidate ?? undefined),
      },
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
        (result as { summary?: string }).summary ||
        "I checked the technician's current work.",
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
    if (!actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "shop-wide stalled work orders");
    }
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
    if (!actor.canManageScheduling && !actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "shop appointment records");
    }
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
        (result as { summary?: string }).summary ||
        "I checked the current bookings.",
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
    if (!actor.canViewShopWideData) {
      return buildAccessDeniedAnswer(resolvedContext, "shop-wide status");
    }
    const result = await runGetShopCurrentStatus({}, ctx);
    const links = toLinks((result as { citations?: unknown }).citations);
    const bullets = dedupeStrings([
      (result as { summary?: string }).summary,
      ...links.slice(0, 5).map((item) => item.label),
    ]);

    return buildAnswer({
      intent: "shop_status",
      summary:
        (result as { summary?: string }).summary ||
        "I pulled the current shop status.",
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

  if (
    isDiagnosticQuestion(question, request) &&
    !wantsKnowledgeMode(question)
  ) {
    if (!actor.canRunInspections) {
      return buildAccessDeniedAnswer(resolvedContext, "technician diagnostic assistance");
    }
    return answerDiagnosticConversation({ question, request, resolvedContext });
  }

  return buildAnswer({
    intent: "unknown",
    summary:
      "I can answer shop operations questions across work orders, approvals, bookings, technician activity, parts/inventory/purchasing, fleet follow-up, and AI-assisted authoring opportunities. Ask a specific operational question and I will ground it in current records.",
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
