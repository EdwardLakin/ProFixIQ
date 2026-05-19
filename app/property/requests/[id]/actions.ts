import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type RequestStatus = "open" | "triaged" | "approval_required" | "assigned" | "scheduled" | "in_progress" | "completed" | "cancelled";
const ALLOWED_STATUSES: RequestStatus[] = ["open", "triaged", "approval_required", "assigned", "scheduled", "in_progress", "completed", "cancelled"];
const TIMELINE_EVENT_TYPES = ["comment", "internal_note"] as const;
const TIMELINE_VISIBILITY = ["internal", "tenant_visible"] as const;
const ATTACHMENT_KINDS = ["image", "video", "document", "other"] as const;
type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

const ATTACHMENT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_BUCKET = "property_request_attachments";

function sanitizeAttachmentFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120) || "upload";
}

type DB = {
  public: {
    Tables: {
      profiles: { Row: { id: string; shop_id: string | null } };
      property_maintenance_requests: {
        Row: {
          id: string;
          shop_id: string;
          property_id: string;
          unit_id: string | null;
          asset_id: string | null;
          requester_profile_id: string | null;
          title: string;
          summary: string;
          category: string | null;
          severity: string;
          status: string;
          source: string;
          access_notes: string | null;
          preferred_window: string | null;
          work_order_id: string | null;
          created_at: string;
        };
      };
      property_properties: { Row: { id: string; name: string } };
      property_units: { Row: { id: string; unit_label: string } };
      property_assets: { Row: { id: string; name: string } };
      property_vendor_assignments: { Row: { id: string; request_id: string | null; vendor_id: string; status: string; scheduled_for: string | null; notes: string | null; created_at: string } };
      property_vendors: { Row: { id: string; shop_id: string; name: string; trade: string | null } };
      property_request_events: { Insert: { shop_id: string; request_id: string; actor_profile_id: string | null; actor_type: string; event_type: string; visibility: string; body: string; metadata: Record<string, unknown> } };
      property_request_attachments: {
        Insert: {
          shop_id: string;
          request_id: string;
          uploaded_by_profile_id: string | null;
          file_kind: AttachmentKind;
          original_filename: string | null;
          content_type: string | null;
          caption: string | null;
          metadata: Record<string, unknown>;
          storage_bucket: string | null;
          storage_path: string | null;
          size_bytes: number | null;
        };
      };
      work_orders: { Row: { id: string }; Insert: { shop_id: string; status?: string; approval_state?: string | null; customer_id?: string | null; vehicle_id?: string | null; notes?: string | null } };
    };
  };
};

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const parseStatus = (v: FormDataEntryValue | null) => (typeof v === "string" && ALLOWED_STATUSES.includes(v.trim() as RequestStatus) ? (v.trim() as RequestStatus) : null);

async function logPropertyRequestEvent(
  supabase: SupabaseClient<DB>,
  input: { shopId: string; requestId: string; actorProfileId: string; eventType: string; visibility?: "internal" | "tenant_visible"; body: string; metadata?: Record<string, unknown> }
) {
  const { error } = await supabase.from("property_request_events").insert({
    shop_id: input.shopId,
    request_id: input.requestId,
    actor_profile_id: input.actorProfileId,
    actor_type: "internal",
    event_type: input.eventType,
    visibility: input.visibility ?? "internal",
    body: input.body,
    metadata: input.metadata ?? {},
  });
  return !error;
}

export async function addPropertyRequestTimelineEvent(formData: FormData) {
  "use server";
  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  const eventType = typeof formData.get("event_type") === "string" ? String(formData.get("event_type")).trim() : "";
  const visibility = typeof formData.get("visibility") === "string" ? String(formData.get("visibility")).trim() : "";
  const body = typeof formData.get("body") === "string" ? String(formData.get("body")).trim() : "";

  if (!requestId) redirect("/property?error=" + encodeURIComponent("Missing request id."));
  if (!TIMELINE_EVENT_TYPES.includes(eventType as (typeof TIMELINE_EVENT_TYPES)[number])) {
    redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Invalid event type.")}`);
  }
  if (!TIMELINE_VISIBILITY.includes(visibility as (typeof TIMELINE_VISIBILITY)[number])) {
    redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Invalid visibility value.")}`);
  }
  if (!body) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Timeline body is required.")}`);

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) redirect("/property?error=" + encodeURIComponent("Request not found or not visible."));
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?error=" + encodeURIComponent("Unauthorized shop scope for request."));

  const { error } = await supabase.from("property_request_events").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    actor_profile_id: user.id,
    actor_type: "internal",
    event_type: eventType,
    visibility,
    body,
    metadata: {},
  });

  if (error) redirect(`/property/requests/${requestId}?error=${encodeURIComponent(`Unable to add timeline note: ${error.message}`)}`);

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}?status=timeline-event-added`);
}

export async function addPropertyRequestAttachmentPlaceholder(formData: FormData) {
  "use server";
  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  const fileKindRaw = typeof formData.get("file_kind") === "string" ? String(formData.get("file_kind")).trim() : "";
  const originalFilenameRaw = typeof formData.get("original_filename") === "string" ? String(formData.get("original_filename")).trim() : "";
  const contentTypeRaw = typeof formData.get("content_type") === "string" ? String(formData.get("content_type")).trim() : "";
  const captionRaw = typeof formData.get("caption") === "string" ? String(formData.get("caption")).trim() : "";
  const notesRaw = typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "";

  if (!requestId) redirect("/property?error=" + encodeURIComponent("Missing request id."));
  if (!ATTACHMENT_KINDS.includes(fileKindRaw as AttachmentKind)) redirect(`/property/requests/${requestId}?error=${encodeURIComponent("Invalid attachment kind.")}`);
  const fileKind = fileKindRaw as AttachmentKind;

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) redirect("/property?error=" + encodeURIComponent("Request not found or not visible."));
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?error=" + encodeURIComponent("Unauthorized shop scope for request."));

  const originalFilename = originalFilenameRaw || null;
  const contentType = contentTypeRaw || null;
  const caption = captionRaw || null;
  const notes = notesRaw || null;

  const { error: attachmentError } = await supabase.from("property_request_attachments").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    uploaded_by_profile_id: user.id,
    file_kind: fileKind,
    original_filename: originalFilename,
    content_type: contentType,
    caption,
    metadata: notes ? { notes } : {},
    storage_bucket: null,
    storage_path: null,
    size_bytes: null,
  });
  if (attachmentError) redirect(`/property/requests/${requestId}?error=${encodeURIComponent(`Unable to add attachment placeholder: ${attachmentError.message}`)}`);

  const attachmentLabel = originalFilename || fileKind;
  const { error: eventError } = await supabase.from("property_request_events").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    actor_profile_id: user.id,
    actor_type: "internal",
    event_type: "attachment_added",
    visibility: "internal",
    body: `Attachment placeholder added: ${attachmentLabel}`,
    metadata: { attachment_kind: fileKind, caption },
  });
  if (eventError) redirect(`/property/requests/${requestId}?error=${encodeURIComponent(`Attachment was saved, but timeline event failed: ${eventError.message}`)}`);

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}?status=attachment-placeholder-added`);
}

