import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { isValidScheduleDateKey } from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ id: string }> };

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_BUCKET = "employee_docs";
const DOCUMENT_TYPES = new Set([
  "drivers_license",
  "certification",
  "tax_form",
  "other",
]);
const EXTENSION_BY_CONTENT_TYPE = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(req: NextRequest, context: Ctx) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const { id: personId } = await context.params;
  const shopId = access.profile.shop_id!;
  const admin = createAdminSupabase();
  const { data: person, error: personError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", personId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (personError) {
    return NextResponse.json({ error: personError.message }, { status: 500 });
  }
  if (!person) {
    return NextResponse.json(
      { error: "Person not found in this shop" },
      { status: 404 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "A multipart document upload is required" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const docType = String(form.get("doc_type") ?? "")
    .trim()
    .toLowerCase();
  const expiresAt = String(form.get("expires_at") ?? "").trim() || null;

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json(
      { error: "Choose a non-empty document file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: "Document files must be 10 MB or smaller" },
      { status: 413 },
    );
  }
  if (!DOCUMENT_TYPES.has(docType)) {
    return NextResponse.json(
      { error: "Choose a supported document type" },
      { status: 400 },
    );
  }
  const extension = EXTENSION_BY_CONTENT_TYPE.get(file.type.toLowerCase());
  if (!extension) {
    return NextResponse.json(
      { error: "Upload a PDF, JPEG, PNG, or WebP document" },
      { status: 400 },
    );
  }
  if (expiresAt && !isValidScheduleDateKey(expiresAt)) {
    return NextResponse.json(
      { error: "Expiry must be a valid calendar date" },
      { status: 400 },
    );
  }

  const storagePath = `${shopId}/${personId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: `Document storage failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: document, error: insertError } = await admin
    .from("employee_documents")
    .insert({
      shop_id: shopId,
      user_id: personId,
      doc_type: docType,
      bucket_id: DOCUMENT_BUCKET,
      file_path: storagePath,
      original_filename: file.name.slice(0, 255),
      content_type: file.type,
      file_size_bytes: file.size,
      expires_at: expiresAt,
      status: "received",
      uploaded_by: access.profile.id,
    })
    .select(
      "id, doc_type, status, uploaded_at, expires_at, original_filename, content_type, file_size_bytes",
    )
    .single();

  if (insertError || !document) {
    await admin.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        error:
          insertError?.message ??
          "Document metadata could not be recorded",
      },
      { status: 500 },
    );
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.document.uploaded",
    target: personId,
    metadata: {
      shop_id: shopId,
      person_id: personId,
      document_id: document.id,
      doc_type: document.doc_type,
      expires_at: document.expires_at,
      file_size_bytes: document.file_size_bytes,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      document,
      warning: auditError
        ? "The document was uploaded, but its Activity entry could not be recorded. No retry is needed."
        : null,
    },
    { status: 201 },
  );
}
