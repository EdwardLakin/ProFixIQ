import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { addTenantVisibleComment } from "./actions";

type DB = { public: { Tables: {
  property_members: { Row: { id: string; user_id: string; shop_id: string } };
  property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; title: string; summary: string; status: string; severity: string; category: string | null; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
  property_assets: { Row: { id: string; name: string } };
  property_request_events: { Row: { id: string; event_type: string; actor_type: string; visibility: string; body: string; created_at: string } };
  property_request_attachments: { Row: { id: string; request_id: string; storage_path: string; mime_type: string | null; file_size: number | null; created_at: string } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function PropertyMemberRequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const qp = (await searchParams) ?? {};
  const error = Array.isArray(qp.error) ? qp.error[0] : qp.error;
  const status = Array.isArray(qp.status) ? qp.status[0] : qp.status;

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: memberships } = await supabase.from('property_members').select('id,user_id,shop_id').eq('user_id', user.id);
  if (!(memberships ?? []).length) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Request detail</h1><p className="mt-3 text-sm text-neutral-300">No property portal access is assigned to this account.</p></section>;
  }

  const shopIds = Array.from(new Set((memberships ?? []).map((m) => m.shop_id)));
  const { data: requestRow } = await supabase.from('property_maintenance_requests').select('id,shop_id,property_id,unit_id,asset_id,title,summary,status,severity,category,created_at').eq('id', id).in('shop_id', shopIds).maybeSingle();
  if (!requestRow) {
    return <section className="metal-card rounded-3xl p-5"><h1 className="text-2xl text-neutral-100">Request detail</h1><p className="mt-3 text-sm text-rose-300">Request is not visible to this account.</p></section>;
  }

  const [{ data: events }, { data: attachments }, { data: property }, { data: unit }, { data: asset }] = await Promise.all([
    supabase.from('property_request_events').select('id,event_type,actor_type,visibility,body,created_at').eq('request_id', requestRow.id).in('visibility', ['tenant_visible', 'all_parties']).order('created_at', { ascending: true }),
    supabase.from('property_request_attachments').select('id,request_id,storage_path,mime_type,file_size,created_at').eq('request_id', requestRow.id).order('created_at', { ascending: true }),
    supabase.from('property_properties').select('id,name').eq('id', requestRow.property_id).maybeSingle(),
    requestRow.unit_id ? supabase.from('property_units').select('id,unit_label').eq('id', requestRow.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    requestRow.asset_id ? supabase.from('property_assets').select('id,name').eq('id', requestRow.asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <section className="metal-card rounded-3xl p-5">
      <h1 className="text-2xl text-neutral-100">{requestRow.title}</h1>
      <p className="mt-2 text-sm text-neutral-300">{requestRow.summary}</p>
      <p className="mt-2 text-sm text-neutral-400">Status: {requestRow.status} · Severity: {requestRow.severity} · Category: {requestRow.category ?? '—'}</p>
      <p className="mt-1 text-sm text-neutral-400">Property: {property?.name ?? '—'} · Unit: {unit?.unit_label ?? '—'} · Asset: {asset?.name ?? '—'}</p>
      <p className="mt-1 text-sm text-neutral-500">Created: {new Date(requestRow.created_at).toLocaleString()}</p>

      {status ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Comment added.</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="mt-6">
        <h2 className="text-lg text-neutral-100">Timeline</h2>
        <div className="mt-2 space-y-2">
          {(events ?? []).map((event) => (
            <article key={event.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-sm text-neutral-200">{event.body}</p>
              <p className="mt-1 text-xs text-neutral-500">{event.event_type} · {event.actor_type} · {event.visibility} · {new Date(event.created_at).toLocaleString()}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg text-neutral-100">Attachments</h2>
        <div className="mt-2 space-y-2">
          {(attachments ?? []).map((attachment) => (
            <article key={attachment.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-neutral-300">
              <p>Path: {attachment.storage_path}</p>
              <p>MIME: {attachment.mime_type ?? '—'} · Size: {attachment.file_size ?? '—'} bytes</p>
            </article>
          ))}
        </div>
      </div>

      <form action={addTenantVisibleComment} className="mt-6 space-y-2">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <label className="block text-sm text-neutral-300" htmlFor="body">Add comment</label>
        <textarea id="body" name="body" required className="min-h-[100px] w-full rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <button type="submit" className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">Post comment</button>
      </form>
    </section>
  );
}
