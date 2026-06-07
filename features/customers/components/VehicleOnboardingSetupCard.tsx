import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type VehicleOnboardingSetupCardProps = {
  className?: string;
};

export function VehicleOnboardingSetupCard({ className = "" }: VehicleOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Vehicle onboarding" description="Optionally review vehicle data from the stable customer workflow." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="vehicles" surface="vehicles" />
        <Link
          href="/customers/search"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open vehicle setup
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default VehicleOnboardingSetupCard;
