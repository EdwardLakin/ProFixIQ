import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type ServiceMenuOnboardingSetupCardProps = {
  className?: string;
};

export function ServiceMenuOnboardingSetupCard({ className = "" }: ServiceMenuOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Service menu onboarding" description="Optionally build canned services and menu pricing from the existing menu builder." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="service_menu" surface="service_menu" />
        <Link
          href="/menu"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open menu builder
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default ServiceMenuOnboardingSetupCard;
