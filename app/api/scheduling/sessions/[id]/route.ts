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

type SessionUpdate = Pick<
  DB["public"]["Tables"]["tech_sessions"]["Update"],
  "started_at" | "ended_at" | "work_order_line_id"
>;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabase();

  const body = (await req.json().catch(() => null)) as SessionUpdate | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (
    body.started_at === undefined &&
    body.ended_at === undefined &&
    body.work_order_line_id === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Ensure shop scope
  const { data: existing, error: exErr } = await admin
    .from("tech_sessions")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("tech_sessions").update(body).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabase();

  // Ensure shop scope
  const { data: existing, error: exErr } = await admin
    .from("tech_sessions")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (existing.shop_id !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.from("tech_sessions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
