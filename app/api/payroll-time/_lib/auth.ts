import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

export async function requirePayrollReviewer(options?: { finalize?: boolean }) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me?.shop_id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Missing shop context" }, { status: 403 }),
    };
  }

  const caps = getActorCapabilities({ role: me.role });
  const allowed = options?.finalize
    ? caps.canFinalizeWorkforceTime
    : caps.canReviewWorkforceTime;
  if (!caps.isKnownRole || !allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, me };
}
