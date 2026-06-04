import { NextResponse } from "next/server";
import { createOrResumeGuidedSession, guardedJsonError, requireGuidedOwnerAdminAccess } from "@/features/onboarding-v2/guided/server";

export async function POST() {
  const access = await requireGuidedOwnerAdminAccess();
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Missing shop context" }, { status: 403 });

  try {
    const payload = await createOrResumeGuidedSession({ supabase: access.supabase, shopId, userId: access.profile.id });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return guardedJsonError(error);
  }
}
