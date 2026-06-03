import { redirect } from "next/navigation";

export default function LegacyDashboardOnboardingRedirect() {
  redirect("/dashboard/onboarding-v2");
}
