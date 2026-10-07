import GuidedOnboardingWorkspace from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { bindPendingEarlyAccessGrantToShop } from "@/features/stripe/lib/server/early-access-discount";

export default async function GuidedSetupPage() {
  const access = await requireAdminPageAccess({ allow: ["owner", "admin"] });

  if (access.canonicalRole === "owner") {
    try {
      await bindPendingEarlyAccessGrantToShop({
        userId: access.profile.id,
        shopId: access.profile.shop_id,
      });
    } catch (error) {
      // Grant bookkeeping must never block owner onboarding; it retries on the
      // next load.
      console.error("early_access_grant_bind_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return <GuidedOnboardingWorkspace />;
}
