import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

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

  const actor = getActorCapabilities({ role: me.role });
  const isAdmin = actor.isKnownRole && actor.canManageScheduling;
  return { ok: true as const, me, isAdmin };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_req: NextRequest, _context: RouteContext) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(
    {
      error:
        "Legacy job sessions are read-only. Correct canonical labor segments from Workforce time review.",
    },
    { status: 410 },
  );
}

export async function DELETE(_req: NextRequest, _context: RouteContext) {
  const a = await authz();
  if (!a.ok) return a.res;
  if (!a.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(
    {
      error:
        "Legacy job sessions are read-only. Correct canonical labor segments from Workforce time review.",
    },
    { status: 410 },
  );
}
