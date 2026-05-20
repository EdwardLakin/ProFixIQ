import "server-only";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { addTenantVisibleComment, uploadMemberPropertyRequestAttachment } from "./actions";

type DB = { public: { Tables: {
  property_members: { Row: { id: string; user_id: string; shop_id: string } };
  property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; title: string; summary: string; status: string; severity: string; category: string | null; created_at: string } };
  property_properties: { Row: { id: string; name: string } };
  property_units: { Row: { id: string; unit_label: string } };
  property_assets: { Row: { id: string; name: string } };
  property_request_events: { Row: { id: string; event_type: string; actor_type: string; visibility: string; body: string; created_at: string } };
  property_request_attachments: { Row: { id: string; request_id: string; uploaded_by_profile_id: string | null; file_kind: string; visibility: string | null; storage_bucket: string | null; storage_path: string | null; original_filename: string | null; content_type: string | null; size_bytes: number | null; caption: string | null; created_at: string } };
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
    supabase.from('property_request_attachments').select('id,request_id,uploaded_by_profile_id,file_kind,visibility,storage_bucket,storage_path,original_filename,content_type,size_bytes,caption,created_at').eq('request_id', requestRow.id).order('created_at', { ascending: true }),
    supabase.from('property_properties').select('id,name').eq('id', requestRow.property_id).maybeSingle(),
    requestRow.unit_id ? supabase.from('property_units').select('id,unit_label').eq('id', requestRow.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    requestRow.asset_id ? supabase.from('property_assets').select('id,name').eq('id', requestRow.asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const signedAttachmentUrls = await Promise.all((attachments ?? []).map(async (attachment) => {
    if (!attachment.storage_bucket || !attachment.storage_path || attachment.file_kind !== "image") return [attachment.id, null] as const;
    const { data } = await supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, 60 * 15);
    return [attachment.id, data?.signedUrl ?? null] as const;
  }));
  const signedUrlByAttachmentId = new Map(signedAttachmentUrls);

  return (
    <section className="metal-card rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Property Portal</p><h1 className="text-2xl text-neutral-100">{requestRow.title}</h1></div><div className="flex flex-wrap gap-2"><Link href="/portal/property/member/requests" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Requests</Link><Link href="/portal/property/member/inspections" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200">Inspections</Link></div></div>
      <p className="mt-2 text-sm text-neutral-300">{requestRow.summary}</p>
      <p className="mt-2 text-sm text-neutral-400">Status: {requestRow.status} · Severity: {requestRow.severity} · Category: {requestRow.category ?? '—'}</p>
      <p className="mt-1 text-sm text-neutral-400">Property: {property?.name ?? '—'} · Unit: {unit?.unit_label ?? '—'} · Asset: {asset?.name ?? '—'}</p>
      <p className="mt-1 text-sm text-neutral-500">Created: {new Date(requestRow.created_at).toLocaleString()}</p>

      {status === "comment-added" ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Comment added.</div> : null}
      {status === "attachment-uploaded" ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Image uploaded.</div> : null}
      {status === "attachment-upload-error" ? <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Upload failed. Review the error below and try again.</div> : null}
      {status === "invalid-attachment" ? <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">Invalid attachment. Use a supported image type up to 10 MB.</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="mt-6">
        <h2 className="text-lg text-neutral-100">Messages & updates</h2><p className="mt-1 text-xs text-neutral-400">Updates shared for this request are listed in time order.</p>
        <div className="mt-2 space-y-2">
          {(events ?? []).map((event) => (
            <article key={event.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-sm text-neutral-200">{event.body}</p>
              <p className="mt-1 text-xs text-neutral-500">{new Date(event.created_at).toLocaleString()}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg text-neutral-100">Photos</h2><p className="mt-1 text-xs text-neutral-400">Photos linked to this maintenance request.</p>
        <div className="mt-2 space-y-2">
          {(attachments ?? []).map((attachment) => (
            <article key={attachment.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-neutral-300">
              <p>Filename: {attachment.original_filename ?? "—"}</p>
              <p>Caption: {attachment.caption ?? "—"}</p>
              <p>Size: {attachment.size_bytes ?? "—"} bytes</p>
              <p>Created: {new Date(attachment.created_at).toLocaleString()}</p>
              {signedUrlByAttachmentId.get(attachment.id) ? <Image src={signedUrlByAttachmentId.get(attachment.id) ?? ""} alt={attachment.original_filename ?? "Attachment"} width={640} height={360} unoptimized className="mt-2 h-auto max-h-64 w-full rounded-lg border border-white/10 object-cover" /> : null}
            </article>
          ))}
        </div>
      </div>

      <form action={uploadMemberPropertyRequestAttachment} className="mt-6 space-y-2">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <label className="block text-sm text-neutral-300" htmlFor="file">Upload image</label>
        <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required className="w-full rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <label className="block text-sm text-neutral-300" htmlFor="caption">Caption (optional)</label>
        <input id="caption" name="caption" className="w-full rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <p className="text-xs text-neutral-400">Images are private and visible only to authorized property users.</p>
        <button type="submit" className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">Upload image</button>
      </form>

      <form action={addTenantVisibleComment} className="mt-6 space-y-2">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <label className="block text-sm text-neutral-300" htmlFor="body">Add message</label>
        <textarea id="body" name="body" required className="min-h-[100px] w-full rounded-lg border border-neutral-700 bg-black/30 p-2 text-sm text-neutral-100" />
        <button type="submit" className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">Post message</button>
      </form>
    </section>
  );
}
