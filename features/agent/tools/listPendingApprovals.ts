import { z } from "zod";

import {
  isReviewableQuoteLine,
  REVIEWABLE_QUOTE_STAGES,
  REVIEWABLE_QUOTE_STATUSES,
} from "@/features/work-orders/lib/quotes/reviewableQuoteLines";
import { validatedAiSelect } from "../lib/aiQueryContract";
import { assertToolContext, type ToolContext } from "../lib/toolTypes";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

const LEGACY_PENDING_LINE_SELECT = validatedAiSelect("work_order_lines", [
  "id",
  "work_order_id",
  "description",
  "job_type",
  "labor_time",
  "price_estimate",
  "status",
  "approval_state",
  "notes",
  "created_at",
]);
const QUOTE_PENDING_LINE_SELECT = validatedAiSelect(
  "work_order_quote_lines",
  [
    "id",
    "work_order_id",
    "work_order_line_id",
    "description",
    "job_type",
    "labor_hours",
    "est_labor_hours",
    "labor_total",
    "parts_total",
    "subtotal",
    "grand_total",
    "status",
    "stage",
    "approved_at",
    "declined_at",
    "notes",
    "created_at",
  ],
);
const QUOTE_LINK_SELECT = validatedAiSelect("work_order_quote_lines", [
  "id",
  "work_order_line_id",
]);
const WORK_ORDER_IDENTITY_SELECT = [
  validatedAiSelect("work_orders", ["id", "custom_id"]),
  `customer:customers (${validatedAiSelect("customers", ["first_name", "last_name"])})`,
  `vehicle:vehicles (${validatedAiSelect("vehicles", [
    "year",
    "make",
    "model",
    "unit_number",
    "license_plate",
  ])})`,
].join(", ");

export const ListPendingApprovalsIn = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});
export type ListPendingApprovalsIn = z.infer<typeof ListPendingApprovalsIn>;

