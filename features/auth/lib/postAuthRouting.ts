import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
} from "@/features/integrations/shopBoost/activationContext";

export const PASSTHROUGH_KEYS = [
  "redirect",
  "session_id",
  "demoId",
  "intakeId",
  "activationContext",
] as const;

const SHOP_BOOST_ACTIVE_OR_ACTIONABLE_STATUSES = new Set([
  "queued",
  "pending",
  "processing",
  "failed",
  "blocked",
  "requires_review",
  "review_needed",
]);

const SHOP_BOOST_RECENT_COMPLETED_STATUSES = new Set([
  "completed",
  "completed_clean",
  "completed_with_review",
  "completed_with_warnings",
  "ready_for_go_live",
]);

function isShopBoostOrchestratedRole(role: string | null | undefined): boolean {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function shouldRouteOwnerToShopBoost(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (SHOP_BOOST_ACTIVE_OR_ACTIONABLE_STATUSES.has(normalized)) return false;
  if (SHOP_BOOST_RECENT_COMPLETED_STATUSES.has(normalized)) return false;
  return false;
}

export function collectPassthroughParams(sp: URLSearchParams | ReadonlyURLSearchParams) {
  const params = new URLSearchParams();
  for (const key of PASSTHROUGH_KEYS) {
    const value = sp.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

export async function resolvePostAuthDestination(args: {
  supabase: SupabaseClient<Database>;
  searchParams: URLSearchParams | ReadonlyURLSearchParams;
  isMobileMode?: boolean;
  defaultDashboardHref?: string;
}): Promise<string> {
  const {
    supabase,
    searchParams,
    isMobileMode = false,
    defaultDashboardHref = "/dashboard",
  } = args;
  const activationContext = parseActivationContextFromSearchParams(searchParams);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "/sign-in";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("completed_onboarding, must_change_password, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  console.info("[auth/post-login-routing]", {
    userId: user.id,
    profileExists: Boolean(profile),
    profileShopId: profile?.shop_id ?? null,
    profileRole: profile?.role ?? null,
    completedOnboarding: profile?.completed_onboarding ?? null,
    profileError: profileError?.message ?? null,
  });

  if (profile?.must_change_password) {
    return "/auth/set-password";
  }

  const isOnboarded = profile?.completed_onboarding === true;

  if (!isOnboarded) {
    const passthrough = collectPassthroughParams(searchParams);
    const onboardingHref = `/onboarding${passthrough.toString() ? `?${passthrough.toString()}` : ""}`;

    return activationContext
      ? appendActivationContextToHref(onboardingHref, activationContext)
      : onboardingHref;
  }

  if (isShopBoostOrchestratedRole(profile?.role) && profile?.shop_id) {
    const { data: latestIntake } = await supabase
      .from("shop_boost_intakes")
      .select("status")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ status: string | null }>();

    if (shouldRouteOwnerToShopBoost(latestIntake?.status)) {
      const passthrough = collectPassthroughParams(searchParams);
      const shopBoostHref = `/onboarding/shop-boost${passthrough.toString() ? `?${passthrough.toString()}` : ""}`;

      return activationContext
        ? appendActivationContextToHref(shopBoostHref, activationContext)
        : shopBoostHref;
    }
  }

  if (isMobileMode) return "/mobile";

  const redirect = searchParams.get("redirect")?.trim();
  const destination = redirect || defaultDashboardHref;

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}
