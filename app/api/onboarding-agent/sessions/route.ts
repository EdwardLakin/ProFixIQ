import { NextResponse } from "next/server";
import { createOnboardingSession } from "@/features/onboarding-agent/server/createOnboardingSession";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { title?: string; source?: string; notes?: string };

  try {
    const result = await createOnboardingSession({
      supabase: access.supabase,
      shopId: access.profile.shop_id as string,
      createdBy: access.profile.id,
      title: body.title,
      source: body.source,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, sessionId: result.sessionId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to create session" }, { status: 500 });
  }
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { data, error } = await (access.supabase as any)
    .from("onboarding_sessions")
    .select("id, title, source, status, summary, stats, created_at, updated_at")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: data ?? [] });
}
