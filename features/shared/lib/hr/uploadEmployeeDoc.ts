// features/shared/lib/hr/uploadEmployeeDoc.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// Narrow the doc types you support in the UI
export type EmployeeDocType = "drivers_license" | "certification" | "tax_form" | "other";

// Minimal runtime-validated payload (matches your table columns)
function buildPayload(args: {
  user_id: string;
  shop_id: string;
  doc_type: EmployeeDocType;
  file_path: string;
}) {
  const { user_id, shop_id, doc_type, file_path } = args;

  // very light validation (avoid zod to keep deps unchanged)
  if (!user_id) throw new Error("Missing user_id");
  if (!shop_id) throw new Error("Missing shop_id");
  if (!file_path) throw new Error("Missing file_path");
  if (!["drivers_license", "certification", "tax_form", "other"].includes(doc_type)) {
    throw new Error("Invalid doc_type");
  }

  return {
    user_id,
    shop_id,
    doc_type,
    file_path,
    bucket_id: "employee_docs",
    status: "active",
    // uploaded_at/expires_at are optional and filled by DB defaults or left null
  };
}

/**
 * Upload a document to storage and create a row in employee_documents.
 * Uses a loosely-typed Supabase client here to avoid TS generic conflicts.
 */
export async function uploadEmployeeDoc(
  file: File,
  docType: EmployeeDocType,
  shopId: string
): Promise<string> {
  // 👇 untyped on purpose to sidestep the "never[]" overload issue
  const supabase = createClientComponentClient() as any;

  // Auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!user) throw new Error("Not signed in");

  // Build storage path
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${shopId}/${user.id}/${docType}/${crypto.randomUUID()}.${ext}`;

  // Upload to Storage
  const { error: uploadErr } = await supabase.storage
    .from("employee_docs")
    .upload(path, file, { upsert: false });
  if (uploadErr) throw uploadErr;

  // Insert metadata row
  const row = buildPayload({
    user_id: user.id,
    shop_id: shopId,
    doc_type: docType,
    file_path: path,
  });

  const { error: insertErr } = await supabase.from("employee_documents").insert([row]);
  if (insertErr) throw insertErr;

  return path;
}