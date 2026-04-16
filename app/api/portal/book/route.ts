import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  createPortalBooking,
  type CreatePortalBookingInput,
} from "@/features/portal/server/createPortalBooking";

export const runtime = "nodejs";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) return bad("Not authenticated", 401);

    const body = (await req.json()) as CreatePortalBookingInput;
    const result = await createPortalBooking({
      supabase,
      userId: user.id,
      input: body,
      actorMode: "allow-staff",
    });

    if (!result.ok) return bad(result.error, result.status);
    return NextResponse.json({ booking: result.booking }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Booking error:", message);
    return bad("Unexpected error", 500);
  }
}
