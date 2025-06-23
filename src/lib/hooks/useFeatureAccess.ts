import { useSession } from '@supabase/auth-helpers-react';
import { features, type FeatureKey } from '@/lib/plan/features';

interface UseFeatureAccessResult {
  allowed: boolean;
  addOnAvailable: boolean;
  reason: string | null;
}

export function useFeatureAccess(feature: FeatureKey): UseFeatureAccessResult {
  const session = useSession();
  const plan = session?.user?.user_metadata?.plan as 'diy' | 'pro' | 'proPlus' | undefined;

  const featureConfig = features.find((f) => f.key === feature);

  if (!featureConfig || !plan) {
    return {
      allowed: false,
      addOnAvailable: false,
      reason: 'Unknown plan access for feature',
    };
  }

  const access = featureConfig.access[plan];
  const allowed = !!access;
  const addOnAvailable = featureConfig.access.addOnAvailable ?? false;

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