import GuidedOnboardingWorkspace from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function GuidedSetupSessionPage({ params }: { params: { sessionId: string } }) {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <GuidedOnboardingWorkspace initialSessionId={params.sessionId} />;
}
