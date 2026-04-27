export function OnboardingEntitiesPanel({ entityCounts, linkCounts }: { entityCounts: Record<string, number>; linkCounts: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Staged entities & links</h3>
      <pre className="mt-2 overflow-auto rounded-lg bg-slate-900/70 p-3 text-xs text-slate-200">{JSON.stringify({ entityCounts, linkCounts }, null, 2)}</pre>
    </div>
  );
}
