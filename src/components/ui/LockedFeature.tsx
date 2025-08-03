'use client';

import { useRouter } from 'next/navigation';
import { LockIcon } from 'lucide-react';
import clsx from 'clsx';

interface LockedFeatureProps {
  reason?: string;
  showUpgradeButton?: boolean;
  showTryNowButton?: boolean;
  featureId?: string;
  className?: string;
}

export default function LockedFeature({
  reason = 'This feature is not available on your current plan.',
  showUpgradeButton = true,
  showTryNowButton = false,
  featureId,
  className,
}: LockedFeatureProps) {
  const router = useRouter();

  return (
    <div
      className={clsx(
        'border border-red-600 bg-red-950/40 rounded-xl p-6 text-center flex flex-col items-center gap-4 shadow-md backdrop-blur-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 text-red-400 font-bold text-lg">
        <LockIcon className="w-5 h-5" />
        Feature Locked
      </div>

      <p className="text-sm text-red-200 max-w-md">{reason}</p>

      <div className="flex flex-wrap justify-center gap-4 mt-2">
        {showUpgradeButton && (
          <button
            onClick={() => router.push('/onboarding/plan')}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg transition"
          >
            Upgrade Plan
          </button>
        )}

        {showTryNowButton && featureId && (
          <button
            onClick={() => router.push(`/pay-per-use/${featureId}`)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-5 py-2 rounded-lg transition"
          >
            Try Now
          </button>
        )}
      </div>
    </div>
  );
}