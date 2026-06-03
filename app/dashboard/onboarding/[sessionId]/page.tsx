import { redirect } from "next/navigation";

export default function LegacyDashboardOnboardingSessionRedirect() {
  redirect("/dashboard/onboarding-v2");
}
