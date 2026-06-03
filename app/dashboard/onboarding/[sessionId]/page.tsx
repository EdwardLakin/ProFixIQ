import { redirect } from "next/navigation";

type Props = { params: Promise<{ sessionId: string }> };

export default async function LegacyDashboardOnboardingSessionRedirect({
  params,
}: Props) {
  const { sessionId } = await params;
  redirect(`/dashboard/onboarding-v2/${encodeURIComponent(sessionId)}`);
}
