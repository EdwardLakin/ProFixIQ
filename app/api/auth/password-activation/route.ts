export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { clearCanonicalPasswordRequirement } from "@/features/auth/server/passwordActivation";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST() {
  const sessionClient = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const result = await clearCanonicalPasswordRequirement({
    authUserId: user.id,
    sessionClient,
    adminClient: createAdminSupabase(),
  });

  if (!result.ok) {
    console.error("[password-activation] canonical profile update failed", {
      authUserId: user.id,
      detail: result.detail,
    });
    return NextResponse.json(
      { ok: false, error: "Account activation could not be completed." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
