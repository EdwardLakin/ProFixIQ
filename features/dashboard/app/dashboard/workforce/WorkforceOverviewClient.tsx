"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type InboxItem = { id: string; type: string; severity: "blocking" | "warning" | "info"; title: string; description: string; count?: number; href: string };
type OverviewPayload = { summary: Record<string, number>; inbox: InboxItem[]; sections: Record<string, InboxItem[]>; generatedAt: string };

const quickLinks = [
  { href: "/dashboard/workforce/people", title: "People" },
  { href: "/dashboard/workforce/scheduling", title: "Scheduling" },
  { href: "/dashboard/workforce/time-off", title: "Time Off" },
  { href: "/dashboard/workforce/payroll-review", title: "Payroll Review" },
  { href: "/dashboard/workforce/certifications", title: "Certifications" },
];

export default function WorkforceOverviewClient() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await fetch("/api/workforce/overview", { cache: "no-store" });
    if (!res.ok) { setError("Unable to load workforce overview."); setLoading(false); return; }
    const json = (await res.json()) as OverviewPayload;
    setData(json); setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-xl border border-white/10 bg-black/25 p-5 text-sm text-neutral-300">Loading workforce overview…</div>;
  if (error || !data) return <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-5 text-sm text-red-100">{error ?? "Failed to load"} <button className="ml-3 underline" onClick={() => void load()}>Retry</button></div>;

  const kpis = [
    ["Working today", data.summary.workingToday], ["Away today", data.summary.awayToday], ["Pending time off", data.summary.pendingTimeOff],
    ["Payroll blocking", data.summary.payrollBlocking], ["Expired certs", data.summary.expiredCertifications], ["Unassigned jobs", data.summary.unassignedJobs],
  ];

  return <div className="space-y-6">
    <header className="rounded-2xl border border-white/10 bg-black/25 p-5"><p className="text-xs uppercase tracking-[0.2em] text-orange-300/90">Workforce</p><h1 className="mt-2 text-2xl font-semibold text-white">Daily people operations</h1><p className="mt-2 text-sm text-neutral-300">Operational workforce inbox for managers and admins.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{kpis.map(([label, value]) => <div key={label as string} className="rounded-xl border border-white/10 bg-black/30 p-3"><p className="text-xs text-neutral-400">{label as string}</p><p className="mt-1 text-2xl font-semibold text-white">{value as number}</p></div>)}</section>
    <section className="rounded-2xl border border-white/10 bg-black/25 p-5"><h2 className="text-lg font-semibold text-white">Workforce Inbox</h2>{data.inbox.length === 0 ? <p className="mt-3 text-sm text-neutral-300">Workforce is clear right now.</p> : <div className="mt-3 space-y-2">{data.inbox.map((item) => <Link href={item.href} key={item.id} className="block rounded-lg border border-white/10 bg-black/25 p-3 hover:border-orange-400/60"><p className="text-xs uppercase tracking-wide text-neutral-400">{item.severity}</p><p className="text-sm font-medium text-white">{item.title}</p><p className="text-xs text-neutral-300">{item.description}</p></Link>)}</div>}</section>
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5"><h3 className="text-white font-medium">Operational risks</h3><ul className="mt-2 text-sm text-neutral-300 space-y-1"><li>Assigned to unavailable: {data.summary.assignedToUnavailable}</li><li>Overloaded techs: {data.summary.overloadedTechs}</li><li>Away tomorrow: {data.summary.awayTomorrow}</li></ul></div>
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5"><h3 className="text-white font-medium">Compliance</h3><ul className="mt-2 text-sm text-neutral-300 space-y-1"><li>Payroll warnings: {data.summary.payrollWarnings}</li><li>Expiring certs: {data.summary.expiringCertifications}</li><li>Schedule gaps: {data.summary.scheduleGaps}</li></ul></div>
    </section>
    <section className="rounded-2xl border border-white/10 bg-black/25 p-5"><h3 className="text-white font-medium">Quick links</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{quickLinks.map((link) => <Link key={link.href} href={link.href} className="rounded-lg border border-white/10 p-3 text-sm text-neutral-200 hover:border-orange-400/60">{link.title}</Link>)}</div></section>
  </div>;
}
