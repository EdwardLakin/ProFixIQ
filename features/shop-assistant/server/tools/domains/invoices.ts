import "server-only";

import { z } from "zod";

import {
  finalizeWorkOrderInvoice,
  InvoiceFinalizationError,
  validateInvoiceFinalizationCandidate,
} from "@/features/invoices/server/finalizeWorkOrderInvoice";
import {
  getActiveInvoiceVersion,
  postPaymentEvent,
  type InvoiceVersionRecord,
} from "@/features/invoices/server/financialLifecycle";
import { ShopAssistantHttpError } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { defineShopAssistantTool, runShopAssistantCommandRpc } from "../types";

const InvoiceCandidateSchema = z.object({
  workOrderId: z.string().uuid(),
  customId: z.string().nullable(),
  status: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  updatedAt: z.string().nullable(),
  href: z.string(),
});

const InvoiceFinalizationResultSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean(),
  invoiceId: z.string().uuid(),
  invoiceVersionId: z.string().uuid(),
  total: z.number().positive(),
  currency: z.enum(["CAD", "USD"]),
  warnings: z
    .array(z.object({ step: z.string(), message: z.string() }))
    .optional(),
  summary: z.string(),
  href: z.string(),
});

const PaymentResultSchema = z.object({
  ok: z.literal(true),
  workOrderId: z.string().uuid(),
  invoiceVersionId: z.string().uuid(),
  lifecycleStatus: z.string(),
  amount: z.number().positive(),
  currency: z.enum(["CAD", "USD"]),
  outstandingTotal: z.number().nonnegative(),
  receiptNumber: z.string().nullable(),
  summary: z.string(),
  href: z.string(),
});

const MoneySchema = z
  .number()
  .finite()
  .positive()
  .max(100_000_000)
  .refine(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 0.000001,
    {
      message: "Use no more than two decimal places.",
    },
  );

const PaymentMethodSchema = z.enum([
  "cash",
  "cheque",
  "terminal",
  "eft",
  "financing",
  "other",
]);

function asShopAssistantFinalizationError(error: unknown): never {
  if (error instanceof InvoiceFinalizationError) {
    throw new ShopAssistantHttpError(error.status, error.message);
  }
  throw error;
}

async function loadInvoiceConfirmationFingerprints(input: {
  shopId: string;
  workOrderId: string;
  snapshot: Record<string, unknown>;
}): Promise<{ source: string; snapshot: string }> {
  const [source, snapshot] = await Promise.all([
    runShopAssistantCommandRpc("shop_assistant_invoice_source_fingerprint", {
      p_shop_id: input.shopId,
      p_work_order_id: input.workOrderId,
    }),
    runShopAssistantCommandRpc("shop_assistant_json_fingerprint", {
      p_value: input.snapshot,
    }),
  ]);
  if (
    typeof source !== "string" ||
    typeof snapshot !== "string" ||
    !/^[0-9a-f]{64}$/i.test(source) ||
    !/^[0-9a-f]{64}$/i.test(snapshot)
  ) {
    throw new Error("Invoice confirmation fingerprints were not returned.");
  }
  return { source, snapshot };
}

function asShopAssistantPaymentError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("not payable") ||
    normalized.includes("exceeds outstanding") ||
    normalized.includes("exceeds net paid") ||
    normalized.includes("invoice version not found")
  ) {
    throw new ShopAssistantHttpError(409, message);
  }
  throw error;
}

async function loadActiveInvoiceVersion(
  workOrderId: string,
  shopId: string,
): Promise<InvoiceVersionRecord> {
  const version = await getActiveInvoiceVersion({
    supabase: createAdminSupabase(),
    workOrderId,
    shopId,
  });
  if (!version) {
    throw new ShopAssistantHttpError(
      404,
      "No finalized invoice was found for this work order.",
    );
  }
  return version;
}

function receiptNumber(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const number = (value as Record<string, unknown>).receipt_number;
  return typeof number === "string" ? number : null;
}

