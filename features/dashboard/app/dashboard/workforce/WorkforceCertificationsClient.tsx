"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkforceQuickLinks } from "./WorkforceQuickLinks";

type Item = { personId: string; personName: string; certificationId: string; name: string | null; expiresAt: string | null; status: "expired" | "expiring_soon" | "active"; href: string };
type Payload = { summary: { expired: number; expiringSoon: number; active: number; peopleAtRisk: number }; items: Item[]; generatedAt: string };

export default function WorkforceCertificationsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void (async () => { try { const r = await fetch('/api/workforce/certifications-readiness', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Failed'); setData(j); } catch (e) { setError((e as Error).message); } finally { setLoading(false);} })(); }, []);

  const grouped = useMemo(() => ({ expired: (data?.items ?? []).filter(i => i.status === 'expired'), expiring: (data?.items ?? []).filter(i => i.status === 'expiring_soon'), active: (data?.items ?? []).filter(i => i.status === 'active') }), [data]);

  const section = (label: string, rows: Item[]) => <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">{label}</h2><div className="grid gap-2">{rows.length===0?<div className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">No certifications in this state right now.</div>:rows.map(r=><div key={r.certificationId} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 flex items-center justify-between"><div><div className="font-medium text-[color:var(--theme-text-primary)]">{r.name ?? 'Certification'}</div><div className="text-sm text-[color:var(--theme-text-secondary)]">{r.personName}</div><div className="text-xs text-[color:var(--theme-text-secondary)]">Expires: {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}</div></div><Link href={r.href} className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-xs text-orange-300">Edit</Link></div>)}</div></section>;

  if (loading) return <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-secondary)]">Loading Certifications Command…</div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5 text-red-200">{error}</div>;

  return <div className="space-y-5"><div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5"><h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Certifications Command</h1><p className="text-sm text-[color:var(--theme-text-secondary)]">Certification readiness and renewal risk view.</p><WorkforceQuickLinks roleScope="owner_admin" className="mt-3 flex flex-wrap gap-2" /></div><div className="grid gap-3 sm:grid-cols-4">{Object.entries({Expired:data?.summary.expired??0,'Expiring Soon':data?.summary.expiringSoon??0,Active:data?.summary.active??0,'People At Risk':data?.summary.peopleAtRisk??0}).map(([k,v])=><div key={k} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"><div className="text-xs text-[color:var(--theme-text-secondary)]">{k}</div><div className="text-xl font-semibold text-[color:var(--theme-text-primary)]">{v}</div></div>)}</div>{section('Expired', grouped.expired)}{section('Expiring Soon', grouped.expiring)}{section('Active', grouped.active)}</div>;
}
