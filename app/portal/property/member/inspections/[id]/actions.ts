"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type MemberRole = "tenant_requester" | "owner_approver" | "property_manager" | string;
type SignerRole = "tenant" | "property_manager" | "owner" | "internal";
type SignatureType = "typed" | "acknowledged";
type DB = { public: { Tables: { property_members: { Row: { id: string; shop_id: string; user_id: string; property_id: string | null; unit_id: string | null; role: MemberRole } }; property_inspections: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null } }; property_inspection_signatures: { Row: { id: string }; Insert: { inspection_id: string; shop_id: string; signer_profile_id: string; signer_name: string; signer_email: string | null; signer_role: SignerRole; signature_type: SignatureType; signature_text: string | null } } } } };
const c = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

const mapRole = (role: MemberRole): SignerRole => {
  if (role === "owner_approver") return "owner";
  if (role === "property_manager") return "property_manager";
  if (role === "tenant_requester") return "tenant";
  return "tenant";
};

export async function addMemberPropertyInspectionSignature(formData: FormData) {
  const s = c();
  const { data: { user } } = await s.auth.getUser();
  if (!user) redirect("/sign-in");

  const inspectionId = typeof formData.get("inspection_id") === "string" ? String(formData.get("inspection_id")).trim() : "";
  const signerName = typeof formData.get("signer_name") === "string" ? String(formData.get("signer_name")).trim() : "";
  const signatureTypeRaw = typeof formData.get("signature_type") === "string" ? String(formData.get("signature_type")).trim() : "acknowledged";
  const signatureTextRaw = typeof formData.get("signature_text") === "string" ? String(formData.get("signature_text")).trim() : "";
  if (!inspectionId || !signerName) redirect(`/portal/property/member/inspections/${inspectionId || ""}?status=validation-error`);
  if (signatureTypeRaw !== "acknowledged" && signatureTypeRaw !== "typed") redirect(`/portal/property/member/inspections/${inspectionId}?status=validation-error`);
  if (signatureTypeRaw === "typed" && !signatureTextRaw) redirect(`/portal/property/member/inspections/${inspectionId}?status=validation-error`);

  const { data: members } = await s.from("property_members").select("id,shop_id,user_id,property_id,unit_id,role").eq("user_id", user.id);
  if (!(members ?? []).length) redirect(`/portal/property/member/inspections/${inspectionId}?status=validation-error`);

  const shopIds = [...new Set((members ?? []).map((x) => x.shop_id))];
  const { data: inspection } = await s.from("property_inspections").select("id,shop_id,property_id,unit_id").eq("id", inspectionId).in("shop_id", shopIds).maybeSingle();
  const member = (members ?? []).find((mm) => inspection && mm.shop_id === inspection.shop_id && (!mm.property_id || mm.property_id === inspection.property_id) && (!mm.unit_id || mm.unit_id === inspection.unit_id));
  if (!inspection || !member) redirect(`/portal/property/member/inspections/${inspectionId}?status=validation-error`);

  const signerRole = mapRole(member.role);
  const { data: existing } = await s.from("property_inspection_signatures").select("id").eq("inspection_id", inspectionId).eq("signer_profile_id", user.id).eq("signer_role", signerRole).limit(1);
  if ((existing ?? []).length > 0) redirect(`/portal/property/member/inspections/${inspectionId}?status=already-signed`);

  const { error } = await s.from("property_inspection_signatures").insert({
    inspection_id: inspectionId,
    shop_id: inspection.shop_id,
    signer_profile_id: user.id,
    signer_name: signerName,
    signer_email: null,
    signer_role: signerRole,
    signature_type: signatureTypeRaw as SignatureType,
    signature_text: signatureTextRaw || null,
  });
  if (error) redirect(`/portal/property/member/inspections/${inspectionId}?status=signature-error`);

  revalidatePath(`/portal/property/member/inspections/${inspectionId}`);
  redirect(`/portal/property/member/inspections/${inspectionId}?status=signature-added`);
}
