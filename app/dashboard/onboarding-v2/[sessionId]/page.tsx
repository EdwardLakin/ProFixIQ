import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { SafeModeVerifyOnlyBanner } from "@/features/onboarding-v2/components/SafeModeVerifyOnlyBanner";
import { SessionWorkspace } from "@/features/onboarding-v2/components/SessionWorkspace";

type Props = { params: Promise<{ sessionId: string }> };

export default async function OnboardingV2SessionPage({ params }: Props) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const { sessionId } = await params;

  return (
    <OnboardingV2Shell title="Onboarding Agent Session">
      <SafeModeVerifyOnlyBanner />
      <AgentReadinessBanner ready={true} detail="Readiness verification proxied through server routes." />
      <SessionWorkspace sessionId={sessionId} />
    </OnboardingV2Shell>
  );
}
