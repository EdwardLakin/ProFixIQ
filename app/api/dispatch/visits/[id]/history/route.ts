import { NextResponse } from "next/server";
import { z } from "zod";
import { getVisitHistory } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  canAccessDispatchVisit,
  resolveDispatchProductScope,
} from "@/features/dispatch/server/productScope";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  if (!actor.canManageScheduling && !actor.canPerformAssignedWork) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid service visit id." },
      { status: 400 },
    );
  }

  try {
    const productScope = await resolveDispatchProductScope(access);
    if (
      !(await canAccessDispatchVisit({
        access,
        scope: productScope,
        visitId: id,
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const events = await getVisitHistory({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      visitId: id,
      actorUserId: access.profile.id,
    });
    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
