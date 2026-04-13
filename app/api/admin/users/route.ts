// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const MAX_ROWS = 500;

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const admin = createAdminSupabase();

  let query = admin
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, shop_id")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: users, error: usersErr } = await query;

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message || "Failed to load users" }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
