import { NextResponse } from "next/server";
import {
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();

  const { count, error: cErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", access.profile.shop_id);

  if (cErr) {
    return NextResponse.json({ error: cErr.message || "Failed to count users" }, { status: 500 });
  }

  return NextResponse.json({ count: typeof count === "number" ? count : 0 });
}
