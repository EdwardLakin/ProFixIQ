import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type InspectionTemplatesOnboardingSetupCardProps = {
  className?: string;
};

export function InspectionTemplatesOnboardingSetupCard({ className = "" }: InspectionTemplatesOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Inspection template onboarding" description="Optionally seed or verify templates while preserving the current inspection templates page." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="inspection_templates" surface="inspection_templates" />
        <Link
          href="/inspections/templates"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open templates
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default InspectionTemplatesOnboardingSetupCard;
