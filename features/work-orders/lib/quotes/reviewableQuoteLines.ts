import type { Database } from "@shared/types/types/supabase";

type QuoteLine = Pick<
  Database["public"]["Tables"]["work_order_quote_lines"]["Row"],
  "status" | "stage" | "approved_at" | "declined_at" | "work_order_line_id"
>;

const TERMINAL_QUOTE_STATUSES = new Set([
  "approved",
  "converted",
  "declined",
  "deferred",
  "rejected",
  "cancelled",
  "canceled",
  "superseded",
  "void",
]);

const TERMINAL_QUOTE_STAGES = new Set([
  "customer_approved",
  "customer_declined",
  "customer_deferred",
  "approved",
  "declined",
  "deferred",
  "converted",
  "materialized",
  "cancelled",
  "canceled",
  "superseded",
  "void",
]);

export const REVIEWABLE_QUOTE_STATUSES = [
  "pending_parts",
  "advisor_pending",
  "ready_to_send",
  "quoted",
  "sent",
] as const;

export const REVIEWABLE_QUOTE_STAGES = [
  "advisor_pending",
  "ready_to_send",
  "sent",
  "customer_review",
] as const;

const REVIEWABLE_STATUS_SET = new Set<string>(REVIEWABLE_QUOTE_STATUSES);
const REVIEWABLE_STAGE_SET = new Set<string>(REVIEWABLE_QUOTE_STAGES);

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isReviewableQuoteLine(line: QuoteLine): boolean {
  const status = norm(line.status);
  const stage = norm(line.stage);

  if (line.work_order_line_id) return false;
  if (line.approved_at || line.declined_at) return false;
  if (TERMINAL_QUOTE_STATUSES.has(status) || TERMINAL_QUOTE_STAGES.has(stage)) return false;

  return REVIEWABLE_STATUS_SET.has(status) || REVIEWABLE_STAGE_SET.has(stage);
}

export function quoteLineStageInventory(): string {
  return `reviewable stages: ${REVIEWABLE_QUOTE_STAGES.join(", ")}; reviewable statuses: ${REVIEWABLE_QUOTE_STATUSES.join(", ")}`;
}
