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

export const ONBOARDING_V2_PATH = "/onboarding/v2";
export const SHOP_ASSIGNMENT_REQUIRED_PATH = "/account/shop-assignment-required";
export const PROFILE_RECOVERY_PATH = "/account/profile-recovery";

export type PostAuthProfile = {
  completed_onboarding?: boolean | null;
  must_change_password?: boolean | null;
  role?: string | null;
  shop_id?: string | null;
} | null;

export type PostAuthDecisionInput = {
  isAuthenticated: boolean;
  profile: PostAuthProfile;
  isMobileMode?: boolean;
  redirect?: string | null;
  defaultDashboardHref?: string;
};

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "")
    .trim()
    .toLowerCase();
}

export function isOwnerOrAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function hasAssignedShop(profile: PostAuthProfile): boolean {
  return Boolean(profile?.shop_id && String(profile.shop_id).trim());
}

function safeRedirectPath(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

export function collectPassthroughParams(sp: URLSearchParams | ReadonlyURLSearchParams) {
  const params = new URLSearchParams();
  for (const key of PASSTHROUGH_KEYS) {
    const value = sp.get(key);
    if (value) params.set(key, value);
  }
  return params;
}

export function resolvePostAuthDecision(input: PostAuthDecisionInput): string {
  const {
    isAuthenticated,
    profile,
    isMobileMode = false,
    redirect = null,
    defaultDashboardHref = "/dashboard",
  } = input;

  if (!isAuthenticated) return "/sign-in";
  if (!profile) return PROFILE_RECOVERY_PATH;
  if (profile.must_change_password) return "/auth/set-password";
  if (hasAssignedShop(profile)) {
    if (isMobileMode) return "/mobile";
    return safeRedirectPath(redirect) ?? defaultDashboardHref;
  }
  if (isOwnerOrAdminRole(profile.role)) return ONBOARDING_V2_PATH;
  return SHOP_ASSIGNMENT_REQUIRED_PATH;
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

  console.info("[auth/post-auth-routing]", {
    userId: user.id,
    profileExists: Boolean(profile),
    profileShopId: profile?.shop_id ?? null,
    profileRole: profile?.role ?? null,
    completedOnboarding: profile?.completed_onboarding ?? null,
    profileError: profileError?.message ?? null,
  });

  const destination = resolvePostAuthDecision({
    isAuthenticated: true,
    profile,
    isMobileMode,
    redirect: searchParams.get("redirect"),
    defaultDashboardHref,
  });

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}
