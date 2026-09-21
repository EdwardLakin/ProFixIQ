import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

const RESOLVED_LINE_STATES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
]);
const QUOTE_PAGE_SIZE = 500;

export type DeferredWorkItem = {
  rootLineId: string;
  quoteLineId: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  title: string;
  complaint: string | null;
  decision: "declined" | "deferred";
  decisionAt: string;
  laborTotal: number | null;
  partsTotal: number | null;
  taxTotal: number | null;
  grandTotal: number | null;
};

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

function isExcludedSource(
  row: Pick<WorkOrder, "source_intake_id" | "external_id"> | undefined,
): boolean {
  if (!row) return true;
  // source_intake_id is the repository's durable imported-history marker, and
  // matches the exclusion the carry-forward trigger applies. work_orders.type
  // only ever holds inspection/repair/maintenance, so it cannot identify an
  // import. Archival is a visibility state, not resolution -- it no longer
  // excludes a recommendation from carry-forward, and must not exclude it
  // here either.
  if (row.source_intake_id) return true;
  return String(row.external_id ?? "").startsWith("portal_quote:");
}

function findingKeyFor(quote: QuoteLine, rootId: string): string {
  const metadata = asRecord(quote.metadata);
  const identity = metadata?.inspection_finding_identity;
  return typeof identity === "string" && identity.trim() ? identity : rootId;
}

function recommendationKey(rootId: string, quote: QuoteLine): string {
  return `${rootId}::${findingKeyFor(quote, rootId)}`;
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

/**
 * Load a vehicle's still-relevant declined/deferred recommendation history:
 * the latest decision per recommendation root, excluding roots that have
 * since been resolved (completed elsewhere) or that only exist in archived
 * source data.
 *
 * This is used by the appointment-preparation projection (Phase 4). It is
 * intentionally a fresh copy of the logic in
 * `/api/work-orders/deferred-history/route.ts` rather than an extraction of
 * it: per this repository's additive-first change control, a shared-contract
 * refactor of that pre-existing route has to land as its own
 * compatible-integration PR with its own preserved-flow proof, not be bundled
 * inside this additive feature. Once that follow-up PR lands, the route
 * should be switched over to call this function instead of carrying its own
 * copy.
 */
export async function loadDeferredWorkHistoryForVehicle(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  vehicleId: string;
  canViewPricing: boolean;
}): Promise<{ items: DeferredWorkItem[]; error: string | null }> {
  const { admin, shopId, vehicleId, canViewPricing } = input;

  const quoteHistory = await loadVehicleQuoteHistory({ admin, shopId, vehicleId });
  if (quoteHistory.error) {
    return { items: [], error: "Could not load previous recommendations." };
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
        .eq("shop_id", shopId)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    return { items: [], error: "Could not load previous repair details." };
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
    Pick<WorkOrder, "id" | "custom_id" | "source_intake_id" | "external_id">
  >;
  try {
    workOrders = await loadRowsForIdChunks(workOrderIds, (ids, from, to) =>
      admin
        .from("work_orders")
        .select("id,custom_id,source_intake_id,external_id")
        .eq("shop_id", shopId)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    return { items: [], error: "Could not load previous work-order context." };
  }

  const workOrderById = new Map(workOrders.map((row) => [row.id, row]));
  // A recommendation's identity is (root line, finding). Inspection imports
  // give every finding from one inspection the same root (the inspection
  // anchor line) but a distinct metadata->>'inspection_finding_identity', the
  // same identity the carry-forward trigger groups and matches on. Keying
  // this reduction on the root alone collapsed multiple findings from one
  // inspection into whichever quote line sorted newest.
  const resolvedKeys = new Set<string>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    if (!rootId) continue;
    const key = recommendationKey(rootId, quote);

    const sourceLine = lineById.get(rootId);
    if (
      sourceLine &&
      !sourceLine.voided_at &&
      RESOLVED_LINE_STATES.has(normalized(sourceLine.status))
    ) {
      resolvedKeys.add(key);
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
      resolvedKeys.add(key);
    }
  }

  // Determine the newest state for every recommendation (root, finding) first.
  // Filtering to terminal decisions happens only after that reduction so a
  // newer approve/requote cannot be hidden by an older decline farther down
  // history.
  const latestByKey = new Map<string, { rootId: string; quote: QuoteLine }>();
  for (const quote of quotes) {
    const rootId = quote.source_work_order_line_id ?? quote.work_order_line_id;
    if (!rootId) continue;
    const key = recommendationKey(rootId, quote);
    if (resolvedKeys.has(key)) continue;

    const sourceLine = lineById.get(rootId);
    const sourceWorkOrder = sourceLine?.work_order_id
      ? workOrderById.get(sourceLine.work_order_id)
      : undefined;
    if (!sourceLine || sourceLine.voided_at || isExcludedSource(sourceWorkOrder)) {
      continue;
    }

    const existing = latestByKey.get(key);
    if (!existing) {
      latestByKey.set(key, { rootId, quote });
      continue;
    }

    const currentKey = `${quoteTimestamp(quote)}:${quote.id}`;
    const existingKey = `${quoteTimestamp(existing.quote)}:${existing.quote.id}`;
    if (currentKey > existingKey) latestByKey.set(key, { rootId, quote });
  }

  const visibleQuotes = [...latestByKey.values()]
    .filter(({ quote }) => quoteDecision(quote) !== null)
    .map(({ rootId, quote: latest }) => ({
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

  return { items, error: null };
}
