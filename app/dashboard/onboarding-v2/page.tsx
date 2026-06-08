import GuidedOnboardingWorkspace from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function GuidedSetupPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <GuidedOnboardingWorkspace />;
}
