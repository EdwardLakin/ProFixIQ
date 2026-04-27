// features/agent/lib/plannerOpenAI.ts
import type { ToolContext } from "./toolTypes";
import { getServerSupabase } from "../server/supabase";
import { buildPartSuggestions } from "@/features/parts/server/buildPartSuggestions";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import {
  buildInspectionTemplateEfficiencyRecommendations,
  buildMenuItemEfficiencyRecommendations,
  evaluateSmartMatchReadiness,
} from "../server/opsRecommendations";

import {
  runCreateWorkOrder,
  runAddWorkOrderLine,
  runFindCustomerVehicle,
  runGenerateInvoiceHtml,
  runEmailInvoice,
  runCreateCustomer,
  runCreateVehicle,
  runCreateCustomInspection,
  runRecordWorkOrderApproval,
  runGetCustomerVisitHistory,
  runGetVehicleHistory,
  runGetBookings,
  runRescheduleBooking,
  runGetShopCurrentStatus,
  runGetStalledWorkOrders,
  runGetWorkOrderStatusSummary,
} from "./toolRegistry";
import type {
  PlannerAffectedRecord,
  PlannerProposal,
} from "./plannerProposal";

type PlannerEvent = {
  kind: string;
  [key: string]: unknown;
};

type OnEvent = (e: PlannerEvent) => Promise<void> | void;

type PlannerMode = "openai" | "ops" | "fleet" | "approvals";
type NotificationLevel = "info" | "warning" | "urgent";

type NotificationItem = {
  level: NotificationLevel;
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

type CitationItem = PlannerAffectedRecord;


type ParsedPlan = {
  action?:
    | "lookup_customer_history"
    | "lookup_vehicle_history"
    | "lookup_bookings"
    | "reschedule_booking"
    | "lookup_tech_work"
    | "lookup_work_order_status"
    | "lookup_stale_work_orders"
    | "create_work_order"
    | "add_line"
    | "create_inspection"
    | "email_invoice"
    | "approve_work_order";
  customerQuery?: string;
  plateOrVin?: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  workOrderId?: string;
  techId?: string;
  techName?: string;
  lineDescription?: string;
  lineNotes?: string;
  laborHours?: number;
  orderType?: "inspection" | "maintenance" | "repair" | "diagnosis";
  jobType?: "maintenance" | "repair" | "diagnosis" | "inspection";
  notes?: string;
  toEmail?: string;
  subject?: string;
  approval?: "approved" | "rejected" | "pending";
  approvalNotes?: string;
  requestedStart?: string;
  requestedEnd?: string;
};

function createProposalId(lane: string) {
  return `${lane}:${crypto.randomUUID().slice(0, 8)}`;
}

function get<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return (obj as Record<string, T | undefined>)[key];
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function coerceOrderType(
  x: unknown,
): "inspection" | "maintenance" | "repair" | "diagnosis" {
  const v = typeof x === "string" ? x.toLowerCase() : "";
  return (["inspection", "maintenance", "repair", "diagnosis"].includes(v)
    ? v
    : "repair") as "inspection" | "maintenance" | "repair" | "diagnosis";
}

const JOB_TYPES = new Set(
  ["maintenance", "repair", "diagnosis", "inspection"] as const,
);

function coerceJobType(
  x: unknown,
): "maintenance" | "repair" | "diagnosis" | "inspection" {
  return typeof x === "string" && JOB_TYPES.has(x as never)
    ? (x as "maintenance" | "repair" | "diagnosis" | "inspection")
    : "repair";
}

function asLevel(value: unknown, fallback: NotificationLevel = "info"): NotificationLevel {
  return value === "warning" || value === "urgent" || value === "info"
    ? value
    : fallback;
}

function asNotifications(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) return [];

  const out: NotificationItem[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;

    out.push({
      level: asLevel(x.level, "info"),
      code: typeof x.code === "string" ? x.code : "notice",
      title: typeof x.title === "string" ? x.title : "Notice",
      message: typeof x.message === "string" ? x.message : "",
      href: typeof x.href === "string" ? x.href : undefined,
      entityType: typeof x.entityType === "string" ? x.entityType : undefined,
      entityId: typeof x.entityId === "string" ? x.entityId : undefined,
    });
  }

  return out;
}

function getPlannerMode(context: Record<string, unknown>): PlannerMode {
  const raw =
    get<string>(context, "plannerKind") ??
    get<string>(context, "mode") ??
    "openai";

  const v = (raw ?? "openai").toLowerCase();

  if (v === "ops") return "ops";
  if (v === "fleet") return "fleet";
  if (v === "approvals") return "approvals";
  return "openai";
}



function extractCustomerFromGoal(goal: string): string | undefined {
  const match = goal.match(/([A-Z][a-z]+\s[A-Z][a-z]+)/);
  return match ? match[1] : undefined;
}

