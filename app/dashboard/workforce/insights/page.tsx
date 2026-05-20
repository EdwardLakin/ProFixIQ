import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

const insightTopics = [
  "Tech availability and shift coverage",
  "Payroll exceptions and correction trends",
  "Certification expiration risk",
  "Absent technicians with active jobs",
  "Workload imbalance across teams",
  "Unassigned work orders impacting throughput",
];

export default async function WorkforceInsightsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <h1 className="text-2xl font-semibold text-white">Workforce Insights</h1>
      <p className="text-sm text-neutral-300">This phase introduces an IA landing page for upcoming workforce intelligence.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-200">
        {insightTopics.map((topic) => <li key={topic}>{topic}</li>)}
      </ul>
      <p className="text-xs text-neutral-400">Coming into focus: deeper analytics will reuse existing data surfaces in a future phase.</p>
    </div>
  );
}
