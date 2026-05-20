import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  property_members: { Row: { id: string; shop_id: string; user_id: string; property_id: string | null; unit_id: string | null } };
  property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; title: string; status: string; severity: string; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
  property_assets: { Row: { id: string; name: string } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function PropertyMemberRequestsPage() {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: memberships } = await supabase.from('property_members').select('id,shop_id,user_id,property_id,unit_id').eq('user_id', user.id);
  if (!(memberships ?? []).length) {
    return <section className="metal-card rounded-3xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Member Portal</p><h1 className="text-2xl text-neutral-100">Maintenance Requests</h1></div><div className="flex flex-wrap gap-2"><Link href="/portal/property/member" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Portal home</Link><Link href="/portal/property/member/inspections" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Inspections</Link></div></div><p className="mt-3 text-sm text-neutral-300">No property portal access is assigned to this account.</p></section>;
  }

  const shopIds = Array.from(new Set((memberships ?? []).map((m) => m.shop_id)));

  const { data: requests } = await supabase
    .from('property_maintenance_requests')
    .select('id,shop_id,property_id,unit_id,asset_id,title,status,severity,created_at')
    .in('shop_id', shopIds)
    .order('created_at', { ascending: false })
    .limit(100);

  const propertyIds = Array.from(new Set((requests ?? []).map((row) => row.property_id)));
  const unitIds = Array.from(new Set((requests ?? []).map((row) => row.unit_id).filter(Boolean))) as string[];
  const assetIds = Array.from(new Set((requests ?? []).map((row) => row.asset_id).filter(Boolean))) as string[];

  const [propertiesResult, unitsResult, assetsResult] = await Promise.all([
    propertyIds.length ? supabase.from('property_properties').select('id,name').in('id', propertyIds) : Promise.resolve({ data: [] as DB['public']['Tables']['property_properties']['Row'][] }),
    unitIds.length ? supabase.from('property_units').select('id,unit_label').in('id', unitIds) : Promise.resolve({ data: [] as DB['public']['Tables']['property_units']['Row'][] }),
    assetIds.length ? supabase.from('property_assets').select('id,name').in('id', assetIds) : Promise.resolve({ data: [] as DB['public']['Tables']['property_assets']['Row'][] }),
  ]);

  const propertyById = new Map((propertiesResult.data ?? []).map((row) => [row.id, row.name]));
  const unitById = new Map((unitsResult.data ?? []).map((row) => [row.id, row.unit_label]));
  const assetById = new Map((assetsResult.data ?? []).map((row) => [row.id, row.name]));

  return (
    <section className="metal-card rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Member Portal</p><h1 className="text-2xl text-neutral-100">Maintenance Requests</h1></div><div className="flex flex-wrap gap-2"><Link href="/portal/property/member" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Portal home</Link><Link href="/portal/property/member/inspections" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Inspections</Link></div></div>
      
      <div className="mt-4">
        <Link href="/portal/property/member/requests/new" className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          New maintenance request
        </Link>
      </div>
      <div className="mt-5 space-y-3">
        {(requests ?? []).map((request) => (
          <article key={request.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base text-neutral-100">{request.title}</h2>
              <span className="text-xs text-neutral-400">{new Date(request.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-300">Status: {request.status} · Severity: {request.severity}</p>
            <p className="mt-1 text-sm text-neutral-400">Property: {propertyById.get(request.property_id) ?? '—'} · Unit: {request.unit_id ? (unitById.get(request.unit_id) ?? '—') : '—'} · Asset: {request.asset_id ? (assetById.get(request.asset_id) ?? '—') : '—'}</p>
            <Link href={`/portal/property/member/requests/${request.id}`} className="mt-2 inline-flex text-sm text-cyan-300 underline">View details</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
