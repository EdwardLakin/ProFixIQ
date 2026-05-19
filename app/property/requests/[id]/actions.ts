import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type RequestStatus = "open" | "triaged" | "approval_required" | "assigned" | "scheduled" | "in_progress" | "completed" | "cancelled";
const ALLOWED_STATUSES: RequestStatus[] = ["open", "triaged", "approval_required", "assigned", "scheduled", "in_progress", "completed", "cancelled"];
type DB = { public: { Tables: { profiles: { Row: { id: string; shop_id: string | null } }; property_maintenance_requests: { Row: { id: string; shop_id: string; property_id: string; unit_id: string | null; asset_id: string | null; requester_profile_id: string | null; title: string; summary: string; category: string | null; severity: string; status: string; source: string; access_notes: string | null; preferred_window: string | null; work_order_id: string | null; created_at: string } }; property_properties: { Row: { id: string; name: string } }; property_units: { Row: { id: string; unit_label: string } }; property_assets: { Row: { id: string; name: string } }; property_vendor_assignments: { Row: { id: string; request_id: string | null; vendor_id: string; status: string; scheduled_for: string | null; notes: string | null; created_at: string } }; property_vendors: { Row: { id: string; shop_id: string; name: string; trade: string | null } }; work_orders: { Row: { id: string }; Insert: { shop_id: string; status?: string; approval_state?: string | null; customer_id?: string | null; vehicle_id?: string | null; notes?: string | null } }; } } };
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

export async function assignPropertyVendorToRequest(formData: FormData) {
  "use server";
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  const vendorId = typeof formData.get("vendor_id") === "string" ? String(formData.get("vendor_id")).trim() : "";
  const scheduledInput = typeof formData.get("scheduled_for") === "string" ? String(formData.get("scheduled_for")).trim() : "";
  const notesInput = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "";

  if (!requestId) redirect("/property?error=" + encodeURIComponent("Missing request id."));
  if (!vendorId) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Vendor is required.")}`);

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) redirect("/property?error=" + encodeURIComponent("Request not found or not visible."));
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?error=" + encodeURIComponent("Unauthorized shop scope for request."));

  const { data: vendorRow } = await supabase.from("property_vendors").select("id,shop_id").eq("id", vendorId).maybeSingle();
  if (!vendorRow) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Vendor not found or not visible.")}`);
  if (vendorRow.shop_id !== profile.shop_id) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Vendor does not belong to your shop scope.")}`);

  const { data: duplicate } = await supabase
    .from("property_vendor_assignments")
    .select("id")
    .eq("request_id", requestId)
    .eq("vendor_id", vendorId)
    .in("status", ["assigned", "scheduled", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (duplicate) redirect(`/property/requests/${requestId}?status=vendor-already-assigned`);

  const scheduledFor = scheduledInput ? scheduledInput : null;
  const notes = notesInput ? notesInput : null;

  const { error: insertError } = await supabase.from("property_vendor_assignments").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    vendor_id: vendorId,
    status: "assigned",
    scheduled_for: scheduledFor,
    notes,
  });
  if (insertError) redirect(`/property/requests/${requestId}?error=${encodeURIComponent(`Unable to assign vendor: ${insertError.message}`)}`);

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}`);
}

export async function convertPropertyRequestToWorkOrder(formData: FormData) {
  "use server";
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  if (!requestId) redirect("/property?status=validation-error");

  const { data: requestRow } = await supabase
    .from("property_maintenance_requests")
    .select("id,shop_id,property_id,unit_id,asset_id,work_order_id,status,title,summary,severity,category,source")
    .eq("id", requestId)
    .maybeSingle();
  if (!requestRow) redirect("/property?status=validation-error");
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?status=validation-error");
  if (requestRow.work_order_id) redirect(`/property/requests/${requestId}?status=already-converted`);
  if (!requestRow.property_id) redirect(`/property/requests/${requestId}?status=validation-error`);

  const [{ data: property }, { data: unit }, { data: asset }] = await Promise.all([
    supabase.from("property_properties").select("id,name").eq("id", requestRow.property_id).maybeSingle(),
    requestRow.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", requestRow.unit_id).maybeSingle() : Promise.resolve({ data: null }),
    requestRow.asset_id ? supabase.from("property_assets").select("id,name").eq("id", requestRow.asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!property) redirect(`/property/requests/${requestId}?status=validation-error`);

  const propertyContext = [
    `Property request: ${requestRow.title}`,
    `Summary: ${requestRow.summary}`,
    `Property: ${property.name}`,
    unit?.unit_label ? `Unit: ${unit.unit_label}` : null,
    asset?.name ? `Asset: ${asset.name}` : null,
    requestRow.category ? `Category: ${requestRow.category}` : null,
    `Severity: ${requestRow.severity}`,
    `Source: ${requestRow.source}`,
  ].filter(Boolean).join(" · ");

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .insert({
      shop_id: profile.shop_id,
      status: "awaiting_approval",
      approval_state: "pending",
      customer_id: null,
      vehicle_id: null,
      notes: propertyContext,
    })
    .select("id")
    .maybeSingle();

  if (workOrderError || !workOrder) redirect(`/property/requests/${requestId}?status=conversion-error`);

  const nextStatus = requestRow.status === "assigned" ? "assigned" : "scheduled";
  const { error: updateError } = await supabase
    .from("property_maintenance_requests")
    .update({ work_order_id: workOrder.id, status: nextStatus })
    .eq("id", requestId)
    .eq("shop_id", profile.shop_id)
    .is("work_order_id", null);
  if (updateError) redirect(`/property/requests/${requestId}?status=conversion-error`);

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}?status=converted`);
}
