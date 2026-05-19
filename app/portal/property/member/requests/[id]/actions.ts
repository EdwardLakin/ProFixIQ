"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  property_maintenance_requests: { Row: { id: string; shop_id: string } };
  property_members: { Row: { id: string; user_id: string; shop_id: string } };
  property_request_attachments: { Insert: {
    shop_id: string;
    request_id: string;
    uploaded_by_profile_id: string | null;
    file_kind: "image" | "video" | "document" | "other";
    storage_bucket: string | null;
    storage_path: string | null;
    original_filename: string | null;
    content_type: string | null;
    size_bytes: number | null;
    caption: string | null;
    metadata: Record<string, unknown>;
  } };
  property_request_events: { Insert: { request_id: string; shop_id: string; actor_profile_id: string | null; actor_type: string; event_type: string; visibility: string; body: string; metadata: Record<string, unknown> } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const ATTACHMENT_BUCKET = "property_request_attachments";
const ATTACHMENT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const readRequired = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const readOptional = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
const sanitizeAttachmentFileName = (fileName: string) =>
  fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "").slice(0, 120) || "upload";

export async function addTenantVisibleComment(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const requestId = readRequired(formData, "request_id");
  const body = readRequired(formData, "body");

  if (!requestId || !body) {
    redirect(`/portal/property/member/requests/${requestId ?? ""}?error=${encodeURIComponent("Comment body is required.")}`);
  }

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();

  if (!requestRow) {
    redirect(`/portal/property/member/requests/${requestId}?error=${encodeURIComponent("Request is not visible to this account.")}`);
  }

  const { error } = await supabase.from("property_request_events").insert({
    request_id: requestId,
    shop_id: requestRow.shop_id,
    actor_profile_id: user.id,
    actor_type: "tenant",
    event_type: "comment",
    visibility: "tenant_visible",
    body,
    metadata: {},
  });

  if (error) {
    redirect(`/portal/property/member/requests/${requestId}?error=${encodeURIComponent(`Unable to add comment: ${error.message}`)}`);
  }

  redirect(`/portal/property/member/requests/${requestId}?status=${encodeURIComponent("comment-added")}`);
}

export async function uploadMemberPropertyRequestAttachment(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const requestId = readRequired(formData, "request_id");
  if (!requestId) {
    redirect(`/portal/property/member/requests/${requestId ?? ""}?status=invalid-attachment&error=${encodeURIComponent("Request is required.")}`);
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    redirect(`/portal/property/member/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("A file is required.")}`);
  }

  if (!ATTACHMENT_IMAGE_CONTENT_TYPES.includes(fileEntry.type as (typeof ATTACHMENT_IMAGE_CONTENT_TYPES)[number])) {
    redirect(`/portal/property/member/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("Unsupported file type. Upload JPEG, PNG, WEBP, HEIC, or HEIF.")}`);
  }
  if (fileEntry.size > MAX_ATTACHMENT_SIZE_BYTES) {
    redirect(`/portal/property/member/requests/${requestId}?status=invalid-attachment&error=${encodeURIComponent("File exceeds 10 MB limit.")}`);
  }

  const { data: requestRow } = await supabase.from("property_maintenance_requests").select("id,shop_id").eq("id", requestId).maybeSingle();
  if (!requestRow) {
    redirect(`/portal/property/member/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent("Request is not visible to this account.")}`);
  }

  const { data: membershipRow } = await supabase.from("property_members").select("id,user_id,shop_id").eq("user_id", user.id).eq("shop_id", requestRow.shop_id).maybeSingle();
  if (!membershipRow) {
    redirect(`/portal/property/member/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent("No property member access for this request.")}`);
  }

  const shopId = membershipRow.shop_id;
  const caption = readOptional(formData, "caption");
  const safeFileName = sanitizeAttachmentFileName(fileEntry.name || "upload");
  const timestamp = Date.now();
  const storagePath = `${shopId}/property-requests/${requestId}/member-${user.id}-${timestamp}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, fileEntry, { contentType: fileEntry.type });
  if (uploadError) {
    redirect(`/portal/property/member/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Unable to upload image: ${uploadError.message}`)}`);
  }

  const { error: attachmentError } = await supabase.from("property_request_attachments").insert({
    shop_id: shopId,
    request_id: requestId,
    uploaded_by_profile_id: user.id,
    file_kind: "image",
    storage_bucket: ATTACHMENT_BUCKET,
    storage_path: storagePath,
    original_filename: fileEntry.name || safeFileName,
    content_type: fileEntry.type,
    size_bytes: fileEntry.size,
    caption,
    metadata: { source: "member_portal" },
  });
  if (attachmentError) {
    redirect(`/portal/property/member/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Upload succeeded but metadata insert failed: ${attachmentError.message}`)}`);
  }

  const { error: eventError } = await supabase.from("property_request_events").insert({
    request_id: requestId,
    shop_id: shopId,
    actor_profile_id: user.id,
    actor_type: "tenant",
    event_type: "attachment_added",
    visibility: "tenant_visible",
    body: `Image attachment uploaded from property member portal: ${fileEntry.name || safeFileName}`,
    metadata: { storage_path: storagePath, caption, content_type: fileEntry.type, size_bytes: fileEntry.size },
  });
  if (eventError) {
    redirect(`/portal/property/member/requests/${requestId}?status=attachment-upload-error&error=${encodeURIComponent(`Attachment saved, but timeline event failed: ${eventError.message}`)}`);
  }

  revalidatePath(`/portal/property/member/requests/${requestId}`);
  redirect(`/portal/property/member/requests/${requestId}?status=attachment-uploaded`);
}
