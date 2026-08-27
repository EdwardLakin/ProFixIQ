import { NextResponse } from "next/server";

import {
  finalizeWorkOrderInvoice,
  InvoiceFinalizationError,
} from "@/features/invoices/server/finalizeWorkOrderInvoice";
import { resolveWorkOrderProductAuthority } from "@/features/mobile/service/server/access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

type Body = { workOrderId?: string };

export async function POST(request: Request) {
  let workOrderId = "";
  try {
    const access = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
      requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
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

    let productAuthority: Awaited<
      ReturnType<typeof resolveWorkOrderProductAuthority>
    >;
    try {
      productAuthority = await resolveWorkOrderProductAuthority(
        access,
        workOrderId,
      );
    } catch {
      return NextResponse.json(
        { error: "Authorization service unavailable" },
        { status: 503 },
      );
    }
    if (!productAuthority.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const actor = getActorCapabilities({ role: access.profile.role });
    const standardInvoiceAuthority =
      productAuthority.product === "shop" &&
      ["owner", "admin", "manager", "advisor", "service"].includes(
        access.canonicalRole,
      ) &&
      actor.canManageWorkOrders &&
      actor.canAuthorizeQuotes;
    const mobileFieldAuthority = productAuthority.product === "field";
    if (!standardInvoiceAuthority && !mobileFieldAuthority) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await finalizeWorkOrderInvoice({
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      workOrderId,
      actorProfileId: access.profile.id,
      actorAuthUserId: access.authUserId,
      operationKey:
        request.headers.get("idempotency-key")?.trim() ||
        `invoice-finalize:${access.profile.shop_id}:${workOrderId}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[invoices/finalize] failed", {
      workOrderId: workOrderId || null,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof InvoiceFinalizationError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ?? {}) },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          "Invoice finalization failed. Please retry; if it continues, contact support.",
      },
      { status: 500 },
    );
  }
}
