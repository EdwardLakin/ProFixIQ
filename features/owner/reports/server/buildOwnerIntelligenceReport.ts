import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import type {
  OwnerIntelligenceReport,
  OwnerReportComparison,
  OwnerReportFocusItem,
  OwnerReportRange,
  OwnerReportTechnician,
  OwnerReportTrendPoint,
} from "@/features/owner/reports/ownerIntelligenceTypes";

type DB = Database;

type InvoiceRow = Pick<
  DB["public"]["Tables"]["invoices"]["Row"],
  | "id"
  | "invoice_number"
  | "issued_at"
  | "total"
  | "labor_cost"
  | "parts_cost"
  | "status"
>;
type ExpenseRow = Pick<
  DB["public"]["Tables"]["expenses"]["Row"],
  "amount" | "created_at"
>;
type QuoteLineRow = Pick<
  DB["public"]["Tables"]["work_order_quote_lines"]["Row"],
  | "id"
  | "status"
  | "sent_to_customer_at"
  | "approved_at"
  | "declined_at"
  | "grand_total"
  | "subtotal"
>;
type PartRequestRow = Pick<
  DB["public"]["Tables"]["part_requests"]["Row"],
  "id" | "status" | "created_at" | "handoff_completed_at"
>;
type ProfileRow = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role"
>;
type CompletedLineRow = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "assigned_tech_id" | "labor_time" | "punched_out_at"
>;
type LaborSegmentRow = Pick<
  DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"],
  "technician_id" | "started_at" | "ended_at"
>;
type TimecardRow = Pick<
  DB["public"]["Tables"]["payroll_timecards"]["Row"],
  "user_id" | "clock_in" | "clock_out" | "hours_worked"
>;
type BoardCardRow = Pick<
  DB["public"]["Views"]["v_work_order_board_cards_shop"]["Row"],
  | "work_order_id"
  | "custom_id"
  | "overall_stage"
  | "has_waiting_parts"
  | "time_in_stage_seconds"
>;

type PaymentEventRow = {
  event_kind: string;
  amount: number | null;
  occurred_at: string;
};

type SummaryCacheRow = {
  summary_text: string;
  summary_source: string;
  generated_at: string;
};

type QueryError = { message: string };
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: QueryError | null }>;

type DynamicRangeQuery<T> = {
  range(from: number, to: number): QueryResult<T>;
};

type DynamicSelectQuery<T> = DynamicRangeQuery<T> & {
  eq(column: string, value: string): DynamicSelectQuery<T>;
  gte(column: string, value: string): DynamicSelectQuery<T>;
  lt(column: string, value: string): DynamicSelectQuery<T>;
  in(column: string, values: string[]): DynamicSelectQuery<T>;
  or(value: string): DynamicSelectQuery<T>;
  order(
    column: string,
    options: { ascending: boolean },
  ): DynamicSelectQuery<T>;
  limit(value: number): DynamicSelectQuery<T>;
  maybeSingle(): PromiseLike<{ data: T | null; error: QueryError | null }>;
};

type DynamicClient = {
  from(table: string): {
    select(columns: string): DynamicSelectQuery<unknown>;
  };
};

const PAGE_SIZE = 1_000;
const MAX_PAGES = 100;

function dynamicClient(supabase: SupabaseClient<DB>): DynamicClient {
  return supabase as unknown as DynamicClient;
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => QueryResult<T>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }

  throw new Error("Report query exceeded the safe pagination limit.");
}

function safeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100, 1);
}

function comparison(current: number, previous: number): OwnerReportComparison {
  return {
    current: round(current),
    previous: round(previous),
    delta: round(current - previous),
    deltaPct: previous > 0 ? round(((current - previous) / previous) * 100, 1) : null,
  };
}

function localDateKey(value: Date | string, timezone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to resolve shop-local date.");
  return `${year}-${month}-${day}`;
}

function utcDateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKey(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysToKey(key: string, days: number): string {
  const date = utcDateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function addMonthsToKey(key: string, months: number): string {
  const date = utcDateFromKey(key);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return dateKey(date);
}

function startKeyForRange(todayKey: string, range: OwnerReportRange): string {
  const date = utcDateFromKey(todayKey);

  if (range === "weekly") {
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + mondayOffset);
  } else if (range === "monthly") {
    date.setUTCDate(1);
  } else if (range === "quarterly") {
    date.setUTCDate(1);
    date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3);
  } else {
    date.setUTCMonth(0, 1);
  }

  return dateKey(date);
}

