import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type ActiveBrandRender = {
  profile: DB["public"]["Tables"]["shop_brand_profiles"]["Row"] | null;
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
};

export async function getActiveBrandForRender(
  shopId: string,
): Promise<ActiveBrandRender> {
  const supabase = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from("shop_brand_profiles")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  const { data: assets } = await supabase
    .from("shop_brand_assets")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true);

  const logo = (assets ?? []).find((a) => a.kind === "logo") ?? null;

  return {
    profile: profile ?? null,
    logoUrl: logo?.file_url ?? null,
    colors: {
      primary: profile?.primary_color ?? "#C97A3D",
      secondary: profile?.secondary_color ?? "#0F172A",
      accent: profile?.accent_color ?? "#E2A164",
    },
  };
}
