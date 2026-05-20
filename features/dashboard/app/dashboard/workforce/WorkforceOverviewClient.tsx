import Link from "next/link";

const cards = [
  { href: "/dashboard/workforce/people", title: "People", blurb: "Directory, profiles, certifications, and workforce status." },
  { href: "/dashboard/workforce/scheduling", title: "Scheduling", blurb: "Shifts, PTO requests, and staffing coverage." },
  { href: "/dashboard/workforce/time-off", title: "Time Off", blurb: "Pending time-off approvals and policy context." },
  { href: "/dashboard/workforce/attendance", title: "Attendance", blurb: "Punch activity and attendance context feeding payroll." },
  { href: "/dashboard/workforce/payroll-review", title: "Payroll Review", blurb: "Exceptions, approvals, and export readiness." },
  { href: "/dashboard/workforce/documents", title: "Documents", blurb: "Employee docs and required records." },
  { href: "/dashboard/workforce/certifications", title: "Certifications", blurb: "Certification tracking is managed per person." },
  { href: "/dashboard/workforce/insights", title: "Insights", blurb: "Operational insights are coming into focus." },
];

export default function WorkforceOverviewClient() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-300/90">Workforce</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Daily people operations</h1>
        <p className="mt-2 text-sm text-neutral-300">Phase 0 centralizes workforce operations without changing underlying admin APIs or workflows.</p>
      </header>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-orange-400/60">
            <p className="font-medium text-white">{card.title}</p>
            <p className="mt-1 text-sm text-neutral-300">{card.blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
