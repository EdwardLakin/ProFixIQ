// app/api/admin/staff-invite-candidates/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const MAX_ROWS = 500;

// ✅ Canonical invite statuses (status is TEXT)
const INVITE_STATUS = {
  pending: "pending",
  invited: "invited",
  created: "created",
  error: "error",
} as const;

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const status = (searchParams.get("status")?.trim() ?? INVITE_STATUS.pending).toLowerCase();

  const admin = createAdminSupabase();

  let query = admin
    .from("staff_invite_candidates")
    .select(
      "id, shop_id, intake_id, full_name, email, phone, username, role, source, confidence, notes, status, created_at, updated_at, created_user_id, created_profile_id, error",
    )
     .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  // ✅ default = pending, but allow ?status=invited|created|error|all
  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,username.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to load candidates" }, { status: 500 });
  }

  return NextResponse.json({ candidates: data ?? [], status });
}
