export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "lead_hand",
  "foreman",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const RESOLVED_LINE_STATES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
]);
const QUOTE_PAGE_SIZE = 500;

function normalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function quoteDecision(row: QuoteLine): "declined" | "deferred" | null {
  const values = [row.status, row.stage, row.decision].map(normalized);
  if (
    values.some(
      (value) => value === "deferred" || value === "customer_deferred",
    )
  )
    return "deferred";
  if (
    values.some(
      (value) => value === "declined" || value === "customer_declined",
    )
  )
    return "declined";
  return null;
}

function quoteTimestamp(row: QuoteLine): string {
  return row.deferred_at ?? row.declined_at ?? row.updated_at ?? row.created_at;
}

function asRecord(value: Json | null): Record<string, Json | undefined> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, Json | undefined>;
}

function isArchivedSource(
  row:
    | Pick<WorkOrder, "archived_at" | "source_intake_id" | "external_id">
    | undefined,
): boolean {
  if (!row) return true;
  if (row.archived_at) return true;
  // source_intake_id is the repository's durable imported-history marker, and
  // matches the exclusion the carry-forward trigger applies. work_orders.type
  // only ever holds inspection/repair/maintenance, so it cannot identify an
  // import.
  if (row.source_intake_id) return true;
  return String(row.external_id ?? "").startsWith("portal_quote:");
}

function originalQuoteForDisplay(
  latest: QuoteLine,
  quoteById: Map<string, QuoteLine>,
): QuoteLine {
  let current = latest;
  const seen = new Set<string>();

  while (!seen.has(current.id)) {
    seen.add(current.id);
    const metadata = asRecord(current.metadata);
    if (metadata?.carry_forward !== true || !current.source_row_id) break;
    const parent = quoteById.get(current.source_row_id);
    if (!parent) break;
    current = parent;
  }

  return current;
}

async function resolveVehicleId(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  url: URL;
}): Promise<string | null> {
  const requested = input.url.searchParams.get("vehicleId")?.trim() ?? "";
  if (requested) {
    if (!UUID_PATTERN.test(requested)) return null;
    const { data } = await input.admin
      .from("vehicles")
      .select("id")
      .eq("id", requested)
      .eq("shop_id", input.shopId)
      .maybeSingle<Pick<Vehicle, "id">>();
    return data?.id ?? null;
  }

  const vin = input.url.searchParams.get("vin")?.trim() ?? "";
  const plate = input.url.searchParams.get("plate")?.trim() ?? "";
  const unit = input.url.searchParams.get("unit")?.trim() ?? "";
  if (!vin && !plate && !unit) return null;

  let query = input.admin
    .from("vehicles")
    .select("id")
    .eq("shop_id", input.shopId)
    .limit(2);

  if (vin) query = query.eq("vin", vin);
  else if (plate) query = query.eq("license_plate", plate);
  else query = query.eq("unit_number", unit);

  const { data, error } = await query;
  if (error || !data || data.length !== 1) return null;
  return (data[0] as Pick<Vehicle, "id">).id;
}

