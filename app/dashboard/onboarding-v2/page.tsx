import GuidedOnboardingWorkspace from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { bindPendingEarlyAccessGrantToShop } from "@/features/stripe/lib/server/early-access-discount";

export default async function GuidedSetupPage() {
  const access = await requireAdminPageAccess({ allow: ["owner", "admin"] });

  if (access.canonicalRole === "owner") {
    await bindPendingEarlyAccessGrantToShop({
      userId: access.profile.id,
      shopId: access.profile.shop_id,
    });
  }

  return <GuidedOnboardingWorkspace />;
}
