import "server-only";

import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addPropertyRequestAttachmentPlaceholder, addPropertyRequestTimelineEvent, assignPropertyVendorToRequest, convertPropertyRequestToWorkOrder, updatePropertyMaintenanceRequestStatus, uploadPropertyRequestAttachment } from "./actions";

type RequestStatus = "open" | "triaged" | "approval_required" | "assigned" | "scheduled" | "in_progress" | "completed" | "cancelled";
const ALLOWED_STATUSES: RequestStatus[] = ["open", "triaged", "approval_required", "assigned", "scheduled", "in_progress", "completed", "cancelled"];

type DB = {
  public: {
    Tables: {
      profiles: { Row: { id: string; shop_id: string | null } };
      property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string | null; title: string; summary: string; category: string | null; severity: string; status: string; source: string; access_notes: string | null; preferred_window: string | null; work_order_id: string | null; created_at: string } };
      property_properties: { Row: { id: string; name: string } };
      property_units: { Row: { id: string; unit_label: string } };
      property_assets: { Row: { id: string; name: string } };
      property_vendor_assignments: { Row: { id: string; request_id: string | null; vendor_id: string; status: string; scheduled_for: string | null; notes: string | null; created_at: string } };
      property_vendors: { Row: { id: string; shop_id: string; name: string; trade: string | null } };
      property_request_events: { Row: { id: string; request_id: string; event_type: string; actor_type: string; visibility: string; body: string; metadata: Record<string, unknown> | null; created_at: string } };
      property_request_attachments: { Row: { id: string; request_id: string; file_kind: string; original_filename: string | null; content_type: string | null; size_bytes: number | null; caption: string | null; storage_bucket: string | null; storage_path: string | null; created_at: string } };
      work_orders: { Row: { id: string }; Insert: { shop_id: string; status?: string; approval_state?: string | null; customer_id?: string | null; vehicle_id?: string | null; notes?: string | null } };
    };
  };
};

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const p = (await searchParams) ?? {};
  const err = Array.isArray(p.error) ? p.error[0] : p.error;
  const status = Array.isArray(p.status) ? p.status[0] : p.status;

  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) return <main className="min-h-screen bg-[var(--theme-gradient-panel)] p-6 text-[color:var(--theme-text-primary)]"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">Profile is missing shop context.</div></main>;

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id,property_id,unit_id,asset_id,requester_profile_id,title,summary,category,severity,status,source,access_notes,preferred_window,work_order_id,created_at").eq("id", id).maybeSingle();
  if (!requestRow || requestRow.shop_id !== profile.shop_id) return <main className="min-h-screen bg-[var(--theme-gradient-panel)] p-6 text-[color:var(--theme-text-primary)]"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-6"><div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Property request detail</div><h1 className="mt-2 text-2xl font-semibold">Request not found or unauthorized</h1><p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">The requested maintenance record is not visible for your current access scope.</p><Link href="/property" className="mt-4 inline-flex text-sm underline">Back to property dashboard</Link></div></main>;

  const [{ data: property }, { data: unit }, { data: asset }, { data: assignment }, { data: vendors }, { data: timeline }, { data: attachments }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", requestRow.property_id).maybeSingle(),
    requestRow.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", requestRow.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    requestRow.asset_id ? supabase.from("property_assets").select("id,name").eq("id", requestRow.asset_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("property_vendor_assignments").select("id,request_id,vendor_id,status,scheduled_for,notes,created_at").eq("request_id", requestRow.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("property_vendors").select("id,shop_id,name,trade").eq("shop_id", profile.shop_id).order("name", { ascending: true }),
    supabase.from("property_request_events").select("id,request_id,event_type,actor_type,visibility,body,metadata,created_at").eq("request_id", requestRow.id).order("created_at", { ascending: true }),
    supabase.from("property_request_attachments").select("id,request_id,file_kind,original_filename,content_type,size_bytes,caption,storage_bucket,storage_path,created_at").eq("request_id", requestRow.id).order("created_at", { ascending: false }),
  ]);
  const vendor = assignment?.vendor_id ? (await supabase.from("property_vendors").select("id,name,trade").eq("id", assignment.vendor_id).maybeSingle()).data : null;
  const signedAttachmentPreviews = new Map<string, string>();
  if (attachments?.length) {
    await Promise.all(attachments.map(async (attachment) => {
      const isPrivateImageInExpectedBucket =
        attachment.storage_bucket === "property_request_attachments" &&
        !!attachment.storage_path &&
        (attachment.content_type?.startsWith("image/") ?? false);
      if (!isPrivateImageInExpectedBucket) return;
      const { data, error } = await supabase.storage.from("property_request_attachments").createSignedUrl(attachment.storage_path, 600);
      if (error || !data?.signedUrl) return;
      signedAttachmentPreviews.set(attachment.id, data.signedUrl);
    }));
  }

  return <main className="min-h-screen bg-[var(--theme-gradient-panel)] p-6 text-[color:var(--theme-text-primary)]"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-6"><div className="mb-4 flex items-center justify-between gap-2"><div><div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Internal only · Property request detail</div><h1 className="mt-1 text-2xl font-semibold">{requestRow.title}</h1></div><Link href="/property" className="text-xs underline">Back to dashboard</Link></div>{err ? <div className="mb-4 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">{err}</div> : null}{status === "vendor-already-assigned" ? <div className="mb-4 rounded border border-amber-300/40 bg-amber-500/10 p-2 text-sm text-amber-100">This vendor is already actively assigned to this request.</div> : null}{status === "converted" ? <div className="mb-4 rounded border border-emerald-300/40 bg-emerald-500/10 p-2 text-sm text-emerald-100">Request was converted to a work order.</div> : null}{status === "already-converted" ? <div className="mb-4 rounded border border-amber-300/40 bg-amber-500/10 p-2 text-sm text-amber-100">This request is already linked to a work order.</div> : null}{status === "conversion-error" ? <div className="mb-4 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">Unable to convert this request to a work order.</div> : null}{status === "validation-error" ? <div className="mb-4 rounded border border-amber-300/40 bg-amber-500/10 p-2 text-sm text-amber-100">Validation failed. Review request context and try again.</div> : null}{status === "timeline-event-added" ? <div className="mb-4 rounded border border-emerald-300/40 bg-emerald-500/10 p-2 text-sm text-emerald-100">Timeline event added.</div> : null}{status === "attachment-placeholder-added" ? <div className="mb-4 rounded border border-emerald-300/40 bg-emerald-500/10 p-2 text-sm text-emerald-100">Attachment placeholder metadata added.</div> : null}{status === "attachment-uploaded" ? <div className="mb-4 rounded border border-emerald-300/40 bg-emerald-500/10 p-2 text-sm text-emerald-100">Image attachment uploaded.</div> : null}{status === "attachment-upload-error" ? <div className="mb-4 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">Attachment upload failed. Review the error and try again.</div> : null}{status === "invalid-attachment" ? <div className="mb-4 rounded border border-amber-300/40 bg-amber-500/10 p-2 text-sm text-amber-100">Attachment is invalid. JPEG, PNG, WEBP, HEIC, or HEIF only up to 10 MB.</div> : null}<div className="grid gap-3 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm md:grid-cols-2"><Field label="Summary" value={requestRow.summary} wide /><Field label="Status" value={requestRow.status} /><Field label="Severity" value={requestRow.severity} /><Field label="Category" value={requestRow.category ?? "—"} /><Field label="Source" value={requestRow.source} /><Field label="Created" value={new Date(requestRow.created_at).toLocaleString()} /><Field label="Preferred window" value={requestRow.preferred_window ?? "—"} /><Field label="Access notes" value={requestRow.access_notes ?? "—"} /><Field label="Property" value={property?.name ?? requestRow.property_id} /><Field label="Unit" value={unit?.unit_label ?? "—"} /><Field label="Asset" value={asset?.name ?? "—"} /><Field label="Requester profile" value={requestRow.requester_profile_id ?? "—"} /><Field label="Vendor assignment" value={assignment ? `${vendor?.name ?? assignment.vendor_id} (${assignment.status})` : "—"} /><Field label="Work order" value={requestRow.work_order_id ? <Link href={`/work-orders/${requestRow.work_order_id}`} className="underline">{requestRow.work_order_id}</Link> : "—"} /></div><form action={updatePropertyMaintenanceRequestStatus} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"><input type="hidden" name="request_id" value={requestRow.id} /><label className="text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="status">Update status</label><select id="status" name="status" defaultValue={requestRow.status} className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm">{ALLOWED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Save status</button></form><section className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]">Work order conversion</h2>{requestRow.work_order_id ? <p className="mt-2 text-sm text-[color:var(--theme-text-primary)]">Linked work order: <Link href={`/work-orders/${requestRow.work_order_id}`} className="underline">{requestRow.work_order_id}</Link></p> : <form action={convertPropertyRequestToWorkOrder} className="mt-3 space-y-3"><input type="hidden" name="request_id" value={requestRow.id} /><p className="text-xs text-[color:var(--theme-text-secondary)]">Creates a shop work order from this property maintenance request.</p><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Convert to work order</button></form>}</section><section className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]">Vendor assignment</h2><p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">Vendor contacts are records only. Vendor portal access is not wired yet.</p>{assignment ? <div className="mt-3 grid gap-2 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm md:grid-cols-2"><Field label="Vendor" value={vendor?.name ?? assignment.vendor_id} /><Field label="Trade" value={vendor?.trade ?? "—"} /><Field label="Status" value={assignment.status} /><Field label="Scheduled for" value={assignment.scheduled_for ? new Date(assignment.scheduled_for).toLocaleString() : "—"} /><Field label="Notes" value={assignment.notes ?? "—"} wide /></div> : <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">No vendor assignment yet.</p>}{(vendors?.length ?? 0) === 0 ? <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">Create a vendor in Property Setup first. <Link href="/property/setup" className="underline">Go to Property Setup</Link>.</p> : <form action={assignPropertyVendorToRequest} className="mt-3 grid gap-3"><input type="hidden" name="request_id" value={requestRow.id} /><label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="vendor_id">Vendor<select id="vendor_id" name="vendor_id" required className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm"><option value="">Select vendor</option>{vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}{v.trade ? ` (${v.trade})` : ""}</option>)}</select></label><label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="scheduled_for">Scheduled for (optional)<input id="scheduled_for" name="scheduled_for" type="datetime-local" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label><label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="notes">Notes (optional)<textarea id="notes" name="notes" rows={3} className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label><div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Assign vendor</button></div></form>}</section>
    <section className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]">Attachments (internal only)</h2>
      <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">Uploads go to the private <code>property_request_attachments</code> bucket. No public URL exposure is used.</p>
      <form action={uploadPropertyRequestAttachment} className="mt-3 grid gap-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="file">Image file
          <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" />
        </label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="image_caption">Caption (optional)<input id="image_caption" name="caption" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label>
        <div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Upload image</button></div>
      </form>
      <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">Legacy metadata-only placeholder flow remains available below for internal staging compatibility.</p>
      <form action={addPropertyRequestAttachmentPlaceholder} className="mt-3 grid gap-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="file_kind">File kind
          <select id="file_kind" name="file_kind" defaultValue="image" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm">
            <option value="image">image</option><option value="video">video</option><option value="document">document</option><option value="other">other</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="original_filename">Original filename (optional)<input id="original_filename" name="original_filename" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="content_type">Content type (optional)<input id="content_type" name="content_type" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="caption">Caption (optional)<input id="caption" name="caption" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="attachment_notes">Notes (optional)<textarea id="attachment_notes" name="notes" rows={2} className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" /></label>
        <div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Add attachment placeholder</button></div>
      </form>
      <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">Private signed preview. Link expires automatically.</p>
      {(attachments?.length ?? 0) === 0 ? <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">No attachments yet.</p> : <div className="mt-3 space-y-2">{attachments?.map((attachment) => {
        const previewUrl = signedAttachmentPreviews.get(attachment.id);
        return <div key={attachment.id} className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm">
          {previewUrl ? <img src={previewUrl} alt={attachment.original_filename ?? "Property request attachment preview"} className="mb-3 h-28 w-28 rounded-lg border border-[color:var(--metal-border-soft)] object-cover" /> : null}
          <div className="text-xs text-[color:var(--theme-text-secondary)]">{new Date(attachment.created_at).toLocaleString()} · {attachment.file_kind}</div>
          <div className="mt-1 text-[color:var(--theme-text-primary)]">{attachment.original_filename ?? "Unnamed placeholder"}</div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Content type: {attachment.content_type ?? "—"}</div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Size: {attachment.size_bytes != null ? `${(attachment.size_bytes / (1024 * 1024)).toFixed(2)} MB` : "—"}</div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Caption: {attachment.caption ?? "—"}</div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Storage path: {attachment.storage_path ?? "(placeholder only)"}</div>
        </div>;
      })}</div>}
    </section>
    <section className="mt-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]">Request Timeline</h2>
      <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">Timeline is internal-preview only. Tenant/vendor portals are not wired yet.</p>
      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Read receipts schema is ready; party-specific read receipts will be wired later.</p>

      <form action={addPropertyRequestTimelineEvent} className="mt-3 grid gap-3 rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <input type="hidden" name="request_id" value={requestRow.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="event_type">Event type
            <select id="event_type" name="event_type" defaultValue="comment" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm">
              <option value="comment">comment</option>
              <option value="internal_note">internal_note</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="visibility">Visibility
            <select id="visibility" name="visibility" defaultValue="internal" className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm">
              <option value="internal">internal</option>
              <option value="tenant_visible">tenant_visible</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]" htmlFor="body">Body
          <textarea id="body" name="body" rows={3} required className="rounded border bg-[color:var(--theme-surface-inset)] p-2 text-sm" />
        </label>
        <div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Add timeline note</button></div>
      </form>

      {(timeline?.length ?? 0) === 0 ? <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">No timeline events yet.</p> : <div className="mt-3 space-y-2">{timeline?.map((event) => <div key={event.id} className="rounded-xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm"><div className="text-xs text-[color:var(--theme-text-secondary)]">{new Date(event.created_at).toLocaleString()} · {event.event_type} · actor: {event.actor_type} · visibility: {event.visibility}</div><div className="mt-1 text-[color:var(--theme-text-primary)]">{event.body}</div>{event.metadata && Object.keys(event.metadata).length > 0 ? <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">metadata: {JSON.stringify(event.metadata)}</div> : null}</div>)}</div>}
    </section>
  </div></main>;
}

function Field({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return <div className={wide ? "md:col-span-2" : undefined}><div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">{label}</div><div className="mt-1 text-[color:var(--theme-text-primary)]">{value}</div></div>;
}