function previousStartKey(currentStartKey: string, range: OwnerReportRange): string {
  if (range === "weekly") return addDaysToKey(currentStartKey, -7);
  if (range === "monthly") return addMonthsToKey(currentStartKey, -1);
  if (range === "quarterly") return addMonthsToKey(currentStartKey, -3);
  return addMonthsToKey(currentStartKey, -12);
}

function nextStartKey(currentStartKey: string, range: OwnerReportRange): string {
  if (range === "weekly") return addDaysToKey(currentStartKey, 7);
  if (range === "monthly") return addMonthsToKey(currentStartKey, 1);
  if (range === "quarterly") return addMonthsToKey(currentStartKey, 3);
  return addMonthsToKey(currentStartKey, 12);
}

function rangeLabel(range: OwnerReportRange): string {
  if (range === "weekly") return "This week";
  if (range === "monthly") return "This month";
  if (range === "quarterly") return "This quarter";
  return "This year";
}

function previousRangeLabel(range: OwnerReportRange): string {
  if (range === "weekly") return "the same point last week";
  if (range === "monthly") return "the same point last month";
  if (range === "quarterly") return "the same point last quarter";
  return "the same point last year";
}

function periodBounds(
  range: OwnerReportRange,
  timezone: string,
  now: Date,
): {
  start: string;
  end: string;
  periodEnd: string;
  previousStart: string;
  previousEnd: string;
  currentStartKey: string;
} {
  const todayKey = localDateKey(now, timezone);
  const currentStartKey = startKeyForRange(todayKey, range);
  const previousKey = previousStartKey(currentStartKey, range);
  const currentStart = shopLocalDateTimeToUtc(currentStartKey, "00:00:00", timezone);
  const periodEnd = shopLocalDateTimeToUtc(
    nextStartKey(currentStartKey, range),
    "00:00:00",
    timezone,
  );
  const previousStart = shopLocalDateTimeToUtc(previousKey, "00:00:00", timezone);
  const previousBoundary = shopLocalDateTimeToUtc(
    currentStartKey,
    "00:00:00",
    timezone,
  );
  const elapsedMs = Math.max(0, now.getTime() - new Date(currentStart).getTime());
  const previousEndMs = Math.min(
    new Date(previousBoundary).getTime(),
    new Date(previousStart).getTime() + elapsedMs,
  );

  return {
    start: currentStart,
    end: now.toISOString(),
    periodEnd,
    previousStart,
    previousEnd: new Date(previousEndMs).toISOString(),
    currentStartKey,
  };
}

function inWindow(value: string | null, start: string, end: string): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(start).getTime() && timestamp < new Date(end).getTime();
}

function overlapHours(
  startedAt: string | null,
  endedAt: string | null,
  start: string,
  end: string,
  now: Date,
): number {
  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  const ended = endedAt ? new Date(endedAt).getTime() : now.getTime();
  const windowStart = new Date(start).getTime();
  const windowEnd = new Date(end).getTime();
  if (![started, ended, windowStart, windowEnd].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(ended, windowEnd) - Math.max(started, windowStart)) / 3_600_000;
}

function technicianRole(role: string | null): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return (
    normalized === "tech" ||
    normalized === "technician" ||
    normalized === "mechanic" ||
    normalized === "lead_hand" ||
    normalized === "foreman" ||
    normalized.includes("tech") ||
    normalized.includes("mechanic")
  );
}

function quoteDecisionAt(row: QuoteLineRow): string | null {
  return row.approved_at ?? row.declined_at;
}

function isDecision(row: QuoteLineRow): boolean {
  return Boolean(quoteDecisionAt(row));
}

function isDeclinedOrDeferred(row: QuoteLineRow): boolean {
  const status = row.status.trim().toLowerCase();
  return status.includes("declin") || status.includes("defer") || Boolean(row.declined_at);
}

function isPaymentPositive(eventKind: string): boolean {
  return eventKind === "payment_succeeded" || eventKind === "manual_payment";
}

function isPaymentNegative(eventKind: string): boolean {
  return eventKind === "refund_succeeded" || eventKind === "manual_reversal";
}

const EXCLUDED_INVOICE_STATUSES = new Set([
  "draft",
  "void",
  "voided",
  "cancelled",
  "canceled",
  "superseded",
]);

function isReportableInvoice(row: InvoiceRow): boolean {
  return !EXCLUDED_INVOICE_STATUSES.has((row.status ?? "").trim().toLowerCase());
}

