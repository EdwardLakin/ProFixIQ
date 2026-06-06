import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DashboardProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "completed_onboarding" | "email" | "full_name" | "role" | "shop_id"
>;

type DashboardShop = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  "id" | "name" | "shop_name" | "business_name"
>;

export type DashboardServerClient = ReturnType<typeof createServerSupabaseRSC>;

export type DashboardIdentity = {
  userId: string | null;
  email: string | null;
  shopId: string | null;
  role: string | null;
  fullName: string | null;
  profileExists: boolean;
  shopLoaded: boolean;
  shop: DashboardShop | null;
};

function logDashboardContextDiagnostics(args: {
  userId: string | null;
  profile: DashboardProfile | null;
  profileError?: string | null;
  shopLoaded: boolean;
  shopIdUsed: string | null;
  shopError?: string | null;
}) {
  console.info("[dashboard/server-context]", {
    userId: args.userId,
    profileExists: Boolean(args.profile),
    profileRole: args.profile?.role ?? null,
    profileShopId: args.profile?.shop_id ?? null,
    shopLoaded: args.shopLoaded,
    shopIdUsed: args.shopIdUsed,
    profileError: args.profileError ?? null,
    shopError: args.shopError ?? null,
  });
}

export async function resolveDashboardServerContext(
  supabase: DashboardServerClient = createDashboardServerClient(),
): Promise<DashboardIdentity> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  if (!userId) {
    logDashboardContextDiagnostics({
      userId: null,
      profile: null,
      profileError: userError?.message ?? null,
      shopLoaded: false,
      shopIdUsed: null,
    });
    return {
      userId: null,
      email: null,
      shopId: null,
      role: null,
      fullName: null,
      profileExists: false,
      shopLoaded: false,
      shop: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("completed_onboarding, email, full_name, role, shop_id")
    .eq("id", userId)
    .limit(1)
    .maybeSingle<DashboardProfile>();

  const shopId = profile?.shop_id ?? null;
  let shop: DashboardShop | null = null;
  let shopErrorMessage: string | null = null;

  if (shopId) {
    const { error: contextError } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: shopId,
    });

    if (contextError) {
      console.warn("[dashboard/server-context] set_current_shop_id failed", {
        userId,
        shopIdUsed: shopId,
        error: contextError.message,
      });
    }

    const { data: shopData, error: shopError } = await supabase
      .from("shops")
      .select("id, name, shop_name, business_name")
      .eq("id", shopId)
      .limit(1)
      .maybeSingle<DashboardShop>();

    shop = shopData ?? null;
    shopErrorMessage = shopError?.message ?? null;
  }

  logDashboardContextDiagnostics({
    userId,
    profile: profile ?? null,
    profileError: profileError?.message ?? null,
    shopLoaded: Boolean(shop),
    shopIdUsed: shopId,
    shopError: shopErrorMessage,
  });

  return {
    userId,
    email: profile?.email ?? user?.email ?? null,
    shopId,
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? null,
    profileExists: Boolean(profile),
    shopLoaded: Boolean(shop),
    shop,
  };
}

export async function getDashboardIdentity(
  supabase?: DashboardServerClient,
): Promise<DashboardIdentity> {
  return resolveDashboardServerContext(supabase);
}

export function createDashboardServerClient() {
  return createServerSupabaseRSC();
}
