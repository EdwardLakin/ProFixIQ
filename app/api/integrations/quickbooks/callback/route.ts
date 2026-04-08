export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { decodeQuickBooksState } from "@/features/integrations/quickbooks/server/state";
import { exchangeQuickBooksCodeForTokens } from "@/features/integrations/quickbooks/server/http";
import {
  getAppBaseUrl,
  getQuickBooksEnvironment,
  getQuickBooksRedirectUri,
} from "@/features/integrations/quickbooks/server/env";

const STATE_COOKIE = "pfq_qbo_oauth_state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const realmId = url.searchParams.get("realmId")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error")?.trim() ?? "";
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${STATE_COOKIE}=`))
    ?.slice(`${STATE_COOKIE}=`.length);

  const redirectBase = `${getAppBaseUrl()}/dashboard/owner/settings/integrations/quickbooks`;

  if (error) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !realmId || !state || !cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent("Invalid QuickBooks callback state.")}`,
    );
  }

  const decoded = decodeQuickBooksState(state);
  if (!decoded?.shopId || !decoded?.userId) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent("Invalid QuickBooks OAuth state.")}`,
    );
  }

  try {
    const tokenResponse = await exchangeQuickBooksCodeForTokens(
      code,
      getQuickBooksRedirectUri(),
    );

    const supabase = createServerSupabaseRoute();

    const accessTokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    ).toISOString();

    const refreshTokenExpiresAt =
      typeof tokenResponse.x_refresh_token_expires_in === "number"
        ? new Date(
            Date.now() + tokenResponse.x_refresh_token_expires_in * 1000,
          ).toISOString()
        : null;

    const payload = {
      shop_id: decoded.shopId,
      created_by: decoded.userId,
      realm_id: realmId,
      environment: getQuickBooksEnvironment(),
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      token_scope: tokenResponse.scope
        ? tokenResponse.scope.split(" ").map((item) => item.trim()).filter(Boolean)
        : [],
      token_type: tokenResponse.token_type ?? null,
      connected_at: new Date().toISOString(),
      is_active: true,
      last_error: null,
      metadata: {},
    };

    const { error: upsertError } = await supabase
      .from("quickbooks_connections")
      .upsert(payload, { onConflict: "shop_id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    const res = NextResponse.redirect(`${redirectBase}?connected=1`);
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to complete QuickBooks connection.";

    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent(message)}`,
    );
  }
}