import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getMaintenanceMappings } from "@/features/maintenance/server/getMaintenanceMappings";


type UpsertBody = {
  serviceCode?: string;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
  labelOverride?: string | null;
  isActive?: boolean;
  confidence?: number | null;
  matchSource?: string | null;
};

async function requireShopContext(supabase: ReturnType<typeof createServerSupabaseRoute>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return {
      error: NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 }),
    };
  }

  return {
    user,
    shopId: profile.shop_id as string,
    role: (profile.role ?? "") as string,
  };
}

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const ctx = await requireShopContext(supabase);
  if ("error" in ctx) return ctx.error;

  try {
    const mappings = await getMaintenanceMappings({
      supabase,
      shopId: ctx.shopId,
    });

    return NextResponse.json({ ok: true, mappings });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load maintenance mappings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const ctx = await requireShopContext(supabase);
  if ("error" in ctx) return ctx.error;

  const body = (await req.json().catch(() => null)) as UpsertBody | null;
  const serviceCode = body?.serviceCode?.trim();

  if (!serviceCode) {
    return NextResponse.json({ error: "serviceCode is required" }, { status: 400 });
  }

  if (!body?.menuItemId && !body?.menuRepairItemId) {
    return NextResponse.json(
      { error: "menuItemId or menuRepairItemId is required" },
      { status: 400 },
    );
  }

  try {
    const payload = {
      shop_id: ctx.shopId,
      service_code: serviceCode,
      menu_item_id: body.menuItemId ?? null,
      menu_repair_item_id: body.menuRepairItemId ?? null,
      label_override: body.labelOverride ?? null,
      is_active: body.isActive ?? true,
      confidence: body.confidence ?? null,
      match_source: body.matchSource ?? "manual",
    };

    const { data, error } = await supabase
      .from("shop_maintenance_service_map")
      .upsert(payload, { onConflict: "shop_id,service_code" })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, mapping: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save maintenance mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
