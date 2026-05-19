"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  property_members: { Row: { id: string; shop_id: string; user_id: string; property_id: string | null; unit_id: string | null } };
  property_properties: { Row: { id: string; shop_id: string } };
  property_units: { Row: { id: string; property_id: string } };
  property_assets: { Row: { id: string; property_id: string; unit_id: string | null } };
  property_maintenance_requests: { Insert: { shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string; title: string; summary: string; category: string | null; severity: string; status: string; source: string; access_notes: string | null; photos: unknown[] }; Row: { id: string } };
  property_request_events: { Insert: { request_id: string; shop_id: string; actor_profile_id: string | null; actor_type: string; event_type: string; visibility: string; body: string; metadata: Record<string, unknown> } };
} } };
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const allowedSeverity = new Set(["emergency", "urgent", "routine", "recommended"]);
const readOptional = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const readRequired = (formData: FormData, key: string) => readOptional(formData, key);

export async function createMemberPropertyMaintenanceRequest(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const propertyId = readRequired(formData, "property_id");
  const unitId = readOptional(formData, "unit_id");
  const assetId = readOptional(formData, "asset_id");
  const title = readRequired(formData, "title");
  const summary = readRequired(formData, "summary");
  const category = readOptional(formData, "category");
  const severity = readOptional(formData, "severity") ?? "routine";
  const accessNotes = readOptional(formData, "access_notes");
  const preferredWindow = readOptional(formData, "preferred_window");
  const photoNotes = readOptional(formData, "photo_notes");

  if (!propertyId || !title || !summary || !allowedSeverity.has(severity)) redirect("/portal/property/member/requests/new?error=Please%20complete%20all%20required%20fields%20with%20valid%20values.");

  const { data: memberships } = await supabase.from("property_members").select("id,shop_id,user_id,property_id,unit_id").eq("user_id", user.id);
  if (!(memberships ?? []).length) redirect("/portal/property/member/requests/new?error=No%20property%20membership%20is%20assigned%20to%20this%20account.");

  const [propertiesResult, unitsResult, assetsResult] = await Promise.all([
    supabase.from("property_properties").select("id,shop_id"),
    supabase.from("property_units").select("id,property_id"),
    supabase.from("property_assets").select("id,property_id,unit_id"),
  ]);

  const propertyById = new Map((propertiesResult.data ?? []).map((row) => [row.id, row]));
  const unitById = new Map((unitsResult.data ?? []).map((row) => [row.id, row]));
  const assetById = new Map((assetsResult.data ?? []).map((row) => [row.id, row]));

  const selectedProperty = propertyById.get(propertyId);
  const matchingMemberships = (memberships ?? []).filter((member) => !member.property_id || member.property_id === propertyId);
  if (!selectedProperty || !matchingMemberships.length) redirect("/portal/property/member/requests/new?error=Selected%20property%20is%20outside%20your%20member%20scope.");

  const shopId = matchingMemberships[0].shop_id;
  if (selectedProperty.shop_id !== shopId) redirect("/portal/property/member/requests/new?error=Selected%20property%20is%20outside%20your%20member%20shop%20scope.");

  let selectedUnitId: string | null = null;
  if (unitId) {
    const unit = unitById.get(unitId);
    if (!unit || unit.property_id !== propertyId) redirect("/portal/property/member/requests/new?error=Selected%20unit%20is%20outside%20your%20member%20scope.");
    const unitAllowed = matchingMemberships.some((member) => !member.unit_id || member.unit_id === unitId);
    if (!unitAllowed) redirect("/portal/property/member/requests/new?error=Selected%20unit%20is%20outside%20your%20member%20scope.");
    selectedUnitId = unit.id;
  }

  let selectedAssetId: string | null = null;
  if (assetId) {
    const asset = assetById.get(assetId);
    if (!asset || asset.property_id !== propertyId) redirect("/portal/property/member/requests/new?error=Selected%20asset%20is%20outside%20your%20member%20scope.");
    if (selectedUnitId && asset.unit_id && asset.unit_id !== selectedUnitId) redirect("/portal/property/member/requests/new?error=Selected%20asset%20must%20belong%20to%20the%20selected%20unit%20or%20be%20property-level.");
    selectedAssetId = asset.id;
  }

  const combinedAccessNotes = [
    accessNotes ? `Access notes: ${accessNotes}` : null,
    preferredWindow ? `Preferred window: ${preferredWindow}` : null,
    photoNotes ? `Photo notes (placeholder): ${photoNotes}` : null,
  ].filter(Boolean).join("\n");

  const { data: inserted, error } = await supabase.from("property_maintenance_requests").insert({
    shop_id: shopId,
    property_id: propertyId,
    unit_id: selectedUnitId,
    asset_id: selectedAssetId,
    requester_profile_id: user.id,
    title,
    summary,
    category,
    severity,
    status: "open",
    source: "member_portal",
    access_notes: combinedAccessNotes || null,
    photos: [],
  }).select("id").single();

  if (error || !inserted) redirect(`/portal/property/member/requests/new?error=${encodeURIComponent(`Unable to submit request: ${error?.message ?? "unknown error"}`)}`);

  await supabase.from("property_request_events").insert({
    request_id: inserted.id,
    shop_id: shopId,
    actor_profile_id: user.id,
    actor_type: "tenant",
    event_type: "request_created",
    visibility: "tenant_visible",
    body: "Request submitted from property member portal.",
    metadata: {},
  });

  revalidatePath("/portal/property/member/requests");
  redirect(`/portal/property/member/requests/${inserted.id}?status=submitted`);
}
