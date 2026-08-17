import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

function cleanSearch(value: string | null): string {
  return (value ?? "")
    .replace(/[,%_().]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const search = cleanSearch(url.searchParams.get("q"));
  const admin = createAdminSupabase();

  let partsQuery = admin
    .from("parts")
    .select(
      "id,shop_id,name,sku,part_number,category,default_cost,cost,price",
    )
    .eq("shop_id", access.profile.shop_id)
    .order("name")
    .limit(50);

  if (search) {
    const pattern = `%${search}%`;
    partsQuery = partsQuery.or(
      `name.ilike.${pattern},sku.ilike.${pattern},part_number.ilike.${pattern},category.ilike.${pattern}`,
    );
  }

  const [partsResult, locationsResult] = await Promise.all([
    partsQuery,
    admin
      .from("stock_locations")
      .select("id,code,name,shop_id")
      .eq("shop_id", access.profile.shop_id)
      .order("code"),
  ]);

  if (partsResult.error) {
    return NextResponse.json(
      { error: partsResult.error.message || "Unable to load parts inventory." },
      { status: 500 },
    );
  }
  if (locationsResult.error) {
    return NextResponse.json(
      {
        error:
          locationsResult.error.message ||
          "Unable to load inventory locations.",
      },
      { status: 500 },
    );
  }

  const parts = partsResult.data ?? [];
  const partIds = parts.map((part) => part.id);
  const stockResult = partIds.length
    ? await admin
        .from("v_part_stock")
        .select(
          "part_id,location_id,qty_available,qty_on_hand,qty_reserved",
        )
        .in("part_id", partIds)
    : { data: [], error: null };

  if (stockResult.error) {
    return NextResponse.json(
      { error: stockResult.error.message || "Unable to load inventory stock." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      shopId: access.profile.shop_id,
      parts,
      locations: locationsResult.data ?? [],
      stock: stockResult.data ?? [],
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
