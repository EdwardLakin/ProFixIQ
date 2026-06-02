import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import {
  relinkQuoteLinePartsToWorkOrderLine,
  type RelinkQuoteLinePartsResult,
} from "@/features/parts/server/relinkQuoteLinePartsToWorkOrderLine";

type DB = Database;
type Json = DB["public"]["Tables"]["work_order_quote_lines"]["Row"]["metadata"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;
type WorkOrderUpdate = DB["public"]["Tables"]["work_orders"]["Update"];

export type QuoteApprovalDecision = "approve" | "decline" | "defer";

const APPROVABLE_STATUSES = new Set([
  "sent",
  "ready_to_send",
  "quoted",
  "approved",
  "converted",
]);
const NON_APPROVABLE_STATUSES = new Set([
  "declined",
  "deferred",
  "rejected",
  "cancelled",
]);

function emptyPartRelinkResult(): RelinkQuoteLinePartsResult {
  return {
    partRequestsRelinked: 0,
    partRequestItemsRelinked: 0,
    partRequestsAlreadyLinked: 0,
    partRequestItemsAlreadyLinked: 0,
    conflicts: [],
  };
}

function mergePartRelinkResult(
  target: RelinkQuoteLinePartsResult,
  source: RelinkQuoteLinePartsResult,
): void {
  target.partRequestsRelinked += source.partRequestsRelinked;
  target.partRequestItemsRelinked += source.partRequestItemsRelinked;
  target.partRequestsAlreadyLinked += source.partRequestsAlreadyLinked;
  target.partRequestItemsAlreadyLinked += source.partRequestItemsAlreadyLinked;
  target.conflicts.push(...source.conflicts);
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function quoteMetadata(
  line: Pick<QuoteLineRow, "metadata">,
): Record<string, unknown> {
  if (
    !line.metadata ||
    typeof line.metadata !== "object" ||
    Array.isArray(line.metadata)
  )
    return {};
  return line.metadata as Record<string, unknown>;
}

function mergeMetadata(
  line: QuoteLineRow,
  patch: Record<string, unknown>,
): Json {
  return {
    ...quoteMetadata(line),
    ...patch,
  } as Json;
}

function getPartsFromMetadata(line: QuoteLineRow): unknown[] {
  const parts = quoteMetadata(line).parts;
  return Array.isArray(parts) ? parts : [];
}

function describeParts(parts: unknown[]): string | null {
  const labels = parts
    .filter(
      (part): part is Record<string, unknown> =>
        Boolean(part) && typeof part === "object" && !Array.isArray(part),
    )
    .map(
      (part) =>
        safeTrim(part.name) ||
        safeTrim(part.description) ||
        safeTrim(part.part_number) ||
        safeTrim(part.sku),
    )
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : null;
}

function decisionPatch(params: {
  line: QuoteLineRow;
  decision: QuoteApprovalDecision;
  actorUserId: string;
  customerId: string | null;
  now: string;
  materializedWorkOrderLineId?: string | null;
}): DB["public"]["Tables"]["work_order_quote_lines"]["Update"] {
  const {
    line,
    decision,
    actorUserId,
    customerId,
    now,
    materializedWorkOrderLineId,
  } = params;
  const baseAudit = {
    customer_decision: decision,
    customer_decision_at: now,
    customer_actor_user_id: actorUserId,
    customer_id: customerId,
  };

  if (decision === "approve") {
    return {
      status: "converted",
      stage: "customer_approved",
      approved_at: line.approved_at ?? now,
      declined_at: null,
      work_order_line_id:
        materializedWorkOrderLineId ?? line.work_order_line_id,
      metadata: mergeMetadata(line, {
        ...baseAudit,
        materialized_work_order_line_id:
          materializedWorkOrderLineId ?? line.work_order_line_id ?? null,
      }),
      updated_at: now,
    };
  }

  if (decision === "decline") {
    return {
      status: "declined",
      stage: "customer_declined",
      declined_at: line.declined_at ?? now,
      metadata: mergeMetadata(line, baseAudit),
      updated_at: now,
    };
  }

  return {
    status: "deferred",
    stage: "customer_deferred",
    declined_at: null,
    metadata: mergeMetadata(line, baseAudit),
    updated_at: now,
  };
}

async function findExistingMaterializedLine(params: {
  supabase: SupabaseClient<DB>;
  line: QuoteLineRow;
}): Promise<{ id: string | null; error: Error | null }> {
  const { supabase, line } = params;
  if (line.work_order_line_id)
    return { id: line.work_order_line_id, error: null };

  const externalId = `quote_line:${line.id}`;
  const { data, error } = await supabase
    .from("work_order_lines")
    .select("id")
    .eq("shop_id", line.shop_id)
    .eq("work_order_id", line.work_order_id)
    .or(`external_id.eq.${externalId},source_row_id.eq.${line.id}`)
    .limit(1);

  if (error) return { id: null, error: new Error(error.message) };
  return { id: data?.[0]?.id ?? null, error: null };
}

async function materializeQuoteLine(params: {
  supabase: SupabaseClient<DB>;
  line: QuoteLineRow;
  actorUserId: string;
  now: string;
}): Promise<{ id: string | null; error: Error | null }> {
  const { supabase, line, actorUserId, now } = params;
  const existing = await findExistingMaterializedLine({ supabase, line });
  if (existing.error || existing.id) return existing;

  const metadata = quoteMetadata(line);
  const parts = getPartsFromMetadata(line);
  const lineTotal =
    asNumber(line.grand_total) ??
    asNumber(line.subtotal) ??
    (asNumber(line.labor_total) ?? 0) + (asNumber(line.parts_total) ?? 0);
  const laborHours =
    asNumber(line.labor_hours) ?? asNumber(line.est_labor_hours);

  const insertLine: WorkOrderLineInsert = {
    shop_id: line.shop_id,
    work_order_id: line.work_order_id,
    vehicle_id: line.vehicle_id,
    description:
      safeTrim(line.description) ||
      safeTrim(line.ai_complaint) ||
      "Approved quote line",
    job_type: safeTrim(line.job_type) || "repair",
    status: "in_progress",
    line_status: "authorized",
    approval_state: "approved",
    approval_at: now,
    approval_by: actorUserId,
    quoted_at: line.sent_to_customer_at ?? line.created_at ?? now,
    labor_time: laborHours,
    price_estimate: lineTotal,
    complaint:
      safeTrim(line.ai_complaint) ||
      safeTrim(line.notes) ||
      safeTrim(line.description) ||
      null,
    cause: safeTrim(line.ai_cause) || null,
    correction: safeTrim(line.ai_correction) || null,
    notes: safeTrim(line.notes) || null,
    parts: describeParts(parts),
    parts_needed:
      parts.length > 0 ? (parts as WorkOrderLineInsert["parts_needed"]) : null,
    external_id: `quote_line:${line.id}`,
    source_row_id: line.id,
    source_intake_id: safeTrim(metadata.source_inspection_id) || null,
    intake_json: {
      source: "work_order_quote_lines",
      quote_line_id: line.id,
      quote_line_metadata: metadata,
      customer_approved_at: now,
      customer_approved_by: actorUserId,
      labor_total: line.labor_total,
      parts_total: line.parts_total,
      subtotal: line.subtotal,
      tax_total: line.tax_total,
      grand_total: line.grand_total,
    } as WorkOrderLineInsert["intake_json"],
  };

  const { data: inserted, error } = await supabase
    .from("work_order_lines")
    .insert(insertLine)
    .select("id")
    .single();

  if (error) return { id: null, error: new Error(error.message) };
  return { id: inserted?.id ?? null, error: null };
}

async function rollupWorkOrderQuoteApprovalState(params: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
  now: string;
  actorUserId: string;
}): Promise<{ state: string | null; error: Error | null }> {
  const { supabase, workOrderId, shopId, now, actorUserId } = params;
  const { data, error } = await supabase
    .from("work_order_quote_lines")
    .select(
      "status, stage, approved_at, declined_at, work_order_line_id, sent_to_customer_at",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId);

  if (error) return { state: null, error: new Error(error.message) };

  const customerVisibleLines = (data ?? []).filter((line) => {
    const status = safeTrim(
      (line as { status?: unknown }).status,
    ).toLowerCase();
    return (
      Boolean(
        (line as { sent_to_customer_at?: unknown }).sent_to_customer_at,
      ) ||
      status === "sent" ||
      status === "approved" ||
      status === "converted" ||
      status === "declined" ||
      status === "deferred"
    );
  });

  let approved = 0;
  let declinedDeferred = 0;
  let pending = 0;

  for (const line of customerVisibleLines) {
    const status = safeTrim(
      (line as { status?: unknown }).status,
    ).toLowerCase();
    const stage = safeTrim((line as { stage?: unknown }).stage).toLowerCase();
    if (
      status === "approved" ||
      status === "converted" ||
      stage === "customer_approved" ||
      (line as { approved_at?: unknown }).approved_at ||
      (line as { work_order_line_id?: unknown }).work_order_line_id
    ) {
      approved += 1;
    } else if (
      status === "declined" ||
      status === "deferred" ||
      stage === "customer_declined" ||
      stage === "customer_deferred" ||
      (line as { declined_at?: unknown }).declined_at
    ) {
      declinedDeferred += 1;
    } else {
      pending += 1;
    }
  }

  let approvalState: WorkOrderUpdate["approval_state"] = "pending";
  if (approved > 0 && pending === 0 && declinedDeferred === 0)
    approvalState = "approved";
  else if (approved > 0) approvalState = "partial";
  else if (approved === 0 && pending === 0 && declinedDeferred > 0)
    approvalState = "declined";

  const patch: WorkOrderUpdate = {
    approval_state: approvalState,
    updated_at: now,
  };

  if (approvalState === "approved" || approvalState === "partial") {
    patch.customer_approval_at = now;
    patch.customer_agreed_at = now;
    patch.customer_approved_by = actorUserId;
  }

  const { error: updateErr } = await supabase
    .from("work_orders")
    .update(patch)
    .eq("id", workOrderId)
    .eq("shop_id", shopId);

  if (updateErr) return { state: null, error: new Error(updateErr.message) };
  return { state: approvalState ?? null, error: null };
}

export async function applyWorkOrderQuoteLineDecision(params: {
  supabase: SupabaseClient<DB>;
  quoteLineIds: string[];
  workOrderId: string;
  shopId: string;
  customerId: string | null;
  actorUserId: string;
  decision: QuoteApprovalDecision;
}): Promise<{
  ok: boolean;
  workOrderLineIds: string[];
  approvalState: string | null;
  partRelink: RelinkQuoteLinePartsResult;
  error?: string;
}> {
  const {
    supabase,
    quoteLineIds,
    workOrderId,
    shopId,
    customerId,
    actorUserId,
    decision,
  } = params;
  const ids = [...new Set(quoteLineIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return {
      ok: false,
      workOrderLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      error: "No quote line ids supplied",
    };
  }

  const { data: rows, error: loadErr } = await supabase
    .from("work_order_quote_lines")
    .select("*")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .in("id", ids);

  if (loadErr)
    return {
      ok: false,
      workOrderLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      error: loadErr.message,
    };
  if ((rows?.length ?? 0) !== ids.length) {
    return {
      ok: false,
      workOrderLineIds: [],
      approvalState: null,
      partRelink: emptyPartRelinkResult(),
      error: "One or more quote lines were not found for this work order",
    };
  }

  const now = new Date().toISOString();
  const workOrderLineIds: string[] = [];
  const partRelink = emptyPartRelinkResult();

  for (const line of (rows ?? []) as QuoteLineRow[]) {
    const status = safeTrim(line.status).toLowerCase();
    if (decision === "approve" && NON_APPROVABLE_STATUSES.has(status)) {
      return {
        ok: false,
        workOrderLineIds,
        approvalState: null,
        partRelink,
        error: `Quote line cannot be approved from status '${line.status}'`,
      };
    }

    if (
      decision === "approve" &&
      status &&
      !APPROVABLE_STATUSES.has(status) &&
      !line.sent_to_customer_at
    ) {
      return {
        ok: false,
        workOrderLineIds,
        approvalState: null,
        partRelink,
        error: "Quote line has not been sent to the customer",
      };
    }

    let materializedLineId: string | null = null;
    if (decision === "approve") {
      const materialized = await materializeQuoteLine({
        supabase,
        line,
        actorUserId,
        now,
      });
      if (materialized.error)
        return {
          ok: false,
          workOrderLineIds,
          approvalState: null,
          partRelink,
          error: materialized.error.message,
        };
      materializedLineId = materialized.id;
      if (materializedLineId) workOrderLineIds.push(materializedLineId);
    }

    const patch = decisionPatch({
      line,
      decision,
      actorUserId,
      customerId,
      now,
      materializedWorkOrderLineId: materializedLineId,
    });

    const { error: updateErr } = await supabase
      .from("work_order_quote_lines")
      .update(patch)
      .eq("id", line.id)
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId);

    if (updateErr)
      return {
        ok: false,
        workOrderLineIds,
        approvalState: null,
        partRelink,
        error: updateErr.message,
      };

    if (decision === "approve" && materializedLineId) {
      const relink = await relinkQuoteLinePartsToWorkOrderLine({
        supabase,
        shopId,
        workOrderId,
        quoteLineId: line.id,
        workOrderLineId: materializedLineId,
      });

      if (relink.error)
        return {
          ok: false,
          workOrderLineIds,
          approvalState: null,
          partRelink,
          error: relink.error.message,
        };
      mergePartRelinkResult(partRelink, relink.result);

      if (relink.result.conflicts.length > 0) {
        console.warn(
          "[quote-line-approval] linked parts conflict while relinking approved quote line",
          {
            shopId,
            workOrderId,
            quoteLineId: line.id,
            workOrderLineId: materializedLineId,
            conflicts: relink.result.conflicts,
          },
        );
      }
    }
  }

  const rollup = await rollupWorkOrderQuoteApprovalState({
    supabase,
    workOrderId,
    shopId,
    now,
    actorUserId,
  });
  if (rollup.error)
    return {
      ok: false,
      workOrderLineIds,
      approvalState: null,
      partRelink,
      error: rollup.error.message,
    };

  return {
    ok: true,
    workOrderLineIds,
    approvalState: rollup.state,
    partRelink,
  };
}
