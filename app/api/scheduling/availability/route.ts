import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getSchedulingAvailability } from "@/features/scheduling/server/availability";

export async function GET(request: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  const start = request.nextUrl.searchParams.get("start")?.trim() ?? "";
  const end = request.nextUrl.searchParams.get("end")?.trim() ?? "";
  const mode = request.nextUrl.searchParams.get("mode") === "mobile" ? "mobile" : "shop";
  const resourceId = request.nextUrl.searchParams.get("resourceId")?.trim() || null;
  const slotMinutes = Math.max(
    5,
    Math.min(480, Number(request.nextUrl.searchParams.get("slotMins") ?? 30)),
  );

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  try {
    const result = await getSchedulingAvailability({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      startYMD: start,
      endYMD: end,
      slotMinutes,
      mode,
      publicOnly: false,
      requireOnlineBooking: false,
      resourceId,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load availability." },
      { status: 500 },
    );
  }
}
