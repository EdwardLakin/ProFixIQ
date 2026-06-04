import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { GuidedOnboardingWorkspace } from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";

export default async function OnboardingV2Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });

  return (
    <OnboardingV2Shell title="Guided Onboarding V2">
      <GuidedOnboardingWorkspace />
    </OnboardingV2Shell>
  );
}
