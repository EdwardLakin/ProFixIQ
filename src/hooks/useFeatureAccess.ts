export function useFeatureAccess() {
  return {
    canUseFeature: (feature: string) => true,
  };
}