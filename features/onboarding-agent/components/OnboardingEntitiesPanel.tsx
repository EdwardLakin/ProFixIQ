import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

const ENTITY_ROWS: Array<{ key: string; label: string; planKey: keyof OnboardingAgentPlan["entityPlan"] }> = [
  { key: "customer", label: "Customers", planKey: "customers" },
  { key: "vehicle", label: "Vehicles", planKey: "vehicles" },
  { key: "historical_work_order", label: "Historical work orders", planKey: "historicalWorkOrders" },
  { key: "historical_invoice", label: "Historical invoices", planKey: "historicalInvoices" },
  { key: "part", label: "Parts", planKey: "parts" },
  { key: "vendor", label: "Vendors", planKey: "vendors" },
  { key: "staff_candidate", label: "Staff candidates", planKey: "staffCandidates" },
  { key: "menu_suggestion", label: "Menu suggestions", planKey: "menuSuggestions" },
  { key: "inspection_suggestion", label: "Inspection suggestions", planKey: "inspectionSuggestions" },
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
          <p className="text-xs uppercase tracking-wide text-slate-400">Entity plan (AI + staged)</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {ENTITY_ROWS.map((item) => {
              const status = entityStatusCounts[item.key] ?? {};
              const planned = agentPlan?.entityPlan?.[item.planKey];
              const hasMeaningfulPlan = Boolean(planned && (planned.staged > 0 || planned.ready > 0 || planned.review > 0));
              return (
                <li key={item.key} className="rounded border border-white/5 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span className="font-semibold text-white">{entityCounts[item.key] ?? 0}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">ready: {status.ready ?? 0} • review: {(status.needs_review ?? 0) + (status.duplicate_candidate ?? 0)}</p>
                  {hasMeaningfulPlan ? <p className="text-[11px] text-cyan-200">ai staged: {planned!.staged} • ai ready: {planned!.ready} • ai review: {planned!.review}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">Relationship plan</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {(agentPlan?.relationshipPlan ?? []).slice(0, 8).map((rel, idx) => (
              <li key={`${rel.relationshipType}-${idx}`} className="rounded border border-white/5 px-2 py-1">
                <div className="flex items-center justify-between gap-2"><span>{rel.fromDomain} ↔ {rel.toDomain}</span><span className="text-cyan-200">{Math.round(rel.confidence * 100)}%</span></div>
                <p className="text-[11px] text-slate-400">{rel.relationshipType} • keys: {rel.matchingKeys.join(", ") || "n/a"}</p>
              </li>
            ))}
            {!agentPlan?.relationshipPlan?.length ? Object.entries(linkCounts).map(([key, value]) => <li key={key} className="flex items-center justify-between gap-2 rounded border border-white/5 px-2 py-1"><span>{key}</span><span className="font-semibold text-white">{value ?? 0}</span></li>) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
