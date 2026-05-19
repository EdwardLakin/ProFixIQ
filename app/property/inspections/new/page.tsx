import "server-only";

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { getPropertyInspectionTemplate, propertyInspectionTypes, type PropertyInspectionType } from "@/features/property/lib/propertyInspectionTemplates";

type AllowedStatus = "ok" | "fail" | "na";
type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null } };
  property_properties: { Row: { id: string; name: string; shop_id: string } };
  property_units: { Row: { id: string; property_id: string; unit_label: string } };
  property_inspections: { Row: { id: string }; Insert: { shop_id: string; property_id: string; unit_id: string | null; performed_by_profile_id: string; inspection_type: string; status: string; summary: string | null; findings: unknown; completed_at: string } };
} } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parse = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function createPropertyInspection(formData: FormData) {
  "use server";
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property/inspections/new?error=" + encodeURIComponent("Missing shop context."));

  const inspectionType = parse(formData.get("inspection_type")) as PropertyInspectionType | null;
  if (!inspectionType || !propertyInspectionTypes.includes(inspectionType)) redirect("/property/inspections/new?error=" + encodeURIComponent("Invalid inspection type."));
  const template = getPropertyInspectionTemplate(inspectionType);

  const propertyId = parse(formData.get("property_id"));
  const unitId = parse(formData.get("unit_id"));
  const summary = parse(formData.get("summary"));
  if (!propertyId) redirect(`/property/inspections/new?type=${inspectionType}&error=${encodeURIComponent("Property is required.")}`);

  const [{ data: property }, { data: unit }] = await Promise.all([
    supabase.from("property_properties").select("id,shop_id").eq("id", propertyId).maybeSingle(),
    unitId ? supabase.from("property_units").select("id,property_id").eq("id", unitId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!property || property.shop_id !== profile.shop_id) redirect(`/property/inspections/new?type=${inspectionType}&error=${encodeURIComponent("Selected property is not visible.")}`);
  if (unitId && (!unit || unit.property_id !== propertyId)) redirect(`/property/inspections/new?type=${inspectionType}&error=${encodeURIComponent("Selected unit is invalid for this property.")}`);

  const findings = template.sections.flatMap((section, sectionIndex) => section.items.map((item, itemIndex) => {
    const status = parse(formData.get(`status_${sectionIndex}_${itemIndex}`));
    const notes = parse(formData.get(`notes_${sectionIndex}_${itemIndex}`));
    const photoNotes = parse(formData.get(`photo_notes_${sectionIndex}_${itemIndex}`));
    const normalized: AllowedStatus = status === "fail" || status === "na" ? status : "ok";
    return { section: section.title, item, status: normalized, notes: notes ?? "", ...(photoNotes ? { photo_notes: photoNotes } : {}) };
  }));

  const { data: inserted, error } = await supabase.from("property_inspections").insert({
    shop_id: profile.shop_id,
    property_id: propertyId,
    unit_id: unitId ?? null,
    performed_by_profile_id: user.id,
    inspection_type: inspectionType,
    status: "completed",
    summary,
    findings,
    completed_at: new Date().toISOString(),
  }).select("id").maybeSingle();

  if (error || !inserted) redirect(`/property/inspections/new?type=${inspectionType}&error=${encodeURIComponent(error?.message ?? "Unable to create inspection.")}`);
  revalidatePath("/property");
  revalidatePath("/property/inspections");
  redirect(`/property/inspections/${inserted.id}`);
}

export default async function NewPropertyInspectionPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const requestedType = Array.isArray(params.type) ? params.type[0] : params.type;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const type: PropertyInspectionType = propertyInspectionTypes.includes(requestedType as PropertyInspectionType) ? (requestedType as PropertyInspectionType) : "move_in";
  const template = getPropertyInspectionTemplate(type);

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: profile }, { data: properties }, { data: units }] = await Promise.all([
    supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(),
    supabase.from("property_properties").select("id,name").order("name"),
    supabase.from("property_units").select("id,property_id,unit_label").order("unit_label"),
  ]);

  if (!profile?.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;
  if (!(properties ?? []).length) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><h1 className="text-2xl font-semibold">New property inspection</h1><p className="mt-2 text-sm text-neutral-300">No properties are visible yet.</p><Link href="/property/setup" className="mt-4 inline-flex rounded-full border px-3 py-1 text-xs">Go to property setup</Link></div></main>;

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-5xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">New property inspection</h1><p className="text-sm text-neutral-400">Photo upload is not implemented yet. Use photo notes as a placeholder.</p></div><Link href="/property/inspections" className="text-xs underline">Back to inspections</Link></div>{error ? <div className="mb-3 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">{error}</div> : null}<div className="mb-4 flex flex-wrap gap-2">{propertyInspectionTypes.map((t) => <Link key={t} href={`/property/inspections/new?type=${t}`} className={`rounded-full border px-3 py-1 text-xs ${t===type ? "border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20" : ""}`}>{t}</Link>)}</div><form action={createPropertyInspection} className="space-y-4"><input type="hidden" name="inspection_type" value={type} /><div className="grid gap-3 md:grid-cols-2"><select name="property_id" required className="rounded border bg-black/50 p-2"><option value="">Select property</option>{(properties ?? []).map((property)=><option key={property.id} value={property.id}>{property.name}</option>)}</select><select name="unit_id" className="rounded border bg-black/50 p-2"><option value="">No unit</option>{(units ?? []).map((unit)=><option key={unit.id} value={unit.id}>{unit.unit_label} · {(properties ?? []).find((p)=>p.id===unit.property_id)?.name ?? "Unknown property"}</option>)}</select><textarea name="summary" rows={3} className="rounded border bg-black/50 p-2 md:col-span-2" placeholder="Optional inspection summary" /></div><div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-4"><h2 className="text-lg font-semibold">{template.label}</h2><p className="text-sm text-neutral-400">{template.description}</p><div className="mt-4 space-y-4">{template.sections.map((section, sectionIndex)=><section key={section.title} className="rounded-xl border border-[color:var(--metal-border-soft)] p-3"><h3 className="text-sm font-semibold">{section.title}</h3>{section.items.map((item, itemIndex)=><div key={`${section.title}-${item}`} className="mt-3 rounded-lg bg-black/30 p-3"><div className="text-sm">{item}</div><div className="mt-2 flex gap-3 text-xs">{(["ok","fail","na"] as AllowedStatus[]).map((status)=><label key={status} className="flex items-center gap-1"><input type="radio" name={`status_${sectionIndex}_${itemIndex}`} value={status} defaultChecked={status==="ok"} />{status}</label>)}</div><textarea name={`notes_${sectionIndex}_${itemIndex}`} rows={2} placeholder="Notes" className="mt-2 w-full rounded border bg-black/50 p-2 text-sm" /><input name={`photo_notes_${sectionIndex}_${itemIndex}`} placeholder="Photo notes (placeholder until media upload step)" className="mt-2 w-full rounded border bg-black/50 p-2 text-sm" /></div>)}</section>)}</div></div><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase">Create and complete inspection</button></form></div></main>;
}
