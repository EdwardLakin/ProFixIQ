export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  isTrustedHandoffNavigation,
  isValidHandoffBind,
  isValidHandoffTokenHash,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  handoffNonceMatches,
  HANDOFF_NONCE_COOKIE,
  HANDOFF_NONCE_COOKIE_OPTIONS,
} from "@/features/shared/lib/server/hostHandoffBinding";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * Target side (step 3) of the cross-host handoff. The token only redeems in
 * the browser that began the handoff (nonce cookie matches `bind`), so a token
 * minted elsewhere and planted in a link cannot log a victim in as someone else: exchange the single-use OTP for a
 * session on this host. On any failure the user still lands on `next`, where
 * normal sign-in applies; the token is never echoed back.
 */
export async function GET(req: NextRequest) {
  const next = safeHandoffPath(req.nextUrl.searchParams.get("next")) ?? "/";
  const destination = NextResponse.redirect(new URL(next, req.nextUrl.origin), {
    status: 303,
    headers: NO_STORE,
  });

  // The nonce is single-use: clear it whatever happens below.
  const nonce = req.cookies.get(HANDOFF_NONCE_COOKIE)?.value;
  destination.cookies.set(HANDOFF_NONCE_COOKIE, "", {
    ...HANDOFF_NONCE_COOKIE_OPTIONS,
    maxAge: 0,
  });

  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const bind = req.nextUrl.searchParams.get("bind");
  if (
    !isTrustedHandoffNavigation(req.headers) ||
    !isValidHandoffTokenHash(tokenHash) ||
    !isValidHandoffBind(bind) ||
    !handoffNonceMatches(nonce, bind)
  ) {
    return destination;
  }

  try {
    await createServerSupabaseRoute().auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
  } catch {
    // Fall through to sign-in on the destination.
  }
  return destination;
}