export function aggregateFinancialWindow(
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  payments: PaymentEventRow[],
  start: string,
  end: string,
): {
  revenue: number;
  invoiceCount: number;
  averageRepairOrder: number;
  collected: number;
  knownCosts: number;
  knownContribution: number;
  costCoveredInvoices: number;
} {
  const issued = invoices.filter(
    (row) => isReportableInvoice(row) && inWindow(row.issued_at, start, end),
  );
  const revenue = issued.reduce((sum, row) => sum + safeNumber(row.total), 0);
  const invoiceCosts = issued.reduce(
    (sum, row) => sum + safeNumber(row.labor_cost) + safeNumber(row.parts_cost),
    0,
  );
  const periodExpenses = expenses
    .filter((row) => inWindow(row.created_at, start, end))
    .reduce((sum, row) => sum + safeNumber(row.amount), 0);
  const collected = payments
    .filter((row) => inWindow(row.occurred_at, start, end))
    .reduce((sum, row) => {
      if (isPaymentPositive(row.event_kind)) return sum + safeNumber(row.amount);
      if (isPaymentNegative(row.event_kind)) return sum - safeNumber(row.amount);
      return sum;
    }, 0);
  const costCoveredInvoices = issued.filter(
    (row) =>
      safeNumber(row.total) <= 0 ||
      safeNumber(row.labor_cost) > 0 ||
      safeNumber(row.parts_cost) > 0,
  ).length;
  const knownCosts = invoiceCosts + periodExpenses;

  return {
    revenue,
    invoiceCount: issued.length,
    averageRepairOrder: issued.length > 0 ? revenue / issued.length : 0,
    collected,
    knownCosts,
    knownContribution: revenue - knownCosts,
    costCoveredInvoices,
  };
}

export function buildOwnerReportTrend(
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  startKey: string,
  end: string,
  range: OwnerReportRange,
  timezone: string,
): OwnerReportTrendPoint[] {
  const monthly = range === "quarterly" || range === "yearly";
  const endKey = localDateKey(end, timezone);
  const buckets = new Map<string, OwnerReportTrendPoint>();
  let cursor = startKey;

  while (cursor <= endKey) {
    const key = monthly ? cursor.slice(0, 7) : cursor;
    if (!buckets.has(key)) {
      const date = utcDateFromKey(`${key}${monthly ? "-01" : ""}`);
      buckets.set(key, {
        key,
        label: monthly
          ? new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date)
          : range === "weekly"
            ? new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(date)
            : String(date.getUTCDate()),
        revenue: 0,
        issuedInvoices: 0,
        knownContribution: 0,
      });
    }
    cursor = monthly ? addMonthsToKey(cursor, 1) : addDaysToKey(cursor, 1);
  }

  for (const invoice of invoices) {
    if (!invoice.issued_at || !isReportableInvoice(invoice)) continue;
    const local = localDateKey(invoice.issued_at, timezone);
    const key = monthly ? local.slice(0, 7) : local;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const revenue = safeNumber(invoice.total);
    const costs = safeNumber(invoice.labor_cost) + safeNumber(invoice.parts_cost);
    bucket.revenue += revenue;
    bucket.knownContribution += revenue - costs;
    bucket.issuedInvoices += 1;
  }

  for (const expense of expenses) {
    const local = localDateKey(expense.created_at, timezone);
    const key = monthly ? local.slice(0, 7) : local;
    const bucket = buckets.get(key);
    if (bucket) bucket.knownContribution -= safeNumber(expense.amount);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    revenue: round(bucket.revenue),
    knownContribution: round(bucket.knownContribution),
  }));
}

