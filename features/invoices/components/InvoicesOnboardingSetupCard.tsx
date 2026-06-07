import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type InvoicesOnboardingSetupCardProps = {
  className?: string;
};

export function InvoicesOnboardingSetupCard({ className = "" }: InvoicesOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Invoice history onboarding" description="Review invoice-ready work and service history from stable billing pages." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="invoices_history" surface="billing" />
        <Link
          href="/dashboard/onboarding-v2?mode=guided&step=invoices_history"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open guided history step
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default InvoicesOnboardingSetupCard;
