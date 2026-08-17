import { redirect } from "next/navigation";

import { acquisitionHomeHref } from "@/features/auth/lib/acquisitionSurfaceRouting";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { normalizeProductAcquisitionSurface } from "@/features/stripe/lib/stripe/product-packages";
import OwnerOnboardingForm from "./OwnerOnboardingForm";

export const dynamic = "force-dynamic";

export default async function OwnerOnboardingPage() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const acquisitionSurface =
    normalizeProductAcquisitionSurface(
      user.app_metadata?.profixiq_acquisition_surface,
    ) ?? "shop";

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role, completed_onboarding")
    .eq("id", user.id)
    .maybeSingle();

  // A shop_id can exist while first-shop billing reconciliation is still
  // pending. Only the explicit completion marker may release an owner from the
  // setup surface; the bootstrap API's pending-owner branch handles retries.
  if (profile?.completed_onboarding) {
    redirect(acquisitionHomeHref(acquisitionSurface));
  }

  return <OwnerOnboardingForm acquisitionSurface={acquisitionSurface} />;
}
