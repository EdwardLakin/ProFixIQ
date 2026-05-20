import "server-only";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { addInternalPropertyInspectionSignature, createRequestsFromFailedInspectionFindings } from "./actions";

type Finding = { section: string; item: string; status: "ok" | "fail" | "na"; notes: string; photos?: Array<{ storage_bucket: string; storage_path: string; original_filename: string; content_type: string; size_bytes: number; uploaded_at: string }> };
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; status: string; summary: string | null; performed_by_profile_id: string; findings: unknown; completed_at: string | null; created_at: string } }; property_properties: { Row: { id: string; name: string } }; property_units: { Row: { id: string; unit_label: string } }; property_inspection_signatures: { Row: { id: string; inspection_id: string; signer_profile_id: string | null; signer_name: string; signer_email: string | null; signer_role: string; signature_type: string; signature_text: string | null; signed_at: string } } } } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parseFindings = (value: unknown): Finding[] => (Array.isArray(value) ? value.filter((f): f is Finding => !!f && typeof f === "object" && "section" in f && "item" in f && "status" in f) : []);
const keyOf = (f: Pick<Finding, "section" | "item">) => `${f.section}::${f.item}`;

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const sp = (await searchParams) ?? {}; const status = Array.isArray(sp.status) ? sp.status[0] : sp.status; const warningCount = Number(Array.isArray(sp.warning_count) ? sp.warning_count[0] : sp.warning_count ?? "0");
  const supabase = client(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/sign-in');
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(); if (!profile?.shop_id) return <main className="p-6 text-white">Missing shop context.</main>;
  const { data: row } = await supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,status,summary,performed_by_profile_id,findings,completed_at,created_at").eq("id", id).maybeSingle();
  if (!row || row.shop_id !== profile.shop_id) return <main className="p-6 text-white">Inspection not found.</main>;
  const [{ data: property }, { data: unit }] = await Promise.all([supabase.from("property_properties").select("id,name").eq("id", row.property_id).maybeSingle(), row.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", row.unit_id).maybeSingle() : Promise.resolve({ data: null })]);
  const findings = parseFindings(row.findings); const failed = findings.filter((f) => f.status === "fail");
  const { data: signatures } = await supabase.from("property_inspection_signatures").select("id,inspection_id,signer_profile_id,signer_name,signer_email,signer_role,signature_type,signature_text,signed_at").eq("inspection_id", row.id).order("signed_at", { ascending: false });
  const bySection = findings.reduce<Record<string, Finding[]>>((a,f)=>{a[f.section]=a[f.section]??[];a[f.section].push(f);return a;},{});
  const signed = new Map<string, string>();
  for (const f of findings) for (const p of f.photos ?? []) { const res = await supabase.storage.from(p.storage_bucket).createSignedUrl(p.storage_path, 600); if (res.data?.signedUrl) signed.set(`${keyOf(f)}::${p.storage_path}`, res.data.signedUrl); }
  const counts = findings.reduce((a,f)=>({ ...a, [f.status]: a[f.status]+1 }),{ok:0,fail:0,na:0});

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.14),transparent_35%),#030712] p-6 text-white"><div className="mx-auto max-w-6xl space-y-4"><div className="flex items-start justify-between"><div><h1 className="text-2xl font-semibold">Property inspection</h1><p className="text-sm text-neutral-400">Dedicated property inspection record (no quote/work-order flow).</p></div><Link href="/property/inspections" className="text-xs underline">Back</Link></div>
  {status === "upload-warning" && warningCount > 0 ? <div className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-sm">Inspection saved. {warningCount} image upload(s) failed or were invalid.</div> : null}
  {status === "signature-added" ? <div className="rounded border border-emerald-400/40 bg-emerald-500/10 p-2 text-sm">Signature saved.</div> : null}
  {status === "already-signed" ? <div className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-sm">You already signed this inspection with this role.</div> : null}
  {status === "signature-error" ? <div className="rounded border border-rose-400/40 bg-rose-500/10 p-2 text-sm">Could not save signature. Try again.</div> : null}
  {status === "validation-error" ? <div className="rounded border border-rose-400/40 bg-rose-500/10 p-2 text-sm">Please check required signature fields.</div> : null}
  <div className="grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-sm md:grid-cols-4"><div>Type: {row.inspection_type}</div><div>Status: {row.status}</div><div>Property: {property?.name ?? "Unknown"}</div><div>Unit: {unit?.unit_label ?? "—"}</div><div>Completed: {row.completed_at ? new Date(row.completed_at).toLocaleString() : "—"}</div><div>Created: {new Date(row.created_at).toLocaleString()}</div><div className="md:col-span-2">Summary: {row.summary || "—"}</div></div>
  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><div>OK: {counts.ok}</div><div>Fail: {counts.fail}</div><div>N/A: {counts.na}</div></div>
  <section className="rounded-xl border border-white/10 bg-black/25 p-4"><h2 className="text-sm font-semibold text-amber-200">Failed findings to maintenance requests</h2><p className="text-xs text-neutral-400">Creates property maintenance requests only.</p>{failed.length===0?<p className="mt-2 text-sm">No failed items.</p>:<form action={createRequestsFromFailedInspectionFindings} className="mt-3 space-y-2"><input type="hidden" name="inspection_id" value={row.id}/>{failed.map((f)=><label key={keyOf(f)} className="flex items-start gap-2 rounded border border-white/10 p-2 text-sm"><input type="checkbox" name="finding_key" value={keyOf(f)} /><span>{f.section}: {f.item}</span></label>)}<button className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-1 text-xs">Create maintenance requests</button></form>}</section>

  <section className="rounded-xl border border-white/10 bg-black/25 p-4">
    <h2 className="text-sm font-semibold text-amber-200">Signatures</h2>
    <p className="text-xs text-neutral-400">Typed and acknowledged signatures only. Drawn signatures will come later.</p>
    <form action={addInternalPropertyInspectionSignature} className="mt-3 grid gap-2 md:grid-cols-2">
      <input type="hidden" name="inspection_id" value={row.id} />
      <input name="signer_name" required placeholder="Signer name" className="rounded border border-white/15 bg-black/30 px-2 py-1 text-sm" />
      <input name="signer_email" type="email" placeholder="Signer email (optional)" className="rounded border border-white/15 bg-black/30 px-2 py-1 text-sm" />
      <select name="signer_role" defaultValue="internal" className="rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"><option value="internal">internal</option><option value="tenant">tenant</option><option value="property_manager">property_manager</option><option value="owner">owner</option><option value="witness">witness</option></select>
      <select name="signature_type" defaultValue="acknowledged" className="rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"><option value="acknowledged">acknowledged</option><option value="typed">typed</option></select>
      <input name="signature_text" placeholder="Typed signature / acknowledgement (required for typed)" className="rounded border border-white/15 bg-black/30 px-2 py-1 text-sm md:col-span-2" />
      <button className="w-fit rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-1 text-xs">Add signature / acknowledgement</button>
    </form>
    <div className="mt-3 space-y-2">{(signatures ?? []).length === 0 ? <p className="text-sm text-neutral-400">No signatures yet.</p> : signatures?.map((sig) => <div key={sig.id} className="rounded border border-white/10 bg-black/20 p-2 text-xs"><div>{sig.signer_name} {sig.signer_email ? `(${sig.signer_email})` : ""}</div><div>role: {sig.signer_role} · type: {sig.signature_type}</div>{sig.signature_text ? <div>text: {sig.signature_text}</div> : null}<div>signed: {new Date(sig.signed_at).toLocaleString()}</div>{sig.signer_profile_id ? <div className="text-neutral-500">profile: {sig.signer_profile_id}</div> : null}</div>)}</div>
  </section>

  {Object.entries(bySection).map(([section, items])=><section key={section} className="rounded-xl border border-white/10 bg-black/20 p-3"><h3 className="border-b border-white/10 pb-2 text-sm font-semibold">{section}</h3>{items.map((f)=><div key={keyOf(f)} className={`border-b border-white/5 py-3 text-sm ${f.status==="fail"?"bg-rose-500/5":""}`}><div className="flex justify-between"><span>{f.item}</span><span className="text-xs uppercase">{f.status}</span></div><div className="text-xs text-neutral-400">{f.notes || "No notes"}</div>{(f.photos??[]).length>0?<div className="mt-2 flex flex-wrap gap-2">{f.photos?.map((p)=><div key={p.storage_path} className="rounded border border-white/10 p-1 text-xs"><div>{p.original_filename}</div>{signed.get(`${keyOf(f)}::${p.storage_path}`)?<Image src={signed.get(`${keyOf(f)}::${p.storage_path}`) ?? ""} alt={p.original_filename} width={80} height={80} unoptimized className="mt-1 h-20 w-20 object-cover"/>:null}<div className="text-neutral-500">{p.content_type} · {Math.round((p.size_bytes||0)/1024)}KB</div></div>)}</div>:null}</div>)}</section>)}
  </div></main>;
}
