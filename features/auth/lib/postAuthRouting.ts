import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
} from "@/features/integrations/shopBoost/activationContext";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import {
  productAccessSignInHref,
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import type { ProductCapability } from "@/features/stripe/lib/stripe/product-packages";

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
  unassignedAccountHref?: string;
  requiredProductCapabilities?: readonly ProductCapability[];
}): Promise<string> {
  const {
    supabase,
    searchParams,
    isMobileMode = false,
    defaultDashboardHref = "/dashboard",
    unassignedAccountHref,
    requiredProductCapabilities = SHOP_PRODUCT_CAPABILITIES,
  } = args;
  const activationContext =
    parseActivationContextFromSearchParams(searchParams);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "/sign-in";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, must_change_password, role, shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .maybeSingle();

  if (profile?.must_change_password) {
    return "/auth/set-password";
  }

  if (profile && !profile.shop_id && !profile.role && unassignedAccountHref) {
    return unassignedAccountHref;
  }

  if (profile?.shop_id) {
    const productAccess = await resolveShopProductAccess({
      supabase,
      shopId: profile.shop_id,
      capabilities: requiredProductCapabilities,
    });
    if (productAccess.error || !productAccess.entitled) {
      const href =
        isMobileMode && requiredProductCapabilities.includes("shop")
          ? "/mobile/sign-in?access=shop_required"
          : productAccessSignInHref(requiredProductCapabilities);
      return productAccess.error
        ? href.replace(/access=[^&]+/, "access=unavailable")
        : href;
    }
  }

  if (isMobileMode) return "/mobile";

  const redirect = searchParams.get("redirect")?.trim();
  const destination = safeInternalRedirect(redirect, defaultDashboardHref);

  return activationContext
    ? appendActivationContextToHref(destination, activationContext)
    : destination;
}
