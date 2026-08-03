import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type { ShopAssistantActionPreviewDraft } from "@/features/shop-assistant/server/tools/types";
import type {
  ShopAssistantActionPreview,
  ShopAssistantActionResult,
  ShopAssistantActionRisk,
  ShopAssistantActionStatus,
  ShopAssistantDomain,
} from "@/features/shop-assistant/types";

type AssistantDb = SupabaseClient<any>;

export const SHOP_ASSISTANT_ACTION_EXECUTION_LEASE_MS = 2 * 60 * 1000;

export type ShopAssistantActionRow = {
  id: string;
  thread_id: string;
  shop_id: string;
  requested_by: string;
  confirmed_by: string | null;
  tool_name: string;
  domain: string;
  risk: string;
  status: string;
  input: unknown;
  preview: unknown;
  result: unknown;
  error: unknown;
  idempotency_key: string;
  target_versions: unknown;
  expires_at: string;
  confirmed_at: string | null;
  execution_started_at: string | null;
  execution_finished_at: string | null;
  created_at: string;
  updated_at: string;
};

function dbFor(actor: ShopAssistantActor): AssistantDb {
  return actor.supabase as unknown as AssistantDb;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeRisk(value: string): ShopAssistantActionRisk {
  return value === "high" || value === "medium" ? value : "low";
}

function normalizeStatus(value: string): ShopAssistantActionStatus {
  if (
    value === "confirmed" ||
    value === "executing" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  return "pending_confirmation";
}

function isTerminalStatus(value: string): boolean {
  return (
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "expired"
  );
}

function executionLeaseExpired(
  row: ShopAssistantActionRow,
  nowMs = Date.now(),
): boolean {
  if (row.status !== "executing") return false;
  const leaseAnchor = row.execution_started_at ?? row.updated_at;
  const leaseStartedAt = new Date(leaseAnchor).getTime();
  return (
    !Number.isFinite(leaseStartedAt) ||
    leaseStartedAt <= nowMs - SHOP_ASSISTANT_ACTION_EXECUTION_LEASE_MS
  );
}

function normalizeDomain(value: string): ShopAssistantDomain {
  if (
    value === "scheduling" ||
    value === "inventory" ||
    value === "customer_communications" ||
    value === "customers" ||
    value === "inspections" ||
    value === "invoices" ||
    value === "workforce" ||
    value === "reporting" ||
    value === "business_analytics"
  ) {
    return value;
  }
  return "work_orders";
}

export function mapActionPreview(
  row: ShopAssistantActionRow,
): ShopAssistantActionPreview {
  const preview = asRecord(row.preview);
  return {
    id: row.id,
    toolName: row.tool_name,
    domain: normalizeDomain(row.domain),
    risk: normalizeRisk(row.risk),
    status: normalizeStatus(row.status),
    title:
      typeof preview.title === "string" ? preview.title : row.tool_name,
    summary:
      typeof preview.summary === "string"
        ? preview.summary
        : "Review this shop action before execution.",
    consequences: asStringArray(preview.consequences),
    expiresAt: row.expires_at,
  };
}

export function mapActionResult(
  row: ShopAssistantActionRow,
): ShopAssistantActionResult {
  const result = asRecord(row.result);
  const error = asRecord(row.error);
  const status = normalizeStatus(row.status);
  const summary =
    typeof result.summary === "string"
      ? result.summary
      : typeof error.message === "string"
        ? error.message
        : status === "cancelled"
          ? "Action cancelled."
          : status === "expired"
            ? "Action expired before confirmation."
            : `Action ${status.replaceAll("_", " ")}.`;

  return {
    id: row.id,
    toolName: row.tool_name,
    domain: normalizeDomain(row.domain),
    status,
    summary,
    details: status === "failed" ? error : result,
    retryable: Boolean(error.retryable),
  };
}

const ACTION_SELECT =
  "id, thread_id, shop_id, requested_by, confirmed_by, tool_name, domain, risk, status, input, preview, result, error, idempotency_key, target_versions, expires_at, confirmed_at, execution_started_at, execution_finished_at, created_at, updated_at";

export async function createPendingAction(params: {
  actor: ShopAssistantActor;
  threadId: string;
  toolName: string;
  domain: ShopAssistantDomain;
  risk: ShopAssistantActionRisk;
  input: unknown;
  preview: ShopAssistantActionPreviewDraft;
  idempotencyKey: string;
  expiresInMinutes?: number;
}): Promise<{ row: ShopAssistantActionRow; created: boolean }> {
  const expiresAt = new Date(
    Date.now() + (params.expiresInMinutes ?? 15) * 60 * 1000,
  ).toISOString();
  const payload = {
    shop_id: params.actor.shopId,
    thread_id: params.threadId,
    requested_by: params.actor.userId,
    tool_name: params.toolName,
    domain: params.domain,
    risk: params.risk,
    status: "pending_confirmation",
    input: params.input,
    preview: {
      title: params.preview.title,
      summary: params.preview.summary,
      consequences: params.preview.consequences,
      metadata: params.preview.metadata ?? {},
    },
    idempotency_key: params.idempotencyKey,
    target_versions: params.preview.targetVersions ?? {},
    expires_at: expiresAt,
  };

  const db = dbFor(params.actor);
  const { data, error } = await db
    .from("shop_assistant_actions")
    .insert(payload)
    .select(ACTION_SELECT)
    .maybeSingle();

  if (!error && data) {
    return { row: data as ShopAssistantActionRow, created: true };
  }
  if (error?.code !== "23505") {
    throw new Error(error?.message ?? "Failed to create shop assistant action.");
  }

  const { data: existing, error: existingError } = await db
    .from("shop_assistant_actions")
    .select(ACTION_SELECT)
    .eq("shop_id", params.actor.shopId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();
  if (existingError || !existing) {
    throw new Error(
      existingError?.message ?? "Failed to restore the existing shop action.",
    );
  }
  return { row: existing as ShopAssistantActionRow, created: false };
}

export async function loadAction(
  actor: ShopAssistantActor,
  actionId: string,
): Promise<ShopAssistantActionRow> {
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_actions")
    .select(ACTION_SELECT)
    .eq("id", actionId)
    .eq("shop_id", actor.shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ShopAssistantHttpError(404, "Shop assistant action not found.");
  return data as ShopAssistantActionRow;
}

export async function expireActionIfNeeded(params: {
  actor: ShopAssistantActor;
  row: ShopAssistantActionRow;
}): Promise<ShopAssistantActionRow> {
  if (
    params.row.status !== "pending_confirmation" ||
    new Date(params.row.expires_at).getTime() > Date.now()
  ) {
    return params.row;
  }

  const now = new Date().toISOString();
  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_actions")
    .update({
      status: "expired",
      error: { message: "Action expired before confirmation.", retryable: true },
      execution_finished_at: now,
      updated_at: now,
    })
    .eq("id", params.row.id)
    .eq("shop_id", params.actor.shopId)
    .eq("status", "pending_confirmation")
    .select(ACTION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShopAssistantActionRow | null) ?? params.row;
}

export async function acquireActionExecution(params: {
  actor: ShopAssistantActor;
  actionId: string;
}): Promise<{ row: ShopAssistantActionRow; acquired: boolean }> {
  const current = await expireActionIfNeeded({
    actor: params.actor,
    row: await loadAction(params.actor, params.actionId),
  });

  if (current.requested_by !== params.actor.userId) {
    throw new ShopAssistantHttpError(
      403,
      "Only the staff member who requested this action can confirm it.",
    );
  }
  if (isTerminalStatus(current.status)) {
    return { row: current, acquired: false };
  }

  const now = new Date().toISOString();
  if (current.status === "executing") {
    if (!executionLeaseExpired(current)) {
      return { row: current, acquired: false };
    }

    let recovery = dbFor(params.actor)
      .from("shop_assistant_actions")
      .update({
        confirmed_by: params.actor.userId,
        execution_started_at: now,
        execution_finished_at: null,
        error: null,
        updated_at: now,
      })
      .eq("id", params.actionId)
      .eq("shop_id", params.actor.shopId)
      .eq("requested_by", params.actor.userId)
      .eq("status", "executing");
    recovery = current.execution_started_at
      ? recovery.eq("execution_started_at", current.execution_started_at)
      : recovery.is("execution_started_at", null);

    const { data, error } = await recovery
      .select(ACTION_SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      return { row: data as ShopAssistantActionRow, acquired: true };
    }
    return {
      row: await loadAction(params.actor, params.actionId),
      acquired: false,
    };
  }

  if (current.status !== "pending_confirmation") {
    return { row: current, acquired: false };
  }

  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_actions")
    .update({
      status: "executing",
      confirmed_by: params.actor.userId,
      confirmed_at: now,
      execution_started_at: now,
      execution_finished_at: null,
      error: null,
      updated_at: now,
    })
    .eq("id", params.actionId)
    .eq("shop_id", params.actor.shopId)
    .eq("requested_by", params.actor.userId)
    .eq("status", "pending_confirmation")
    .gt("expires_at", now)
    .select(ACTION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { row: data as ShopAssistantActionRow, acquired: true };

  return { row: await loadAction(params.actor, params.actionId), acquired: false };
}

export async function completeAction(params: {
  actor: ShopAssistantActor;
  actionId: string;
  result: unknown;
}): Promise<ShopAssistantActionRow> {
  const now = new Date().toISOString();
  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_actions")
    .update({
      status: "succeeded",
      result: params.result,
      error: null,
      execution_finished_at: now,
      updated_at: now,
    })
    .eq("id", params.actionId)
    .eq("shop_id", params.actor.shopId)
    .eq("status", "executing")
    .select(ACTION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as ShopAssistantActionRow;

  const current = await loadAction(params.actor, params.actionId);
  if (isTerminalStatus(current.status)) return current;
  throw new Error("Action execution result could not be persisted.");
}

export async function failAction(params: {
  actor: ShopAssistantActor;
  actionId: string;
  error: unknown;
  retryable?: boolean;
}): Promise<ShopAssistantActionRow> {
  const message =
    params.error instanceof Error
      ? params.error.message
      : "The shop action failed.";
  const now = new Date().toISOString();
  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_actions")
    .update({
      status: "failed",
      error: { message, retryable: params.retryable ?? true },
      execution_finished_at: now,
      updated_at: now,
    })
    .eq("id", params.actionId)
    .eq("shop_id", params.actor.shopId)
    .eq("status", "executing")
    .select(ACTION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return loadAction(params.actor, params.actionId);
  return data as ShopAssistantActionRow;
}

export async function cancelAction(params: {
  actor: ShopAssistantActor;
  actionId: string;
}): Promise<ShopAssistantActionRow> {
  const current = await expireActionIfNeeded({
    actor: params.actor,
    row: await loadAction(params.actor, params.actionId),
  });
  if (current.status !== "pending_confirmation") return current;
  if (current.requested_by !== params.actor.userId) {
    throw new ShopAssistantHttpError(
      403,
      "Only the staff member who requested this action can cancel it.",
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await dbFor(params.actor)
    .from("shop_assistant_actions")
    .update({
      status: "cancelled",
      result: { summary: "Action cancelled." },
      execution_finished_at: now,
      updated_at: now,
    })
    .eq("id", params.actionId)
    .eq("shop_id", params.actor.shopId)
    .eq("requested_by", params.actor.userId)
    .eq("status", "pending_confirmation")
    .select(ACTION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShopAssistantActionRow | null) ?? current;
}
