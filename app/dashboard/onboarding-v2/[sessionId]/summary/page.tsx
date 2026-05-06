import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { OnboardingSummaryPage } from "@/features/onboarding-v2/components/OnboardingSummaryPage";

type Props = { params: Promise<{ sessionId: string }> };

export default async function OnboardingV2SummaryRoute({ params }: Props) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const { sessionId } = await params;
  return <OnboardingV2Shell title="Onboarding Final Summary"><OnboardingSummaryPage sessionId={sessionId} /></OnboardingV2Shell>;
}
