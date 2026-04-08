export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { decodeQuickBooksState } from "@/features/integrations/quickbooks/server/state";
import { exchangeQuickBooksCodeForTokens } from "@/features/integrations/quickbooks/server/http";
import {
  getAppBaseUrl,
  getQuickBooksEnvironment,
  getQuickBooksRedirectUri,
} from "@/features/integrations/quickbooks/server/env";

const STATE_COOKIE = "pfq_qbo_oauth_state";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const realmId = url.searchParams.get("realmId")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error")?.trim() ?? "";

  const redirectBase = `${getAppBaseUrl()}/dashboard/owner/settings`;

  if (error) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent(error)}#quickbooks-integration`,
    );
  }

  if (!code || !realmId || !state) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent("Missing QuickBooks callback parameters.")}#quickbooks-integration`,
    );
  }

  const decoded = decodeQuickBooksState(state);
  if (!decoded?.shopId || !decoded?.userId || !decoded?.issuedAt) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent("Invalid QuickBooks OAuth state.")}#quickbooks-integration`,
    );
  }

  if (Date.now() - decoded.issuedAt > STATE_MAX_AGE_MS) {
    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent("QuickBooks connection expired. Please try again.")}#quickbooks-integration`,
    );
  }

  try {
    const tokenResponse = await exchangeQuickBooksCodeForTokens(
      code,
      getQuickBooksRedirectUri(),
    );

    const supabase = getAdminSupabase();

    const accessTokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    ).toISOString();

    const refreshTokenExpiresAt =
      typeof tokenResponse.x_refresh_token_expires_in === "number"
        ? new Date(
            Date.now() + tokenResponse.x_refresh_token_expires_in * 1000,
          ).toISOString()
        : null;

    const payload: Database["public"]["Tables"]["quickbooks_connections"]["Insert"] =
      {
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

    const res = NextResponse.redirect(
      `${redirectBase}?connected=1#quickbooks-integration`,
    );

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
      err instanceof Error
        ? err.message
        : "Failed to complete QuickBooks connection.";

    return NextResponse.redirect(
      `${redirectBase}?error=${encodeURIComponent(message)}#quickbooks-integration`,
    );
  }
}