type ExistingPaymentOperation = {
  invoice_version_id: string | null;
  work_order_id: string | null;
  event_kind: string;
  amount: number;
  currency: string;
};

function invoiceVersionStamp(version: InvoiceVersionRecord): string {
  return [
    version.lifecycle_status,
    version.paid_total,
    version.refunded_total,
    version.outstanding_total,
  ].join(":");
}

async function loadExistingPaymentOperation(params: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  operationKey: string;
  workOrderId: string;
  invoiceVersionId: string;
  eventKind: "manual_payment" | "manual_reversal";
  amount: number;
}): Promise<ExistingPaymentOperation | null> {
  const { data, error } = await params.admin
    .from("payment_events")
    .select("invoice_version_id, work_order_id, event_kind, amount, currency")
    .eq("shop_id", params.shopId)
    .eq("operation_key", params.operationKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const event = data as ExistingPaymentOperation;
  if (
    event.invoice_version_id !== params.invoiceVersionId ||
    event.work_order_id !== params.workOrderId ||
    event.event_kind !== params.eventKind ||
    Math.abs(Number(event.amount) - params.amount) > 0.001 ||
    !["CAD", "USD"].includes(String(event.currency).toUpperCase())
  ) {
    throw new ShopAssistantHttpError(
      409,
      "The existing payment operation does not match this confirmed action.",
    );
  }
  return event;
}

export const listReadyInvoicesTool = defineShopAssistantTool({
  name: "list_ready_invoices",
  domain: "invoices",
  description:
    "List completed or ready-to-invoice work orders for billing review.",
  mode: "read",
  risk: "low",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "never",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrders: z.array(InvoiceCandidateSchema),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const { data, error } = await context.actor.supabase
      .from("work_orders")
      .select("id, custom_id, status, customer_id, customer_name, updated_at")
      .eq("shop_id", context.actor.shopId)
      .in("status", ["completed", "ready_to_invoice"])
      .order("updated_at", { ascending: true, nullsFirst: false })
      .limit(input.limit);
    if (error) throw new Error(error.message);

    const workOrders = (data ?? []).map((row) => ({
      workOrderId: row.id,
      customId: row.custom_id ?? null,
      status: row.status ?? null,
      customerId: row.customer_id ?? null,
      customerName: row.customer_name ?? null,
      updatedAt: row.updated_at ?? null,
      href: `/work-orders/invoice/${row.id}`,
    }));

    return {
      ok: true as const,
      workOrders,
      summary: `${workOrders.length} work order(s) are ready for invoice review.`,
      href: "/billing",
    };
  },
});

export const readInvoiceStatusTool = defineShopAssistantTool({
  name: "read_invoice_status",
  domain: "invoices",
  description: "Read the latest invoice lifecycle state for a work order.",
  mode: "read",
  risk: "low",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "never",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: z.object({
    ok: z.literal(true),
    workOrderId: z.string().uuid(),
    invoiceId: z.string().uuid().nullable(),
    invoiceVersionId: z.string().uuid().nullable(),
    status: z.string().nullable(),
    total: z.number().nullable(),
    currency: z.enum(["CAD", "USD"]).nullable(),
    paidTotal: z.number().nullable(),
    outstandingTotal: z.number().nullable(),
    issuedAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    summary: z.string(),
    href: z.string(),
  }),
  async execute(input, context) {
    const { data: workOrder, error: workOrderError } =
      await context.actor.supabase
        .from("work_orders")
        .select("id, custom_id, invoice_sent_at")
        .eq("shop_id", context.actor.shopId)
        .eq("id", input.workOrderId)
        .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) {
      throw new ShopAssistantHttpError(
        404,
        "Work order not found in this shop.",
      );
    }

    const { data, error } = await context.actor.supabase
      .from("invoices")
      .select("id, status, total, issued_at, created_at")
      .eq("shop_id", context.actor.shopId)
      .eq("work_order_id", input.workOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const version = await getActiveInvoiceVersion({
      supabase: context.actor.supabase,
      workOrderId: input.workOrderId,
      shopId: context.actor.shopId,
    });

    const label = workOrder.custom_id
      ? `WO #${workOrder.custom_id}`
      : `WO ${workOrder.id.slice(0, 8)}`;
    return {
      ok: true as const,
      workOrderId: workOrder.id,
      invoiceId: data?.id ?? null,
      invoiceVersionId: version?.id ?? null,
      status: version?.lifecycle_status ?? data?.status ?? null,
      total:
        version?.total ?? (data?.total == null ? null : Number(data.total)),
      currency: version?.currency ?? null,
      paidTotal: version?.paid_total ?? null,
      outstandingTotal: version?.outstanding_total ?? null,
      issuedAt: version?.issued_at ?? data?.issued_at ?? null,
      sentAt: workOrder.invoice_sent_at ?? null,
      summary: data
        ? `${label} has an invoice in ${data.status ?? "unknown"} status.`
        : `${label} does not have a persisted invoice yet.`,
      href: `/work-orders/invoice/${workOrder.id}`,
    };
  },
});

