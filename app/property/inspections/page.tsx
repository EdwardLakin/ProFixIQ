import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null } };
  property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; status: string; summary: string | null; completed_at: string | null; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
} } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function PropertyInspectionsPage() {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;

  const [{ data: inspections }, { data: properties }, { data: units }] = await Promise.all([
    supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,status,summary,completed_at,created_at").order("created_at", { ascending: false }),
    supabase.from("property_properties").select("id,name"),
    supabase.from("property_units").select("id,unit_label"),
  ]);

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-6xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Property inspections</h1><p className="text-sm text-neutral-400">Internal property-maintenance inspections only.</p></div><div className="flex gap-2"><Link href="/property" className="rounded-full border px-3 py-1 text-xs">Back</Link><Link href="/property/inspections/new?type=move_in" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-3 py-1 text-xs">New property inspection</Link></div></div>{!(inspections??[]).length ? <div className="rounded-2xl border border-dashed border-[color:var(--metal-border-soft)] p-6 text-sm text-neutral-300">No property inspections yet.</div> : <div className="space-y-3">{(inspections??[]).map((x)=><article key={x.id} className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-semibold text-neutral-100">{x.inspection_type}</div><div className="mt-1 text-xs text-neutral-400">{properties?.find((p)=>p.id===x.property_id)?.name ?? "Unknown property"}{x.unit_id ? ` · ${units?.find((u)=>u.id===x.unit_id)?.unit_label ?? "Unknown unit"}` : ""}</div><p className="mt-2 text-xs text-neutral-300">{x.summary || "No summary provided."}</p></div><div className="text-right text-xs text-neutral-400"><div>Status: {x.status}</div><div>Completed: {x.completed_at ? new Date(x.completed_at).toLocaleString() : "—"}</div><div>Created: {new Date(x.created_at).toLocaleString()}</div></div></div><div className="mt-2"><Link href={`/property/inspections/${x.id}`} className="text-xs underline">View detail →</Link></div></article>)}</div>}</div></main>;
}
