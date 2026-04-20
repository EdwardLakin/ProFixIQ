import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
} from "@/features/integrations/shopBoost/activationContext";

const PASSTHROUGH_KEYS = [
  "redirect",
  "priceId",
  "interval",
  "trial",
  "founding",
  "session_id",
  "demoId",
  "intakeId",
  "activationContext",
] as const;

function collectPassthroughParams(sp: URLSearchParams | ReadonlyURLSearchParams) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "/sign-in";

  const { data: profile } = await supabase
    .from("profiles")
    .select("completed_onboarding, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.must_change_password) {
    return "/auth/set-password";
  }

  const isOnboarded = profile?.completed_onboarding === true;

  if (!isOnboarded) {
    const passthrough = collectPassthroughParams(searchParams);
    const onboardingHref = `/onboarding${passthrough.toString() ? `?${passthrough.toString()}` : ""}`;
    const activationContext = parseActivationContextFromSearchParams(searchParams);

    return activationContext
      ? appendActivationContextToHref(onboardingHref, activationContext)
      : onboardingHref;
  }

  if (isMobileMode) return "/mobile";

  const redirect = searchParams.get("redirect")?.trim();
  const activationContext = parseActivationContextFromSearchParams(searchParams);
  const destination = redirect || defaultDashboardHref;

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}