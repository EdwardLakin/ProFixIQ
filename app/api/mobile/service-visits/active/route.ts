import { NextResponse } from "next/server";
import { getMobileActiveJobs } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";

export async function GET() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    const snapshot = await getMobileActiveJobs({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return dispatchErrorResponse(error);
  }
}
