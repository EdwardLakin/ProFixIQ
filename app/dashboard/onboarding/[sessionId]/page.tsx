import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingSessionPage } from "@/features/onboarding-agent/components/OnboardingSessionPage";

export default async function OnboardingSessionRoute({ params }: { params: { sessionId: string } }) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  return <OnboardingSessionPage sessionId={params.sessionId} />;
}
