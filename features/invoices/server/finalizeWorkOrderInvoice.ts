import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { reviewWorkOrder } from "../../../app/api/work-orders/[id]/_lib/reviewWorkOrder";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { attachInspectionReportToInvoice } from "@/features/invoices/server/attachInspectionReportToInvoice";
import {
  finalizeInvoiceVersion,
  getActiveInvoiceVersion,
  type InvoiceVersionRecord,
} from "@/features/invoices/server/financialLifecycle";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import {
  getInvoiceSnapshotForWorkOrder,
  type InvoiceSnapshot,
} from "@/features/invoices/server/getInvoiceSnapshot";
import type { Database } from "@/features/shared/types/types/supabase";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DbClient = SupabaseClient<Database>;

type AssistantFinalizeRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string | null; message?: string | null } | null;
  }>;
};

export type InvoiceFinalizationWarning = {
  step: string;
  message: string;
};

export class InvoiceFinalizationError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvoiceFinalizationError";
    this.status = status;
    this.details = details;
  }
}

type WorkOrderForFinalization = {
  id: string;
  shop_id: string;
  customer_id: string | null;
  custom_id: string | null;
  status: string | null;
  updated_at: string | null;
};

export type AssistantFinalizationActionCheckpoint = {
  id: string;
  shop_id: string;
  requested_by: string;
  confirmed_by: string | null;
  tool_name: string;
  status: string;
  input: unknown;
  result: unknown;
};

export type InvoiceFinalizationCandidate = {
  workOrder: WorkOrderForFinalization;
  existingVersion: InvoiceVersionRecord | null;
  snapshot: InvoiceSnapshot | null;
};

export type FinalizeWorkOrderInvoiceResult = {
  ok: true;
  idempotent: boolean;
  invoiceId: string;
  invoiceVersionId: string;
  invoiceVersion: InvoiceVersionRecord;
  inspectionAttachment: Awaited<
    ReturnType<typeof attachInspectionReportToInvoice>
  > | null;
  finalizedWithWarnings?: true;
  warnings?: InvoiceFinalizationWarning[];
};

