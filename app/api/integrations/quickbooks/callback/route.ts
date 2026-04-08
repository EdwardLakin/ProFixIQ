export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { decodeQuickBooksState } from "@/features/integrations/quickbooks/server/state";
import { exchangeQuickBooksCodeForTokens } from "@/features/integrations/quickbooks/server/http";
import {
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

  const decoded = state ? decodeQuickBooksState(state) : null;

  const debug: Record<string, unknown> = {
    step: "start",
    hasCode: Boolean(code),
    hasRealmId: Boolean(realmId),
    hasState: Boolean(state),
    hasCookieState: Boolean(cookieState),
    cookieMatchesState: Boolean(cookieState && state && cookieState === state),
    decodedState: decoded,
    callbackUrl: req.url,
    redirectUriEnv: getQuickBooksRedirectUri(),
    environment: getQuickBooksEnvironment(),
    incomingError: error || null,
  };

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        step: "provider_error",
        debug,
        error,
      },
      { status: 400 },
    );
  }

  if (!code || !realmId || !state || !cookieState || cookieState !== state) {
    return NextResponse.json(
      {
        ok: false,
        step: "state_validation_failed",
        debug,
        error: "Invalid QuickBooks callback state.",
      },
      { status: 400 },
    );
  }

  if (!decoded?.shopId || !decoded?.userId) {
    return NextResponse.json(
      {
        ok: false,
        step: "decoded_state_invalid",
        debug,
        error: "Invalid QuickBooks OAuth state.",
      },
      { status: 400 },
    );
  }

  try {
    debug.step = "exchange_tokens";
    const tokenResponse = await exchangeQuickBooksCodeForTokens(
      code,
      getQuickBooksRedirectUri(),
    );

    debug.step = "create_supabase_client";
    const supabase = createServerSupabaseRoute();

    debug.step = "check_auth_user";
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    debug.authUserId = user?.id ?? null;
    debug.authError = authError?.message ?? null;

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

    debug.step = "upsert_connection";
    debug.payloadPreview = {
      shop_id: payload.shop_id,
      created_by: payload.created_by,
      realm_id: payload.realm_id,
      environment: payload.environment,
      token_scope: payload.token_scope,
    };

    const { data, error: upsertError } = await supabase
      .from("quickbooks_connections")
      .upsert(payload, { onConflict: "shop_id" })
      .select("*");

    if (upsertError) {
      return NextResponse.json(
        {
          ok: false,
          step: "upsert_failed",
          debug,
          error: upsertError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      step: "connected",
      debug,
      insertedRows: data ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        step: String(debug.step ?? "unknown"),
        debug,
        error:
          err instanceof Error
            ? err.message
            : "Failed to complete QuickBooks connection.",
      },
      { status: 500 },
    );
  }
}
