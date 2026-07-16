import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
} from "@/features/integrations/shopBoost/activationContext";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.must_change_password) {
    return "/auth/set-password";
  }

  if (isMobileMode) return "/mobile";

  const redirect = searchParams.get("redirect")?.trim();
  const destination = safeInternalRedirect(redirect, defaultDashboardHref);

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}
