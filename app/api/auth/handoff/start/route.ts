export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  HANDOFF_REDEEM_PATH,
  isValidHandoffBind,
  resolveHandoffTarget,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * Source side (step 2) of the cross-host handoff: for the signed-in user, mint a
 * single-use Supabase OTP and send the browser to the target host's redeem
 * route. If anything prevents minting, fall through to a plain navigation so
 * the target host's own sign-in handles the user.
 */
export async function GET(req: NextRequest) {
  const target = resolveHandoffTarget(req.nextUrl.searchParams.get("target"));
  const next = safeHandoffPath(req.nextUrl.searchParams.get("next"));
  const bind = req.nextUrl.searchParams.get("bind");
  if (!target || !next || !isValidHandoffBind(bind)) {
    return NextResponse.json(
      { error: "Invalid handoff request." },
      { status: 400, headers: NO_STORE },
    );
  }

  const plain = NextResponse.redirect(new URL(next, target), {
    status: 303,
    headers: NO_STORE,
  });

  try {
    const {
      data: { user },
    } = await createServerSupabaseRoute().auth.getUser();
    if (!user?.email) return plain;

    const { data, error } = await createAdminSupabase().auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) return plain;

    const redeem = new URL(HANDOFF_REDEEM_PATH, target);
    redeem.searchParams.set("token_hash", tokenHash);
    redeem.searchParams.set("next", next);
    redeem.searchParams.set("bind", bind);
    return NextResponse.redirect(redeem, { status: 303, headers: NO_STORE });
  } catch {
    return plain;
  }
}
