import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { listWorkOrderBoardRowsForActorShop } from "@/features/work-orders/lib/work-orders/listWorkOrders";
import type { WorkOrderBoardVariant } from "@/features/shared/lib/workboard/types";

export const dynamic = "force-dynamic";

function parseVariant(value: string | null): WorkOrderBoardVariant {
  if (value === "fleet" || value === "portal") return value;
  return "shop";
}

export async function GET(request: Request) {
  const userSupabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(userSupabase);

  if (!actor.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.shopId) return NextResponse.json({ error: "Shop assignment required" }, { status: 403 });

  const url = new URL(request.url);
  const variant = parseVariant(url.searchParams.get("variant"));
  const fleetId = url.searchParams.get("fleetId");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const rows = await listWorkOrderBoardRowsForActorShop(createAdminSupabase(), {
      shopId: actor.shopId,
      variant,
      fleetId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[work-order-board] failed to load same-shop board rows", {
      actorUserPresent: Boolean(actor.user?.id),
      actorProfileId: actor.profile?.id ?? null,
      actorRole: actor.role ?? null,
      actorShopId: actor.shopId,
      workOrderQueryShopId: actor.shopId,
      customerQueryShopId: actor.shopId,
      variant,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to load work order board." }, { status: 500 });
  }
}
