export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";


const ALLOWED_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

export async function GET(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr || !me?.shop_id) {
      return NextResponse.json(
        { error: meErr?.message ?? "Profile not found" },
        { status: 403 },
      );
    }

    const role = String(me.role ?? "").toLowerCase();
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 25;

    const { data, error } = await supabase
      .from("email_logs")
      .select(
        "id, to_email, subject, template_key, status, provider, provider_message_id, error_text, created_at, sent_at, metadata",
      )
      .eq("shop_id", me.shop_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
