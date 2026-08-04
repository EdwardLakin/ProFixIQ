import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { reviewWorkOrder } from "../../work-orders/[id]/_lib/reviewWorkOrder";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { attachInspectionReportToInvoice } from "@/features/invoices/server/attachInspectionReportToInvoice";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import {
  finalizeInvoiceVersion,
  getActiveInvoiceVersion,
} from "@/features/invoices/server/financialLifecycle";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;
type Body = { workOrderId?: string };
type FinalizationWarning = { step: string; message: string };

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

async function runFinalizationSideEffects(
  steps: Array<{ step: string; run: () => Promise<void> }>,
): Promise<FinalizationWarning[]> {
  const warnings: FinalizationWarning[] = [];
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

export async function POST(request: Request) {
  let workOrderId = "";
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => null)) as Body | null;
    workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Missing work order ID." },
        { status: 400 },
      );
    }

    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("id,shop_id,customer_id,status")
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<{
        id: string;
        shop_id: string;
        customer_id: string | null;
        status: string | null;
      }>();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder)
      return NextResponse.json(
        { error: "Work order not found." },
        { status: 404 },
      );

    const status = String(workOrder.status ?? "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_");
    if (!["completed", "ready_to_invoice", "invoiced"].includes(status)) {
      return NextResponse.json(
        {
          error: `Work order status ${workOrder.status ?? "unknown"} is not ready for invoicing.`,
        },
        { status: 409 },
      );
    }

    const existingVersion = await getActiveInvoiceVersion({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    if (existingVersion) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        invoiceId: existingVersion.invoice_id,
        invoiceVersionId: existingVersion.id,
        invoiceVersion: existingVersion,
      });
    }

    const review = await reviewWorkOrder({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
      kind: "invoice_review",
    });
    if (!review.ok) {
      return NextResponse.json(
        { error: "Invoice review failed.", issues: review.issues },
        { status: 400 },
      );
    }

    const draftSnapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: admin,
      workOrderId,
    });
    const snapshot = await getIssuableInvoiceSnapshot({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
    });
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
      return NextResponse.json(
        {
          error:
            "Invoice totals changed while preparing issuance. Refresh the invoice and review its parts before finalizing.",
        },
        { status: 409 },
      );
    }

    const total = Number(snapshot.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        { error: "Cannot finalize a zero-total invoice." },
        { status: 400 },
      );
    }

    const brand = await getActiveBrandForRender(workOrder.shop_id);
    const version = await finalizeInvoiceVersion({
      supabase: admin,
      shopId: workOrder.shop_id,
      workOrderId,
      invoiceId: null,
      snapshot: { ...snapshot, documentConfiguration: brand.document },
      actorUserId: access.profile.id,
      operationKey:
        request.headers.get("idempotency-key")?.trim() ||
        `invoice-finalize:${workOrder.shop_id}:${workOrderId}`,
    });
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
            supabase: admin,
            invoiceId,
            workOrderId,
            shopId: workOrder.shop_id,
            actorUserId: access.authUserId,
          });
        },
      },
      {
        step: "invoice_finalized_audit_log",
        run: () =>
          logOperationalEvent({
            supabase: admin,
            event: "invoice_finalized",
            entityType: "invoice_version",
            entityId: version.id,
            details: {
              work_order_id: workOrderId,
              invoice_id: invoiceId,
              invoice_total: version.total,
            },
          }),
      },
    ]);

    return NextResponse.json({
      ok: true,
      invoiceId,
      invoiceVersionId: version.id,
      invoiceVersion: version,
      inspectionAttachment,
      finalizedWithWarnings: warnings.length > 0 || undefined,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error) {
    console.error("[invoices/finalize] failed", {
      workOrderId: workOrderId || null,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          "Invoice finalization failed. Please retry; if it continues, contact support.",
      },
      { status: 500 },
    );
  }
}