async function loadVehicleQuoteHistory(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  vehicleId: string;
}): Promise<{ quotes: QuoteLine[]; error: string | null }> {
  const quotes: QuoteLine[] = [];

  for (let from = 0; ; from += QUOTE_PAGE_SIZE) {
    const { data, error } = await input.admin
      .from("work_order_quote_lines")
      .select(
        "id,shop_id,work_order_id,work_order_line_id,source_work_order_line_id,source_row_id,vehicle_id,title,description,status,stage,decision,decline_reason,defer_reason,labor_total,parts_total,subtotal,tax_total,grand_total,metadata,declined_at,deferred_at,created_at,updated_at",
      )
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.vehicleId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + QUOTE_PAGE_SIZE - 1);

    if (error) return { quotes: [], error: error.message };

    const page = (data ?? []) as QuoteLine[];
    quotes.push(...page);
    if (page.length < QUOTE_PAGE_SIZE) break;
  }

  return { quotes, error: null };
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ALLOWED_ROLES });
  if (!access.ok) return access.response;

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: access.supabase,
    profileId: access.profile.id,
    shopId: access.profile.shop_id,
  });
  if (financial.error) {
    return NextResponse.json(
      { error: "Workspace authorization could not be resolved." },
      { status: 500 },
    );
  }

  const canViewPricing = financial.access.canViewSellPricing;
  const admin = createAdminSupabase();
  const url = new URL(request.url);
  const vehicleId = await resolveVehicleId({
    admin,
    shopId: access.profile.shop_id,
    url,
  });

  if (!vehicleId) {
    return NextResponse.json(
      { ok: true, vehicleId: null, canViewPricing, items: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const quoteHistory = await loadVehicleQuoteHistory({
    admin,
    shopId: access.profile.shop_id,
    vehicleId,
  });
  if (quoteHistory.error) {
    return NextResponse.json(
      { error: "Could not load previous recommendations." },
      { status: 500 },
    );
  }

  const quotes = quoteHistory.quotes;
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const lineIds = [
    ...new Set(
      quotes
        .flatMap((quote) => [
          quote.work_order_line_id,
          quote.source_work_order_line_id,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let lines: Array<
    Pick<
      WorkOrderLine,
      | "id"
      | "work_order_id"
      | "complaint"
      | "description"
      | "status"
      | "voided_at"
    >
  >;
  try {
    lines = await loadRowsForIdChunks(lineIds, (ids, from, to) =>
      admin
        .from("work_order_lines")
        .select("id,work_order_id,complaint,description,status,voided_at")
        .eq("shop_id", access.profile.shop_id)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load previous repair details." },
      { status: 500 },
    );
  }

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const workOrderIds = [
    ...new Set(
      [
        ...quotes.map((quote) => quote.work_order_id),
        ...lines.map((line) => line.work_order_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  let workOrders: Array<
    Pick<
      WorkOrder,
      "id" | "custom_id" | "source_intake_id" | "external_id" | "archived_at"
    >
  >;
  try {
    workOrders = await loadRowsForIdChunks(workOrderIds, (ids, from, to) =>
      admin
        .from("work_orders")
        .select("id,custom_id,source_intake_id,external_id,archived_at")
        .eq("shop_id", access.profile.shop_id)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load previous work-order context." },
      { status: 500 },
    );
  }

  const workOrderById = new Map(workOrders.map((row) => [row.id, row]));
  const resolvedRoots = new Set<string>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    if (!rootId) continue;

    const sourceLine = lineById.get(rootId);
    if (
      sourceLine &&
      !sourceLine.voided_at &&
      RESOLVED_LINE_STATES.has(normalized(sourceLine.status))
    ) {
      resolvedRoots.add(rootId);
      continue;
    }

    const currentLine = quote.work_order_line_id
      ? lineById.get(quote.work_order_line_id)
      : null;
    if (
      currentLine &&
      !currentLine.voided_at &&
      RESOLVED_LINE_STATES.has(normalized(currentLine.status))
    ) {
      resolvedRoots.add(rootId);
    }
  }

  // Determine the newest state for every recommendation root first. Filtering
  // to terminal decisions happens only after that reduction so a newer
  // approve/requote cannot be hidden by an older decline farther down history.
  const latestByRoot = new Map<string, QuoteLine>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    if (!rootId || resolvedRoots.has(rootId)) continue;

    const sourceLine = lineById.get(rootId);
    const sourceWorkOrder = sourceLine?.work_order_id
      ? workOrderById.get(sourceLine.work_order_id)
      : undefined;
    if (!sourceLine || sourceLine.voided_at || isArchivedSource(sourceWorkOrder)) {
      continue;
    }

    const existing = latestByRoot.get(rootId);
    if (!existing) {
      latestByRoot.set(rootId, quote);
      continue;
    }

    const currentKey = `${quoteTimestamp(quote)}:${quote.id}`;
    const existingKey = `${quoteTimestamp(existing)}:${existing.id}`;
    if (currentKey > existingKey) latestByRoot.set(rootId, quote);
  }

  const visibleQuotes = [...latestByRoot.entries()]
    .filter(([, latest]) => quoteDecision(latest) !== null)
    .map(([rootId, latest]) => ({
      rootId,
      latest,
      original: originalQuoteForDisplay(latest, quoteById),
    }));

  const items = visibleQuotes
    .map(({ rootId, latest, original }) => {
      const sourceLine = lineById.get(rootId);
      const decision = quoteDecision(latest) ?? "deferred";
      const originalWorkOrder = original.work_order_id
        ? workOrderById.get(original.work_order_id)
        : undefined;

      return {
        rootLineId: rootId,
        quoteLineId: original.id,
        workOrderId: original.work_order_id,
        workOrderNumber: originalWorkOrder?.custom_id ?? null,
        title:
          original.title?.trim() ||
          original.description?.trim() ||
          sourceLine?.description?.trim() ||
          sourceLine?.complaint?.trim() ||
          "Previous recommendation",
        complaint: sourceLine?.complaint ?? null,
        decision,
        decisionAt: quoteTimestamp(original),
        laborTotal: canViewPricing ? Number(original.labor_total ?? 0) : null,
        partsTotal: canViewPricing ? Number(original.parts_total ?? 0) : null,
        taxTotal: canViewPricing ? Number(original.tax_total ?? 0) : null,
        grandTotal: canViewPricing ? Number(original.grand_total ?? 0) : null,
      };
    })
    .sort((left, right) => right.decisionAt.localeCompare(left.decisionAt));

  return NextResponse.json(
    { ok: true, vehicleId, canViewPricing, items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
