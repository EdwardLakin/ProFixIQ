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
    .select("must_change_password, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  console.info("[auth/post-login-routing]", {
    userId: user.id,
    profileExists: Boolean(profile),
    profileShopId: profile?.shop_id ?? null,
    profileRole: profile?.role ?? null,
    profileError: profileError?.message ?? null,
  });

  if (profile?.must_change_password) {
    return "/auth/set-password";
  }

  if (isMobileMode) return "/mobile";

  const redirect = searchParams.get("redirect")?.trim();
  const destination = redirect || defaultDashboardHref;

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}
