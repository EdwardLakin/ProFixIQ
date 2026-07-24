import Link from "next/link";
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
    <div className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
      <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Workforce Insights</h1>
      <p className="text-sm text-[color:var(--theme-text-secondary)]">Use trusted workforce signals to spot coverage, time, readiness, and throughput risks.</p>
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <p className="text-sm text-[color:var(--theme-text-primary)]">Use Scheduling, Attendance, and Payroll Review today for immediate decisions and exception handling.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link href="/dashboard/workforce/scheduling" className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-[color:var(--theme-accent-text)]">Scheduling Command</Link>
          <Link href="/dashboard/workforce/attendance" className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-[color:var(--theme-accent-text)]">Attendance & Activity</Link>
          <Link href="/dashboard/workforce/payroll-review" className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-[color:var(--theme-accent-text)]">Payroll Review</Link>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--theme-text-primary)]">
        {insightTopics.map((topic) => <li key={topic}>{topic}</li>)}
      </ul>
      <p className="text-xs text-[color:var(--theme-text-secondary)]">Trend visualizations and historical comparisons will use the same trusted Workforce data sources.</p>
    </div>
  );
}
