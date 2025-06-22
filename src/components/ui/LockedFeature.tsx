'use client';

import { useRouter } from 'next/navigation';

interface LockedFeatureProps {
  reason?: string;
  showUpgradeButton?: boolean;
  showTryNowButton?: boolean;
  featureId?: string;
}

export default function LockedFeature({
  reason = 'This feature is not available on your current plan.',
  showUpgradeButton = true,
  showTryNowButton = false,
  featureId,
}: LockedFeatureProps) {
  const router = useRouter();

  return (
    <div className="border border-red-500 bg-red-950/30 rounded-lg p-6 text-center text-white space-y-3 shadow-md">
      <div className="text-xl font-semibold text-red-400">Feature Locked 🔒</div>
      <div className="text-sm text-red-200">{reason}</div>

      <div className="flex justify-center gap-4 mt-4">
        {showUpgradeButton && (
          <button
            onClick={() => router.push('/onboarding/plan')}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition"
          >
            Upgrade Plan
          </button>
        )}
        {showTryNowButton && featureId && (
          <button
            onClick={() => router.push(`/pay-per-use/${featureId}`)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded transition"
          >
            Try Now
          </button>
        )}
      </div>
    </div>
  );
}