import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type Finding = { section: string; item: string; status: "ok" | "fail" | "na"; notes: string; photo_notes?: string };
type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null } };
  property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; status: string; summary: string | null; performed_by_profile_id: string; findings: unknown; completed_at: string | null; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
} } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function PropertyInspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;

  const { data: row } = await supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,status,summary,performed_by_profile_id,findings,completed_at,created_at").eq("id", id).maybeSingle();
  if (!row || row.shop_id !== profile.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Inspection not found.</div></main>;

  const [{ data: property }, { data: unit }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", row.property_id).maybeSingle(),
    row.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", row.unit_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const findings: Finding[] = Array.isArray(row.findings) ? row.findings as Finding[] : [];
  const grouped = findings.reduce<Record<string, Finding[]>>((acc, finding) => {
    if (!acc[finding.section]) acc[finding.section] = [];
    acc[finding.section].push(finding);
    return acc;
  }, {});

  const counts = findings.reduce((acc, f) => ({ ...acc, [f.status]: acc[f.status] + 1 }), { ok: 0, fail: 0, na: 0 });

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-5xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex items-start justify-between"><div><h1 className="text-2xl font-semibold">Property inspection detail</h1><p className="text-sm text-neutral-400">Internal-only property maintenance inspection record.</p></div><Link href="/property/inspections" className="text-xs underline">Back to inspections</Link></div><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-[color:var(--metal-border-soft)] p-3 text-sm"><div>Type: {row.inspection_type}</div><div>Status: {row.status}</div><div>Summary: {row.summary || "—"}</div><div>Property: {property?.name ?? "Unknown"}</div><div>Unit: {unit?.unit_label ?? "—"}</div><div>Completed: {row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}</div><div>Created: {new Date(row.created_at).toLocaleString()}</div><div>Performed by profile: {row.performed_by_profile_id}</div></div><div className="rounded-xl border border-[color:var(--metal-border-soft)] p-3 text-sm"><div className="font-semibold">Finding totals</div><div className="mt-2">OK: {counts.ok}</div><div>Fail: {counts.fail}</div><div>N/A: {counts.na}</div></div></div><div className="mt-4 space-y-3">{Object.entries(grouped).map(([section, sectionFindings]) => <section key={section} className="rounded-xl border border-[color:var(--metal-border-soft)] p-3"><h2 className="text-sm font-semibold">{section}</h2><div className="mt-2 space-y-2">{sectionFindings.map((finding, idx) => <article key={`${section}-${idx}`} className="rounded-lg bg-black/30 p-2 text-sm"><div className="font-medium">{finding.item} · <span className="uppercase text-xs">{finding.status}</span></div><div className="text-neutral-300">Notes: {finding.notes || "—"}</div>{finding.photo_notes ? <div className="text-neutral-400">Photo notes: {finding.photo_notes}</div> : null}</article>)}</div></section>)}</div></div></main>;
}
