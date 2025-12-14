// app/api/admin/users/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

type DB = Database;

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

async function getCaller(_req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me || !me.shop_id) {
    return { ok: false as const, res: NextResponse.json({ error: "Profile not found or missing shop" }, { status: 403 }) };
  }

  const role = String(me.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, me };
}

async function assertTargetInSameShop(admin: ReturnType<typeof createAdminSupabase>, shopId: string, targetId: string) {
  const { data: target, error } = await admin
    .from("profiles")
    .select("id, shop_id")
    .eq("id", targetId)
    .maybeSingle();

  if (error) return { ok: false as const, message: error.message };
  if (!target) return { ok: false as const, message: "Target user not found" };
  if (target.shop_id !== shopId) return { ok: false as const, message: "Target user not in your shop" };

  return { ok: true as const };
}

// ✅ PUT /api/admin/users/:id
export async function PUT(req: NextRequest, context: unknown) {
  const { params } = context as { params: { id: string } };
  const id = params?.id;

  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const caller = await getCaller(req);
  if (!caller.ok) return caller.res;

  const body = (await req.json().catch(() => null)) as
    | { full_name?: string | null; role?: DB["public"]["Enums"]["user_role_enum"] | null }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.full_name === undefined && body.role === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const check = await assertTargetInSameShop(admin, caller.me.shop_id!, id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  const { error } = await admin
    .from("profiles")
    .update({
      ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ✅ DELETE /api/admin/users/:id
export async function DELETE(req: NextRequest, context: unknown) {
  const { params } = context as { params: { id: string } };
  const id = params?.id;

  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const caller = await getCaller(req);
  if (!caller.ok) return caller.res;

  const admin = createAdminSupabase();

  const check = await assertTargetInSameShop(admin, caller.me.shop_id!, id);
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 403 });

  // Delete profile row first
  const { error: profileErr } = await admin.from("profiles").delete().eq("id", id);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  // Delete auth user
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json(
      { ok: false, warning: "Profile deleted but failed to delete auth user", error: authErr.message },
      { status: 207 },
    );
  }

  return NextResponse.json({ ok: true });
}