import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { OnboardingAgentDashboard } from "@/features/onboarding-agent/components/OnboardingAgentDashboard";

export default async function OnboardingPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"], redirectTo: "/dashboard" });
  return <OnboardingAgentDashboard />;
}
