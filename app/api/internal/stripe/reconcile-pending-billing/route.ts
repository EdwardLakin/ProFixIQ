import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { reconcileShopSubscriptionSeats } from "@/features/stripe/lib/server/subscription-seat-reconciliation";
import { resolveStripePriceContract } from "@/features/stripe/lib/server/stripe-price-contract";
import { PRODUCT_PACKAGE_BILLING_MODEL } from "@/features/stripe/lib/stripe/product-packages";
import { resolveProductPackagePriceContract } from "@/features/stripe/lib/server/product-package-price-contract";
import { reconcileProductPackageSubscription } from "@/features/stripe/lib/server/product-package-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return { ok: true } as const;
  }
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_STRIPE_BILLING_RECONCILE_SECRET",
    headerName: "x-internal-stripe-billing-secret",
    routeLabel: "internal/stripe/reconcile-pending-billing",
  });
}

export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;

  const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secretKey) {
    return NextResponse.json(
      { error: "Missing STRIPE_SECRET_KEY" },
      { status: 500 },
    );
  }

  const supabase = createAdminSupabase();
  const stripe = createStripeClient(secretKey);
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, stripe_pricing_model")
    .eq("stripe_billing_sync_required", true)
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingShops = shops ?? [];
  if (pendingShops.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    });
  }

  let legacyPriceContract;
  let packagePriceContract;
  try {
    if (
      pendingShops.some(
        (shop) => shop.stripe_pricing_model === PRODUCT_PACKAGE_BILLING_MODEL,
      )
    ) {
      packagePriceContract = await resolveProductPackagePriceContract(stripe);
    }
    if (
      pendingShops.some(
        (shop) => shop.stripe_pricing_model !== PRODUCT_PACKAGE_BILLING_MODEL,
      )
    ) {
      legacyPriceContract = await resolveStripePriceContract(stripe);
    }
  } catch (priceError) {
    return NextResponse.json(
      {
        error:
          priceError instanceof Error
            ? priceError.message
            : "Stripe price contract could not be resolved",
      },
      { status: 503 },
    );
  }

  const results: Array<{
    shop_id: string;
    ok: boolean;
    state?: string;
    error?: string;
  }> = [];

  for (const shop of pendingShops) {
    try {
      const result =
        shop.stripe_pricing_model === PRODUCT_PACKAGE_BILLING_MODEL
          ? await reconcileProductPackageSubscription({
              stripe,
              supabase,
              shopId: shop.id,
              priceContract: packagePriceContract,
            })
          : await reconcileShopSubscriptionSeats({
              stripe,
              supabase,
              shopId: shop.id,
              priceContract: legacyPriceContract,
            });
      results.push({ shop_id: shop.id, ok: true, state: result.state });
    } catch (reconcileError) {
      results.push({
        shop_id: shop.id,
        ok: false,
        error:
          reconcileError instanceof Error
            ? reconcileError.message
            : "Stripe billing reconciliation failed",
      });
    }
  }

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    processed: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}
