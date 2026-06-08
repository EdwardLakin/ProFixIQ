import GuidedOnboardingWorkspace from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GuidedSetupSessionPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  void resolvedSearchParams;

  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <GuidedOnboardingWorkspace initialSessionId={sessionId} />;
}
