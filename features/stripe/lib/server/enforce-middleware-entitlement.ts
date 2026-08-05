import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  hasSupabasePublicEnv,
  readSupabasePublicEnv,
} from "@/features/shared/lib/supabase/public-env";
import { resolveShopBillingEntitlement } from "@/features/stripe/lib/billing-entitlement";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const WRITE_GATE_EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/internal/",
  "/api/organizations/",
  "/api/portal/",
  "/api/public/",
  "/api/shop/owner-pin/",
  "/api/stripe/",
  "/api/webhooks/",
  "/api/admin/export",
  "/api/data-export",
  "/api/export",
] as const;

type StaffProfile = {
  id: string;
  user_id: string | null;
  shop_id: string | null;
  role: string | null;
};

type ShopBillingRow = {
  id: string;
  stripe_subscription_status: string | null;
  stripe_trial_end: string | null;
  billing_grace_until: string | null;
  billing_entitlement_override: string | null;
};

function isExemptPath(pathname: string): boolean {
  return WRITE_GATE_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function createResponseBoundClient(req: NextRequest, res: NextResponse) {
  const { supabaseUrl, supabaseAnonKey } = readSupabasePublicEnv(
    "billing-entitlement-middleware",
  );

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        });
      },
    },
  });
}

async function resolveStaffProfile(
  supabase: ReturnType<typeof createResponseBoundClient>,
  userId: string,
): Promise<StaffProfile | null> {
  const byId = await supabase
    .from("profiles")
    .select("id, user_id, shop_id, role")
    .eq("id", userId)
    .maybeSingle<StaffProfile>();

  if (byId.data) return byId.data;
  if (byId.error) {
    console.info("[billing-entitlement/profile-id]", {
      userId,
      error: byId.error.message,
    });
  }

  const byUserId = await supabase
    .from("profiles")
    .select("id, user_id, shop_id, role")
    .eq("user_id", userId)
    .maybeSingle<StaffProfile>();

  if (byUserId.error) {
    console.info("[billing-entitlement/profile-user-id]", {
      userId,
      error: byUserId.error.message,
    });
    return null;
  }

  return byUserId.data ?? null;
}

export async function enforceApiWriteBillingEntitlement(
  req: NextRequest,
): Promise<NextResponse> {
  const response = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  if (!MUTATING_METHODS.has(req.method.toUpperCase()) || isExemptPath(pathname)) {
    return response;
  }

  if (!hasSupabasePublicEnv()) {
    return NextResponse.json(
      {
        error: "Shop billing entitlement could not be verified.",
        code: "billing_entitlement_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createResponseBoundClient(req, response);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Public webhooks and portal calls are handled by their own route-level auth.
  // The write gate only applies once an authenticated shop staff identity exists.
  if (userError || !user) return response;

  const profile = await resolveStaffProfile(supabase, user.id);
  if (!profile?.shop_id) return response;

  const actor = getActorCapabilities({ role: profile.role });
  if (!actor.isKnownRole || actor.canonicalRole === "customer") return response;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select(
      "id, stripe_subscription_status, stripe_trial_end, billing_grace_until, billing_entitlement_override",
    )
    .eq("id", profile.shop_id)
    .maybeSingle<ShopBillingRow>();

  if (shopError || !shop) {
    console.error("[billing-entitlement/shop-resolution]", {
      pathname,
      shopId: profile.shop_id,
      error: shopError?.message ?? "shop_not_found",
    });
    return NextResponse.json(
      {
        error: "Shop billing entitlement could not be verified.",
        code: "billing_entitlement_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const entitlement = resolveShopBillingEntitlement({
    stripeSubscriptionStatus: shop.stripe_subscription_status,
    stripeTrialEnd: shop.stripe_trial_end,
    billingGraceUntil: shop.billing_grace_until,
    billingEntitlementOverride: shop.billing_entitlement_override,
  });

  if (entitlement.canWrite) return response;

  console.warn("[billing-entitlement/write-blocked]", {
    pathname,
    method: req.method,
    shopId: shop.id,
    userId: user.id,
    entitlement: entitlement.state,
    reason: entitlement.reason,
  });

  return NextResponse.json(
    {
      error:
        "This shop is read-only because its subscription is inactive. Existing data remains available. An owner can reactivate billing in Shop Settings.",
      code: "shop_billing_read_only",
      entitlement: entitlement.state,
      billingPath: "/dashboard/owner/settings#settings-billing",
    },
    { status: 402, headers: { "Cache-Control": "no-store" } },
  );
}
