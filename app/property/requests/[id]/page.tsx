import "server-only";

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type RequestStatus = "open" | "triaged" | "approval_required" | "assigned" | "scheduled" | "in_progress" | "completed" | "cancelled";
const ALLOWED_STATUSES: RequestStatus[] = ["open", "triaged", "approval_required", "assigned", "scheduled", "in_progress", "completed", "cancelled"];
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string | null; title: string; summary: string; category: string | null; severity: string; status: string; source: string; access_notes: string | null; preferred_window: string | null; work_order_id: string | null; created_at: string } }; property_properties: { Row: { id: string; name: string } }; property_units: { Row: { id: string; unit_label: string } }; property_assets: { Row: { id: string; name: string } }; property_vendor_assignments: { Row: { id: string; request_id: string | null; vendor_id: string; status: string } }; property_vendors: { Row: { id: string; name: string; trade: string | null } }; } } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parseStatus = (v: FormDataEntryValue | null) => (typeof v === "string" && ALLOWED_STATUSES.includes(v.trim() as RequestStatus) ? (v.trim() as RequestStatus) : null);

export async function updatePropertyMaintenanceRequestStatus(formData: FormData) {
  "use server";
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  const nextStatus = parseStatus(formData.get("status"));
  if (!requestId) redirect("/property?error=" + encodeURIComponent("Missing request id."));
  if (!nextStatus) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Invalid status value.")}`);

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) redirect("/property?error=" + encodeURIComponent("Request not found or not visible."));
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?error=" + encodeURIComponent("Unauthorized shop scope for request."));

  const { error } = await supabase.from("property_maintenance_requests").update({ status: nextStatus }).eq("id", requestId).eq("shop_id", profile.shop_id);
  if (error) redirect(`/property/requests/${requestId}?error=${encodeURIComponent(`Unable to update status: ${error.message}`)}`);

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}`);
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const p = (await searchParams) ?? {};
  const err = Array.isArray(p.error) ? p.error[0] : p.error;

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id,property_id,unit_id,asset_id,requester_profile_id,title,summary,category,severity,status,source,access_notes,preferred_window,work_order_id,created_at").eq("id", id).maybeSingle();
  if (!requestRow || requestRow.shop_id !== profile.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Property request detail</div><h1 className="mt-2 text-2xl font-semibold">Request not found or unauthorized</h1><p className="mt-2 text-sm text-neutral-300">The requested maintenance record is not visible for your current access scope.</p><Link href="/property" className="mt-4 inline-flex text-sm underline">Back to property dashboard</Link></div></main>;

  const [{ data: property }, { data: unit }, { data: asset }, { data: assignment }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", requestRow.property_id).maybeSingle(),
    requestRow.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", requestRow.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    requestRow.asset_id ? supabase.from("property_assets").select("id,name").eq("id", requestRow.asset_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("property_vendor_assignments").select("id,request_id,vendor_id,status").eq("request_id", requestRow.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const vendor = assignment?.vendor_id ? (await supabase.from("property_vendors").select("id,name,trade").eq("id", assignment.vendor_id).maybeSingle()).data : null;

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex items-center justify-between gap-2"><div><div className="text-xs uppercase tracking-[0.16em] text-neutral-500">Internal only · Property request detail</div><h1 className="mt-1 text-2xl font-semibold">{requestRow.title}</h1></div><Link href="/property" className="text-xs underline">Back to dashboard</Link></div>{err ? <div className="mb-4 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">{err}</div> : null}<div className="grid gap-3 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 p-4 text-sm md:grid-cols-2"><Field label="Summary" value={requestRow.summary} wide /><Field label="Status" value={requestRow.status} /><Field label="Severity" value={requestRow.severity} /><Field label="Category" value={requestRow.category ?? "—"} /><Field label="Source" value={requestRow.source} /><Field label="Created" value={new Date(requestRow.created_at).toLocaleString()} /><Field label="Preferred window" value={requestRow.preferred_window ?? "—"} /><Field label="Access notes" value={requestRow.access_notes ?? "—"} /><Field label="Property" value={property?.name ?? requestRow.property_id} /><Field label="Unit" value={unit?.unit_label ?? "—"} /><Field label="Asset" value={asset?.name ?? "—"} /><Field label="Requester profile" value={requestRow.requester_profile_id ?? "—"} /><Field label="Vendor assignment" value={assignment ? `${vendor?.name ?? assignment.vendor_id} (${assignment.status})` : "—"} /><Field label="Work order" value={requestRow.work_order_id ?? "—"} /></div><form action={updatePropertyMaintenanceRequestStatus} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 p-4"><input type="hidden" name="request_id" value={requestRow.id} /><label className="text-xs uppercase tracking-[0.12em] text-neutral-400" htmlFor="status">Update status</label><select id="status" name="status" defaultValue={requestRow.status} className="rounded border bg-black/50 p-2 text-sm">{ALLOWED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Save status</button></form></div></main>;
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "md:col-span-2" : undefined}><div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</div><div className="mt-1 text-neutral-100">{value}</div></div>;
}
