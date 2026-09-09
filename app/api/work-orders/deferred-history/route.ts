export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
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
const TERMINAL_DECISIONS = new Set(["declined", "deferred", "customer_declined", "customer_deferred"]);
const RESOLVED_LINE_STATES = new Set(["completed", "ready_to_invoice", "invoiced"]);

function normalized(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function quoteDecision(row: QuoteLine): "declined" | "deferred" | null {
  const values = [row.status, row.stage, row.decision].map(normalized);
  if (values.some((value) => value === "deferred" || value === "customer_deferred")) return "deferred";
  if (values.some((value) => value === "declined" || value === "customer_declined")) return "declined";
  return null;
}

function quoteTimestamp(row: QuoteLine): string {
  return row.deferred_at ?? row.declined_at ?? row.updated_at ?? row.created_at;
}

function asRecord(value: Json | null): Record<string, Json | undefined> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, Json | undefined>;
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

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ALLOWED_ROLES });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const url = new URL(request.url);
  const vehicleId = await resolveVehicleId({
    admin,
    shopId: access.profile.shop_id,
    url,
  });

  if (!vehicleId) {
    return NextResponse.json(
      { ok: true, vehicleId: null, items: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data: quoteData, error: quoteError } = await admin
    .from("work_order_quote_lines")
    .select(
      "id,shop_id,work_order_id,work_order_line_id,source_work_order_line_id,source_row_id,vehicle_id,title,description,status,stage,decision,decline_reason,defer_reason,labor_total,parts_total,subtotal,tax_total,grand_total,metadata,declined_at,deferred_at,created_at,updated_at",
    )
    .eq("shop_id", access.profile.shop_id)
    .eq("vehicle_id", vehicleId)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (quoteError) {
    return NextResponse.json({ error: "Could not load previous recommendations." }, { status: 500 });
  }

  const quotes = (quoteData ?? []) as QuoteLine[];
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const lineIds = [
    ...new Set(
      quotes
        .flatMap((quote) => [quote.work_order_line_id, quote.source_work_order_line_id])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: lineData, error: lineError } = lineIds.length
    ? await admin
        .from("work_order_lines")
        .select("id,work_order_id,complaint,description,status,voided_at")
        .eq("shop_id", access.profile.shop_id)
        .in("id", lineIds)
    : { data: [], error: null };

  if (lineError) {
    return NextResponse.json({ error: "Could not load previous repair details." }, { status: 500 });
  }

  const lines = (lineData ?? []) as Array<
    Pick<WorkOrderLine, "id" | "work_order_id" | "complaint" | "description" | "status" | "voided_at">
  >;
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const resolvedRoots = new Set<string>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    const currentLine = quote.work_order_line_id ? lineById.get(quote.work_order_line_id) : null;
    if (rootId && currentLine && !currentLine.voided_at && RESOLVED_LINE_STATES.has(normalized(currentLine.status))) {
      resolvedRoots.add(rootId);
    }
  }

  const latestByRoot = new Map<string, QuoteLine>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    if (!rootId || resolvedRoots.has(rootId) || latestByRoot.has(rootId)) continue;
    const state = normalized(quote.stage) || normalized(quote.status) || normalized(quote.decision);
    const decision = quoteDecision(quote);
    if (!decision && !TERMINAL_DECISIONS.has(state)) continue;
    latestByRoot.set(rootId, quote);
  }

  const visibleQuotes = [...latestByRoot.entries()].map(([rootId, latest]) => {
    const metadata = asRecord(latest.metadata);
    const carried = metadata?.carry_forward === true;
    const original = carried && latest.source_row_id ? quoteById.get(latest.source_row_id) ?? latest : latest;
    return { rootId, latest, original };
  });

  const workOrderIds = [
    ...new Set(visibleQuotes.map(({ original }) => original.work_order_id).filter(Boolean)),
  ] as string[];
  const { data: workOrderData } = workOrderIds.length
    ? await admin
        .from("work_orders")
        .select("id,custom_id")
        .eq("shop_id", access.profile.shop_id)
        .in("id", workOrderIds)
    : { data: [] };
  const workOrderById = new Map(
    ((workOrderData ?? []) as Array<Pick<WorkOrder, "id" | "custom_id">>).map((row) => [row.id, row]),
  );

  const items = visibleQuotes
    .map(({ rootId, original }) => {
      const sourceLine = lineById.get(rootId);
      const decision = quoteDecision(original) ?? "deferred";
      return {
        rootLineId: rootId,
        quoteLineId: original.id,
        workOrderId: original.work_order_id,
        workOrderNumber: original.work_order_id
          ? workOrderById.get(original.work_order_id)?.custom_id ?? null
          : null,
        title:
          original.title?.trim() ||
          original.description?.trim() ||
          sourceLine?.description?.trim() ||
          sourceLine?.complaint?.trim() ||
          "Previous recommendation",
        complaint: sourceLine?.complaint ?? null,
        decision,
        decisionAt: quoteTimestamp(original),
        laborTotal: Number(original.labor_total ?? 0),
        partsTotal: Number(original.parts_total ?? 0),
        taxTotal: Number(original.tax_total ?? 0),
        grandTotal: Number(original.grand_total ?? 0),
      };
    })
    .sort((left, right) => right.decisionAt.localeCompare(left.decisionAt));

  return NextResponse.json(
    { ok: true, vehicleId, items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
