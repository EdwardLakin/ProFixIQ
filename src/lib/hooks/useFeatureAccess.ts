import { useSession } from '@supabase/auth-helpers-react';
import { features, FeatureAccess } from '@/lib/plan/features';

interface UseFeatureAccessResult {
  allowed: boolean;
  addOnAvailable: boolean;
  reason: string | null;
}

export function useFeatureAccess(feature: string): UseFeatureAccessResult {
  const session = useSession();
  const plan = session?.user?.user_metadata?.plan;

  const featureConfig = features[feature];

  if (!plan || !featureConfig) {
    return {
      allowed: false,
      addOnAvailable: false,
      reason: 'Unknown feature',
    };
  }

  const access: FeatureAccess = featureConfig[plan as keyof typeof featureConfig];

  const allowed = access?.pro || access?.proPlus || access?.diy || false;
  const addOnAvailable = access?.addOnAvailable ?? false;

  return {
    allowed,
    addOnAvailable,
    reason: allowed
      ? null
      : addOnAvailable
        ? 'Available as pay-per-use'
        : 'Upgrade your plan to unlock this feature',
  };
}