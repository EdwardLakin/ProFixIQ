// app/api/scheduling/shifts/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

type DB = Database;

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

type RouteContext = {
  params: Record<string, string>;
};

function safeRole(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

async function authz() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me || !me.shop_id) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Missing shop" }, { status: 403 }),
    };
  }

  const isAdmin = ADMIN_ROLES.has(safeRole(me.role));
  return { ok: true as const, me, isAdmin };
}

type ShiftUpdate = Pick<
  DB["public"]["Tables"]["tech_shifts"]["Update"],
  "start_time" | "end_time" | "type" | "status"
>;

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = ctx.params["id"] ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing shift id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | Partial<ShiftUpdate>
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only allow specific fields
  const update: Partial<ShiftUpdate> = {
    ...(body.start_time !== undefined ? { start_time: body.start_time } : {}),
    ...(body.end_time !== undefined ? { end_time: body.end_time } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  };

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Enforce same-shop on the shift row itself
  const { data: shift, error: sErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  if (shift.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("tech_shifts").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = ctx.params["id"] ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing shift id" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Enforce same-shop
  const { data: shift, error: sErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  if (shift.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("tech_shifts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}