function buildFocus(args: {
  revenue: OwnerReportComparison;
  costCoveragePct: number;
  awaitingApprovalCount: number;
  awaitingApprovalHours: number;
  waitingForPartsCount: number;
  waitingForPartsHours: number;
  readyToInvoiceCount: number;
  readyToInvoiceHours: number;
  productivityPct: number | null;
}): OwnerReportFocusItem[] {
  const items: OwnerReportFocusItem[] = [];

  if (args.waitingForPartsCount > 0) {
    items.push({
      id: "waiting_parts",
      title: "Parts are holding work",
      detail: `${args.waitingForPartsCount} work order${args.waitingForPartsCount === 1 ? "" : "s"} account for ${round(args.waitingForPartsHours, 1)} measured waiting hours.`,
      severity: args.waitingForPartsHours >= 24 ? "critical" : "watch",
      href: "/work-orders/board?stage=waiting_parts",
    });
  }

  if (args.awaitingApprovalCount > 0) {
    items.push({
      id: "awaiting_approval",
      title: "Customer decisions are pending",
      detail: `${args.awaitingApprovalCount} work order${args.awaitingApprovalCount === 1 ? "" : "s"} account for ${round(args.awaitingApprovalHours, 1)} measured approval-wait hours.`,
      severity: args.awaitingApprovalHours >= 24 ? "critical" : "watch",
      href: "/work-orders/board?stage=awaiting_approval",
    });
  }

  if (args.readyToInvoiceCount > 0) {
    items.push({
      id: "ready_to_invoice",
      title: "Completed work is waiting to bill",
      detail: `${args.readyToInvoiceCount} repair order${args.readyToInvoiceCount === 1 ? "" : "s"} account for ${round(args.readyToInvoiceHours, 1)} hours since technician completion.`,
      severity: args.readyToInvoiceHours >= 12 ? "critical" : "watch",
      href: "/work-orders/board?stage=ready_to_invoice",
    });
  }

  if (args.revenue.deltaPct != null && args.revenue.deltaPct < -5) {
    items.push({
      id: "revenue_down",
      title: "Issued revenue is behind pace",
      detail: `Issued revenue is ${Math.abs(args.revenue.deltaPct).toFixed(1)}% below ${"the equivalent prior period"}.`,
      severity: args.revenue.deltaPct <= -15 ? "critical" : "watch",
      href: "/dashboard/owner/reports?section=financial",
    });
  } else if (args.revenue.deltaPct != null && args.revenue.deltaPct >= 5) {
    items.push({
      id: "revenue_up",
      title: "Revenue pace improved",
      detail: `Issued revenue is ${args.revenue.deltaPct.toFixed(1)}% ahead of the equivalent prior period.`,
      severity: "positive",
      href: "/dashboard/owner/reports?section=financial",
    });
  }

  if (args.productivityPct != null && args.productivityPct < 65) {
    items.push({
      id: "productivity",
      title: "Attendance is not converting to job time",
      detail: `Technician productivity is ${args.productivityPct.toFixed(1)}%. Review unassigned, paused, training, and support time before drawing conclusions.`,
      severity: "watch",
      href: "/dashboard/workforce/attendance",
    });
  }

  if (args.costCoveragePct < 80) {
    items.push({
      id: "cost_coverage",
      title: "Margin confidence is limited",
      detail: `Only ${args.costCoveragePct.toFixed(0)}% of issued invoices have recorded labor or parts cost. Contribution is shown as known, not final profit.`,
      severity: "watch",
      href: "/dashboard/owner/reports?section=financial",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "stable",
      title: "No major exception dominates this period",
      detail: "The measured approval, parts, billing, revenue, and workforce signals are within their current watch thresholds.",
      severity: "positive",
      href: "/dashboard/owner/reports",
    });
  }

  return items
    .sort((a, b) => {
      const weight = { critical: 3, watch: 2, info: 1, positive: 0 };
      return weight[b.severity] - weight[a.severity];
    })
    .slice(0, 4);
}

export function deterministicExecutiveSummary(
  report: Omit<OwnerIntelligenceReport, "executiveSummary">,
): string {
  const revenueDelta = report.financial.issuedRevenue.deltaPct;
  const revenueSentence =
    revenueDelta == null
      ? `Issued revenue was $${report.financial.issuedRevenue.current.toLocaleString()} with no comparable prior-period baseline.`
      : `Issued revenue was $${report.financial.issuedRevenue.current.toLocaleString()}, ${Math.abs(revenueDelta).toFixed(1)}% ${revenueDelta >= 0 ? "ahead of" : "behind"} ${report.period.comparisonLabel}.`;

  const lostTime = [
    ["waiting for parts", report.workflow.waitingForPartsHours],
    ["awaiting customer approval", report.workflow.awaitingApprovalHours],
    ["on hold", report.workflow.onHoldHours],
    ["ready to invoice", report.workflow.readyToInvoiceHours],
  ] as const;
  const measuredHours = lostTime.reduce((sum, [, value]) => sum + value, 0);
  const largest = [...lostTime].sort((a, b) => b[1] - a[1])[0];
  const timeSentence =
    measuredHours > 0
      ? `ProFixIQ measured ${round(measuredHours, 1)} open delay hours; the largest visible category was ${largest[0]} at ${round(largest[1], 1)} hours.`
      : "No open approval, parts, on-hold, or ready-to-invoice delay hours were visible in the current workflow snapshot.";
  const workforceSentence =
    report.workforce.efficiencyPct == null
      ? "Technician efficiency is unavailable because no completed billed hours and job-clock evidence overlap this period."
      : `Technician efficiency was ${report.workforce.efficiencyPct.toFixed(1)}% and productivity was ${report.workforce.productivityPct?.toFixed(1) ?? "unavailable"}%.`;
  const confidenceSentence =
    report.confidence.warnings.length > 0
      ? `Confidence is ${report.confidence.level}; ${report.confidence.warnings[0]}`
      : `Confidence is ${report.confidence.level} across the included sources.`;

  return `${revenueSentence} ${timeSentence} ${workforceSentence} ${confidenceSentence}`;
}

