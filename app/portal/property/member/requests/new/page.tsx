import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { createMemberPropertyMaintenanceRequest } from "./actions";

type DB = { public: { Tables: {
  property_members: { Row: { id: string; user_id: string; property_id: string | null; unit_id: string | null } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; property_id: string; unit_label: string } };
  property_assets: { Row: { id: string; property_id: string; unit_id: string | null; name: string } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function NewMemberPropertyRequestPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const qp = (await searchParams) ?? {};
  const error = Array.isArray(qp.error) ? qp.error[0] : qp.error;

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: memberships } = await supabase.from("property_members").select("id,user_id,property_id,unit_id").eq("user_id", user.id);
  if (!(memberships ?? []).length) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Submit maintenance request</h1><p className="mt-3 text-sm text-neutral-300">No property portal access is assigned to this account.</p></section>;
  }

  const [propertiesResult, unitsResult, assetsResult] = await Promise.all([
    supabase.from("property_properties").select("id,name"),
    supabase.from("property_units").select("id,property_id,unit_label"),
    supabase.from("property_assets").select("id,property_id,unit_id,name"),
  ]);

  const allowedPropertyIds = new Set((memberships ?? []).map((m) => m.property_id).filter(Boolean));
  const properties = (propertiesResult.data ?? []).filter((p) => !allowedPropertyIds.size || allowedPropertyIds.has(p.id));
  const units = (unitsResult.data ?? []).filter((u) => properties.some((p) => p.id === u.property_id));
  const assets = (assetsResult.data ?? []).filter((a) => properties.some((p) => p.id === a.property_id));

  if (!properties.length) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Submit maintenance request</h1><p className="mt-3 text-sm text-neutral-300">No member-scoped properties are available for request submission.</p></section>;
  }

  return (
    <section className="metal-card rounded-3xl p-5">
      <h1 className="text-2xl text-neutral-100">Submit maintenance request</h1>
      <p className="mt-2 text-sm text-neutral-300">Authenticated member portal — public invite access is not wired yet.</p>
      <p className="mt-1 text-sm text-neutral-400">Image upload for tenants is coming later. Use photo notes for now.</p>
      {error ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <form action={createMemberPropertyMaintenanceRequest} className="mt-6 grid gap-3">
        <label className="text-sm text-neutral-300">Property *</label>
        <select name="property_id" required className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100">
          {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>

        <label className="text-sm text-neutral-300">Unit (optional)</label>
        <select name="unit_id" className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100">
          <option value="">None</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_label}</option>)}
        </select>

        <label className="text-sm text-neutral-300">Asset (optional)</label>
        <select name="asset_id" className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100">
          <option value="">None</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>

        <label className="text-sm text-neutral-300">Title *</label>
        <input name="title" required className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="text-sm text-neutral-300">Summary *</label>
        <textarea name="summary" required className="min-h-[120px] rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="text-sm text-neutral-300">Category (optional)</label>
        <input name="category" className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="text-sm text-neutral-300">Severity</label>
        <select name="severity" defaultValue="routine" className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100">
          <option value="emergency">emergency</option><option value="urgent">urgent</option><option value="routine">routine</option><option value="recommended">recommended</option>
        </select>
        <label className="text-sm text-neutral-300">Access notes (optional)</label>
        <textarea name="access_notes" className="min-h-[80px] rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="text-sm text-neutral-300">Preferred window (optional)</label>
        <input name="preferred_window" className="rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="text-sm text-neutral-300">Photo notes (placeholder only)</label>
        <textarea name="photo_notes" className="min-h-[80px] rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <button type="submit" className="mt-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">Submit maintenance request</button>
      </form>
    </section>
  );
}
