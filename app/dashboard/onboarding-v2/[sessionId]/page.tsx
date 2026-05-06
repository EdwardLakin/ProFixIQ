import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { SessionWorkspace } from "@/features/onboarding-v2/components/SessionWorkspace";

type Props = { params: Promise<{ sessionId: string }> };

export default async function OnboardingV2SessionPage({ params }: Props) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const { sessionId } = await params;

  return (
    <OnboardingV2Shell title="Onboarding Agent Session">
      <SessionWorkspace sessionId={sessionId} />
    </OnboardingV2Shell>
  );
}
