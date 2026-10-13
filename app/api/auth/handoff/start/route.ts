export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  handoffFailureUrl,
  HANDOFF_REDEEM_PATH,
  isTrustedHandoffNavigation,
  isValidHandoffBind,
  resolveHandoffTarget,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import { verifyHandoffState } from "@/features/shared/lib/server/hostHandoffBinding";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * Source side (step 2) of the cross-host handoff: for the signed-in user, mint
 * a single-use Supabase OTP and send the browser to the target host's redeem
 * route. It only acts on state signed by `begin`, and only for a top-level
 * navigation, so a page cannot trigger minting by embedding or forging a
 * request. Every failure goes to the target's sign-in, never to `next`.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const target = resolveHandoffTarget(params.get("target"));
  const next = safeHandoffPath(params.get("next"));
  const bind = params.get("bind");
  const exp = Number(params.get("exp"));
  if (
    !target ||
    !next ||
    !isValidHandoffBind(bind) ||
    !verifyHandoffState({ target, next, bind, exp }, params.get("sig"))
  ) {
    return NextResponse.json(
      { error: "Invalid handoff request." },
      { status: 400, headers: NO_STORE },
    );
  }

  const failed = () =>
    NextResponse.redirect(handoffFailureUrl(target), {
      status: 303,
      headers: NO_STORE,
    });
  if (!isTrustedHandoffNavigation(req.headers)) return failed();

  try {
    const {
      data: { user },
    } = await createServerSupabaseRoute().auth.getUser();
    if (!user?.email) return failed();

    const { data, error } = await createAdminSupabase().auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) return failed();

    const redeem = new URL(HANDOFF_REDEEM_PATH, target);
    redeem.searchParams.set("token_hash", tokenHash);
    redeem.searchParams.set("next", next);
    redeem.searchParams.set("bind", bind);
    return NextResponse.redirect(redeem, { status: 303, headers: NO_STORE });
  } catch {
    return failed();
  }
}
