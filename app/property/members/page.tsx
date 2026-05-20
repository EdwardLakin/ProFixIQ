import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { createMember } from "./actions";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null; role: string | null; full_name: string | null; name: string | null; display_name: string | null; email: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portfolios: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_properties: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_units: { Row: { id: string; shop_id: string; property_id: string; unit_label: string | null }; Insert: never; Update: never; Relationships: [] };
  property_members: { Row: { id: string; shop_id: string; user_id: string; role: string; portfolio_id: string | null; property_id: string | null; unit_id: string | null; created_at: string | null }; Insert: { shop_id: string; user_id: string; role: string; portfolio_id?: string | null; property_id?: string | null; unit_id?: string | null }; Update: never; Relationships: [] };
} } };

const roles = ["property_manager", "owner_approver", "tenant_requester", "vendor", "viewer"] as const;
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

function label(p: DB["public"]["Tables"]["profiles"]["Row"]) { return p.full_name || p.display_name || p.name || p.email || p.id; }
function sv(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("No shop scope on current profile."));
  const shopId = profile.shop_id;

  const [profiles, portfolios, properties, units, members] = await Promise.all([
    supabase.from("profiles").select("id,shop_id,role,full_name,name,display_name,email").eq("shop_id", shopId),
    supabase.from("property_portfolios").select("id,shop_id,name").eq("shop_id", shopId),
    supabase.from("property_properties").select("id,shop_id,name").eq("shop_id", shopId),
    supabase.from("property_units").select("id,shop_id,property_id,unit_label").eq("shop_id", shopId),
    supabase.from("property_members").select("id,shop_id,user_id,role,portfolio_id,property_id,unit_id,created_at").eq("shop_id", shopId).order("created_at", { ascending: false }),
  ]);

  const pRows = profiles.data ?? []; const poRows = portfolios.data ?? []; const prRows = properties.data ?? []; const uRows = units.data ?? []; const mRows = members.data ?? [];
  const pMap = new Map(pRows.map((p) => [p.id, p])); const poMap = new Map(poRows.map((p) => [p.id, p])); const prMap = new Map(prRows.map((p) => [p.id, p])); const uMap = new Map(uRows.map((u) => [u.id, u]));

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex gap-2 text-xs uppercase tracking-[0.16em]"><Link href="/property" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Back to /property</Link><Link href="/property/setup" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Property Setup</Link></div>
    <section className="metal-card rounded-3xl p-6"><h1 className="text-3xl font-semibold">Property Members</h1><p className="mt-2 text-sm text-neutral-300">Manage property-scoped access for existing users.</p><p className="mt-2 text-xs text-neutral-400">This does not send invites or create new auth users yet.</p>{sv(params.status)==="member-created"&&<p className="mt-2 text-emerald-300">Property member created.</p>}{sv(params.status)==="member-exists"&&<p className="mt-2 text-amber-300">Member already exists for that role and scope.</p>}{sv(params.error)&&<p className="mt-2 text-rose-300">{sv(params.error)}</p>}</section>
    <section className="grid gap-6 lg:grid-cols-2"><article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Create property member</h2><form action={createMember} className="mt-4 space-y-3">
      <select name="user_id" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">Select user</option>{pRows.map((p)=><option key={p.id} value={p.id}>{label(p)} ({p.id})</option>)}</select>
      <select name="role" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2">{roles.map((r)=><option key={r} value={r}>{r}</option>)}</select>
      <select name="portfolio_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No portfolio scope</option>{poRows.map((x)=><option key={x.id} value={x.id}>{x.name??x.id}</option>)}</select>
      <select name="property_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No property scope</option>{prRows.map((x)=><option key={x.id} value={x.id}>{x.name??x.id}</option>)}</select>
      <select name="unit_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No unit scope</option>{uRows.map((x)=><option key={x.id} value={x.id}>{x.unit_label??x.id}</option>)}</select>
      <button type="submit" className="w-full rounded-xl border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2">Add member</button>
    </form></article>
    <article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Existing members</h2><div className="mt-4 space-y-3">{mRows.length===0?<p className="text-sm text-neutral-400">No property members found for this shop.</p>:mRows.map((m)=><div key={m.id} className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3 text-sm"><div className="flex justify-between"><span>{pMap.get(m.user_id)?label(pMap.get(m.user_id)!):m.user_id}</span><span>{m.role}</span></div><div className="text-xs text-neutral-400">Portfolio: {m.portfolio_id?(poMap.get(m.portfolio_id)?.name??m.portfolio_id):"—"}<br/>Property: {m.property_id?(prMap.get(m.property_id)?.name??m.property_id):"—"}<br/>Unit: {m.unit_id?(uMap.get(m.unit_id)?.unit_label??m.unit_id):"—"}<br/>Created: {m.created_at?new Date(m.created_at).toLocaleString():"—"}</div></div>)}</div></article></section>
  </div></main>;
}
