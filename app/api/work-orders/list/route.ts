import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { listWorkOrdersForActorShop } from "@/features/work-orders/lib/work-orders/listWorkOrders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userSupabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(userSupabase);

  if (!actor.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.shopId) return NextResponse.json({ error: "Shop assignment required" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("q") ?? "";
  const seededShop = url.searchParams.get("seededShop") === "1";
  const workforceDrilldownActive =
    url.searchParams.get("assignment") === "unassigned" &&
    url.searchParams.get("statusFilter") === "active" &&
    url.searchParams.get("source") === "workforce";

  try {
    const result = await listWorkOrdersForActorShop(createAdminSupabase(), {
      shopId: actor.shopId,
      status,
      search,
      seededShop,
      workforceDrilldownActive,
      limit: 100,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[work-orders:list] failed to load same-shop work orders", {
      actorUserPresent: Boolean(actor.user?.id),
      actorProfileId: actor.profile?.id ?? null,
      actorRole: actor.role ?? null,
      actorShopId: actor.shopId,
      workOrderQueryShopId: actor.shopId,
      customerQueryShopId: actor.shopId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to load work orders." }, { status: 500 });
  }
}
