import Link from "next/link";

import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type StaffOnboardingSetupCardProps = {
  className?: string;
};

export function StaffOnboardingSetupCard({ className = "" }: StaffOnboardingSetupCardProps) {
  return (
    <OnboardingHighlightFrame title="Staff onboarding" description="Invite or review users from the existing owner staff tools." className={className}>
      <div className="space-y-3">
        <GuidedOnboardingStepCard stepKey="staff" surface="staff" />
        <Link
          href="/dashboard/owner/create-user"
          className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100 transition hover:border-orange-200/60 hover:bg-orange-400/20"
        >
          Open staff setup
        </Link>
      </div>
    </OnboardingHighlightFrame>
  );
}

export default StaffOnboardingSetupCard;
