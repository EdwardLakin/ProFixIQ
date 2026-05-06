import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { ReviewItemsQueue } from "@/features/onboarding-v2/components/ReviewItemsQueue";

type Props = { params: Promise<{ sessionId: string }> };

export default async function ReviewPage({ params }: Props) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const { sessionId } = await params;
  return <OnboardingV2Shell title="Onboarding Exception Review"><ReviewItemsQueue sessionId={sessionId} /></OnboardingV2Shell>;
}
