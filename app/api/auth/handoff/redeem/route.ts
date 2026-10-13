export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  handoffFailureUrl,
  isTrustedHandoffNavigation,
  isValidHandoffBind,
  isValidHandoffTokenHash,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  handoffNonceCookieName,
  handoffNonceMatches,
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
 * minted elsewhere and planted in a link cannot log a victim in as someone
 * else. Only a verified session reaches `next`; every failure goes to sign-in,
 * because this host may already hold a different account's session and
 * silently opening a workspace under it would be the wrong tenant. The token
 * is never echoed.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const bind = req.nextUrl.searchParams.get("bind");
  const cookieName = isValidHandoffBind(bind)
    ? handoffNonceCookieName(bind)
    : null;

  const respond = (location: string) => {
    const res = NextResponse.redirect(location, {
      status: 303,
      headers: NO_STORE,
    });
    // Single-use: clear only this handoff's nonce, so a failed or stale attempt
    // never deletes the nonce of another handoff running in a different tab.
    if (cookieName) {
      res.cookies.set(cookieName, "", {
        ...HANDOFF_NONCE_COOKIE_OPTIONS,
        maxAge: 0,
      });
    }
    return res;
  };
  const failed = () => respond(handoffFailureUrl(origin));

  const next = safeHandoffPath(req.nextUrl.searchParams.get("next"));
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  if (
    !next ||
    !cookieName ||
    !isValidHandoffBind(bind) ||
    !isTrustedHandoffNavigation(req.headers) ||
    !isValidHandoffTokenHash(tokenHash) ||
    !handoffNonceMatches(req.cookies.get(cookieName)?.value, bind)
  ) {
    return failed();
  }

  try {
    const { data, error } = await createServerSupabaseRoute().auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error || !data?.session) return failed();
  } catch {
    return failed();
  }
  return respond(new URL(next, origin).toString());
}
