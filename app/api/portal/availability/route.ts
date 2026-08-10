import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getSchedulingAvailability } from "@/features/scheduling/server/availability";

export async function GET(request: NextRequest) {
  try {
    const shopSlug = request.nextUrl.searchParams.get("shop")?.trim() ?? "";
    const startYMD = request.nextUrl.searchParams.get("start")?.trim() ?? "";
    const endYMD = request.nextUrl.searchParams.get("end")?.trim() ?? "";
    const slotMinutes = Math.max(
      5,
      Math.min(480, Number(request.nextUrl.searchParams.get("slotMins") ?? 30)),
    );

    if (!shopSlug || !startYMD || !endYMD) {
      return NextResponse.json(
        { error: "Missing required params: shop, start, end" },
        { status: 400 },
      );
    }

    const availability = await getSchedulingAvailability({
      supabase: createServerSupabaseRoute(),
      shopSlug,
      startYMD,
      endYMD,
      slotMinutes,
      mode: "shop",
      publicOnly: true,
      requireOnlineBooking: true,
    });

    // Preserve the public portal contract and do not expose internal bay/truck
    // resource identities. Resource-level capacity remains server-side truth.
    return NextResponse.json(
      {
        tz: availability.tz,
        disabled: availability.disabled,
        slots: availability.slots.map((slot) => ({
          start: slot.start,
          end: slot.end,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to compute availability",
      },
      { status: 500 },
    );
  }
}
