const { allowed, reason, addOnAvailable } = useFeatureAccess(id);

return (
  <div className="border border-neutral-700 rounded-lg p-4 bg-neutral-900/80 text-white shadow-md">
    <div className="text-lg font-semibold mb-2">{label}</div>
    {allowed ? (
      <p className="text-green-400">✅ Available on your plan</p>
    ) : (
      <LockedFeature
        reason={reason}
        showTryNowButton={addOnAvailable}
        featureId={id}
      />
    )}
  </div>
);