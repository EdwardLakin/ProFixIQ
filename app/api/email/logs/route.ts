export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "25");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 100)
      : 25;

    const { data, error } = await access.supabase
      .from("email_logs")
      .select(
        "id, to_email, subject, template_key, status, provider, provider_message_id, error_text, created_at, sent_at, metadata",
      )
      .eq("shop_id", access.profile.shop_id)
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
