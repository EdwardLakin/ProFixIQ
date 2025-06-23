import { useSession } from '@supabase/auth-helpers-react';
import { features, type FeatureKey } from '@/lib/plan/features';

type UseFeatureAccessResult = {
  allowed: boolean;
  addOnAvailable: boolean;
  reason: string | null;
};

export function useFeatureAccess(feature: FeatureKey): UseFeatureAccessResult {
  const session = useSession();
  const rawPlan = session?.user.user_metadata?.plan ?? 'diy';
  const plan = rawPlan as 'diy' | 'pro' | 'proPlus';

  const featureConfig = features.find(f => f.key === feature);

  if (!featureConfig || !plan || !featureConfig.access) {
    return {
      allowed: false,
      addOnAvailable: false,
      reason: 'Unknown plan access for feature',
    };
  }

  const allowed = Boolean(featureConfig.access[plan]);
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