export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { reconcileCanonicalShopBillingByShopId } from "@/features/stripe/lib/server/shop-billing-reconciliation";

type ReconcileRequestBody = {
  shop_id?: string;
  expected_customer_id?: string;
  dry_run?: boolean;
};

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizeBearerToken(req: Request): string | null {
  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function POST(req: Request) {
  try {
    const expectedToken = mustEnv("STRIPE_BILLING_RECONCILE_TOKEN");
    const providedToken = normalizeBearerToken(req);

    if (!providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as ReconcileRequestBody;
    const shopId = String(body.shop_id ?? "").trim();
    const expectedCustomerId = String(body.expected_customer_id ?? "").trim() || null;
    const dryRun = Boolean(body.dry_run);

    if (!shopId) {
      return NextResponse.json({ error: "shop_id is required" }, { status: 400 });
    }

    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));

    const result = await reconcileCanonicalShopBillingByShopId({
      stripe,
      supabase: supabaseAdmin,
      shopId,
      expectedCustomerId,
      applyUpdate: !dryRun,
    });

    console.info("[stripe/billing/reconcile-shop] result", result);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reconcile shop billing.";
    console.error("[stripe/billing/reconcile-shop] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
