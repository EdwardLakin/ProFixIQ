import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { OnboardingV2Shell } from "@/features/onboarding-v2/components/OnboardingV2Shell";
import { SafeModeVerifyOnlyBanner } from "@/features/onboarding-v2/components/SafeModeVerifyOnlyBanner";
import { StartOnboardingSessionCard } from "@/features/onboarding-v2/components/StartOnboardingSessionCard";

async function getReadiness(): Promise<{ ready: boolean; detail: string }> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/onboarding-v2/agent-readiness`, { cache: "no-store" });
    if (!response.ok) return { ready: false, detail: "Readiness unavailable." };
    return { ready: true, detail: "Agent production and connector readiness checks are reachable." };
  } catch {
    return { ready: false, detail: "Readiness unavailable." };
  }
}

export default async function OnboardingV2Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  const readiness = await getReadiness();

  return (
    <OnboardingV2Shell title="Onboarding Agent">
      <SafeModeVerifyOnlyBanner />
      <AgentReadinessBanner ready={readiness.ready} detail={readiness.detail} />
      <StartOnboardingSessionCard />
      <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-300">Session listing coming next.</div>
      <div className="text-xs text-slate-400">Legacy onboarding remains available at /dashboard/onboarding during transition.</div>
    </OnboardingV2Shell>
  );
}
