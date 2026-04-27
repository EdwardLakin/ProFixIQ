import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingSessionPage } from "@/features/onboarding-agent/components/OnboardingSessionPage";

type PageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function OnboardingSessionRoute({ params }: PageProps) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });

  const { sessionId } = await params;

  return <OnboardingSessionPage sessionId={sessionId} />;
}