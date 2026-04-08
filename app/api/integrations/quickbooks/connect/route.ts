export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireQuickBooksShopAccess } from "@/features/integrations/quickbooks/server/auth";
import { encodeQuickBooksState } from "@/features/integrations/quickbooks/server/state";
import {
  getQuickBooksAuthorizeUrlBase,
  getQuickBooksClientId,
  getQuickBooksRedirectUri,
} from "@/features/integrations/quickbooks/server/env";

const STATE_COOKIE = "pfq_qbo_oauth_state";

export async function POST() {
  try {
    const supabase = createServerSupabaseRoute();

    const auth = await requireQuickBooksShopAccess(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { user, shop } = auth.data;

    const state = encodeQuickBooksState({
      shopId: shop.id,
      userId: user.id,
      issuedAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: getQuickBooksClientId(),
      redirect_uri: getQuickBooksRedirectUri(),
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      state,
    });

    const authorizeUrl = `${getQuickBooksAuthorizeUrlBase()}?${params.toString()}`;

    const res = NextResponse.json({
      ok: true,
      authorizeUrl,
    });

    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });

    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start QuickBooks connection.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}