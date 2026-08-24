// app/api/work-orders/[id]/invoice/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import {
  getCanonicalDocumentIdentity,
  overlayCanonicalDocumentIdentity,
} from "@/features/invoices/server/canonicalDocumentIdentity";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import { reviewWorkOrder } from "../_lib/reviewWorkOrder";

type RouteContext = { params: Promise<{ id: string }> };

type AuthorizedInvoiceRequest = {
  supabase: Awaited<ReturnType<typeof requireShopScopedApiAccess>> extends infer T
    ? T extends { ok: true; supabase: infer S }
      ? S
      : never
    : never;
  shopId: string;
  workOrderId: string;
};

function invoiceError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function authorizeInvoiceRequest(input: {
  context: RouteContext;
  required: "view" | "manage";
}): Promise<
  | { ok: true; value: AuthorizedInvoiceRequest }
  | { ok: false; response: NextResponse }
> {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access;

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: access.supabase,
    profileId: access.profile.id,
    shopId: access.profile.shop_id,
  });
  if (financial.error) {
    return {
      ok: false,
      response: invoiceError("Authorization service unavailable", 503),
    };
  }

  const permitted =
    input.required === "manage"
      ? financial.access.canManageInvoice
      : financial.access.canViewInvoice;
  if (!permitted) {
    return { ok: false, response: invoiceError("Forbidden", 403) };
  }

  const params = await input.context.params;
  const workOrderId = typeof params?.id === "string" ? params.id.trim() : "";
  if (!workOrderId) {
    return {
      ok: false,
      response: invoiceError("Missing work order id", 400),
    };
  }

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle<{ id: string }>();
  if (workOrderError) {
    console.error("[work-order invoice] scope check failed", {
      workOrderId,
      shopId: access.profile.shop_id,
      actorId: access.authUserId,
      message: workOrderError.message,
    });
    return {
      ok: false,
      response: invoiceError("Invoice could not be loaded", 500),
    };
  }
  if (!workOrder?.id) {
    return {
      ok: false,
      response: invoiceError("Work order not found", 404),
    };
  }

  return {
    ok: true,
    value: {
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      workOrderId,
    },
  };
}

export async function POST(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeInvoiceRequest({
    context,
    required: "manage",
  });
  if (!authorization.ok) return authorization.response;

  const { supabase, shopId, workOrderId } = authorization.value;
  try {
    const result = await reviewWorkOrder({
      supabase,
      workOrderId,
      shopId,
      kind: "invoice_review",
    });
    if (!result.ok && result.issues.some((issue) => issue.kind === "missing_wo")) {
      return NextResponse.json(result, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[work-order invoice] review failed", {
      workOrderId,
      shopId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return invoiceError("Invoice review failed", 500);
  }
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeInvoiceRequest({
    context,
    required: "view",
  });
  if (!authorization.ok) return authorization.response;

  const { supabase, shopId, workOrderId } = authorization.value;
  try {
    const activeInvoiceVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId,
    });
    const storedSnapshot =
      activeInvoiceVersion?.snapshot ??
      (await getIssuableInvoiceSnapshot({
        supabase,
        workOrderId,
        shopId,
      }));
    const identity = await getCanonicalDocumentIdentity({
      supabase,
      workOrderId,
      shopId,
      invoiceId: activeInvoiceVersion?.invoice_id,
    });
    const snapshot = overlayCanonicalDocumentIdentity(storedSnapshot, identity);

    return NextResponse.json(
      {
        snapshot,
        activeInvoiceVersion,
        documentIdentity: identity,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[work-order invoice] snapshot failed", {
      workOrderId,
      shopId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return invoiceError("Invoice snapshot failed", 500);
  }
}
