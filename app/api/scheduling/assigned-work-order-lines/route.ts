// app/api/scheduling/assigned-work-order-lines/route.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

const ADMIN_ROLES = new Set<string>(["owner", "admin"]);

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

export async function GET(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const shopId = searchParams.get("shop_id");
  const workOrderId = searchParams.get("work_order_id");

  if (!shopId || !userId || !workOrderId) {
    return NextResponse.json(
      { error: "Missing shop_id, user_id, or work_order_id" },
      { status: 400 },
    );
  }

  if (shopId !== a.me.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const effectiveUserId = a.isAdmin ? userId : a.me.id;
  const admin = createAdminSupabase();

  // 1) Lines directly assigned via assigned_tech_id
  const { data: directLines, error: dErr } = await admin
    .from("work_order_lines")
    .select("id, work_order_id, description, complaint, job_type, created_at")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("assigned_tech_id", effectiveUserId)
    .order("created_at", { ascending: true });

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // 2) Lines assigned via many-to-many join table
  const { data: joinRows, error: jErr } = await admin
    .from("work_order_line_technicians")
    .select("work_order_line_id")
    .eq("technician_id", effectiveUserId);

  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

  const joinLineIds = Array.from(
    new Set((joinRows ?? []).map((r) => r.work_order_line_id).filter(Boolean)),
  ) as string[];

  let joinLines: Array<{
    id: string;
    work_order_id: string | null;
    description: string | null;
    complaint: string | null;
    job_type: string | null;
    created_at: string | null;
  }> = [];

  if (joinLineIds.length > 0) {
    const { data: jl, error: jlErr } = await admin
      .from("work_order_lines")
      .select("id, work_order_id, description, complaint, job_type, created_at")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId)
      .in("id", joinLineIds)
      .order("created_at", { ascending: true });

    if (jlErr) return NextResponse.json({ error: jlErr.message }, { status: 500 });
    joinLines = jl ?? [];
  }

  // Merge + de-dupe
  const map = new Map<string, (typeof joinLines)[number]>();
  for (const l of directLines ?? []) map.set(l.id, l);
  for (const l of joinLines) map.set(l.id, l);

  return NextResponse.json({ lines: Array.from(map.values()) });
}