import { NextRequest, NextResponse } from "next/server";
import { getDispatchBoard } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import {
  filterDispatchBoardForProduct,
  resolveDispatchProductScope,
} from "@/features/dispatch/server/productScope";
import { SHOP_OR_FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function resolveWindow(
  request: NextRequest,
): { startsAt: string; endsAt: string } | null {
  const startsRaw = request.nextUrl.searchParams.get("startsAt")?.trim();
  const endsRaw = request.nextUrl.searchParams.get("endsAt")?.trim();

  if (!startsRaw && !endsRaw) {
    const now = new Date();
    const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { startsAt: start.toISOString(), endsAt: end.toISOString() };
  }

  if (!startsRaw || !endsRaw) return null;
  const start = new Date(startsRaw);
  const end = new Date(endsRaw);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return null;
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export async function GET(request: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
    requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  const window = resolveWindow(request);
  if (!window) {
    return NextResponse.json(
      { error: "Valid startsAt and endsAt values are required together." },
      { status: 400 },
    );
  }

  try {
    const productScope = await resolveDispatchProductScope(access);
    const board = filterDispatchBoardForProduct(
      await getDispatchBoard({
        supabase: access.supabase,
        shopId: access.profile.shop_id,
        actorUserId: access.profile.id,
        ...window,
      }),
      productScope,
    );
    return NextResponse.json(board, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
