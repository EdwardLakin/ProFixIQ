import "server-only";

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { getPropertyInspectionTemplate, propertyInspectionTypes, type PropertyInspectionType } from "@/features/property/lib/propertyInspectionTemplates";

type AllowedStatus = "ok" | "fail" | "na";
type FindingDraft = { section: string; item: string; status: AllowedStatus; notes: string; photos: Array<{ storage_bucket: string; storage_path: string; original_filename: string; content_type: string; size_bytes: number; uploaded_at: string }> };
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_properties: { Row: { id: string; name: string; shop_id: string } }; property_units: { Row: { id: string; property_id: string; unit_label: string } }; property_inspections: { Row: { id: string }; Insert: { shop_id: string; property_id: string; unit_id: string | null; performed_by_profile_id: string; inspection_type: string; status: string; summary: string | null; findings: unknown; completed_at: string } } } } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parse = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const BUCKET = "property_request_attachments";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX = 10 * 1024 * 1024;
const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

async function createPropertyInspection(formData: FormData) { "use server";
  const supabase = client(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(); if (!profile?.shop_id) redirect("/property/inspections/new?error=Missing%20shop%20context");
  const inspectionType = parse(formData.get("inspection_type")) as PropertyInspectionType | null; if (!inspectionType || !propertyInspectionTypes.includes(inspectionType)) redirect("/property/inspections/new?error=Invalid%20inspection%20type");
  const template = getPropertyInspectionTemplate(inspectionType); const propertyId = parse(formData.get("property_id")); const unitId = parse(formData.get("unit_id")); const summary = parse(formData.get("summary"));
  if (!propertyId) redirect(`/property/inspections/new?type=${inspectionType}&error=Property%20is%20required`);
  const [{ data: property }, { data: unit }] = await Promise.all([supabase.from("property_properties").select("id,shop_id").eq("id", propertyId).maybeSingle(), unitId ? supabase.from("property_units").select("id,property_id").eq("id", unitId).maybeSingle() : Promise.resolve({ data: null })]);
  if (!property || property.shop_id !== profile.shop_id) redirect(`/property/inspections/new?type=${inspectionType}&error=Selected%20property%20is%20not%20visible`);
  if (unitId && (!unit || unit.property_id !== propertyId)) redirect(`/property/inspections/new?type=${inspectionType}&error=Selected%20unit%20is%20invalid`);

  const findings: FindingDraft[] = template.sections.flatMap((section, si) => section.items.map((item, ii) => ({ section: section.title, item, status: ((parse(formData.get(`status_${si}_${ii}`)) === "fail" || parse(formData.get(`status_${si}_${ii}`)) === "na") ? parse(formData.get(`status_${si}_${ii}`)) : "ok") as AllowedStatus, notes: parse(formData.get(`notes_${si}_${ii}`)) ?? "", photos: [] })));
  const { data: inserted, error } = await supabase.from("property_inspections").insert({ shop_id: profile.shop_id, property_id: propertyId, unit_id: unitId ?? null, performed_by_profile_id: user.id, inspection_type: inspectionType, status: "completed", summary, findings, completed_at: new Date().toISOString() }).select("id").maybeSingle();
  if (error || !inserted) redirect(`/property/inspections/new?type=${inspectionType}&error=${encodeURIComponent(error?.message ?? "Unable to create inspection")}`);

  let uploadWarnings = 0;
  for (let si = 0; si < template.sections.length; si += 1) for (let ii = 0; ii < template.sections[si].items.length; ii += 1) {
    const entry = formData.get(`photo_${si}_${ii}`); if (!(entry instanceof File) || entry.size === 0) continue;
    if (!ALLOWED.has(entry.type) || entry.size > MAX) { uploadWarnings += 1; continue; }
    const key = safe(`${template.sections[si].title}-${template.sections[si].items[ii]}`.toLowerCase());
    const path = `${profile.shop_id}/property-inspections/${inserted.id}/${key}/${Date.now()}-${safe(entry.name || "image")}`;
    const { error: uErr } = await supabase.storage.from(BUCKET).upload(path, entry, { contentType: entry.type, upsert: false });
    if (uErr) { uploadWarnings += 1; continue; }
    const finding = findings.find((f) => f.section === template.sections[si].title && f.item === template.sections[si].items[ii]);
    if (finding) finding.photos.push({ storage_bucket: BUCKET, storage_path: path, original_filename: entry.name, content_type: entry.type, size_bytes: entry.size, uploaded_at: new Date().toISOString() });
  }
  await supabase.from("property_inspections").update({ findings }).eq("id", inserted.id);
  revalidatePath("/property"); revalidatePath("/property/inspections");
  redirect(`/property/inspections/${inserted.id}${uploadWarnings ? `?status=upload-warning&warning_count=${uploadWarnings}` : ""}`);
}

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
 const params = (await searchParams) ?? {}; const type = (propertyInspectionTypes.includes((Array.isArray(params.type) ? params.type[0] : params.type) as PropertyInspectionType) ? (Array.isArray(params.type) ? params.type[0] : params.type) : "move_in") as PropertyInspectionType; const error = Array.isArray(params.error) ? params.error[0] : params.error;
 const template = getPropertyInspectionTemplate(type); const supabase = client(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/sign-in');
 const [{ data: profile }, { data: properties }, { data: units }] = await Promise.all([supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(), supabase.from("property_properties").select("id,name").order("name"), supabase.from("property_units").select("id,property_id,unit_label").order("unit_label")]);
 if (!profile?.shop_id) return <main className="p-6 text-white">Missing shop context.</main>;
 return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.14),transparent_35%),#030712] p-6 text-white"><div className="mx-auto max-w-6xl"><div className="sticky top-2 z-10 mb-4 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">New property inspection</h1><p className="text-sm text-neutral-400">Dedicated property inspection — no quote flow</p></div><Link href="/property/inspections" className="text-xs underline">Back</Link></div></div>{error ? <div className="mb-3 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">{error}</div> : null}
 <div className="mb-4 flex gap-2">{propertyInspectionTypes.map((t) => <Link key={t} href={`/property/inspections/new?type=${t}`} className={`rounded-full border px-3 py-1 text-xs ${t===type ? "border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20" : "border-white/15"}`}>{t.replaceAll("_","-")}</Link>)}</div>
 <form action={createPropertyInspection} className="space-y-5"><input type="hidden" name="inspection_type" value={type} /><div className="grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 md:grid-cols-3"><select required name="property_id" className="rounded border border-white/20 bg-black/40 p-2"><option value="">Select property</option>{(properties??[]).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="unit_id" className="rounded border border-white/20 bg-black/40 p-2"><option value="">No unit</option>{(units??[]).map((u)=><option key={u.id} value={u.id}>{u.unit_label}</option>)}</select><textarea name="summary" rows={2} className="rounded border border-white/20 bg-black/40 p-2" placeholder="Summary"/></div>
 <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><h2 className="mb-1 text-sm uppercase tracking-[0.2em] text-neutral-400">{template.label}</h2>{template.sections.map((section,si)=><section key={section.title} className="mt-4"><h3 className="border-b border-white/10 pb-2 text-sm font-semibold text-amber-200">{section.title}</h3>{section.items.map((item,ii)=><div key={item} className="grid gap-2 border-b border-white/5 py-3 md:grid-cols-12 md:items-center"><div className="md:col-span-4 text-sm">{item}</div><div className="md:col-span-3 flex gap-3 text-xs">{(["ok","fail","na"] as AllowedStatus[]).map((s)=><label key={s} className="flex items-center gap-1"><input type="radio" name={`status_${si}_${ii}`} value={s} defaultChecked={s==="ok"}/>{s.toUpperCase()}</label>)}</div><textarea name={`notes_${si}_${ii}`} rows={2} className="md:col-span-3 rounded border border-white/15 bg-black/30 p-2 text-xs" placeholder="Notes"/><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" name={`photo_${si}_${ii}`} className="md:col-span-2 text-xs"/></div>)}</section>)}</div>
 <button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-5 py-2 text-xs font-semibold uppercase">Create and complete inspection</button></form></div></main>;
}
