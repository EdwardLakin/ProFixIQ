export function OnboardingReviewPanel({ reviewCounts }: { reviewCounts: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Review exceptions</h3>
      <p className="mt-2 text-sm text-slate-300">Blocking: {reviewCounts.blocking ?? 0} • Nonblocking: {reviewCounts.nonblocking ?? 0}</p>
      <p className="mt-2 text-xs text-slate-400">Only exceptions require review. Parse and linkage issues are highlighted here.</p>
    </div>
  );
}
