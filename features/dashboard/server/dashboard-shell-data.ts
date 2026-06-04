import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

type DashboardSupabaseClient = SupabaseClient<Database>;

type DashboardProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "email" | "full_name" | "role" | "shop_id"
>;

function errorSummary(error: { message?: string; code?: string | null } | null | undefined) {
  if (!error) return null;
  return {
    message: error.message ?? "Unknown error",
    code: error.code ?? null,
  };
}

export type DashboardIdentity = {
  userId: string | null;
  authEmail: string | null;
  profileId: string | null;
  profileEmail: string | null;
  shopId: string | null;
  role: string | null;
  fullName: string | null;
  diagnostics: {
    authUserError: ReturnType<typeof errorSummary>;
    profileExists: boolean;
    profileError: ReturnType<typeof errorSummary>;
    shopIdPresent: boolean;
    shopLookupAttempted: boolean;
    shopLookupFound: boolean;
    shopQueryError: ReturnType<typeof errorSummary>;
    setCurrentShopIdCalled: boolean;
    setCurrentShopIdError: ReturnType<typeof errorSummary>;
  };
};

export async function getDashboardIdentity(): Promise<DashboardIdentity> {
  const supabase = createDashboardServerClient();
  const {
    data: { user },
    error: authUserError,
  } = await supabase.auth.getUser();

  if (!user) {
    const identity: DashboardIdentity = {
      userId: null,
      authEmail: null,
      profileId: null,
      profileEmail: null,
      shopId: null,
      role: null,
      fullName: null,
      diagnostics: {
        authUserError: errorSummary(authUserError),
        profileExists: false,
        profileError: null,
        shopIdPresent: false,
        shopLookupAttempted: false,
        shopLookupFound: false,
        shopQueryError: null,
        setCurrentShopIdCalled: false,
        setCurrentShopIdError: null,
      },
    };

    console.info("[Dashboard][Identity] no authenticated user", identity.diagnostics);
    return identity;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,shop_id")
    .eq("id", user.id)
    .maybeSingle<DashboardProfile>();

  let shopLookupAttempted = false;
  let shopLookupFound = false;
  let shopQueryError: ReturnType<typeof errorSummary> = null;
  let setCurrentShopIdCalled = false;
  let setCurrentShopIdError: ReturnType<typeof errorSummary> = null;

  if (profile?.shop_id) {
    setCurrentShopIdCalled = true;
    const { error: contextError } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: profile.shop_id,
    });
    setCurrentShopIdError = errorSummary(contextError);

    shopLookupAttempted = true;
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", profile.shop_id)
      .maybeSingle();
    shopLookupFound = Boolean(shop?.id);
    shopQueryError = errorSummary(shopError);
  }

  const identity: DashboardIdentity = {
    userId: user.id,
    authEmail: user.email ?? null,
    profileId: profile?.id ?? null,
    profileEmail: profile?.email ?? null,
    shopId: profile?.shop_id ?? null,
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? null,
    diagnostics: {
      authUserError: errorSummary(authUserError),
      profileExists: Boolean(profile),
      profileError: errorSummary(profileError),
      shopIdPresent: Boolean(profile?.shop_id),
      shopLookupAttempted,
      shopLookupFound,
      shopQueryError,
      setCurrentShopIdCalled,
      setCurrentShopIdError,
    },
  };

  console.info("[Dashboard][Identity] resolved shop context", {
    authUserId: identity.userId,
    authEmail: identity.authEmail,
    profileId: identity.profileId,
    profileEmail: identity.profileEmail,
    role: identity.role,
    shopIdPresent: identity.diagnostics.shopIdPresent,
    shopId: identity.shopId,
    shopQueryError: identity.diagnostics.shopQueryError,
    setCurrentShopIdCalled: identity.diagnostics.setCurrentShopIdCalled,
    setCurrentShopIdError: identity.diagnostics.setCurrentShopIdError,
    profileError: identity.diagnostics.profileError,
  });

  return identity;
}

export function createDashboardServerClient(): DashboardSupabaseClient {
  return createServerSupabaseRSC() as DashboardSupabaseClient;
}

export async function ensureDashboardShopContext(
  supabase: DashboardSupabaseClient,
  identity: DashboardIdentity,
  source: string,
): Promise<ReturnType<typeof errorSummary>> {
  if (!identity.shopId) return null;

  const { error } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: identity.shopId,
  });
  const summary = errorSummary(error);

  console.info(`[Dashboard][${source}] set_current_shop_id`, {
    authUserId: identity.userId,
    authEmail: identity.authEmail,
    profileId: identity.profileId,
    profileEmail: identity.profileEmail,
    role: identity.role,
    shopIdPresent: Boolean(identity.shopId),
    shopId: identity.shopId,
    setCurrentShopIdCalled: true,
    setCurrentShopIdError: summary,
  });

  return summary;
}

export function getMissingShopContextWarning(identity: DashboardIdentity): string {
  if (!identity.userId) return "Dashboard shop context unavailable: no authenticated user session.";
  if (identity.diagnostics.profileError) {
    return `Dashboard shop context unavailable: profile query failed (${identity.diagnostics.profileError.code ?? "no-code"}: ${identity.diagnostics.profileError.message}).`;
  }
  if (!identity.diagnostics.profileExists) return "Dashboard shop context unavailable: no profile row found for the authenticated user.";
  if (!identity.diagnostics.shopIdPresent) return "Dashboard shop context unavailable: profile is missing shop_id.";
  if (identity.diagnostics.shopQueryError) {
    return `Dashboard shop context warning: shop lookup failed (${identity.diagnostics.shopQueryError.code ?? "no-code"}: ${identity.diagnostics.shopQueryError.message}).`;
  }
  if (identity.diagnostics.setCurrentShopIdError) {
    return `Dashboard shop context warning: set_current_shop_id failed (${identity.diagnostics.setCurrentShopIdError.code ?? "no-code"}: ${identity.diagnostics.setCurrentShopIdError.message}).`;
  }
  return "Dashboard shop context unavailable: profile shop_id could not be resolved.";
}