function extractWorkOrderFromGoal(goal: string): string | undefined {
  const match = goal.match(/WO[#\s]*([A-Za-z0-9\-]+)/i);
  return match ? match[1] : undefined;
}

function extractPlateOrVinFromGoal(goal: string): string | undefined {
  const vinLike = goal.match(/\b[A-HJ-NPR-Z0-9]{11,17}\b/i)?.[0];
  if (vinLike) return vinLike.toUpperCase();

  const plateLike = goal.match(/\b[A-Z0-9]{5,8}\b/i)?.[0];
  return plateLike?.toUpperCase();
}

async function llmParseGoal(
  goal: string,
  context: Record<string, unknown>,
): Promise<ParsedPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const system = [
    "You are parsing requests for the ProFixIQ ops assistant.",
    "Return JSON only.",
    "Detect whether the request is asking to look up customer history, vehicle history, bookings, tech work, work order status, stale work orders, or a write action.",
    "Prefer retrieval-style action labels when the user is asking for information.",
    "Allowed action values:",
    [
      "lookup_customer_history",
      "lookup_vehicle_history",
      "lookup_bookings",
      "reschedule_booking",
      "lookup_tech_work",
      "lookup_work_order_status",
      "lookup_stale_work_orders",
      "create_work_order",
      "add_line",
      "create_inspection",
      "email_invoice",
      "approve_work_order",
    ].join(", "),
  ].join("\n");

  const user = JSON.stringify({ goal, context });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModelForPurpose("reasoning"),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) return {};

  const j = (await res.json().catch(() => null)) as unknown;

  const text =
    typeof j === "object" &&
    j !== null &&
    "choices" in j &&
    Array.isArray((j as { choices?: unknown }).choices) &&
    typeof (j as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message
      ?.content === "string"
      ? (j as { choices: Array<{ message: { content: string } }> }).choices[0].message
          .content
      : undefined;

  if (!text) return {};

  try {
    return JSON.parse(text) as ParsedPlan;
  } catch {
    return {};
  }
}

function mergeCitations(
  ...groups: Array<CitationItem[] | undefined>
): CitationItem[] {
  const seen = new Set<string>();
  const out: CitationItem[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      const key = `${item.type}:${item.id}:${item.href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function mergeNotifications(
  ...groups: Array<NotificationItem[] | undefined>
): NotificationItem[] {
  const out: NotificationItem[] = [];
  for (const group of groups) {
    for (const item of group ?? []) out.push(item);
  }
  return out;
}

async function buildPartsProposal(
  lane: "low_inventory_reorder" | "parts_follow_up",
  context: Record<string, unknown>,
  ctx: ToolContext,
): Promise<PlannerProposal> {
  const supabase = getServerSupabase();

  const [stockRes, poRes, requestItemRes, woRes, vehicleRes] = await Promise.all([
    supabase
      .from("part_stock")
      .select("part_id, qty_on_hand, reorder_point, reorder_qty, parts(name, sku, low_stock_threshold)")
      .eq("parts.shop_id", ctx.shopId)
      .limit(400),
    supabase
      .from("purchase_orders")
      .select("id, status, expected_at, created_at")
      .eq("shop_id", ctx.shopId)
      .in("status", ["draft", "sent", "partially_received", "receiving"])
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("part_request_items")
      .select("id, part_id, po_id, qty_approved, qty_received, work_order_id, description, updated_at")
      .eq("shop_id", ctx.shopId)
      .order("updated_at", { ascending: false })
      .limit(180),
    supabase
      .from("work_orders")
      .select("id, custom_id, status, vehicle_id")
      .eq("shop_id", ctx.shopId)
      .limit(400),
    context.vehicleId
      ? supabase
          .from("vehicles")
          .select("id, year, make, model, vin, license_plate")
          .eq("id", String(context.vehicleId))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (stockRes.error || poRes.error || requestItemRes.error || woRes.error || vehicleRes.error) {
    throw new Error(
      stockRes.error?.message ??
        poRes.error?.message ??
        requestItemRes.error?.message ??
        woRes.error?.message ??
        vehicleRes.error?.message ??
        "Failed to build parts proposal",
    );
  }

  const stockRows = (stockRes.data ?? []) as Array<{
    part_id: string;
    qty_on_hand: number;
    reorder_point: number | null;
    reorder_qty: number | null;
    parts?: { name?: string | null; sku?: string | null; low_stock_threshold?: number | null } | null;
  }>;
  const openPos = (poRes.data ?? []) as Array<{
    id: string;
    status: string | null;
    expected_at: string | null;
  }>;
  const requestItems = (requestItemRes.data ?? []) as Array<{
    part_id: string | null;
    po_id: string | null;
    qty_approved: number | null;
    qty_received: number | null;
    work_order_id: string | null;
    description: string | null;
  }>;
  const workOrders = (woRes.data ?? []) as Array<{
    id: string;
    custom_id: string | null;
    status: string | null;
    vehicle_id: string | null;
  }>;

  const lowStock = stockRows
    .map((row) => {
      const threshold = row.reorder_point ?? row.parts?.low_stock_threshold ?? null;
      if (threshold == null || row.qty_on_hand > threshold) return null;
      const suggested = row.reorder_qty ?? Math.max(1, threshold - row.qty_on_hand + 1);
      return {
        ...row,
        threshold,
        suggested,
        name: row.parts?.name ?? row.parts?.sku ?? row.part_id,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.qty_on_hand - b.qty_on_hand);

  const pendingReceiving = requestItems.filter((item) => {
    const approved = item.qty_approved ?? 0;
    const received = item.qty_received ?? 0;
    return approved > received;
  });

  const blockedWoIds = Array.from(
    new Set(
      pendingReceiving
        .map((item) => item.work_order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const workOrderById = new Map(workOrders.map((row) => [row.id, row] as const));

  const affectedRecords: CitationItem[] = [
    ...lowStock.slice(0, 5).map((row) => ({
      type: "part",
      id: row.part_id,
      href: `/parts/inventory?part=${row.part_id}`,
      label: `${row.name} • on-hand ${row.qty_on_hand} / threshold ${row.threshold}`,
    })),
    ...openPos.slice(0, 4).map((po) => ({
      type: "purchase_order",
      id: po.id,
      href: `/parts/po/${po.id}`,
      label: `PO ${po.id.slice(0, 8)} • ${po.status ?? "unknown"}`,
    })),
    ...blockedWoIds.slice(0, 4).map((woId) => {
      const wo = workOrderById.get(woId);
      return {
        type: "work_order",
        id: woId,
        href: `/work-orders/${woId}`,
        label: wo?.custom_id
          ? `WO #${wo.custom_id} • ${wo.status ?? "status unknown"}`
          : `WO ${woId.slice(0, 8)} • ${wo?.status ?? "status unknown"}`,
      };
    }),
  ];

  const vehicleContext = vehicleRes.data as
    | { year: string | null; make: string | null; model: string | null; vin: string | null; license_plate: string | null }
    | null;
  const vehicleLabel = vehicleContext
    ? [vehicleContext.year, vehicleContext.make, vehicleContext.model].filter(Boolean).join(" ") ||
      vehicleContext.vin ||
      vehicleContext.license_plate ||
      "selected vehicle"
    : null;

  const canonicalSuggestions = await buildPartSuggestions({
    supabase,
    shopId: ctx.shopId,
    workOrderId: typeof context.workOrderId === "string" ? context.workOrderId : null,
    description: typeof context.goal === "string" ? context.goal : "parts follow up",
    notes: null,
    topK: 4,
  });

  return {
    id: createProposalId(lane),
    lane,
    classification: "confirmable_write",
    title:
      lane === "low_inventory_reorder"
        ? "Low-inventory reorder proposal"
        : "Parts follow-up proposal",
    summary:
      lane === "low_inventory_reorder"
        ? `Proposed reorder set includes ${lowStock.length} low-inventory part(s) with receiving and blocker checks.`
        : `Proposed parts follow-up covers ${pendingReceiving.length} pending receiving item(s) and ${blockedWoIds.length} potentially blocked job(s).`,
    proposed_steps: [
      "Review low-stock candidates and reorder thresholds.",
      "Review receiving state and open purchase order dependencies.",
      "Review linked work orders that may be parts-constrained.",
      "Confirm follow-up scope before any apply action.",
    ],
    source_rationale: [
      "Inventory availability derived from part_stock on-hand and threshold values.",
      "Pending receiving derived from part_request_items approved vs received quantities.",
      "Blocked-job risk inferred when a work order is tied to not-yet-received request items.",
      vehicleLabel ? `Vehicle-specific context applied for ${vehicleLabel}.` : "No specific vehicle context provided; shop-wide evidence was used.",
      lowStock.length > 0
        ? `Top candidates: ${lowStock
            .slice(0, 5)
            .map((row) => `${row.name} (${row.qty_on_hand}/${row.threshold})`)
            .join(", ")}`
        : "No low-stock candidate crossed threshold in sampled rows.",
      ...canonicalSuggestions.slice(0, 3).map((s) => `Suggestion: ${s.title} • ${s.fitmentConfidence.replaceAll("_", " ")} • sources: ${s.sourceTypes.join(", ")}`),
    ],
    warnings: [
      "This is a staged proposal only. No purchase orders or inventory quantities were modified.",
      "Fitment confidence is not auto-assumed from inventory. Validate fitment before ordering if vehicle context is present.",
      ...canonicalSuggestions.flatMap((s) => s.warnings.slice(0, 1).map((w) => `${s.title}: ${w.message}`)).slice(0, 3),
    ],
    affected_records: affectedRecords,
    review_actions: [
      "Review reorder quantities against min/max policy and supplier constraints.",
      "Confirm blocked jobs to prioritize receiving follow-up.",
      "Send selected follow-up items to execution only after explicit confirmation.",
    ],
    duplicate_candidates: [
      ...openPos.slice(0, 5).map((po) => `Open PO ${po.id.slice(0, 8)} • ${po.status ?? "unknown"}`),
      ...canonicalSuggestions.flatMap((s) => s.warnings.filter((w) => w.type === "duplicate_on_work_order" || w.type === "existing_part_request").map((w) => `${s.title}: ${w.message}`)),
    ].slice(0, 6),
    confirmation_required: true,
    execution_available: false,
    execution_label: "Confirm and apply",
    not_executable_reason:
      "Apply path is not enabled for parts follow-up yet. Keep this in review-first mode.",
    result_summary:
      lane === "low_inventory_reorder"
        ? "Ready for explicit apply when reorder mutation path is enabled."
        : "Ready for explicit apply when parts follow-up mutation path is enabled.",
    result_links: [],
    audit: {
      generated_at: new Date().toISOString(),
    },
  };
}

