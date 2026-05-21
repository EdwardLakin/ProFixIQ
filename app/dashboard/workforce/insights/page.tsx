import Link from "next/link";
import { WorkforceQuickLinks } from "@/features/dashboard/app/dashboard/workforce/WorkforceQuickLinks";
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
      <p className="text-sm text-neutral-300">Command-level insight planning is now anchored here while operational decisions continue in live Workforce commands.</p>
      <WorkforceQuickLinks roleScope="manager" className="flex flex-wrap gap-2" />
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-neutral-200">Use Scheduling, Attendance, and Payroll Review today for immediate decisions and exception handling.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/dashboard/workforce/scheduling" className="rounded border border-white/15 px-2 py-1 text-orange-300">Scheduling Command</Link>
          <Link href="/dashboard/workforce/attendance" className="rounded border border-white/15 px-2 py-1 text-orange-300">Attendance Command</Link>
          <Link href="/dashboard/workforce/payroll-review" className="rounded border border-white/15 px-2 py-1 text-orange-300">Payroll Review</Link>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-200">
        {insightTopics.map((topic) => <li key={topic}>{topic}</li>)}
      </ul>
      <p className="text-xs text-neutral-400">Coming next: deeper trend visualizations and historical comparisons using the same trusted Workforce data sources.</p>
    </div>
  );
}