export async function uploadPropertyRequestAttachment(formData: FormData) {
  "use server";
  const supabase = client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) redirect("/property?error=" + encodeURIComponent("Missing shop context."));

  const requestId = typeof formData.get("request_id") === "string" ? String(formData.get("request_id")).trim() : "";
  const captionRaw = typeof formData.get("caption") === "string" ? String(formData.get("caption")).trim() : "";
  const fileEntry = formData.get("file");

  if (!requestId) redirect("/property?error=" + encodeURIComponent("Missing request id."));

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) redirect("/property?error=" + encodeURIComponent("Request not found or not visible."));
  if (requestRow.shop_id !== profile.shop_id) redirect("/property?error=" + encodeURIComponent("Unauthorized shop scope for request."));

  if (!(fileEntry instanceof File)) {
    redirect(`/property/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("A file is required.")}`);
  }

  const contentType = fileEntry.type;
  if (!ATTACHMENT_IMAGE_CONTENT_TYPES.includes(contentType as (typeof ATTACHMENT_IMAGE_CONTENT_TYPES)[number])) {
    redirect(`/property/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("Unsupported file type. Upload JPEG, PNG, WEBP, HEIC, or HEIF.")}`);
  }

  if (fileEntry.size > MAX_ATTACHMENT_SIZE_BYTES) {
    redirect(`/property/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("File exceeds 10 MB limit.")}`);
  }

  const safeFileName = sanitizeAttachmentFileName(fileEntry.name || "upload");
  const timestamp = Date.now();
  const storagePath = `${profile.shop_id}/property-requests/${requestId}/${timestamp}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, fileEntry, { contentType });
  if (uploadError) {
    redirect(`/property/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Unable to upload file: ${uploadError.message}`)}`);
  }

  const caption = captionRaw || null;
  const { error: attachmentError } = await supabase.from("property_request_attachments").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    uploaded_by_profile_id: user.id,
    file_kind: "image",
    original_filename: fileEntry.name || safeFileName,
    content_type: contentType,
    caption,
    metadata: {},
    storage_bucket: ATTACHMENT_BUCKET,
    storage_path: storagePath,
    size_bytes: fileEntry.size,
  });

  if (attachmentError) {
    redirect(`/property/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Upload succeeded but metadata insert failed: ${attachmentError.message}`)}`);
  }

  const { error: eventError } = await supabase.from("property_request_events").insert({
    shop_id: profile.shop_id,
    request_id: requestId,
    actor_profile_id: user.id,
    actor_type: "internal",
    event_type: "attachment_added",
    visibility: "internal",
    body: `Image attachment uploaded: ${fileEntry.name || safeFileName}`,
    metadata: { storage_path: storagePath, caption, content_type: contentType, size_bytes: fileEntry.size },
  });

  if (eventError) {
    redirect(`/property/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Attachment saved, but timeline event failed: ${eventError.message}`)}`);
  }

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}?status=attachment-uploaded`);
}

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

  await logPropertyRequestEvent(supabase, { shopId: profile.shop_id, requestId, actorProfileId: user.id, eventType: "status_changed", body: `Status updated to ${nextStatus}.`, metadata: { next_status: nextStatus } });

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

  await logPropertyRequestEvent(supabase, { shopId: profile.shop_id, requestId, actorProfileId: user.id, eventType: "vendor_assigned", body: `Vendor assigned: ${vendorRow.id}.`, metadata: { vendor_id: vendorRow.id, scheduled_for: scheduledFor } });

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
  ]
    .filter(Boolean)
    .join(" · ");

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

  await logPropertyRequestEvent(supabase, { shopId: profile.shop_id, requestId, actorProfileId: user.id, eventType: "work_order_linked", body: `Linked to work order ${workOrder.id}.`, metadata: { work_order_id: workOrder.id } });

  revalidatePath("/property");
  revalidatePath(`/property/requests/${requestId}`);
  redirect(`/property/requests/${requestId}?status=converted`);
}
