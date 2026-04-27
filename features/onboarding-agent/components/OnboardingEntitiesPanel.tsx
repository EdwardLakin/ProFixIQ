import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

const ENTITY_ROWS: Array<{ key: string; label: string }> = [
  { key: "customer", label: "Customers" },
  { key: "vehicle", label: "Vehicles" },
  { key: "historical_work_order", label: "Historical work orders" },
  { key: "historical_invoice", label: "Historical invoices" },
  { key: "part", label: "Parts" },
  { key: "vendor", label: "Vendors" },
  { key: "staff_candidate", label: "Staff candidates" },
  { key: "menu_suggestion", label: "Menu suggestions" },
  { key: "inspection_suggestion", label: "Inspection suggestions" },
];

export function OnboardingEntitiesPanel({
  entityCounts,
  entityStatusCounts,
  linkCounts,
  agentPlan,
}: {
  entityCounts: Record<string, number>;
  entityStatusCounts: Record<string, Record<string, number>>;
  linkCounts: Record<string, number>;
  agentPlan?: OnboardingAgentPlan | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Staged entities & links</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Persisted staged entities</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {ENTITY_ROWS.map((item) => {
              const status = entityStatusCounts[item.key] ?? {};
              return (
                <li key={item.key} className="rounded border border-white/5 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span className="font-semibold text-white">{entityCounts[item.key] ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">ready: {status.ready ?? 0} • review: {(status.needs_review ?? 0) + (status.duplicate_candidate ?? 0)}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Persisted relationship links</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {Object.entries(linkCounts).map(([key, value]) => (
              <li key={key} className="flex items-center justify-between gap-2 rounded border border-white/5 px-2 py-1">
                <span>{key}</span>
                <span className="font-semibold text-white">{value ?? 0}</span>
              </li>
            ))}
          </ul>
          {agentPlan?.relationshipPlan?.length ? (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">AI relationship hints</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-400">
                {agentPlan.relationshipPlan.slice(0, 5).map((rel, idx) => (
                  <li key={`${rel.relationshipType}-${idx}`}>{rel.fromDomain} → {rel.toDomain} ({rel.relationshipType})</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