async function buildAuthoringProposal(
  lane: "menu_item_draft" | "inspection_template_draft",
  ctx: ToolContext,
): Promise<PlannerProposal> {
  const supabase = getServerSupabase();

  const [menuRes, templateRes, linesRes, inspectionItemsRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, category, estimated_hours, description")
      .eq("shop_id", ctx.shopId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("inspection_templates")
      .select("id, template_name, sections, vehicle_type")
      .eq("shop_id", ctx.shopId)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("work_order_lines")
      .select("id, description, complaint, labor_hours_actual, work_order_id, created_at")
      .eq("shop_id", ctx.shopId)
      .order("created_at", { ascending: false })
      .limit(260),
    supabase
      .from("inspection_result_items")
      .select("item_label, section_title, status, notes")
      .limit(260),
  ]);

  if (menuRes.error || templateRes.error || linesRes.error || inspectionItemsRes.error) {
    throw new Error(
      menuRes.error?.message ??
        templateRes.error?.message ??
        linesRes.error?.message ??
        inspectionItemsRes.error?.message ??
        "Failed to build authoring proposal",
    );
  }

  const lines = (linesRes.data ?? []) as Array<{
    id: string;
    description: string | null;
    complaint: string | null;
    labor_hours_actual: number | null;
    work_order_id: string | null;
  }>;
  const templates = (templateRes.data ?? []) as Array<{
    id: string;
    template_name: string | null;
    vehicle_type: string | null;
  }>;
  const menuItems = (menuRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    category: string | null;
    estimated_hours: number | null;
    description: string | null;
  }>;
  const inspectionItems = (inspectionItemsRes.data ?? []) as Array<{
    item_label: string | null;
    section_title: string | null;
    status: string | null;
  }>;

  const clusterMap = new Map<string, { count: number; samples: string[]; hours: number[]; workOrderIds: string[] }>();
  for (const line of lines) {
    const raw = (line.description ?? line.complaint ?? "").trim();
    if (raw.length < 6) continue;
    const key = raw.toLowerCase();
    const current = clusterMap.get(key) ?? { count: 0, samples: [], hours: [], workOrderIds: [] };
    current.count += 1;
    if (current.samples.length < 3) current.samples.push(raw);
    if (typeof line.labor_hours_actual === "number") current.hours.push(line.labor_hours_actual);
    if (line.work_order_id && current.workOrderIds.length < 8) current.workOrderIds.push(line.work_order_id);
    clusterMap.set(key, current);
  }

  const topCluster = [...clusterMap.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)[0];

  const clusterLabel = topCluster?.[0] ?? "custom recurring service";
  const clusterStats = topCluster?.[1] ?? { count: 0, samples: [], hours: [], workOrderIds: [] };

  const nearDuplicateMenu = menuItems
    .filter((item) => (item.name ?? "").toLowerCase().includes(clusterLabel.slice(0, 16)))
    .slice(0, 5);
  const nearDuplicateTemplates = templates
    .filter((item) => (item.template_name ?? "").toLowerCase().includes(clusterLabel.slice(0, 16)))
    .slice(0, 5);

  const avgHours =
    clusterStats.hours.length > 0
      ? clusterStats.hours.reduce((sum, value) => sum + value, 0) / clusterStats.hours.length
      : null;

  const topInspectionSections = new Map<string, number>();
  for (const row of inspectionItems) {
    const section = (row.section_title ?? "").trim();
    if (!section) continue;
    topInspectionSections.set(section, (topInspectionSections.get(section) ?? 0) + 1);
  }
  const sortedSections = [...topInspectionSections.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const affectedRecords: CitationItem[] = [
    ...clusterStats.workOrderIds.slice(0, 5).map((woId) => ({
      type: "work_order",
      id: woId,
      href: `/work-orders/${woId}`,
      label: `Source work order ${woId.slice(0, 8)}`,
    })),
    ...(lane === "menu_item_draft" ? nearDuplicateMenu : nearDuplicateTemplates).map((item) => ({
      type: lane === "menu_item_draft" ? "menu_item" : "inspection_template",
      id: item.id,
      href: lane === "menu_item_draft" ? `/menu/item/${item.id}` : "/inspections/custom-draft",
      label:
        lane === "menu_item_draft"
          ? (item as { name: string | null }).name ?? `Menu item ${item.id.slice(0, 8)}`
          : (item as { template_name: string | null }).template_name ?? `Template ${item.id.slice(0, 8)}`,
    })),
  ];

  if (lane === "menu_item_draft") {
    const proposedName = clusterLabel
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .slice(0, 62);

    return {
      id: createProposalId(lane),
      lane,
      classification: "draft_only",
      title: "Menu item draft proposal",
      summary: `Draft menu item "${proposedName}" prepared from repeated custom work with duplicate checks and review-first controls.`,
      proposed_steps: [
        `Draft menu item title: ${proposedName}`,
        `Draft category: ${nearDuplicateMenu[0]?.category ?? "General Repair"}`,
        `Draft labor estimate: ${avgHours != null ? `${avgHours.toFixed(1)} hr` : "Needs advisor review"}`,
        "Review duplicates and overlap before considering creation.",
      ],
      source_rationale: [
        `Repeated custom-line frequency: ${clusterStats.count} occurrence(s) in recent sample.`,
        ...clusterStats.samples.slice(0, 3).map((sample) => `Observed line: ${sample}`),
      ],
      warnings: [
        "Draft only: no menu item was created.",
        "Duplicate candidates require manual review before any create action.",
      ],
      affected_records: affectedRecords,
      review_actions: [
        "Keep as draft and request advisor edits.",
        "Revise title, description, labor, and suggested parts.",
        "Send reviewed draft to Planner execution lane for explicit create confirmation.",
      ],
      duplicate_candidates: nearDuplicateMenu.map((item) => item.name ?? item.id.slice(0, 8)),
      confirmation_required: false,
      execution_available: false,
      execution_label: "Not yet executable",
      not_executable_reason:
        "Creation route is not enabled in this lane. Keep this proposal in draft review.",
      result_summary: "Not yet applied.",
      result_links: [],
      audit: {
        generated_at: new Date().toISOString(),
      },
    };
  }

  return {
    id: createProposalId(lane),
    lane,
    classification: "draft_only",
    title: "Inspection template draft proposal",
    summary: `Draft inspection template proposal generated from recurring findings/manual additions with overlap checks against existing templates.`,
    proposed_steps: [
      `Draft template name: ${clusterLabel
        .split(" ")
        .slice(0, 5)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")} Inspection`,
      "Review recurring sections and checklist coverage.",
      ...sortedSections.map(([title, count]) => `Candidate section: ${title} (${count} references)`),
    ],
    source_rationale: [
      `Repeated custom-line/finding signal count: ${clusterStats.count}`,
      "Recurring manual items and findings were used as draft evidence; this does not auto-merge template domains.",
    ],
    warnings: [
      "Draft only: no inspection template was created.",
      "Potential template overlap detected; review section structure before create.",
    ],
    affected_records: affectedRecords,
    review_actions: [
      "Keep as draft and edit sections/items.",
      "Revise overlap and duplicate checks with service leads.",
      "Send reviewed template draft to Planner execution lane for explicit confirmation.",
    ],
    duplicate_candidates: nearDuplicateTemplates.map(
      (item) => item.template_name ?? item.id.slice(0, 8),
    ),
    confirmation_required: false,
    execution_available: false,
    execution_label: "Not yet executable",
    not_executable_reason:
      "Creation route is not enabled in this lane. Keep this proposal in draft review.",
    result_summary: "Not yet applied.",
    result_links: [],
    audit: {
      generated_at: new Date().toISOString(),
    },
  };
}

async function buildOpsIntelligenceProposal(
  lane:
    | "smart_match_readiness"
    | "menu_item_efficiency_review"
    | "inspection_template_efficiency_review",
  ctx: ToolContext,
): Promise<PlannerProposal> {
  if (lane === "smart_match_readiness") {
    const readiness = await evaluateSmartMatchReadiness(ctx.shopId);
    return {
      id: createProposalId(lane),
      lane,
      classification: "informational",
      title: "Smart Match readiness proposal",
      summary: readiness.summary,
      proposed_steps: [
        `Recommended state: ${readiness.state}`,
        ...(readiness.nextAction ? [`Next action: ${readiness.nextAction}`] : []),
      ],
      affected_records: [],
      warnings: readiness.reviewNotes,
      review_actions: [
        "Owner/admin reviews readiness evidence and false-match risk before changing Smart Match settings.",
        "Do not auto-enable Smart Match from this proposal; use explicit settings action if approved.",
      ],
      duplicate_candidates: [],
      source_rationale: readiness.evidence,
      confirmation_required: false,
      execution_available: false,
      execution_label: "Review only",
      not_executable_reason: "Readiness proposals are recommendation-only and never auto-enable Smart Match.",
      result_summary: "No Smart Match mode changes were applied.",
      result_links: [
        { href: "/dashboard/owner/settings", label: "Open owner settings" },
      ],
      audit: {
        generated_at: new Date().toISOString(),
      },
    };
  }

  if (lane === "menu_item_efficiency_review") {
    const recs = await buildMenuItemEfficiencyRecommendations(ctx.shopId);
    const top = recs[0];
    return {
      id: createProposalId(lane),
      lane,
      classification: "draft_only",
      title: "Menu item efficiency review proposal",
      summary: top
        ? `Found ${recs.length} menu-item candidate(s) from repeated manual work. Top recommendation: ${top.suggestedTitle}.`
        : "No menu-item recommendation met the evidence threshold in the sampled history.",
      proposed_steps: top
        ? [
            `Proposed title: ${top.suggestedTitle}`,
            `Suggested category: ${top.suggestedCategory}`,
            `Labor baseline: ${top.suggestedLaborHours != null ? `${top.suggestedLaborHours.toFixed(1)} hr` : "Needs review"}`,
            "Review overlap candidates and advisor workflow impact before drafting.",
          ]
        : ["Collect more repeated manual line history, then re-run this review lane."],
      affected_records: top
        ? top.sourceRecords.slice(0, 8).map((record) => ({
            type: "work_order_line",
            id: record.id,
            href: record.href,
            label: record.label,
          }))
        : [],
      warnings: [
        "Review-first only: no menu_items records were created from this proposal.",
        ...(top?.overlapCandidates.length ? ["Potential catalog overlap detected; verify duplicates before drafting."] : []),
      ],
      review_actions: [
        "Review proposed title/category/labor with advisors.",
        "Confirm duplicate/overlap handling with existing menu_items.",
        "If approved, create manually through existing menu item flows.",
      ],
      duplicate_candidates: top?.overlapCandidates ?? [],
      source_rationale: top ? [top.rationale, ...top.evidenceBullets] : ["No candidate reached repeat threshold."],
      confirmation_required: false,
      execution_available: false,
      execution_label: "Draft only",
      not_executable_reason: "This lane only stages evidence-backed recommendations for review.",
      result_summary: "No catalog records were created.",
      result_links: [{ href: "/menu", label: "Open menu catalog" }],
      audit: {
        generated_at: new Date().toISOString(),
      },
    };
  }

  const recs = await buildInspectionTemplateEfficiencyRecommendations(ctx.shopId);
  const top = recs[0];
  return {
    id: createProposalId(lane),
    lane,
    classification: "draft_only",
    title: "Inspection template efficiency review proposal",
    summary: top
      ? `Found ${recs.length} inspection-template candidate(s) from repeated inspection behavior. Top recommendation: ${top.suggestedTemplateTitle}.`
      : "No inspection-template recommendation met the evidence threshold in the sampled history.",
    proposed_steps: top
      ? [
          `Proposed template: ${top.suggestedTemplateTitle}`,
          `Suggested scope: ${top.suggestedScope}`,
          "Review overlap and section structure before drafting any template.",
        ]
      : ["Collect more repeated inspection activity, then re-run this review lane."],
    affected_records: top
      ? top.sourceRecords.slice(0, 8).map((record) => ({
          type: "work_order_line",
          id: record.id,
          href: record.href,
          label: record.label,
        }))
      : [],
    warnings: [
      "Review-first only: no inspection_templates records were created from this proposal.",
      ...(top?.overlapCandidates.length ? ["Potential template overlap detected; validate before authoring."] : []),
    ],
    review_actions: [
      "Review candidate scope with service leads/technicians.",
      "Confirm overlap handling with existing inspection_templates.",
      "If approved, create manually through existing inspection template flows.",
    ],
    duplicate_candidates: top?.overlapCandidates ?? [],
    source_rationale: top ? [top.rationale, ...top.evidenceBullets] : ["No candidate reached repeat threshold."],
    confirmation_required: false,
    execution_available: false,
    execution_label: "Draft only",
    not_executable_reason: "This lane only stages evidence-backed recommendations for review.",
    result_summary: "No template records were created.",
    result_links: [{ href: "/inspection/templates", label: "Open inspection templates" }],
    audit: {
      generated_at: new Date().toISOString(),
    },
  };
}

function buildOperationalProposal(
  lane: "resolve_approval_queue" | "reschedule_booking" | "work_order_operations",
  context: Record<string, unknown>,
): PlannerProposal {
  const bookingId = normalizeText(get<string>(context, "bookingId"));
  const workOrderId = normalizeText(get<string>(context, "workOrderId"));
  const lineId =
    normalizeText(get<string>(context, "lineId")) ??
    normalizeText(get<string>(context, "workOrderLineId"));
  const requestedStart = normalizeText(get<string>(context, "requestedStart"));
  const lineDescription = normalizeText(get<string>(context, "lineDescription"));
  const approvalAction = normalizeText(get<string>(context, "approvalAction")) ?? "approve";

  const affectedRecords: CitationItem[] = [];
  if (bookingId) {
    affectedRecords.push({
      type: "booking",
      id: bookingId,
      href: `/calendar?bookingId=${bookingId}`,
      label: `Booking ${bookingId.slice(0, 8)}`,
    });
  }
  if (workOrderId) {
    affectedRecords.push({
      type: "work_order",
      id: workOrderId,
      href: `/work-orders/${workOrderId}`,
      label: `Work order ${workOrderId.slice(0, 8)}`,
    });
  }
  if (lineId) {
    affectedRecords.push({
      type: "work_order_line",
      id: lineId,
      href: workOrderId ? `/work-orders/${workOrderId}` : "#",
      label: `Line ${lineId.slice(0, 8)}`,
    });
  }

  const base: Omit<PlannerProposal, "title" | "summary" | "proposed_steps" | "execution_payload" | "execution_available" | "not_executable_reason" | "id"> = {
    lane,
    classification: "confirmable_write",
    affected_records: affectedRecords,
    warnings: ["No records are changed during Generate Plan. Review before apply."],
    review_actions: [
      "Verify affected records are correct.",
      "Review warnings and duplicate/conflict checks.",
      "Use Confirm and apply only when ready.",
    ],
    duplicate_candidates: [],
    source_rationale: ["Proposal derived from planner goal and linked record identifiers."],
    confirmation_required: true,
    execution_label: "Confirm and apply",
    result_summary: "Not yet applied.",
    result_links: [],
    audit: {
      generated_at: new Date().toISOString(),
    },
  };

  if (lane === "resolve_approval_queue") {
    const executionAvailable = Boolean(lineId);
    return {
      id: createProposalId(lane),
      ...base,
      title: "Approval resolution proposal",
      summary: lineId
        ? `Planner will set line ${lineId.slice(0, 8)} to ${approvalAction} after confirmation.`
        : "Planner identified approval resolution work, but no line id was provided.",
      proposed_steps: [
        "Review pending approval line.",
        `Apply approval state: ${approvalAction}.`,
        "Capture execution result and changed records.",
      ],
      duplicate_candidates: lineId ? [`Line ${lineId.slice(0, 8)} may have been recently updated.`] : [],
      execution_available: executionAvailable,
      not_executable_reason: executionAvailable ? undefined : "Missing line id for apply.",
      execution_payload: executionAvailable
        ? { lane, action: "set_line_approval", data: { lineId, approvalAction } }
        : undefined,
    };
  }

  if (lane === "reschedule_booking") {
    const executionAvailable = Boolean(bookingId && requestedStart);
    return {
      id: createProposalId(lane),
      ...base,
      title: "Booking reschedule proposal",
      summary: executionAvailable
        ? `Planner will move booking ${bookingId?.slice(0, 8)} to ${requestedStart} after confirmation.`
        : "Planner identified booking reschedule work, but booking id and requested start are required.",
      proposed_steps: [
        "Review requested booking time change.",
        "Validate conflicts and dependencies.",
        "Confirm and apply booking update.",
      ],
      duplicate_candidates: bookingId ? [`Booking ${bookingId.slice(0, 8)} may already be rescheduled.`] : [],
      execution_available: executionAvailable,
      not_executable_reason: executionAvailable
        ? undefined
        : "Missing booking id or requested start timestamp for apply.",
      execution_payload: executionAvailable
        ? {
            lane,
            action: "reschedule_booking",
            data: {
              bookingId,
              requestedStart,
              requestedEnd: normalizeText(get<string>(context, "requestedEnd")),
            },
          }
        : undefined,
    };
  }

  const executionAvailable = Boolean(workOrderId && lineDescription);
  return {
    id: createProposalId(lane),
    ...base,
    title: "Work-order operation proposal",
    summary: executionAvailable
      ? `Planner will add/update work-order operations on ${workOrderId?.slice(0, 8)} after confirmation.`
      : "Planner identified work-order operations, but work order id and line description are required.",
    proposed_steps: [
      "Review target work order and operation details.",
      "Validate duplicate line risk.",
      "Confirm and apply work-order line change.",
    ],
    duplicate_candidates: lineDescription
      ? [`Potential duplicate operation text: "${lineDescription.slice(0, 80)}"`]
      : [],
    execution_available: executionAvailable,
    not_executable_reason: executionAvailable
      ? undefined
      : "Missing work order id or operation description for apply.",
    execution_payload: executionAvailable
      ? {
          lane,
          action: "add_work_order_line",
          data: {
            workOrderId,
            lineDescription,
            jobType: coerceJobType(get<string>(context, "jobType")),
            laborHours: Number(get<number>(context, "laborHours") ?? 1),
          },
        }
      : undefined,
  };
}

export async function runOpenAIPlanner(
  goal: string,
  context: Record<string, unknown>,
  ctx: ToolContext,
  onEvent?: OnEvent,
) {
  await onEvent?.({ kind: "plan", text: `Goal: ${goal}` });

  const mode = getPlannerMode(context);
  const lane = get<string>(context, "lane");

  if (lane === "low_inventory_reorder" || lane === "parts_follow_up") {
    const proposal = await buildPartsProposal(lane, context, ctx);
    await onEvent?.({
      kind: "proposal",
      proposal,
    });
    await onEvent?.({
      kind: "final",
      text: proposal.summary,
      citations: proposal.affected_records,
    });
    return {
      summary: proposal.summary,
      citations: proposal.affected_records,
      notifications: proposal.warnings.map((warning, index) => ({
        level: "warning",
        code: `parts_proposal_warning_${index + 1}`,
        title: "Review required",
        message: warning,
      })),
    };
  }

  if (lane === "menu_item_draft" || lane === "inspection_template_draft") {
    const proposal = await buildAuthoringProposal(lane, ctx);
    await onEvent?.({
      kind: "proposal",
      proposal,
    });
    await onEvent?.({
      kind: "final",
      text: proposal.summary,
      citations: proposal.affected_records,
    });
    return {
      summary: proposal.summary,
      citations: proposal.affected_records,
      notifications: proposal.warnings.map((warning, index) => ({
        level: "warning",
        code: `authoring_proposal_warning_${index + 1}`,
        title: "Review required",
        message: warning,
      })),
    };
  }

  if (
    lane === "smart_match_readiness" ||
    lane === "menu_item_efficiency_review" ||
    lane === "inspection_template_efficiency_review"
  ) {
    const proposal = await buildOpsIntelligenceProposal(lane, ctx);
    await onEvent?.({
      kind: "proposal",
      proposal,
    });

    await onEvent?.({
      kind: "plan",
      text: proposal.summary,
      citations: proposal.affected_records,
    });

    await onEvent?.({
      kind: "agent_result",
      summary: proposal.summary,
      citations: proposal.affected_records,
      notifications: proposal.warnings.map((warning, index) => ({
        level: "warning",
        code: `ops_intel_warning_${index + 1}`,
        title: "Review warning",
        message: warning,
      })),
    });
    return;
  }

  if (
    lane === "resolve_approval_queue" ||
    lane === "reschedule_booking" ||
    lane === "work_order_operations"
  ) {
    const proposal = buildOperationalProposal(lane, context);
    await onEvent?.({ kind: "proposal", proposal });
    await onEvent?.({
      kind: "final",
      text: proposal.summary,
      citations: proposal.affected_records,
    });
    return {
      summary: proposal.summary,
      citations: proposal.affected_records,
      notifications: proposal.warnings.map((warning, index) => ({
        level: "warning",
        code: `operational_proposal_warning_${index + 1}`,
        title: "Review before apply",
        message: warning,
      })),
    };
  }

  let parsed: ParsedPlan = {};
  try {
    parsed = await llmParseGoal(goal, context);
  } catch {
    // ignore parse errors
  }

  const lowerGoal = goal.toLowerCase();

  // 🔥 Extract structured hints from goal
  const inferredCustomer = extractCustomerFromGoal(goal);
  const inferredWO = extractWorkOrderFromGoal(goal);


  const customerQuery = inferredCustomer ??
    normalizeText(parsed.customerQuery) ??
    normalizeText(get<string>(context, "customerQuery"));

  const plateOrVin =
    normalizeText(parsed.plateOrVin) ??
    normalizeText(get<string>(context, "plateOrVin")) ??
    extractPlateOrVinFromGoal(goal);

  const customerId =
    normalizeText(parsed.customerId) ?? normalizeText(get<string>(context, "customerId"));

  const vehicleId =
    normalizeText(parsed.vehicleId) ?? normalizeText(get<string>(context, "vehicleId"));

  const workOrderId = inferredWO ??
    normalizeText(parsed.workOrderId) ??
    normalizeText(get<string>(context, "workOrderId")) ??
    normalizeText(get<string>(context, "id"));

  const bookingId =
    normalizeText(parsed.bookingId) ?? normalizeText(get<string>(context, "bookingId"));

  const requestedAction =
    parsed.action ??
    (lowerGoal.includes("last time") || lowerGoal.includes("last visit")
      ? "lookup_customer_history"
      : lowerGoal.includes("vehicle history")
        ? "lookup_vehicle_history"
        : lowerGoal.includes("reschedule") || lowerGoal.includes("move appointment")
          ? "reschedule_booking"
          : lowerGoal.includes("appointment") || lowerGoal.includes("booking")
            ? "lookup_bookings"
            : lowerGoal.includes("tech") && (lowerGoal.includes("working on") || lowerGoal.includes("doing"))
              ? "lookup_tech_work"
              : lowerGoal.includes("on hold") || lowerGoal.includes("status")
                ? "lookup_work_order_status"
                : lowerGoal.includes("too long") || lowerGoal.includes("stale")
                  ? "lookup_stale_work_orders"
                  : undefined);

  const notifications: NotificationItem[] = [];

  if (
    requestedAction === "lookup_customer_history" ||
    (mode === "ops" && customerQuery) ||
    (mode === "ops" && plateOrVin && !workOrderId && !bookingId)
  ) {
    const result = await runGetCustomerVisitHistory(
      {
        customerId,
        customerQuery,
        plateOrVin,
        limit: 10,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_vehicle_history") {
    const result = await runGetVehicleHistory(
      {
        vehicleId,
        customerQuery,
        plateOrVin,
        limit: 12,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_bookings") {
    const result = await runGetBookings(
      {
        customerId,
        customerQuery,
        plateOrVin,
        status: normalizeText(get<string>(context, "bookingStatus")),
        limit: 20,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "reschedule_booking" && bookingId && parsed.requestedStart) {
    const result = await runRescheduleBooking(
      {
        bookingId,
        startsAt: parsed.requestedStart,
        endsAt: parsed.requestedEnd,
        notes: parsed.notes,
      },
      ctx,
    );

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_tech_work") {
    const result = await runGetShopCurrentStatus({}, ctx);

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return result;
  }

  if (requestedAction === "lookup_work_order_status" && workOrderId) {
    const result = await runGetWorkOrderStatusSummary({ workOrderId }, ctx);

    notifications.push(...asNotifications(result.notifications));

    if (notifications.length > 0) {
      await onEvent?.({
        kind: "notifications",
        items: notifications,
      });
    }

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return {
      ...result,
      notifications,
    };
  }

  if (requestedAction === "lookup_stale_work_orders") {
    const result = await runGetStalledWorkOrders({}, ctx);

    notifications.push(...asNotifications(result.notifications));

    if (notifications.length > 0) {
      await onEvent?.({
        kind: "notifications",
        items: notifications,
      });
    }

    await onEvent?.({
      kind: "final",
      text: result.summary,
      citations: result.citations ?? [],
    });

    return {
      ...result,
      notifications,
    };
  }

  const allowCreate =
    get<boolean>(context, "allowCreate") === true ||
    get<boolean>(context, "allow_create") === true;

  let resolvedCustomerId = customerId;
  let resolvedVehicleId = vehicleId;

  if (!resolvedCustomerId || !resolvedVehicleId) {
    await onEvent?.({
      kind: "tool_call",
      name: "find_customer_vehicle",
      input: {
        customerQuery,
        plateOrVin,
      },
    });

    const found = await runFindCustomerVehicle(
      {
        customerQuery,
        plateOrVin,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "find_customer_vehicle",
      output: found,
    });

    resolvedCustomerId = resolvedCustomerId ?? found.customerId ?? undefined;
    resolvedVehicleId = resolvedVehicleId ?? found.vehicleId ?? undefined;

    if ((!resolvedCustomerId || !resolvedVehicleId) && !allowCreate) {
      const summary =
        "I could not safely continue because the customer/vehicle could not be resolved from existing records.";
      await onEvent?.({ kind: "final", text: summary });
      return { summary, citations: [], notifications: [] };
    }

    if (!resolvedCustomerId && allowCreate) {
      const name = customerQuery ?? "Customer";

      await onEvent?.({
        kind: "tool_call",
        name: "create_customer",
        input: { name },
      });

      const createdCustomer = await runCreateCustomer({ name }, ctx);
      resolvedCustomerId = createdCustomer.customerId;

      await onEvent?.({
        kind: "tool_result",
        name: "create_customer",
        output: createdCustomer,
      });
    }

    if (!resolvedVehicleId && allowCreate && resolvedCustomerId) {
      await onEvent?.({
        kind: "tool_call",
        name: "create_vehicle",
        input: {
          customerId: resolvedCustomerId,
          vin: plateOrVin,
          license_plate: plateOrVin,
        },
      });

      const createdVehicle = await runCreateVehicle(
        {
          customerId: resolvedCustomerId,
          vin: plateOrVin,
          license_plate: plateOrVin,
        },
        ctx,
      );

      resolvedVehicleId = createdVehicle.vehicleId;

      await onEvent?.({
        kind: "tool_result",
        name: "create_vehicle",
        output: createdVehicle,
      });
    }
  }

  if (
    (requestedAction === "create_work_order" || lowerGoal.includes("create work order")) &&
    resolvedCustomerId &&
    resolvedVehicleId
  ) {
    const orderType = coerceOrderType(parsed.orderType ?? get(context, "orderType"));

    await onEvent?.({
      kind: "tool_call",
      name: "create_work_order",
      input: {
        customerId: resolvedCustomerId,
        vehicleId: resolvedVehicleId,
        type: orderType,
        notes: parsed.notes ?? normalizeText(get<string>(context, "notes")),
      },
    });

    const created = await runCreateWorkOrder(
      {
        customerId: resolvedCustomerId,
        vehicleId: resolvedVehicleId,
        type: orderType,
        notes: parsed.notes ?? normalizeText(get<string>(context, "notes")),
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "create_work_order",
      output: created,
    });

    await onEvent?.({
      kind: "wo.created",
      workOrderId: created.workOrderId,
      customerId: resolvedCustomerId,
      vehicleId: resolvedVehicleId,
    });

    const summary = `Created work order ${created.workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: created.workOrderId,
          href: `/work-orders/${created.workOrderId}`,
          label: `Work order ${created.workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: created.workOrderId,
          href: `/work-orders/${created.workOrderId}`,
          label: `Work order ${created.workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "add_line" &&
    workOrderId &&
    normalizeText(parsed.lineDescription)
  ) {
    await onEvent?.({
      kind: "tool_call",
      name: "add_work_order_line",
      input: {
        workOrderId,
        description: parsed.lineDescription,
        jobType: coerceJobType(parsed.jobType),
        laborHours: typeof parsed.laborHours === "number" ? parsed.laborHours : 0,
        notes: parsed.lineNotes,
      },
    });

    const added = await runAddWorkOrderLine(
      {
        workOrderId,
        description: parsed.lineDescription!,
        jobType: coerceJobType(parsed.jobType),
        laborHours: typeof parsed.laborHours === "number" ? parsed.laborHours : 0,
        notes: parsed.lineNotes,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "add_work_order_line",
      output: added,
    });

    const summary = `Added a line to work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (requestedAction === "create_inspection" && workOrderId) {
    const inspectionTitle = parsed.notes ?? "Custom Inspection";

    await onEvent?.({
      kind: "tool_call",
      name: "create_custom_inspection",
      input: {
        workOrderId,
        title: inspectionTitle,
      },
    });

    const inspection = await runCreateCustomInspection(
      {
        workOrderId,
        title: inspectionTitle,
        selections: {},
        services: [],
        vehicleType: "car",
        includeAxle: false,
        includeOil: false,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "create_custom_inspection",
      output: inspection,
    });

    const summary = `Created a custom inspection for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/work-orders/${workOrderId}`,
          label: `Work order ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "email_invoice" &&
    workOrderId &&
    normalizeText(parsed.toEmail)
  ) {
    await onEvent?.({
      kind: "tool_call",
      name: "generate_invoice_html",
      input: { workOrderId },
    });

    const html = await runGenerateInvoiceHtml({ workOrderId }, ctx);

    await onEvent?.({
      kind: "tool_result",
      name: "generate_invoice_html",
      output: html,
    });

    await onEvent?.({
      kind: "tool_call",
      name: "email_invoice",
      input: {
        toEmail: parsed.toEmail,
        subject: parsed.subject ?? "Your invoice",
      },
    });

    const emailed = await runEmailInvoice(
      {
        toEmail: parsed.toEmail!,
        subject: parsed.subject ?? "Your invoice",
        html: html.html,
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "email_invoice",
      output: emailed,
    });

    const summary = `Invoice emailed for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "invoice",
          id: workOrderId,
          href: `/work-orders/invoice/${workOrderId}`,
          label: `Invoice ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "invoice",
          id: workOrderId,
          href: `/work-orders/invoice/${workOrderId}`,
          label: `Invoice ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  if (
    requestedAction === "approve_work_order" &&
    workOrderId &&
    parsed.approval
  ) {
    const approvalState:
      | "advisor_approved"
      | "rejected"
      | "pending" =
      parsed.approval === "approved"
        ? "advisor_approved"
        : parsed.approval === "rejected"
          ? "rejected"
          : "pending";

    await onEvent?.({
      kind: "tool_call",
      name: "record_work_order_approval",
      input: {
        workOrderId,
        method: "advisor",
        approvalState,
        approvedBy: ctx.userId,
        approvedAt: new Date().toISOString(),
      },
    });

    const approval = await runRecordWorkOrderApproval(
      {
        workOrderId,
        method: "advisor",
        approvalState,
        approvedBy: ctx.userId,
        approvedAt: new Date().toISOString(),
      },
      ctx,
    );

    await onEvent?.({
      kind: "tool_result",
      name: "record_work_order_approval",
      output: approval,
    });

    const summary = `Recorded ${approvalState} for work order ${workOrderId}.`;
    await onEvent?.({
      kind: "final",
      text: summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/quote-review/${workOrderId}`,
          label: `Approval ${workOrderId.slice(0, 8)}`,
        },
      ],
    });

    return {
      summary,
      citations: [
        {
          type: "work_order",
          id: workOrderId,
          href: `/quote-review/${workOrderId}`,
          label: `Approval ${workOrderId.slice(0, 8)}`,
        },
      ],
      notifications,
    };
  }

  const stale = await runGetStalledWorkOrders({}, ctx);
  const summary =
    "I couldn’t map that request to a specific action yet, so I checked for shop issues that may need attention.";

  const mergedNotifications = mergeNotifications(
    notifications,
    asNotifications(stale.notifications),
  );

  if (mergedNotifications.length > 0) {
    await onEvent?.({
      kind: "notifications",
      items: mergedNotifications,
    });
  }

  await onEvent?.({
    kind: "final",
    text: `${summary} ${stale.summary}`,
    citations: stale.citations ?? [],
  });

  return {
    summary: `${summary} ${stale.summary}`,
    citations: mergeCitations(stale.citations),
    notifications: mergedNotifications,
  };
}
