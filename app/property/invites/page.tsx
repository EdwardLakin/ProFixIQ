import "server-only";

import { createHash, randomBytes } from "node:crypto";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

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

const roles = ["property_manager", "owner_approver", "tenant_requester", "viewer"] as const;
const roleSet = new Set<string>(roles);
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

  async function createInvite(formData: FormData) {
    "use server";
    const supabase = client();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/signin");

    const { data: me } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
    if (!me?.shop_id) redirect("/property/invites?error=" + encodeURIComponent("No shop scope on current profile."));
    const currentShopId = me.shop_id;

    const invitedEmail = String(formData.get("invited_email") || "").trim().toLowerCase();
    const invitedName = String(formData.get("invited_name") || "").trim() || null;
    const role = String(formData.get("role") || "").trim();
    const portfolioId = String(formData.get("portfolio_id") || "").trim() || null;
    const propertyId = String(formData.get("property_id") || "").trim() || null;
    const unitId = String(formData.get("unit_id") || "").trim() || null;
    const expiresInDays = Number.parseInt(String(formData.get("expires_in_days") || "7").trim(), 10);

    if (!invitedEmail) redirect("/property/invites?error=" + encodeURIComponent("Invited email is required."));
    if (!roleSet.has(role)) redirect("/property/invites?error=" + encodeURIComponent("Invalid role."));
    if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) redirect("/property/invites?error=" + encodeURIComponent("Expires in days must be between 1 and 30."));
    if (role !== "property_manager" && !portfolioId && !propertyId && !unitId) redirect("/property/invites?error=" + encodeURIComponent("Scope required unless role is property_manager."));

    if (portfolioId) {
      const { data } = await supabase.from("property_portfolios").select("id,shop_id").eq("id", portfolioId).maybeSingle();
      if (!data || data.shop_id !== currentShopId) redirect("/property/invites?error=" + encodeURIComponent("Invalid portfolio scope."));
    }

    if (propertyId) {
      const { data } = await supabase.from("property_properties").select("id,shop_id").eq("id", propertyId).maybeSingle();
      if (!data || data.shop_id !== currentShopId) redirect("/property/invites?error=" + encodeURIComponent("Invalid property scope."));
    }

    if (unitId) {
      const { data } = await supabase.from("property_units").select("id,shop_id,property_id").eq("id", unitId).maybeSingle();
      if (!data || data.shop_id !== currentShopId) redirect("/property/invites?error=" + encodeURIComponent("Invalid unit scope."));
      if (propertyId && data.property_id !== propertyId) redirect("/property/invites?error=" + encodeURIComponent("Unit does not belong to property."));
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("property_portal_invites").insert({
      shop_id: currentShopId,
      invited_email: invitedEmail,
      invited_name: invitedName,
      role,
      portfolio_id: portfolioId,
      property_id: propertyId,
      unit_id: unitId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by_profile_id: user.id,
    });

    if (error) redirect("/property/invites?error=" + encodeURIComponent(error.message));

    revalidatePath("/property/invites");
    revalidatePath("/property");
    redirect("/property/invites?status=invite-created");
  }

  const portfolioRows = portfolios.data ?? [];
  const propertyRows = properties.data ?? [];
  const unitRows = units.data ?? [];
  const inviteRows = invites.data ?? [];

  const portfolioMap = new Map(portfolioRows.map((p) => [p.id, p.name ?? p.id]));
  const propertyMap = new Map(propertyRows.map((p) => [p.id, p.name ?? p.id]));
  const unitMap = new Map(unitRows.map((u) => [u.id, u.unit_label ?? u.id]));

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex gap-2 text-xs uppercase tracking-[0.16em]"><Link href="/property" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Back to /property</Link><Link href="/property/members" className="rounded-full border border-[color:var(--metal-border-soft)] px-3 py-1">Property Members</Link></div>
    <section className="metal-card rounded-3xl p-6"><h1 className="text-3xl font-semibold">Property Portal Invites</h1><p className="mt-2 text-sm text-neutral-300">Create internal invite records for property portal access scopes.</p><p className="mt-2 text-xs text-neutral-400">Invite created. Email sending and token acceptance will be wired in the next phase.</p>{sv(params.status)==="invite-created"&&<p className="mt-2 text-emerald-300">Invite record created successfully.</p>}{sv(params.error)&&<p className="mt-2 text-rose-300">{sv(params.error)}</p>}</section>
    <section className="grid gap-6 lg:grid-cols-2"><article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Create invite record</h2><form action={createInvite} className="mt-4 space-y-3">
      <input type="email" name="invited_email" required placeholder="tenant@example.com" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"/>
      <input name="invited_name" placeholder="Invited name (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"/>
      <select name="role" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2">{roles.map((r)=><option key={r} value={r}>{r}</option>)}</select>
      <select name="portfolio_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No portfolio scope</option>{portfolioRows.map((x)=><option key={x.id} value={x.id}>{x.name??x.id}</option>)}</select>
      <select name="property_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No property scope</option>{propertyRows.map((x)=><option key={x.id} value={x.id}>{x.name??x.id}</option>)}</select>
      <select name="unit_id" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"><option value="">No unit scope</option>{unitRows.map((x)=><option key={x.id} value={x.id}>{x.unit_label??x.id}</option>)}</select>
      <input type="number" min={1} max={30} name="expires_in_days" defaultValue={7} required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"/>
      <button type="submit" className="w-full rounded-xl border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2">Create invite record</button>
    </form></article>
    <article className="metal-card rounded-3xl p-6"><h2 className="text-lg font-semibold">Existing invite records</h2><div className="mt-4 space-y-3">{inviteRows.length===0?<p className="text-sm text-neutral-400">No property portal invites found for this shop.</p>:inviteRows.map((invite)=><div key={invite.id} className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3 text-sm"><div className="flex justify-between"><span>{invite.invited_email}</span><span>{invite.status}</span></div><div className="text-xs text-neutral-400">Name: {invite.invited_name||"—"}<br/>Role: {invite.role}<br/>Scope: {scopeLabel(invite, portfolioMap, propertyMap, unitMap)}<br/>Expires: {invite.expires_at?new Date(invite.expires_at).toLocaleString():"—"}<br/>Created: {invite.created_at?new Date(invite.created_at).toLocaleString():"—"}<br/>Accepted: {invite.accepted_at?new Date(invite.accepted_at).toLocaleString():"—"}</div></div>)}</div></article></section>
  </div></main>;
}
