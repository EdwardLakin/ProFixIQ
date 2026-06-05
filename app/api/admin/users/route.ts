// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const MAX_ROWS = 20;

function escapePostgrestSearchValue(value: string): string {
  return value.replace(/[\\%_,]/g, (char) => `\\${char}`);
}

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
    .select("id, full_name, email, phone, role, username, created_at, shop_id")
    .eq("shop_id", access.profile.shop_id)
    .order("full_name", { ascending: true, nullsFirst: false })
    .order("username", { ascending: true, nullsFirst: false })
    .limit(MAX_ROWS);

  if (q) {
    const like = `%${escapePostgrestSearchValue(q)}%`;
    query = query.or([
      `full_name.ilike.${like}`,
      `email.ilike.${like}`,
      `username.ilike.${like}`,
      `phone.ilike.${like}`,
      `role.ilike.${like}`,
    ].join(","));
  }

  const { data: users, error: usersErr } = await query;

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message || "Failed to load users" }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