export const finalizeInvoiceTool = defineShopAssistantTool({
  name: "finalize_invoice",
  domain: "invoices",
  description:
    "Run the canonical invoice review and issue an immutable invoice version for a completed or ready-to-invoice work order.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageWorkOrders",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "required",
  inputSchema: z.object({ workOrderId: z.string().uuid() }),
  outputSchema: InvoiceFinalizationResultSchema,
  async preview(input, context) {
    let candidate: Awaited<
      ReturnType<typeof validateInvoiceFinalizationCandidate>
    >;
    try {
      candidate = await validateInvoiceFinalizationCandidate({
        supabase: createAdminSupabase(),
        shopId: context.actor.shopId,
        workOrderId: input.workOrderId,
      });
    } catch (error) {
      asShopAssistantFinalizationError(error);
    }
    if (candidate.existingVersion) {
      throw new ShopAssistantHttpError(
        409,
        "This work order already has an active finalized invoice.",
      );
    }
    if (!candidate.snapshot) {
      throw new ShopAssistantHttpError(
        409,
        "The invoice snapshot could not be prepared.",
      );
    }
    const fingerprints = await loadInvoiceConfirmationFingerprints({
      shopId: context.actor.shopId,
      workOrderId: candidate.workOrder.id,
      snapshot: candidate.snapshot as unknown as Record<string, unknown>,
    });

    const label = candidate.workOrder.custom_id
      ? `WO #${candidate.workOrder.custom_id}`
      : `WO ${candidate.workOrder.id.slice(0, 8)}`;
    return {
      title: `Finalize invoice for ${label}`,
      summary: `Issue an immutable ${candidate.snapshot.currency} ${Number(
        candidate.snapshot.total ?? 0,
      ).toFixed(2)} invoice.`,
      consequences: [
        `${candidate.snapshot.lines.length} labor/job line(s) and ${candidate.snapshot.parts.length} part line(s) will be frozen into the invoice version.`,
        "The work order becomes financially locked; later changes require the audited correction workflow.",
        "The finalized inspection report will be attached when available.",
        "This action finalizes the invoice but does not email it or collect payment.",
      ],
      targetVersions: {
        [`work_order:${candidate.workOrder.id}`]:
          candidate.workOrder.updated_at ?? "missing",
        [`invoice_source:${candidate.workOrder.id}`]: fingerprints.source,
        [`invoice_snapshot:${candidate.workOrder.id}`]: fingerprints.snapshot,
      },
      metadata: {
        total: candidate.snapshot.total,
        currency: candidate.snapshot.currency,
        lineCount: candidate.snapshot.lines.length,
        partCount: candidate.snapshot.parts.length,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required for invoice finalization.");
    }
    let result: Awaited<ReturnType<typeof finalizeWorkOrderInvoice>>;
    const expectedWorkOrderUpdatedAt =
      context.targetVersions?.[`work_order:${input.workOrderId}`];
    if (!expectedWorkOrderUpdatedAt) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed work-order version is missing. Ask again to review its current invoice state.",
      );
    }
    try {
      result = await finalizeWorkOrderInvoice({
        supabase: createAdminSupabase(),
        shopId: context.actor.shopId,
        workOrderId: input.workOrderId,
        actorProfileId: context.actor.profileId,
        actorAuthUserId: context.actor.userId,
        operationKey: `shop-assistant:${context.actionId}`,
        expectedWorkOrderUpdatedAt,
        assistantActionId: context.actionId,
      });
    } catch (error) {
      asShopAssistantFinalizationError(error);
    }
    const total = Number(result.invoiceVersion.total);
    const currency = result.invoiceVersion.currency;
    return InvoiceFinalizationResultSchema.parse({
      ok: true,
      idempotent: result.idempotent,
      invoiceId: result.invoiceId,
      invoiceVersionId: result.invoiceVersionId,
      total,
      currency,
      warnings: result.warnings,
      summary: `Invoice ${result.invoiceId.slice(0, 8)} was finalized for ${currency} ${total.toFixed(2)}${
        result.warnings?.length ? " with follow-up warnings" : ""
      }.`,
      href: `/work-orders/invoice/${input.workOrderId}`,
    });
  },
});

