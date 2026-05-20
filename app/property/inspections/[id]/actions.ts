"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type FindingStatus = "ok" | "fail" | "na";
type Finding = { section: string; item: string; status: FindingStatus; notes: string; photo_notes?: string };
type SignerRole = "tenant" | "property_manager" | "owner" | "internal" | "witness";
type SignatureType = "typed" | "acknowledged";
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; inspection_type: string; findings: unknown } }; property_maintenance_requests: { Row: { id: string; property_id: string; unit_id: string | null; source: string; title: string }; Insert: { shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string; title: string; summary: string; category: string | null; severity: "emergency" | "urgent" | "routine" | "recommended"; status: "open"; source: "inspection_failed_finding"; access_notes: string | null; preferred_window: string | null; photos: unknown } }; property_inspection_signatures: { Row: { id: string; inspection_id: string; shop_id: string; signer_profile_id: string | null; signer_name: string; signer_email: string | null; signer_role: SignerRole; signature_type: SignatureType; signature_text: string | null; signed_at: string }; Insert: { inspection_id: string; shop_id: string; signer_profile_id: string; signer_name: string; signer_email: string | null; signer_role: SignerRole; signature_type: SignatureType; signature_text: string | null } } } } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const findKey = (finding: Pick<Finding, "section" | "item">) => `${finding.section}::${finding.item}`;
const parseFindings = (value: unknown): Finding[] => Array.isArray(value) ? (value.filter((f): f is Finding => !!f && typeof f === "object" && "section" in f && "item" in f && "status" in f) as Finding[]) : [];

export async function addInternalPropertyInspectionSignature(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property/inspections?status=validation-error");

  const inspectionId = typeof formData.get("inspection_id") === "string" ? String(formData.get("inspection_id")).trim() : "";
  const signerName = typeof formData.get("signer_name") === "string" ? String(formData.get("signer_name")).trim() : "";
  const signerEmailRaw = typeof formData.get("signer_email") === "string" ? String(formData.get("signer_email")).trim() : "";
  const signerRoleRaw = typeof formData.get("signer_role") === "string" ? String(formData.get("signer_role")).trim() : "internal";
  const signatureTypeRaw = typeof formData.get("signature_type") === "string" ? String(formData.get("signature_type")).trim() : "acknowledged";
  const signatureTextRaw = typeof formData.get("signature_text") === "string" ? String(formData.get("signature_text")).trim() : "";
  const signerEmail = signerEmailRaw.length > 0 ? signerEmailRaw : null;

  if (!inspectionId || !signerName) redirect(`/property/inspections/${inspectionId || ""}?status=validation-error`);

  const signerRoleAllowed: SignerRole[] = ["tenant", "property_manager", "owner", "internal", "witness"];
  if (!signerRoleAllowed.includes(signerRoleRaw as SignerRole)) redirect(`/property/inspections/${inspectionId}?status=validation-error`);
  const signatureTypes: SignatureType[] = ["typed", "acknowledged"];
  if (!signatureTypes.includes(signatureTypeRaw as SignatureType)) redirect(`/property/inspections/${inspectionId}?status=validation-error`);
  if (signatureTypeRaw === "typed" && signatureTextRaw.length === 0) redirect(`/property/inspections/${inspectionId}?status=validation-error`);

  const { data: inspection } = await supabase.from("property_inspections").select("id,shop_id").eq("id", inspectionId).maybeSingle();
  if (!inspection || inspection.shop_id !== profile.shop_id) redirect(`/property/inspections/${inspectionId}?status=validation-error`);

  const { data: existing } = await supabase
    .from("property_inspection_signatures")
    .select("id")
    .eq("inspection_id", inspectionId)
    .eq("signer_profile_id", user.id)
    .eq("signer_role", signerRoleRaw as SignerRole)
    .limit(1);
  if ((existing ?? []).length > 0) redirect(`/property/inspections/${inspectionId}?status=already-signed`);

  const { error } = await supabase.from("property_inspection_signatures").insert({
    inspection_id: inspectionId,
    shop_id: profile.shop_id,
    signer_profile_id: user.id,
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRoleRaw as SignerRole,
    signature_type: signatureTypeRaw as SignatureType,
    signature_text: signatureTextRaw.length > 0 ? signatureTextRaw : null,
  });
  if (error) redirect(`/property/inspections/${inspectionId}?status=signature-error`);

  revalidatePath("/property/inspections");
  revalidatePath(`/property/inspections/${inspectionId}`);
  redirect(`/property/inspections/${inspectionId}?status=signature-added`);
}

export async function createRequestsFromFailedInspectionFindings(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property/inspections?status=validation-error");

  const inspectionId = typeof formData.get("inspection_id") === "string" ? String(formData.get("inspection_id")) : "";
  const selectedKeys = formData.getAll("finding_key").filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (!inspectionId) redirect("/property/inspections?status=validation-error");

  const { data: inspection } = await supabase.from("property_inspections").select("id,shop_id,property_id,unit_id,inspection_type,findings").eq("id", inspectionId).maybeSingle();
  if (!inspection || inspection.shop_id !== profile.shop_id || !inspection.property_id) redirect(`/property/inspections/${inspectionId}?status=validation-error`);

  const findings = parseFindings(inspection.findings);
  const failedByKey = new Map(findings.filter((f) => f.status === "fail").map((f) => [findKey(f), f]));
  const validFailedSelections = Array.from(new Set(selectedKeys)).map((key) => ({ key, finding: failedByKey.get(key) })).filter((x): x is { key: string; finding: Finding } => Boolean(x.finding));
  if (validFailedSelections.length === 0) redirect(`/property/inspections/${inspectionId}?status=no-failed-selected`);

  let created = 0;
  let skipped = 0;
  for (const { finding } of validFailedSelections) {
    const title = `${finding.section}: ${finding.item}`;
    const notes = finding.notes?.trim() ? `\nNotes: ${finding.notes.trim()}` : "";
    const photoNotes = finding.photo_notes?.trim() ? `\nPhoto notes: ${finding.photo_notes.trim()}` : "";
    const summary = `Failed inspection item: ${finding.section} - ${finding.item}\nInspection type: ${inspection.inspection_type}${notes}${photoNotes}\nInspection ID: ${inspection.id}`;

    const { data: existing, error: lookupError } = await supabase.from("property_maintenance_requests").select("id,title").eq("property_id", inspection.property_id).eq("unit_id", inspection.unit_id).eq("source", "inspection_failed_finding").ilike("title", `%${title}%`).limit(1);
    if (lookupError) redirect(`/property/inspections/${inspectionId}?status=conversion-error`);
    if ((existing ?? []).length > 0) { skipped += 1; continue; }

    const { error: insertError } = await supabase.from("property_maintenance_requests").insert({ shop_id: profile.shop_id, property_id: inspection.property_id, unit_id: inspection.unit_id, asset_id: null, requester_profile_id: user.id, title, summary, category: "Inspection", severity: "routine", status: "open", source: "inspection_failed_finding", access_notes: null, preferred_window: null, photos: [] });
    if (insertError) redirect(`/property/inspections/${inspectionId}?status=conversion-error`);
    created += 1;
  }
  if (created === 0) redirect(`/property/inspections/${inspectionId}?status=no-failed-selected`);
  revalidatePath("/property"); revalidatePath("/property/inspections"); revalidatePath(`/property/inspections/${inspectionId}`);
  redirect(`/property/inspections/${inspectionId}?status=requests-created&created=${created}&skipped=${skipped}`);
}

