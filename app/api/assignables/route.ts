// app/api/assignables/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side ONLY
);

export async function GET() {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canAssignWork" });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;

  let query = supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
    .order("full_name", { ascending: true });

  query = query.eq("shop_id", shopId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