export const recordManualPaymentTool = defineShopAssistantTool({
  name: "record_manual_invoice_payment",
  domain: "invoices",
  description:
    "Record a confirmed external payment against the active invoice for a same-shop work order and issue a receipt.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageWorkOrders",
  allowedRoles: ["owner", "admin", "manager", "advisor", "service"],
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    amount: MoneySchema,
    method: PaymentMethodSchema,
    reference: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
  }),
  outputSchema: PaymentResultSchema,
  async preview(input, context) {
    const version = await loadActiveInvoiceVersion(
      input.workOrderId,
      context.actor.shopId,
    );
    if (!["issued", "partially_paid"].includes(version.lifecycle_status)) {
      throw new ShopAssistantHttpError(409, "This invoice is not payable.");
    }
    if (input.amount > Number(version.outstanding_total) + 0.01) {
      throw new ShopAssistantHttpError(
        409,
        "Payment exceeds the outstanding invoice balance.",
      );
    }
    return {
      title: `Record ${version.currency} ${input.amount.toFixed(2)} payment`,
      summary: `Apply a ${input.method} payment to the active invoice for this work order.`,
      consequences: [
        `The outstanding balance will change from ${version.currency} ${Number(version.outstanding_total).toFixed(2)} to ${version.currency} ${Math.max(0, Number(version.outstanding_total) - input.amount).toFixed(2)}.`,
        "An auditable payment event and receipt will be created.",
        "This records money already received outside ProFixIQ; it does not charge a card.",
      ],
      targetVersions: {
        [`invoice_work_order:${input.workOrderId}`]: version.id,
        [`invoice_version:${version.id}`]: [
          version.lifecycle_status,
          version.paid_total,
          version.refunded_total,
          version.outstanding_total,
        ].join(":"),
      },
      metadata: {
        invoiceVersionId: version.id,
        currency: version.currency,
        outstandingTotal: version.outstanding_total,
      },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to record a payment.");
    }
    const admin = createAdminSupabase();
    const confirmedInvoiceVersionId =
      context.targetVersions?.[`invoice_work_order:${input.workOrderId}`];
    if (!confirmedInvoiceVersionId) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed invoice is missing. Ask again to review the current balance.",
      );
    }
    const operationKey = `manual:${context.actor.shopId}:shop-assistant:${context.actionId}`;
    const existingOperation = await loadExistingPaymentOperation({
      admin,
      shopId: context.actor.shopId,
      operationKey,
      workOrderId: input.workOrderId,
      invoiceVersionId: confirmedInvoiceVersionId,
      eventKind: "manual_payment",
      amount: input.amount,
    });
    const version = existingOperation
      ? null
      : await getActiveInvoiceVersion({
          supabase: admin,
          workOrderId: input.workOrderId,
          shopId: context.actor.shopId,
        });
    if (!existingOperation && !version) {
      throw new ShopAssistantHttpError(
        404,
        "No finalized invoice was found for this work order.",
      );
    }
    if (version && version.id !== confirmedInvoiceVersionId) {
      throw new ShopAssistantHttpError(
        409,
        "The active invoice changed after preview. Ask again to review the current invoice.",
      );
    }
    const expectedVersion =
      context.targetVersions?.[`invoice_version:${confirmedInvoiceVersionId}`];
    if (
      version &&
      (!expectedVersion || expectedVersion !== invoiceVersionStamp(version))
    ) {
      throw new ShopAssistantHttpError(
        409,
        "The invoice balance changed after preview. Ask again to review the current balance.",
      );
    }
    const currency = String(
      existingOperation?.currency ?? version?.currency ?? "",
    ).toUpperCase();
    if (currency !== "CAD" && currency !== "USD") {
      throw new ShopAssistantHttpError(
        409,
        "The invoice currency is unsupported.",
      );
    }

    let result: Awaited<ReturnType<typeof postPaymentEvent>>;
    try {
      result = await postPaymentEvent({
        supabase: admin,
        shopId: context.actor.shopId,
        workOrderId: input.workOrderId,
        invoiceVersionId: confirmedInvoiceVersionId,
        eventKind: "manual_payment",
        amount: input.amount,
        currency,
        paymentMethod: input.method,
        processor: "manual",
        processorPaymentId: input.reference ?? null,
        operationKey,
        actorUserId: context.actor.profileId,
        occurredAt: input.receivedAt,
        metadata: {
          reference: input.reference ?? null,
          note: input.note ?? null,
          source: "shop_assistant",
          actionId: context.actionId,
        },
      });
    } catch (error) {
      asShopAssistantPaymentError(error);
    }

    return PaymentResultSchema.parse({
      ok: true,
      workOrderId: input.workOrderId,
      invoiceVersionId: result.invoice_version.id,
      lifecycleStatus: result.invoice_version.lifecycle_status,
      amount: input.amount,
      currency: result.invoice_version.currency,
      outstandingTotal: Number(result.invoice_version.outstanding_total),
      receiptNumber: receiptNumber(result.receipt),
      summary: `${result.invoice_version.currency} ${input.amount.toFixed(2)} was recorded as a ${input.method} payment.`,
      href: `/work-orders/invoice/${input.workOrderId}`,
    });
  },
});