function invoicePartSignature(
  parts: Array<{ id: string; qty: number; unitPrice: number }>,
): string {
  return parts
    .map((part) => ({
      id: part.id,
      qty: Number(part.qty),
      unitPrice: Number(part.unitPrice),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((part) => `${part.id}:${part.qty}:${part.unitPrice}`)
    .join("|");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isResumableAssistantFinalizationCheckpoint(input: {
  checkpoint: AssistantFinalizationActionCheckpoint;
  actionId: string;
  shopId: string;
  workOrderId: string;
  actorAuthUserId: string;
  version: Pick<InvoiceVersionRecord, "id" | "invoice_id" | "work_order_id">;
}): boolean {
  const actionInput = asRecord(input.checkpoint.input);
  const result = asRecord(input.checkpoint.result);
  return (
    input.version.invoice_id !== null &&
    input.checkpoint.id === input.actionId &&
    input.checkpoint.shop_id === input.shopId &&
    input.checkpoint.requested_by === input.actorAuthUserId &&
    input.checkpoint.confirmed_by === input.actorAuthUserId &&
    input.checkpoint.tool_name === "finalize_invoice" &&
    input.checkpoint.status === "executing" &&
    actionInput.workOrderId === input.workOrderId &&
    input.version.work_order_id === input.workOrderId &&
    result.ok === true &&
    result.sideEffectsPending === true &&
    result.workOrderId === input.workOrderId &&
    result.invoiceVersionId === input.version.id &&
    result.invoiceId === input.version.invoice_id
  );
}

async function canResumeAssistantFinalization(input: {
  supabase: DbClient;
  actionId: string;
  shopId: string;
  workOrderId: string;
  actorAuthUserId: string;
  version: InvoiceVersionRecord;
}): Promise<boolean> {
  const { data, error } = await input.supabase
    .from("shop_assistant_actions")
    .select(
      "id, shop_id, requested_by, confirmed_by, tool_name, status, input, result",
    )
    .eq("id", input.actionId)
    .eq("shop_id", input.shopId)
    .maybeSingle<AssistantFinalizationActionCheckpoint>();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return isResumableAssistantFinalizationCheckpoint({
    checkpoint: data,
    actionId: input.actionId,
    shopId: input.shopId,
    workOrderId: input.workOrderId,
    actorAuthUserId: input.actorAuthUserId,
    version: input.version,
  });
}

async function runFinalizationSideEffects(
  steps: Array<{ step: string; run: () => Promise<void> }>,
): Promise<InvoiceFinalizationWarning[]> {
  const warnings: InvoiceFinalizationWarning[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      warnings.push({
        step: step.step,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return warnings;
}

function throwAssistantFinalizeRpcError(error: {
  code?: string | null;
  message?: string | null;
}): never {
  const code = error.code?.trim() ?? "";
  const message = error.message?.trim() || "Invoice finalization failed.";
  if (code === "42501") throw new InvoiceFinalizationError(403, message);
  if (code === "P0002") throw new InvoiceFinalizationError(404, message);
  if (code === "22023" || code === "22P02") {
    throw new InvoiceFinalizationError(400, message);
  }
  if (
    code === "40001" ||
    code === "P0001" ||
    code === "23503" ||
    code === "23505" ||
    code === "23514" ||
    code === "55000"
  ) {
    throw new InvoiceFinalizationError(409, message);
  }
  throw new Error(message);
}

async function finalizeAssistantInvoiceVersion(input: {
  supabase: DbClient;
  actionId: string;
  shopId: string;
  workOrderId: string;
  actorAuthUserId: string;
  actorProfileId: string;
  snapshot: InvoiceSnapshot;
}): Promise<{ version: InvoiceVersionRecord; idempotent: boolean }> {
  const rpc = input.supabase as unknown as AssistantFinalizeRpcClient;
  const { data, error } = await rpc.rpc(
    "shop_assistant_finalize_invoice_atomic",
    {
      p_action_id: input.actionId,
      p_shop_id: input.shopId,
      p_actor_user_id: input.actorAuthUserId,
      p_actor_profile_id: input.actorProfileId,
      p_work_order_id: input.workOrderId,
      p_snapshot: input.snapshot,
    },
  );
  if (error) throwAssistantFinalizeRpcError(error);
  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const version = await getActiveInvoiceVersion({
    supabase: input.supabase,
    shopId: input.shopId,
    workOrderId: input.workOrderId,
  });
  if (!version) {
    throw new Error("The finalized invoice version could not be reloaded.");
  }
  if (
    typeof result.invoiceVersionId === "string" &&
    result.invoiceVersionId !== version.id
  ) {
    throw new Error(
      "The finalized invoice version did not match the action result.",
    );
  }
  return { version, idempotent: Boolean(result.idempotent) };
}

export async function validateInvoiceFinalizationCandidate(input: {
  supabase: DbClient;
  shopId: string;
  workOrderId: string;
}): Promise<InvoiceFinalizationCandidate> {
  const { data: workOrder, error: workOrderError } = await input.supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, custom_id, status, updated_at")
    .eq("id", input.workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle<WorkOrderForFinalization>();
  if (workOrderError) throw new Error(workOrderError.message);
  if (!workOrder) {
    throw new InvoiceFinalizationError(404, "Work order not found.");
  }

  const status = String(workOrder.status ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  if (!["completed", "ready_to_invoice", "invoiced"].includes(status)) {
    throw new InvoiceFinalizationError(
      409,
      `Work order status ${workOrder.status ?? "unknown"} is not ready for invoicing.`,
    );
  }

  const existingVersion = await getActiveInvoiceVersion({
    supabase: input.supabase,
    workOrderId: input.workOrderId,
    shopId: input.shopId,
  });
  if (existingVersion) {
    return { workOrder, existingVersion, snapshot: null };
  }

  const review = await reviewWorkOrder({
    supabase: input.supabase,
    workOrderId: input.workOrderId,
    shopId: input.shopId,
    kind: "invoice_review",
  });
  if (!review.ok) {
    throw new InvoiceFinalizationError(400, "Invoice review failed.", {
      issues: review.issues,
    });
  }

  const [draftSnapshot, snapshot] = await Promise.all([
    getInvoiceSnapshotForWorkOrder({
      supabase: input.supabase,
      workOrderId: input.workOrderId,
    }),
    getIssuableInvoiceSnapshot({
      supabase: input.supabase,
      workOrderId: input.workOrderId,
      shopId: input.shopId,
    }),
  ]);
  const partsMatch =
    invoicePartSignature(draftSnapshot.parts) ===
    invoicePartSignature(snapshot.parts);
  if (
    !partsMatch ||
    Math.abs(
      Number(draftSnapshot.partsCost ?? 0) - Number(snapshot.partsCost ?? 0),
    ) > 0.01 ||
    Math.abs(Number(draftSnapshot.total ?? 0) - Number(snapshot.total ?? 0)) >
      0.01
  ) {
    throw new InvoiceFinalizationError(
      409,
      "Invoice totals changed while preparing issuance. Refresh the invoice and review its parts before finalizing.",
    );
  }

  const total = Number(snapshot.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new InvoiceFinalizationError(
      400,
      "Cannot finalize a zero-total invoice.",
    );
  }

  return { workOrder, existingVersion: null, snapshot };
}

export async function finalizeWorkOrderInvoice(input: {
  supabase: DbClient;
  shopId: string;
  workOrderId: string;
  actorProfileId: string;
  actorAuthUserId: string;
  operationKey: string;
  expectedWorkOrderUpdatedAt?: string;
  assistantActionId?: string;
}): Promise<FinalizeWorkOrderInvoiceResult> {
  const candidate = await validateInvoiceFinalizationCandidate(input);
  let finalized: { version: InvoiceVersionRecord; idempotent: boolean };
  if (candidate.existingVersion) {
    if (input.assistantActionId) {
      const resumable = await canResumeAssistantFinalization({
        supabase: input.supabase,
        actionId: input.assistantActionId,
        shopId: input.shopId,
        workOrderId: input.workOrderId,
        actorAuthUserId: input.actorAuthUserId,
        version: candidate.existingVersion,
      });
      if (!resumable) {
        throw new InvoiceFinalizationError(
          409,
          "This work order was finalized after the assistant confirmation preview.",
        );
      }
      finalized = { version: candidate.existingVersion, idempotent: true };
    } else {
      const invoiceId = candidate.existingVersion.invoice_id;
      if (!invoiceId) {
        throw new Error(
          "The active invoice version is missing its invoice ID.",
        );
      }
      return {
        ok: true,
        idempotent: true,
        invoiceId,
        invoiceVersionId: candidate.existingVersion.id,
        invoiceVersion: candidate.existingVersion,
        inspectionAttachment: null,
      };
    }
  } else {
    if (
      input.expectedWorkOrderUpdatedAt &&
      (input.expectedWorkOrderUpdatedAt === "missing"
        ? candidate.workOrder.updated_at !== null
        : candidate.workOrder.updated_at !== input.expectedWorkOrderUpdatedAt)
    ) {
      throw new InvoiceFinalizationError(
        409,
        "The work order changed after the invoice confirmation preview.",
      );
    }
    if (!candidate.snapshot) {
      throw new Error("The invoice snapshot was not prepared.");
    }

    const brand = await getActiveBrandForRender(input.shopId);
    const snapshot = {
      ...candidate.snapshot,
      documentConfiguration: brand.document,
    };
    finalized = input.assistantActionId
      ? await finalizeAssistantInvoiceVersion({
          supabase: input.supabase,
          actionId: input.assistantActionId,
          shopId: input.shopId,
          workOrderId: input.workOrderId,
          actorAuthUserId: input.actorAuthUserId,
          actorProfileId: input.actorProfileId,
          snapshot,
        })
      : {
          version: await finalizeInvoiceVersion({
            supabase: input.supabase,
            shopId: input.shopId,
            workOrderId: input.workOrderId,
            invoiceId: null,
            snapshot,
            actorUserId: input.actorProfileId,
            operationKey: input.operationKey,
          }),
          idempotent: false,
        };
  }
  const { version } = finalized;
  const invoiceId = version.invoice_id;
  if (!invoiceId) {
    throw new Error("Invoice finalization did not return an invoice ID.");
  }

  let inspectionAttachment: Awaited<
    ReturnType<typeof attachInspectionReportToInvoice>
  > | null = null;
  const warnings = await runFinalizationSideEffects([
    {
      step: "inspection_attachment",
      run: async () => {
        inspectionAttachment = await attachInspectionReportToInvoice({
          supabase: input.supabase,
          invoiceId,
          workOrderId: input.workOrderId,
          shopId: input.shopId,
          actorUserId: input.actorAuthUserId,
        });
      },
    },
    {
      step: "invoice_finalized_audit_log",
      run: () =>
        logOperationalEvent({
          supabase: input.supabase,
          event: "invoice_finalized",
          actorId: input.actorAuthUserId,
          entityType: "invoice_version",
          entityId: version.id,
          details: {
            work_order_id: input.workOrderId,
            invoice_id: invoiceId,
            invoice_total: version.total,
          },
          throwOnFailure: true,
        }),
    },
  ]);

  return {
    ok: true,
    idempotent: finalized.idempotent,
    invoiceId,
    invoiceVersionId: version.id,
    invoiceVersion: version,
    inspectionAttachment,
    finalizedWithWarnings: warnings.length > 0 || undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}
