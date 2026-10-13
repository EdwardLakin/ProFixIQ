export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  isTrustedHandoffNavigation,
  isValidHandoffTokenHash,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * Target side of the cross-host handoff: exchange the single-use OTP for a
 * session on this host. On any failure the user still lands on `next`, where
 * normal sign-in applies; the token is never echoed back.
 */
export async function GET(req: NextRequest) {
  const next = safeHandoffPath(req.nextUrl.searchParams.get("next")) ?? "/";
  const destination = NextResponse.redirect(new URL(next, req.nextUrl.origin), {
    status: 303,
    headers: NO_STORE,
  });

  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  if (!isTrustedHandoffNavigation(req.headers) || !isValidHandoffTokenHash(tokenHash)) {
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