export const ListPendingApprovalsOut = z.object({
  items: z.array(
    z.object({
      workOrderId: z.string().uuid(),
      customId: z.string().nullable(),
      customerName: z.string().nullable(),
      vehicleSummary: z.string().nullable(),
      estimatedTotal: z.number().nullable(),
      lines: z.array(
        z.object({
          id: z.string().uuid(),
          description: z.string().nullable(),
          jobType: z.string().nullable(),
          laborTime: z.number().nullable(),
          status: z.string().nullable(),
          approvalState: z.string().nullable(),
          notes: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type ListPendingApprovalsOut = z.infer<typeof ListPendingApprovalsOut>;

type LegacyPendingLine = {
  id: string;
  work_order_id: string;
  description: string | null;
  job_type: string | null;
  labor_time: number | null;
  price_estimate: number | null;
  status: string | null;
  approval_state: string | null;
  notes: string | null;
  created_at: string | null;
};

type ReviewableQuoteLine = {
  id: string;
  work_order_id: string;
  work_order_line_id: string | null;
  description: string;
  job_type: string;
  labor_hours: number | null;
  est_labor_hours: number | null;
  labor_total: number | null;
  parts_total: number | null;
  subtotal: number | null;
  grand_total: number | null;
  status: string;
  stage: string | null;
  approved_at: string | null;
  declined_at: string | null;
  notes: string | null;
  created_at: string;
};

type QueryPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type WorkOrderIdentity = {
  id: string;
  custom_id: string | null;
  customer:
    | { first_name: string | null; last_name: string | null }
    | Array<{ first_name: string | null; last_name: string | null }>
    | null;
  vehicle:
    | {
        year: number | null;
        make: string | null;
        model: string | null;
        unit_number: string | null;
        license_plate: string | null;
      }
    | Array<{
        year: number | null;
        make: string | null;
        model: string | null;
        unit_number: string | null;
        license_plate: string | null;
      }>
    | null;
};

function finiteNumber(value: unknown): number | null {
  if (
    value == null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadLinkedLegacyLineIds(params: {
  supabase: ReturnType<typeof getServerSupabase>;
  shopId: string;
  workOrderLineIds: string[];
}): Promise<Set<string>> {
  const linked = new Set<string>();
  const uniqueIds = [...new Set(params.workOrderLineIds)];

  // Keep each PostgREST URL bounded while still handling legacy lines that
  // have more than one quote projection.
  for (let chunkStart = 0; chunkStart < uniqueIds.length; chunkStart += 100) {
    const chunk = uniqueIds.slice(chunkStart, chunkStart + 100);
    for (let from = 0; ; from += 500) {
      const { data, error } = await params.supabase
        .from("work_order_quote_lines")
        .select(QUOTE_LINK_SELECT)
        .eq("shop_id", params.shopId)
        .in("work_order_line_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + 499);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (row.work_order_line_id) linked.add(row.work_order_line_id);
      }
      if ((data ?? []).length < 500) break;
    }
  }

  return linked;
}

export function resolvePendingQuoteLineTotal(
  line: Pick<
    ReviewableQuoteLine,
    "grand_total" | "subtotal" | "labor_total" | "parts_total"
  >,
): number | null {
  const persisted =
    finiteNumber(line.grand_total) ?? finiteNumber(line.subtotal);
  if (persisted != null) return persisted;

  const labor = finiteNumber(line.labor_total);
  const parts = finiteNumber(line.parts_total);
  if (labor == null && parts == null) return null;
  return (labor ?? 0) + (parts ?? 0);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function isoTime(value: string | null): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

export const toolListPendingApprovals: ToolDef<
  ListPendingApprovalsIn,
  ListPendingApprovalsOut
> = {
  name: "list_pending_approvals",
  description:
    "Lists canonical quote lines and legacy work-order lines that are still awaiting review or approval in this shop.",
  inputSchema: ListPendingApprovalsIn,
  outputSchema: ListPendingApprovalsOut,
  async run(input, ctx) {
    assertToolContext(ctx);
    const supabase = getServerSupabase();
    const limit = input.limit ?? 20;
    const quoteReviewFilter = [
      `status.in.(${REVIEWABLE_QUOTE_STATUSES.join(",")})`,
      `stage.in.(${REVIEWABLE_QUOTE_STAGES.join(",")})`,
    ].join(",");

    // Find the oldest distinct work orders in each ordered source. Stopping
    // after `limit` distinct ids is exact: every later row in that source is
    // newer than at least `limit` already-seen work orders and therefore
    // cannot enter the merged oldest `limit`.
    const legacyCandidates: LegacyPendingLine[] = [];
    const quoteCandidates: ReviewableQuoteLine[] = [];
    const legacyWorkOrders = new Set<string>();
    const quoteWorkOrders = new Set<string>();
    let legacyDone = false;
    let quoteDone = false;
    for (let from = 0; !legacyDone || !quoteDone; from += 500) {
      const pages: unknown[] = await Promise.all([
        legacyDone
          ? Promise.resolve({ data: [] as LegacyPendingLine[], error: null })
          : supabase
              .from("work_order_lines")
              .select(LEGACY_PENDING_LINE_SELECT)
              .eq("shop_id", ctx.shopId)
              .eq("approval_state", "pending")
              .is("voided_at", null)
              .order("created_at", { ascending: true, nullsFirst: false })
              .order("id", { ascending: true })
              .range(from, from + 499),
        quoteDone
          ? Promise.resolve({ data: [] as ReviewableQuoteLine[], error: null })
          : supabase
              .from("work_order_quote_lines")
              .select(QUOTE_PENDING_LINE_SELECT)
              .eq("shop_id", ctx.shopId)
              .is("work_order_line_id", null)
              .is("approved_at", null)
              .is("declined_at", null)
              .or(quoteReviewFilter)
              .order("created_at", { ascending: true, nullsFirst: false })
              .order("id", { ascending: true })
              .range(from, from + 499),
      ]);
      const legacyPage = pages[0] as QueryPage<LegacyPendingLine>;
      const quotePage = pages[1] as QueryPage<ReviewableQuoteLine>;
      if (legacyPage.error) throw new Error(legacyPage.error.message);
      if (quotePage.error) throw new Error(quotePage.error.message);

      const legacyRows = (legacyPage.data ?? []) as LegacyPendingLine[];
      const quoteRows = (
        (quotePage.data ?? []) as ReviewableQuoteLine[]
      ).filter(isReviewableQuoteLine);
      const linkedOnPage = await loadLinkedLegacyLineIds({
        supabase,
        shopId: ctx.shopId,
        workOrderLineIds: legacyRows.map((row) => row.id),
      });
      const unlinkedLegacyRows = legacyRows.filter(
        (row) => !linkedOnPage.has(row.id),
      );
      legacyCandidates.push(...unlinkedLegacyRows);
      quoteCandidates.push(...quoteRows);
      unlinkedLegacyRows.forEach((row) =>
        legacyWorkOrders.add(row.work_order_id),
      );
      quoteRows.forEach((row) => quoteWorkOrders.add(row.work_order_id));
      legacyDone = legacyRows.length < 500 || legacyWorkOrders.size >= limit;
      quoteDone =
        (quotePage.data ?? []).length < 500 || quoteWorkOrders.size >= limit;
    }

    const oldestByWorkOrder = new Map<string, number>();
    for (const line of [...legacyCandidates, ...quoteCandidates]) {
      const existing = oldestByWorkOrder.get(line.work_order_id);
      const createdAt = isoTime(line.created_at);
      if (existing == null || createdAt < existing) {
        oldestByWorkOrder.set(line.work_order_id, createdAt);
      }
    }

    const workOrderIds = [...oldestByWorkOrder.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, limit)
      .map(([workOrderId]) => workOrderId);
    if (workOrderIds.length === 0) return { items: [] };

    // Reload every pending item for the selected work orders; the discovery
    // pass intentionally stops early once it can prove the oldest id set.
    const legacyLines: LegacyPendingLine[] = [];
    const quoteLines: ReviewableQuoteLine[] = [];
    const linkedLegacyLineIds = new Set<string>();
    for (let from = 0; ; from += 500) {
      const [legacyPage, quotePage, linkPage] = await Promise.all([
        supabase
          .from("work_order_lines")
          .select(LEGACY_PENDING_LINE_SELECT)
          .eq("shop_id", ctx.shopId)
          .in("work_order_id", workOrderIds)
          .eq("approval_state", "pending")
          .is("voided_at", null)
          .order("created_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + 499),
        supabase
          .from("work_order_quote_lines")
          .select(QUOTE_PENDING_LINE_SELECT)
          .eq("shop_id", ctx.shopId)
          .in("work_order_id", workOrderIds)
          .is("work_order_line_id", null)
          .is("approved_at", null)
          .is("declined_at", null)
          .or(quoteReviewFilter)
          .order("created_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, from + 499),
        supabase
          .from("work_order_quote_lines")
          .select(QUOTE_LINK_SELECT)
          .eq("shop_id", ctx.shopId)
          .in("work_order_id", workOrderIds)
          .not("work_order_line_id", "is", null)
          .order("id", { ascending: true })
          .range(from, from + 499),
      ]);
      if (legacyPage.error) throw new Error(legacyPage.error.message);
      if (quotePage.error) throw new Error(quotePage.error.message);
      if (linkPage.error) throw new Error(linkPage.error.message);

      legacyLines.push(...((legacyPage.data ?? []) as LegacyPendingLine[]));
      quoteLines.push(
        ...((quotePage.data ?? []) as ReviewableQuoteLine[]).filter(
          isReviewableQuoteLine,
        ),
      );
      for (const row of linkPage.data ?? []) {
        if (row.work_order_line_id)
          linkedLegacyLineIds.add(row.work_order_line_id);
      }
      if (
        (legacyPage.data ?? []).length < 500 &&
        (quotePage.data ?? []).length < 500 &&
        (linkPage.data ?? []).length < 500
      ) {
        break;
      }
    }

    const { data: workOrdersData, error: workOrdersError } = await supabase
      .from("work_orders")
      .select(WORK_ORDER_IDENTITY_SELECT)
      .eq("shop_id", ctx.shopId)
      .in("id", workOrderIds);
    if (workOrdersError) throw new Error(workOrdersError.message);

    const workOrderById = new Map(
      ((workOrdersData ?? []) as unknown as WorkOrderIdentity[]).map((row) => [
        row.id,
        row,
      ]),
    );
    const legacyByWorkOrder = new Map<string, LegacyPendingLine[]>();
    const quotesByWorkOrder = new Map<string, ReviewableQuoteLine[]>();

    for (const line of legacyLines) {
      if (!workOrderIds.includes(line.work_order_id)) continue;
      const rows = legacyByWorkOrder.get(line.work_order_id) ?? [];
      rows.push(line);
      legacyByWorkOrder.set(line.work_order_id, rows);
    }
    for (const line of quoteLines) {
      if (!workOrderIds.includes(line.work_order_id)) continue;
      const rows = quotesByWorkOrder.get(line.work_order_id) ?? [];
      rows.push(line);
      quotesByWorkOrder.set(line.work_order_id, rows);
    }

    const items: ListPendingApprovalsOut["items"] = [];
    for (const workOrderId of workOrderIds) {
      const workOrder = workOrderById.get(workOrderId);
      if (!workOrder) continue;

      const customer = one(workOrder.customer);
      const vehicle = one(workOrder.vehicle);
      const customerName = [customer?.first_name, customer?.last_name]
        .filter(Boolean)
        .join(" ");
      const vehicleSummary = [
        vehicle?.year,
        vehicle?.make,
        vehicle?.model,
        vehicle?.unit_number || vehicle?.license_plate,
      ]
        .filter(Boolean)
        .join(" ");
      const legacy = legacyByWorkOrder.get(workOrderId) ?? [];
      const quotes = quotesByWorkOrder.get(workOrderId) ?? [];
      const totals = [
        ...quotes.map(resolvePendingQuoteLineTotal),
        ...legacy
          .filter((line) => !linkedLegacyLineIds.has(line.id))
          .map((line) => finiteNumber(line.price_estimate)),
      ].filter((value): value is number => value != null);

      items.push({
        workOrderId,
        customId: workOrder.custom_id ?? null,
        customerName: customerName || null,
        vehicleSummary: vehicleSummary || null,
        estimatedTotal:
          totals.length > 0
            ? Math.round(totals.reduce((sum, total) => sum + total, 0) * 100) /
              100
            : null,
        lines: [
          ...quotes.map((line) => ({
            id: line.id,
            description: line.description ?? null,
            jobType: line.job_type ?? null,
            laborTime: line.labor_hours ?? line.est_labor_hours ?? null,
            status: line.status ?? line.stage ?? null,
            approvalState: "pending",
            notes: line.notes ?? null,
          })),
          ...legacy
            .filter((line) => !linkedLegacyLineIds.has(line.id))
            .map((line) => ({
              id: line.id,
              description: line.description ?? null,
              jobType: line.job_type ?? null,
              laborTime: line.labor_time ?? null,
              status: line.status ?? null,
              approvalState: line.approval_state ?? null,
              notes: line.notes ?? null,
            })),
        ],
      });
    }

    return { items };
  },
};

export async function runListPendingApprovals(
  input: ListPendingApprovalsIn,
  context: ToolContext,
): Promise<ListPendingApprovalsOut> {
  const validatedInput = ListPendingApprovalsIn.parse(input);
  const output = await toolListPendingApprovals.run(validatedInput, context);
  return ListPendingApprovalsOut.parse(output);
}