export const reverseManualPaymentTool = defineShopAssistantTool({
  name: "reverse_manual_invoice_payment",
  domain: "invoices",
  description:
    "Post an auditable manual payment reversal against the active same-shop invoice. Owner, admin, or manager only.",
  mode: "write",
  risk: "high",
  requiredCapability: "canManageWorkOrders",
  allowedRoles: ["owner", "admin", "manager"],
  confirmation: "required",
  inputSchema: z.object({
    workOrderId: z.string().uuid(),
    amount: MoneySchema,
    reason: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(200).optional(),
  }),
  outputSchema: PaymentResultSchema,
  async preview(input, context) {
    const version = await loadActiveInvoiceVersion(
      input.workOrderId,
      context.actor.shopId,
    );
    const netPaid = Number(version.paid_total) - Number(version.refunded_total);
    if (input.amount > netPaid + 0.01) {
      throw new ShopAssistantHttpError(
        409,
        "Reversal exceeds the net paid invoice amount.",
      );
    }
    return {
      title: `Reverse ${version.currency} ${input.amount.toFixed(2)} payment`,
      summary: `Post a manual reversal for: ${input.reason}`,
      consequences: [
        `The outstanding balance will increase from ${version.currency} ${Number(version.outstanding_total).toFixed(2)} to ${version.currency} ${(Number(version.outstanding_total) + input.amount).toFixed(2)}.`,
        "The original payment event remains in the audit history.",
        "A new reversal event is posted; no processor refund is initiated.",
      ],
      targetVersions: {
        [`invoice_work_order:${input.workOrderId}`]: version.id,
        [`invoice_version:${version.id}`]: [
          version.lifecycle_status,
          version.paid_total,
          version.refunded_total,
          version.outstanding_total,
        ].join(":"),
      },
      metadata: { invoiceVersionId: version.id, reason: input.reason },
    };
  },
  async execute(input, context) {
    if (!context.actionId) {
      throw new Error("An action id is required to reverse a payment.");
    }
    const admin = createAdminSupabase();
    const confirmedInvoiceVersionId =
      context.targetVersions?.[`invoice_work_order:${input.workOrderId}`];
    if (!confirmedInvoiceVersionId) {
      throw new ShopAssistantHttpError(
        409,
        "The confirmed invoice is missing. Ask again to review the current balance.",
      );
    }
    const operationKey = `manual-reversal:${context.actor.shopId}:shop-assistant:${context.actionId}`;
    const existingOperation = await loadExistingPaymentOperation({
      admin,
      shopId: context.actor.shopId,
      operationKey,
      workOrderId: input.workOrderId,
      invoiceVersionId: confirmedInvoiceVersionId,
      eventKind: "manual_reversal",
      amount: input.amount,
    });
    const version = existingOperation
      ? null
      : await getActiveInvoiceVersion({
          supabase: admin,
          workOrderId: input.workOrderId,
          shopId: context.actor.shopId,
        });
    if (!existingOperation && !version) {
      throw new ShopAssistantHttpError(
        404,
        "No finalized invoice was found for this work order.",
      );
    }
    if (version && version.id !== confirmedInvoiceVersionId) {
      throw new ShopAssistantHttpError(
        409,
        "The active invoice changed after preview. Ask again to review the current invoice.",
      );
    }
    const expectedVersion =
      context.targetVersions?.[`invoice_version:${confirmedInvoiceVersionId}`];
    if (
      version &&
      (!expectedVersion || expectedVersion !== invoiceVersionStamp(version))
    ) {
      throw new ShopAssistantHttpError(
        409,
        "The invoice balance changed after preview. Ask again to review the current balance.",
      );
    }
    const currency = String(
      existingOperation?.currency ?? version?.currency ?? "",
    ).toUpperCase();
    if (currency !== "CAD" && currency !== "USD") {
      throw new ShopAssistantHttpError(
        409,
        "The invoice currency is unsupported.",
      );
    }

    let result: Awaited<ReturnType<typeof postPaymentEvent>>;
    try {
      result = await postPaymentEvent({
        supabase: admin,
        shopId: context.actor.shopId,
        workOrderId: input.workOrderId,
        invoiceVersionId: confirmedInvoiceVersionId,
        eventKind: "manual_reversal",
        amount: input.amount,
        currency,
        paymentMethod: "manual_reversal",
        processor: "manual",
        processorPaymentId: input.reference ?? null,
        operationKey,
        actorUserId: context.actor.profileId,
        metadata: {
          reason: input.reason,
          reference: input.reference ?? null,
          source: "shop_assistant",
          actionId: context.actionId,
        },
      });
    } catch (error) {
      asShopAssistantPaymentError(error);
    }

    return PaymentResultSchema.parse({
      ok: true,
      workOrderId: input.workOrderId,
      invoiceVersionId: result.invoice_version.id,
      lifecycleStatus: result.invoice_version.lifecycle_status,
      amount: input.amount,
      currency: result.invoice_version.currency,
      outstandingTotal: Number(result.invoice_version.outstanding_total),
      receiptNumber: null,
      summary: `${result.invoice_version.currency} ${input.amount.toFixed(2)} was reversed with an audit event.`,
      href: `/work-orders/invoice/${input.workOrderId}`,
    });
  },
});
