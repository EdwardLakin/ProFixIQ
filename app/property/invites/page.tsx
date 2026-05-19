import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import InviteCreateForm from "./InviteCreateForm";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portfolios: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_properties: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_units: { Row: { id: string; shop_id: string; property_id: string; unit_label: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portal_invites: {
    Row: { id: string; shop_id: string; invited_email: string; invited_name: string | null; role: string; portfolio_id: string | null; property_id: string | null; unit_id: string | null; status: string; expires_at: string; created_at: string; accepted_at: string | null };
    Insert: { shop_id: string; invited_email: string; invited_name?: string | null; role: string; portfolio_id?: string | null; property_id?: string | null; unit_id?: string | null; token_hash: string; expires_at: string; created_by_profile_id: string };
    Update: never;
    Relationships: [];
  };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

function sv(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

function scopeLabel(invite: DB["public"]["Tables"]["property_portal_invites"]["Row"], portfolioMap: Map<string, string>, propertyMap: Map<string, string>, unitMap: Map<string, string>) {
  const parts: string[] = [];
  if (invite.portfolio_id) parts.push(`Portfolio: ${portfolioMap.get(invite.portfolio_id) ?? invite.portfolio_id}`);
  if (invite.property_id) parts.push(`Property: ${propertyMap.get(invite.property_id) ?? invite.property_id}`);
  if (invite.unit_id) parts.push(`Unit: ${unitMap.get(invite.unit_id) ?? invite.unit_id}`);
  return parts.length > 0 ? parts.join(" · ") : "Global (property_manager)";
}

export default async function PropertyInvitesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("No shop scope on current profile."));
  const shopId = profile.shop_id;

  const [portfolios, properties, units, invites] = await Promise.all([
    supabase.from("property_portfolios").select("id,shop_id,name").eq("shop_id", shopId).order("name", { ascending: true }),
    supabase.from("property_properties").select("id,shop_id,name").eq("shop_id", shopId).order("name", { ascending: true }),
    supabase.from("property_units").select("id,shop_id,property_id,unit_label").eq("shop_id", shopId).order("unit_label", { ascending: true }),
    supabase.from("property_portal_invites").select("id,shop_id,invited_email,invited_name,role,portfolio_id,property_id,unit_id,status,expires_at,created_at,accepted_at").eq("shop_id", shopId).order("created_at", { ascending: false }),
  ]);

  const portfolioRows = portfolios.data ?? [];
  const propertyRows = properties.data ?? [];
  const unitRows = units.data ?? [];
  const inviteRows = invites.data ?? [];

  const portfolioMap = new Map(portfolioRows.map((p) => [p.id, p.name ?? p.id]));
  const propertyMap = new Map(propertyRows.map((p) => [p.id, p.name ?? p.id]));
  const unitMap = new Map(unitRows.map((u) => [u.id, u.unit_label ?? u.id]));

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex gap-2 text-xs uppercase tracking-[0.16em]"><Link href="/property" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Back to /property</Link><Link href="/property/members" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Property Members</Link></div>
    <section className="metal-card rounded-3xl p-6"><h1 className="text-3xl font-semibold">Property Portal Invites</h1><p className="mt-2 text-sm text-neutral-300">Create internal invite records for property portal access scopes.</p><p className="mt-2 text-xs text-neutral-400">Invite created. Email sending and token acceptance will be wired in the next phase.</p>{sv(params.error)&&<p className="mt-2 text-rose-300">{sv(params.error)}</p>}</section>
    <section className="grid gap-6 lg:grid-cols-2"><article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Create invite record</h2>
      <InviteCreateForm
        portfolios={portfolioRows.map((x) => ({ id: x.id, label: x.name ?? x.id }))}
        properties={propertyRows.map((x) => ({ id: x.id, label: x.name ?? x.id }))}
        units={unitRows.map((x) => ({ id: x.id, label: x.unit_label ?? x.id }))}
      />
    </article>
    <article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Existing invite records</h2><div className="mt-4 space-y-3">{inviteRows.length===0?<p className="text-sm text-neutral-400">No property portal invites found for this shop.</p>:inviteRows.map((invite)=><div key={invite.id} className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3 text-sm"><div className="flex justify-between"><span>{invite.invited_email}</span><span>{invite.status}</span></div><div className="text-xs text-neutral-400">Name: {invite.invited_name||"—"}<br/>Role: {invite.role}<br/>Scope: {scopeLabel(invite, portfolioMap, propertyMap, unitMap)}<br/>Link: Link not available. Create a new invite to generate a one-time link.<br/>Expires: {invite.expires_at?new Date(invite.expires_at).toLocaleString():"—"}<br/>Created: {invite.created_at?new Date(invite.created_at).toLocaleString():"—"}<br/>Accepted: {invite.accepted_at?new Date(invite.accepted_at).toLocaleString():"—"}</div></div>)}</div></article></section>
  </div></main>;
}
