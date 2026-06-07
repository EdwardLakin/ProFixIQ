import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type CustomerOnboardingSetupCardProps = {
  className?: string;
};

export function CustomerOnboardingSetupCard({ className = "" }: CustomerOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Customer onboarding" description="Optionally review customer records or launch imports without changing customer page loading." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="customers" surface="customers" />
        <Link
          href="/customers/search"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open customer setup
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default CustomerOnboardingSetupCard;
