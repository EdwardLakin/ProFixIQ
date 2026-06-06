import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export const runtime = "nodejs";


export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json({ error: "Unable to resolve actor profile" }, { status: 403 });
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canAuthorizeQuotes) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2];

    if (!id) {
      return NextResponse.json({ error: "Missing quote line id" }, { status: 400 });
    }

    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("id,shop_id")
      .eq("id", id)
      .single();

    if (qErr || !q) {
      return NextResponse.json({ error: "Quote line not found" }, { status: 404 });
    }

    if (q.shop_id !== profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: updErr } = await supabase
      .from("work_order_quote_lines")
      .update({ status: "declined", declined_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to decline quote" }, { status: 500 });
  }
}
