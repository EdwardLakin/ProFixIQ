import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type ServiceHistoryOnboardingSetupCardProps = {
  className?: string;
};

export function ServiceHistoryOnboardingSetupCard({ className = "" }: ServiceHistoryOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Service history onboarding" description="Optionally import or review historical service data without changing work-order assignment flows." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="fleet_history_import" surface="billing" />
        <Link
          href="/dashboard/onboarding-v2?mode=guided&step=fleet_history_import"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open guided history import
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default ServiceHistoryOnboardingSetupCard;
