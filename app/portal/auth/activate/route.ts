import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type PortalOtpType = "invite" | "magiclink" | "signup";

function asPortalOtpType(value: string | null): PortalOtpType | null {
  return value === "invite" || value === "magiclink" || value === "signup"
    ? value
    : null;
}

function activationFailureUrl(req: NextRequest): URL {
  const url = new URL("/portal/auth/sign-in", req.url);
  url.searchParams.set("portal", "customer");
  url.searchParams.set("activation", "invalid");
  return url;
}

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash")?.trim() ?? "";
  const type = asPortalOtpType(req.nextUrl.searchParams.get("type"));
  const inviteId = req.nextUrl.searchParams.get("invite")?.trim() ?? "";
  const next = safeInternalRedirect(
    req.nextUrl.searchParams.get("next"),
    "/auth/set-password?mode=portal&redirect=%2Fportal",
    ["/auth/set-password", "/portal"],
  );

  if (!tokenHash || !type || !inviteId) {
    return NextResponse.redirect(activationFailureUrl(req));
  }

  const supabase = createServerSupabaseRoute();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(activationFailureUrl(req));
  }

  const confirmUrl = new URL("/portal/auth/confirm", req.url);
  confirmUrl.searchParams.set("invite", inviteId);
  confirmUrl.searchParams.set("next", next);
  return NextResponse.redirect(confirmUrl);
}
