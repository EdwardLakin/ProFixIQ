import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { SafeModeVerifyOnlyBanner } from "@/features/onboarding-v2/components/SafeModeVerifyOnlyBanner";
import { getAgentReadinessForDashboard } from "@/features/onboarding-v2/lib/agentReadinessServer";
import { StartOnboardingSessionCard } from "@/features/onboarding-v2/components/StartOnboardingSessionCard";

export default async function OnboardingV2Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const readiness = await getAgentReadinessForDashboard();

  return (
    <OnboardingV2Shell title="Onboarding Agent">
      <SafeModeVerifyOnlyBanner />
      <AgentReadinessBanner readiness={readiness} />
      <StartOnboardingSessionCard />
      <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-300">Session listing coming next.</div>
      <div className="text-xs text-slate-400">Legacy onboarding remains available at /dashboard/onboarding during transition.</div>
    </OnboardingV2Shell>
  );
}
