"use server";

import "server-only";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type Severity = "emergency" | "urgent" | "routine" | "recommended";
const ALLOWED_SEVERITIES: Severity[] = ["emergency", "urgent", "routine", "recommended"];

type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_properties: { Row: { id: string; name: string } }; property_units: { Row: { id: string; property_id: string; unit_label: string } }; property_assets: { Row: { id: string; property_id: string; unit_id: string | null; name: string } }; property_maintenance_requests: { Insert: { shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string; title: string; summary: string; category: string | null; severity: Severity; status: "open"; source: "tenant_preview"; access_notes: string | null; preferred_window: string | null; photos: unknown[]; }; }; }; }; };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const clean = (value: FormDataEntryValue | null) => typeof value === "string" && value.trim() ? value.trim() : null;

export async function createTenantPreviewRequest(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: properties }, { data: units }, { data: assets }] = await Promise.all([
    supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle(),
    supabase.from("property_properties").select("id,name").order("name"),
    supabase.from("property_units").select("id,property_id,unit_label").order("unit_label"),
    supabase.from("property_assets").select("id,property_id,unit_id,name").order("name"),
  ]);

  if (!profile?.shop_id) redirect("/portal/property/request?error=" + encodeURIComponent("Your profile is missing shop context."));

  const propertyId = clean(formData.get("property_id"));
  const unitId = clean(formData.get("unit_id"));
  const assetId = clean(formData.get("asset_id"));
  const requesterName = clean(formData.get("requester_name"));
  const requesterEmail = clean(formData.get("requester_email"));
  const requesterPhone = clean(formData.get("requester_phone"));
  const title = clean(formData.get("title"));
  const summary = clean(formData.get("summary"));
  const category = clean(formData.get("category"));
  const severity = (clean(formData.get("severity")) ?? "routine") as Severity;
  const accessNotes = clean(formData.get("access_notes"));
  const preferredWindow = clean(formData.get("preferred_window"));
  const photoNotes = clean(formData.get("photo_notes"));

  if (!propertyId || !(properties ?? []).some((property) => property.id === propertyId)) redirect("/portal/property/request?error=" + encodeURIComponent("Selected property is not visible."));
  if (!title || !summary) redirect("/portal/property/request?error=" + encodeURIComponent("Title and summary are required."));
  if (!ALLOWED_SEVERITIES.includes(severity)) redirect("/portal/property/request?error=" + encodeURIComponent("Invalid severity."));

  const unit = unitId ? (units ?? []).find((candidate) => candidate.id === unitId) : null;
  if (unitId && (!unit || unit.property_id !== propertyId)) redirect("/portal/property/request?error=" + encodeURIComponent("Selected unit is invalid for the chosen property."));

  const asset = assetId ? (assets ?? []).find((candidate) => candidate.id === assetId) : null;
  if (assetId && (!asset || asset.property_id !== propertyId)) redirect("/portal/property/request?error=" + encodeURIComponent("Selected asset is invalid for the chosen property."));

  if (unit && asset && asset.unit_id !== unit.id && asset.unit_id !== null) redirect("/portal/property/request?error=" + encodeURIComponent("Selected asset must belong to selected unit, or be property-level."));

  const requesterRollup = `Requester: ${requesterName ?? "n/a"} / ${requesterEmail ?? "n/a"} / ${requesterPhone ?? "n/a"}`;
  const summaryWithRequester = `${summary}\n\n${requesterRollup}`;
  const accessNotesCombined = [accessNotes, photoNotes ? `Photo notes: ${photoNotes}` : null].filter(Boolean).join("\n\n");

  const { error } = await supabase.from("property_maintenance_requests").insert({
    shop_id: profile.shop_id,
    property_id: propertyId,
    unit_id: unit?.id ?? null,
    asset_id: asset?.id ?? null,
    requester_profile_id: user.id,
    title,
    summary: summaryWithRequester,
    category,
    severity,
    status: "open",
    source: "tenant_preview",
    access_notes: accessNotesCombined || null,
    preferred_window: preferredWindow,
    photos: [],
  });

  if (error) redirect("/portal/property/request?error=" + encodeURIComponent(`Unable to submit request: ${error.message}`));

  redirect("/portal/property/request?status=submitted");
}