function stableSnapshotHash(
  report: Omit<OwnerIntelligenceReport, "snapshotHash" | "generatedAt" | "executiveSummary">,
): string {
  const stableReport = {
    ...report,
    period: {
      range: report.period.range,
      start: report.period.start,
      end: report.period.end,
      previousStart: report.period.previousStart,
    },
  };
  return createHash("sha256").update(JSON.stringify(stableReport)).digest("hex");
}

async function readCachedSummary(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  range: OwnerReportRange;
  start: string;
  end: string;
  snapshotHash: string;
}): Promise<OwnerIntelligenceReport["executiveSummary"]> {
  const query = dynamicClient(args.supabase)
    .from("owner_report_summaries")
    .select("summary_text,summary_source,generated_at")
    .eq("shop_id", args.shopId)
    .eq("period_kind", args.range)
    .eq("period_start", args.start)
    .eq("period_end", args.end)
    .eq("snapshot_hash", args.snapshotHash)
    .order("generated_at", { ascending: false })
    .limit(1) as DynamicSelectQuery<SummaryCacheRow>;
  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return { text: null, source: null, generatedAt: null };
  }

  return {
    text: data.summary_text,
    source: data.summary_source === "ai" ? "cached_ai" : "cached_deterministic",
    generatedAt: data.generated_at,
  };
}

