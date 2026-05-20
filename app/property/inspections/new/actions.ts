"use server";

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

export async function createPropertyInspection(formData: FormData) {
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
