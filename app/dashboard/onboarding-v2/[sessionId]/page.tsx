import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { GuidedOnboardingWorkspace } from "@/features/onboarding-v2/components/GuidedOnboardingWorkspace";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { SessionWorkspace } from "@/features/onboarding-v2/components/SessionWorkspace";

type Props = { params: Promise<{ sessionId: string }> };

export default async function OnboardingV2SessionPage({ params }: Props) {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const { sessionId } = await params;

  return (
    <OnboardingV2Shell title="Data Onboarding">
      <GuidedOnboardingWorkspace initialSessionId={sessionId} />
      <details className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-4 text-slate-300">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">Legacy/dev upload workspace</summary>
        <div className="mt-4">
          <SessionWorkspace sessionId={sessionId} />
        </div>
      </details>
    </OnboardingV2Shell>
  );
}
