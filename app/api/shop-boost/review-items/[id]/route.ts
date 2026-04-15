import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const body = (await req.json().catch(() => ({}))) as {
    status?: "pending" | "resolved" | "dismissed";
    resolution_action?: "linked_to_existing" | "created_new" | "ignored";
  };

  const admin = createAdminSupabase() as any;
  const { error } = await admin
    .from("shop_boost_review_items")
    .update({
      status: body.status ?? "resolved",
      resolution_action: body.resolution_action ?? "ignored",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("shop_id", profile.shop_id)
    .eq("id", params.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
