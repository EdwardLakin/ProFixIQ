import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

type DB = Database;

export async function POST() {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: prof, error: profErr } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (profErr || !prof?.shop_id) {
    return NextResponse.json({ ok: false, error: "No shop linked to your profile." }, { status: 400 });
  }

  const shopId = prof.shop_id;
  const supabaseAdmin = createAdminSupabase();

  const { data: intakeRow, error: intakeErr } = await supabaseAdmin
    .from("shop_boost_intakes")
    .select("id")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (intakeErr) {
    return NextResponse.json({ ok: false, error: intakeErr.message }, { status: 500 });
  }

  if (!intakeRow?.id) {
    return NextResponse.json({ ok: false, error: "No intake found yet. Upload files once first." }, { status: 404 });
  }

  const snapshot = await buildShopBoostProfile({ shopId, intakeId: intakeRow.id });

  return NextResponse.json({ ok: !!snapshot, snapshot: snapshot ?? null }, { status: 200 });
}