export async function buildOwnerIntelligenceReport(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  range: OwnerReportRange;
  now?: Date;
}): Promise<OwnerIntelligenceReport> {
  const now = args.now ?? new Date();
  const warnings: string[] = [];

  const { data: shop, error: shopError } = await args.supabase
    .from("shops")
    .select("id,name,shop_name,business_name,timezone,stripe_default_currency")
    .eq("id", args.shopId)
    .maybeSingle();
  if (shopError || !shop) throw new Error(shopError?.message ?? "Shop not found.");

  const timezone = shop.timezone?.trim() || "UTC";
  const bounds = periodBounds(args.range, timezone, now);
  const combinedStart = bounds.previousStart;

  const invoicePromise = fetchAllRows<InvoiceRow>((from, to) =>
    args.supabase
      .from("invoices")
      .select("id,invoice_number,issued_at,total,labor_cost,parts_cost,status")
      .eq("shop_id", args.shopId)
      .not("issued_at", "is", null)
      .gte("issued_at", combinedStart)
      .lt("issued_at", bounds.end)
      .range(from, to),
  );
  const expensePromise = fetchAllRows<ExpenseRow>((from, to) =>
    args.supabase
      .from("expenses")
      .select("amount,created_at")
      .eq("shop_id", args.shopId)
      .gte("created_at", combinedStart)
      .lt("created_at", bounds.end)
      .range(from, to),
  );
  const quotePromise = fetchAllRows<QuoteLineRow>((from, to) =>
    args.supabase
      .from("work_order_quote_lines")
      .select("id,status,sent_to_customer_at,approved_at,declined_at,grand_total,subtotal")
      .eq("shop_id", args.shopId)
      .not("sent_to_customer_at", "is", null)
      .gte("sent_to_customer_at", combinedStart)
      .lt("sent_to_customer_at", bounds.end)
      .range(from, to),
  );
  const partRequestPromise = fetchAllRows<PartRequestRow>((from, to) =>
    args.supabase
      .from("part_requests")
      .select("id,status,created_at,handoff_completed_at")
      .eq("shop_id", args.shopId)
      .gte("created_at", combinedStart)
      .lt("created_at", bounds.end)
      .range(from, to),
  );
  const profilePromise = fetchAllRows<ProfileRow>((from, to) =>
    args.supabase
      .from("profiles")
      .select("id,full_name,role")
      .eq("shop_id", args.shopId)
      .range(from, to),
  );
  const completedLinePromise = fetchAllRows<CompletedLineRow>((from, to) =>
    args.supabase
      .from("work_order_lines")
      .select("id,assigned_tech_id,labor_time,punched_out_at")
      .eq("shop_id", args.shopId)
      .in("status", ["completed", "ready_to_invoice", "invoiced"])
      .not("assigned_tech_id", "is", null)
      .not("punched_out_at", "is", null)
      .gte("punched_out_at", combinedStart)
      .lt("punched_out_at", bounds.end)
      .range(from, to),
  );
  const laborSegmentPromise = fetchAllRows<LaborSegmentRow>((from, to) =>
    args.supabase
      .from("work_order_line_labor_segments")
      .select("technician_id,started_at,ended_at")
      .eq("shop_id", args.shopId)
      .lt("started_at", bounds.end)
      .or(`ended_at.gte.${combinedStart},ended_at.is.null`)
      .range(from, to),
  );
  const timecardPromise = fetchAllRows<TimecardRow>((from, to) =>
    args.supabase
      .from("payroll_timecards")
      .select("user_id,clock_in,clock_out,hours_worked")
      .eq("shop_id", args.shopId)
      .lt("clock_in", bounds.end)
      .or(`clock_out.gte.${combinedStart},clock_out.is.null`)
      .range(from, to),
  );
  const boardPromise = fetchAllRows<BoardCardRow>((from, to) =>
    args.supabase
      .from("v_work_order_board_cards_shop")
      .select("work_order_id,custom_id,overall_stage,has_waiting_parts,time_in_stage_seconds")
      .eq("shop_id", args.shopId)
      .range(from, to),
  );
  const paymentPromise = fetchAllRows<PaymentEventRow>((from, to) =>
    (dynamicClient(args.supabase)
      .from("payment_events")
      .select("event_kind,amount,occurred_at")
      .eq("shop_id", args.shopId)
      .gte("occurred_at", combinedStart)
      .lt("occurred_at", bounds.end) as DynamicSelectQuery<PaymentEventRow>)
      .range(from, to),
  ).catch((error: unknown) => {
    warnings.push(
      `Collected revenue is unavailable: ${error instanceof Error ? error.message : "payment evidence could not be read"}.`,
    );
    return [] as PaymentEventRow[];
  });

  const [
    invoices,
    expenses,
    quoteLines,
    partRequests,
    profiles,
    completedLines,
    laborSegments,
    timecards,
    boardCards,
    paymentEvents,
  ] = await Promise.all([
    invoicePromise,
    expensePromise,
    quotePromise,
    partRequestPromise,
    profilePromise,
    completedLinePromise,
    laborSegmentPromise,
    timecardPromise,
    boardPromise,
    paymentPromise,
  ]);

  const currentFinance = aggregateFinancialWindow(
    invoices,
    expenses,
    paymentEvents,
    bounds.start,
    bounds.end,
  );
  const previousFinance = aggregateFinancialWindow(
    invoices,
    expenses,
    paymentEvents,
    bounds.previousStart,
    bounds.previousEnd,
  );
  const costCoveragePct =
    currentFinance.invoiceCount > 0
      ? round((currentFinance.costCoveredInvoices / currentFinance.invoiceCount) * 100, 1)
      : 100;
  if (currentFinance.invoiceCount > 0 && costCoveragePct < 100) {
    warnings.push(
      `${currentFinance.invoiceCount - currentFinance.costCoveredInvoices} issued invoice${currentFinance.invoiceCount - currentFinance.costCoveredInvoices === 1 ? "" : "s"} lack recorded labor and parts cost.`,
    );
  }

  const currentQuotes = quoteLines.filter((row) =>
    inWindow(row.sent_to_customer_at, bounds.start, bounds.end),
  );
  const decidedQuotes = currentQuotes.filter(isDecision);
  const approvalHours = decidedQuotes
    .map((row) => {
      const decisionAt = quoteDecisionAt(row);
      if (!row.sent_to_customer_at || !decisionAt) return null;
      return Math.max(
        0,
        (new Date(decisionAt).getTime() - new Date(row.sent_to_customer_at).getTime()) /
          3_600_000,
      );
    })
    .filter((value): value is number => value != null);
  const declinedDeferredValue = decidedQuotes
    .filter(isDeclinedOrDeferred)
    .reduce(
      (sum, row) => sum + safeNumber(row.grand_total ?? row.subtotal),
      0,
    );

  const awaitingApprovalCards = boardCards.filter(
    (row) => row.overall_stage === "awaiting_approval",
  );
  const waitingPartsCards = boardCards.filter(
    (row) => row.overall_stage === "waiting_parts" || row.has_waiting_parts === true,
  );
  const onHoldCards = boardCards.filter((row) => row.overall_stage === "on_hold");
  const readyToInvoiceCards = boardCards.filter(
    (row) => row.overall_stage === "ready_to_invoice",
  );
  const stageHours = (rows: BoardCardRow[]) =>
    rows.reduce((sum, row) => sum + safeNumber(row.time_in_stage_seconds) / 3_600, 0);

  const currentPartRequests = partRequests.filter((row) =>
    inWindow(row.created_at, bounds.start, bounds.end),
  );
  if (
    currentPartRequests.some(
      (row) => row.handoff_completed_at && new Date(row.handoff_completed_at) < new Date(row.created_at),
    )
  ) {
    warnings.push("At least one parts handoff timestamp predates its request and was excluded from duration reasoning.");
  }

  const techProfiles = profiles.filter((profile) => technicianRole(profile.role));
  const technicianMap = new Map<string, OwnerReportTechnician>();
  for (const profile of techProfiles) {
    technicianMap.set(profile.id, {
      technicianId: profile.id,
      name: profile.full_name?.trim() || "Unnamed technician",
      role: profile.role,
      completedLines: 0,
      billedHours: 0,
      jobClockHours: 0,
      attendanceHours: 0,
      efficiencyPct: null,
      productivityPct: null,
      proficiencyPct: null,
    });
  }

  for (const line of completedLines) {
    if (!inWindow(line.punched_out_at, bounds.start, bounds.end) || !line.assigned_tech_id) continue;
    const row = technicianMap.get(line.assigned_tech_id);
    if (!row) continue;
    row.completedLines += 1;
    row.billedHours += safeNumber(line.labor_time);
  }
  for (const segment of laborSegments) {
    const row = technicianMap.get(segment.technician_id);
    if (!row) continue;
    row.jobClockHours += overlapHours(
      segment.started_at,
      segment.ended_at,
      bounds.start,
      bounds.end,
      now,
    );
  }
  for (const timecard of timecards) {
    if (!timecard.user_id) continue;
    const row = technicianMap.get(timecard.user_id);
    if (!row) continue;
    row.attendanceHours += overlapHours(
      timecard.clock_in,
      timecard.clock_out,
      bounds.start,
      bounds.end,
      now,
    );
  }

  const technicians = [...technicianMap.values()]
    .map((row) => ({
      ...row,
      billedHours: round(row.billedHours, 1),
      jobClockHours: round(row.jobClockHours, 1),
      attendanceHours: round(row.attendanceHours, 1),
      efficiencyPct: percent(row.billedHours, row.jobClockHours),
      productivityPct: percent(row.jobClockHours, row.attendanceHours),
      proficiencyPct: percent(row.billedHours, row.attendanceHours),
    }))
    .sort((a, b) => b.billedHours - a.billedHours);
  const billedHours = technicians.reduce((sum, row) => sum + row.billedHours, 0);
  const jobClockHours = technicians.reduce((sum, row) => sum + row.jobClockHours, 0);
  const attendanceHours = technicians.reduce((sum, row) => sum + row.attendanceHours, 0);
  const completedLineCount = technicians.reduce((sum, row) => sum + row.completedLines, 0);

  if (billedHours > 0 && jobClockHours <= 0) {
    warnings.push("Billed hours exist without overlapping job-clock segments, so efficiency is unavailable.");
  }
  if (jobClockHours > 0 && attendanceHours <= 0) {
    warnings.push("Job-clock hours exist without overlapping attendance timecards, so productivity is unavailable.");
  }
  warnings.push(
    "Historical workflow-stage duration is not reconstructed where ProFixIQ lacks durable stage events; open delay hours use the current board stage timer.",
  );
  warnings.push(
    "Confirmed comeback reporting is unavailable until a canonical rework/comeback outcome is recorded.",
  );

  const issuedRevenue = comparison(currentFinance.revenue, previousFinance.revenue);
  const issuedInvoices = comparison(
    currentFinance.invoiceCount,
    previousFinance.invoiceCount,
  );
  const averageRepairOrder = comparison(
    currentFinance.averageRepairOrder,
    previousFinance.averageRepairOrder,
  );
  const collectedRevenue = comparison(
    currentFinance.collected,
    previousFinance.collected,
  );
  const knownContribution = comparison(
    currentFinance.knownContribution,
    previousFinance.knownContribution,
  );
  const productivityPct = percent(jobClockHours, attendanceHours);
  const focus = buildFocus({
    revenue: issuedRevenue,
    costCoveragePct,
    awaitingApprovalCount: awaitingApprovalCards.length,
    awaitingApprovalHours: stageHours(awaitingApprovalCards),
    waitingForPartsCount: waitingPartsCards.length,
    waitingForPartsHours: stageHours(waitingPartsCards),
    readyToInvoiceCount: readyToInvoiceCards.length,
    readyToInvoiceHours: stageHours(readyToInvoiceCards),
    productivityPct,
  });

  const confidenceScore = Math.max(
    20,
    Math.round(
      100 -
        (100 - costCoveragePct) * 0.35 -
        (warnings.some((warning) => warning.startsWith("Collected revenue")) ? 20 : 0) -
        (warnings.some((warning) => warning.startsWith("Billed hours")) ? 15 : 0) -
        10,
    ),
  );
  const confidenceLevel: OwnerIntelligenceReport["confidence"]["level"] =
    confidenceScore >= 85 ? "high" : confidenceScore >= 60 ? "medium" : "low";

  const reportWithoutHash = {
    metricVersion: "owner_intelligence_v1" as const,
    shop: {
      id: shop.id,
      name: shop.business_name ?? shop.shop_name ?? shop.name ?? "ProFixIQ shop",
      timezone,
      currency: shop.stripe_default_currency || "CAD",
    },
    period: {
      range: args.range,
      label: rangeLabel(args.range),
      start: bounds.start,
      end: bounds.periodEnd,
      previousStart: bounds.previousStart,
      previousEnd: bounds.previousEnd,
      comparisonLabel: previousRangeLabel(args.range),
    },
    financial: {
      issuedRevenue,
      issuedInvoices,
      averageRepairOrder,
      collectedRevenue,
      knownContribution,
      knownMarginPct: percent(currentFinance.knownContribution, currentFinance.revenue),
      knownCosts: round(currentFinance.knownCosts),
      costCoveragePct,
      costCoveredInvoices: currentFinance.costCoveredInvoices,
    },
    workflow: {
      averageApprovalHours:
        approvalHours.length > 0
          ? round(approvalHours.reduce((sum, value) => sum + value, 0) / approvalHours.length, 1)
          : null,
      approvalSamples: approvalHours.length,
      awaitingApprovalCount: awaitingApprovalCards.length,
      awaitingApprovalHours: round(stageHours(awaitingApprovalCards), 1),
      waitingForPartsCount: waitingPartsCards.length,
      waitingForPartsHours: round(stageHours(waitingPartsCards), 1),
      onHoldWorkOrders: onHoldCards.length,
      onHoldHours: round(stageHours(onHoldCards), 1),
      readyToInvoiceCount: readyToInvoiceCards.length,
      readyToInvoiceHours: round(stageHours(readyToInvoiceCards), 1),
    },
    workforce: {
      billedHours: round(billedHours, 1),
      jobClockHours: round(jobClockHours, 1),
      attendanceHours: round(attendanceHours, 1),
      efficiencyPct: percent(billedHours, jobClockHours),
      productivityPct,
      proficiencyPct: percent(billedHours, attendanceHours),
      completedLines: completedLineCount,
      technicians,
    },
    quality: {
      approvalRatePct: percent(decidedQuotes.length, currentQuotes.length),
      decidedQuoteLines: decidedQuotes.length,
      sentQuoteLines: currentQuotes.length,
      declinedDeferredValue: round(declinedDeferredValue),
      confirmedComebacks: null,
    },
    trend: buildOwnerReportTrend(
      invoices.filter((row) => inWindow(row.issued_at, bounds.start, bounds.end)),
      expenses.filter((row) => inWindow(row.created_at, bounds.start, bounds.end)),
      bounds.currentStartKey,
      bounds.end,
      args.range,
      timezone,
    ),
    focus,
    confidence: {
      level: confidenceLevel,
      score: confidenceScore,
      warnings,
      definitions: [
        "Issued revenue: invoice total dated by invoices.issued_at. Import time is never used.",
        "Known contribution: issued revenue minus recorded invoice labor cost, recorded invoice parts cost, and period expenses. It is not labeled profit.",
        "Technician efficiency: billed hours divided by job-clock hours.",
        "Technician productivity: job-clock hours divided by attendance hours.",
        "Overall proficiency: billed hours divided by attendance hours.",
        "Open delay hours: the current board time in the approval, parts, hold, or ready-to-invoice stage. These categories are not added to technician touch time.",
      ],
    },
  };
  const snapshotHash = stableSnapshotHash(reportWithoutHash);
  const executiveSummary = await readCachedSummary({
    supabase: args.supabase,
    shopId: args.shopId,
    range: args.range,
    start: bounds.start,
    end: bounds.periodEnd,
    snapshotHash,
  });

  return {
    ...reportWithoutHash,
    snapshotHash,
    generatedAt: now.toISOString(),
    executiveSummary,
  };
}
