export const dynamic = "force-dynamic";
export const revalidate = 0;

import EstimateBuilder from "@/features/estimates/components/EstimateBuilder";
import { ESTIMATE_ADVISOR_ROLES } from "@/features/estimates/lib/access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function NewEstimatePage() {
  const { profile } = await requireShopPageAccess({
    allowRoles: ESTIMATE_ADVISOR_ROLES,
    requiredCapability: "canAuthorizeQuotes",
  });
  const supabase = createServerSupabaseRSC();
  const { data: shop } = await supabase
    .from("shops")
    .select("labor_rate,timezone")
    .eq("id", profile.shop_id)
    .maybeSingle();

  return (
    <EstimateBuilder
      shopId={profile.shop_id}
      defaultLaborRate={Number(shop?.labor_rate ?? 0)}
      shopTimezone={shop?.timezone ?? "UTC"}
    />
  );
}
