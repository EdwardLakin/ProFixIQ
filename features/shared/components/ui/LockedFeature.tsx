"use client";

import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import clsx from "clsx";

interface LockedFeatureProps {
  reason?: string;
  showUpgradeButton?: boolean;
  showTryNowButton?: boolean;
  featureId?: string;
  className?: string;
}

export default function LockedFeature({
  reason = "This feature is not available on your current plan.",
  showUpgradeButton = true,
  showTryNowButton = false,
  featureId,
  className,
}: LockedFeatureProps) {
  const router = useRouter();

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(184,115,51,0.10),rgba(0,0,0,0.82))] p-6",
        "text-center shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl",
        "flex flex-col items-center gap-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[color:var(--accent-copper-light,#fdba74)]">
        <LockIcon className="h-5 w-5" />
        <span className="text-lg font-semibold">Feature Locked</span>
      </div>

      <p className="max-w-md text-sm text-neutral-300">{reason}</p>

      <div className="flex flex-wrap justify-center gap-3 mt-1">
        {showUpgradeButton && (
          <button
            type="button"
            onClick={() => router.push("/onboarding/plan")}
            className="rounded-full border border-[rgba(184,115,51,0.45)] bg-[rgba(184,115,51,0.10)] px-5 py-2 text-sm font-semibold text-amber-100 transition hover:bg-[rgba(184,115,51,0.16)]"
          >
            Upgrade Plan
          </button>
        )}

        {showTryNowButton && featureId && (
          <button
            type="button"
            onClick={() => router.push(`/pay-per-use/${featureId}`)}
            className="rounded-full border border-white/10 bg-black/30 px-5 py-2 text-sm font-semibold text-neutral-200 transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/40"
          >
            Try Now
          </button>
        )}
      </div>
    </div>
  );
}
