import { NextResponse } from "next/server";
import { resolveCustomerVehicleLink } from "@/features/onboarding-agent/server/resolveCustomerVehicleLink";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id as string;
  const actorId = access.profile.id;
  const admin = createAdminSupabase();
  const { sessionId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action === "link" || body?.action === "skip" ? body.action : null;
    if (!action) {
      return NextResponse.json({ ok: false, error: "action is required: link | skip" }, { status: 400 });
    }
    const result = await resolveCustomerVehicleLink({
      supabase: admin,
      shopId,
      sessionId,
      actorId,
      reviewItemId: typeof body?.reviewItemId === "string" ? body.reviewItemId : undefined,
      stagedLinkId: typeof body?.stagedLinkId === "string" ? body.stagedLinkId : undefined,
      action,
      selectedCustomerId: typeof body?.selectedCustomerId === "string" ? body.selectedCustomerId : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve customer/vehicle link";
    const status = message.includes("not found") ? 404 : message.includes("required") || message.includes("different customer") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
