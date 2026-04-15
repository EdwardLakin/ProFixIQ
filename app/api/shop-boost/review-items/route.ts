import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

export async function GET(req: Request) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  const status = url.searchParams.get("status") ?? "pending";

  const admin = createAdminSupabase() as any;
  let query = admin
    .from("shop_boost_review_items")
    .select("id,domain,issue_type,summary,raw_payload,suggested_matches,status,resolution_action,resolved_at,materialized_at,materialization_error,materialized_record,created_at")
    .eq("shop_id", profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(250);

  if (domain) query = query.eq("domain", domain);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}
