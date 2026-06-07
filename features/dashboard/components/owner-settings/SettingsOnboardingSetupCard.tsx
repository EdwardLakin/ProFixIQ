import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type SettingsOnboardingSetupCardProps = {
  className?: string;
};

export function SettingsOnboardingSetupCard({ className = "" }: SettingsOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Settings onboarding" description="Check labor, tax, branding, billing, and integration setup from this stable settings page." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="settings" surface="settings" />
        <Link
          href="/dashboard/onboarding-v2?mode=guided&step=settings"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open settings checklist
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default SettingsOnboardingSetupCard;
