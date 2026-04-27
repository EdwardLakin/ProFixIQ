export function OnboardingActivationPlanPanel({ latestPlan }: { latestPlan?: Record<string, unknown> | null }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
      <h3 className="text-sm font-semibold text-amber-100">Activation plan (dry-run only)</h3>
      <p className="mt-2 text-xs text-amber-200/80">Activation is not enabled in this foundation phase. This workspace stages, explains, and prepares an activation plan.</p>
      <pre className="mt-3 overflow-auto rounded-lg bg-slate-900/60 p-3 text-xs text-slate-200">{JSON.stringify(latestPlan ?? { status: "not_prepared" }, null, 2)}</pre>
    </div>
  );
}
