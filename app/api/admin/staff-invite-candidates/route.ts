// app/api/admin/staff-invite-candidates/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const MAX_ROWS = 500;
const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

// ✅ Canonical invite statuses (status is TEXT)
const INVITE_STATUS = {
  pending: "pending",
  invited: "invited",
  created: "created",
  error: "error",
} as const;

export async function GET(req: Request) {
  const supabaseUser = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const status = (searchParams.get("status")?.trim() ?? INVITE_STATUS.pending).toLowerCase();

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me || !me.shop_id) {
    return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
  }

  const role = String(me.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabase();

  let query = admin
    .from("staff_invite_candidates")
    .select(
      "id, shop_id, intake_id, full_name, email, phone, username, role, source, confidence, notes, status, created_at, updated_at, created_user_id, created_profile_id, error",
    )
    .eq("shop_id", me.shop_id)
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