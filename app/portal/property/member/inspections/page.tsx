import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type Finding = { section: string; item: string; status: "ok" | "fail" | "na"; notes: string };
type DB = { public: { Tables: {
  property_members: { Row: { id: string; shop_id: string; user_id: string; property_id: string | null; unit_id: string | null } };
  property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; status: string; findings: unknown; completed_at: string | null; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parse = (v: unknown): Finding[] => Array.isArray(v) ? v.filter((f): f is Finding => !!f && typeof f === "object" && "status" in f) : [];

export default async function PropertyMemberInspectionsPage() {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: memberships } = await supabase.from("property_members").select("id,shop_id,user_id,property_id,unit_id").eq("user_id", user.id);
  if (!(memberships ?? []).length) return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Inspections</h1><p className="mt-3 text-sm text-neutral-300">No property portal access is assigned to this account.</p></section>;

  const shopIds = [...new Set((memberships ?? []).map((m) => m.shop_id))];
  const { data: rows } = await supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,status,findings,completed_at,created_at").in("shop_id", shopIds).order("created_at", { ascending: false }).limit(100);

  const visible = (rows ?? []).filter((row) => (memberships ?? []).some((m) => m.shop_id === row.shop_id && (!m.property_id || m.property_id === row.property_id) && (!m.unit_id || m.unit_id === row.unit_id)));
  const pids = [...new Set(visible.map((r) => r.property_id))];
  const uids = [...new Set(visible.map((r) => r.unit_id).filter(Boolean))] as string[];
  const [p, u] = await Promise.all([
    pids.length ? supabase.from("property_properties").select("id,name").in("id", pids) : Promise.resolve({ data: [] as DB["public"]["Tables"]["property_properties"]["Row"][] }),
    uids.length ? supabase.from("property_units").select("id,unit_label").in("id", uids) : Promise.resolve({ data: [] as DB["public"]["Tables"]["property_units"]["Row"][] }),
  ]);
  const propertyById = new Map((p.data ?? []).map((x) => [x.id, x.name]));
  const unitById = new Map((u.data ?? []).map((x) => [x.id, x.unit_label]));

  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Property Portal</p>
      <h1 className="mt-2 text-2xl text-neutral-100">Inspections</h1>
      <p className="mt-2 text-sm text-neutral-300">View property inspection records and acknowledgements.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/portal/property/member" className="text-neutral-300 underline">Portal Home</Link>
        <Link href="/portal/property/member/requests" className="text-neutral-300 underline">Requests</Link>
        <Link href="/portal/property/member/requests/new" className="text-neutral-300 underline">Submit Request</Link>
        <Link href="/portal/property/member/inspections" className="text-cyan-200 underline">Inspections</Link>
      </div>

      {visible.length === 0 ? <p className="mt-6 text-sm text-neutral-300">No inspections are available yet.</p> : (
        <div className="mt-5 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20">
          {visible.map((r) => {
            const failCount = parse(r.findings).filter((f) => f.status === "fail").length;
            return <article key={r.id} className="p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-neutral-100">{r.inspection_type} · {r.status}</div><div className="text-xs text-neutral-500">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "Not completed"}</div></div><div className="mt-1 text-neutral-400">Property: {propertyById.get(r.property_id) ?? "—"} · Unit: {r.unit_id ? (unitById.get(r.unit_id) ?? "—") : "—"}</div><div className="mt-1 text-neutral-500">Fail count: {failCount}</div><Link href={`/portal/property/member/inspections/${r.id}`} className="mt-2 inline-block text-cyan-300 underline">View details</Link></article>;
          })}
        </div>
      )}
    </section>
  );
}
