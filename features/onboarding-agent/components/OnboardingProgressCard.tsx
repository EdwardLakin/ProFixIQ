export function OnboardingProgressCard({ summary }: { summary?: Record<string, unknown> | null }) {
  const rows = [
    ["Uploaded files", String((summary?.fileCount as number) ?? 0)],
    ["Rows parsed", String((summary?.rowsParsed as number) ?? 0)],
    ["Entities discovered", String((summary?.entitiesDiscovered as number) ?? 0)],
    ["Links found", String((summary?.linksFound as number) ?? 0)],
    ["Review exceptions", String((summary?.reviewExceptions as number) ?? 0)],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Onboarding progress</h3>
      <p className="mt-1 text-xs text-cyan-100/80">Uploaded files are staged as information. No live records are created in this phase.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-sm text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
