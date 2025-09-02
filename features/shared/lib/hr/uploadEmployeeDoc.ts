// features/shared/lib/hr/uploadEmployeeDoc.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  TablesInsert,
} from "@shared/types/types/supabase";

type DB = Database;
type EmpDocInsert = TablesInsert<"employee_documents">;

// You can refine this later if you add a real enum in your DB
export type EmployeeDocType =
  DB["public"]["Tables"]["employee_documents"]["Row"]["doc_type"];

/**
 * Upload a file to the `employee_docs` bucket and create an `employee_documents` row.
 * DB has defaults for: bucket_id ('employee_docs'), uploaded_at (now()), status ('active')
 */
export async function uploadEmployeeDoc(
  file: File,
  docType: EmployeeDocType,
  shopId: string,
  userId: string
) {
  // 🔒 make sure the client is strongly typed to your Database + "public"
  const raw = createClientComponentClient<DB>();
  const supabase = raw as unknown as SupabaseClient<DB, "public">;

  // ---------- 1) Upload to Storage (bucket: employee_docs)
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${shopId}/${docType}/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from("employee_docs")
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
  if (uploadErr) throw uploadErr;

  // ---------- 2) Insert DB row
  const row: EmpDocInsert = {
    user_id: userId,
    shop_id: shopId,
    doc_type: docType,
    file_path: storagePath,
    // keep if you want something explicit; otherwise let DB default:
    status: "received",
    // bucket_id / uploaded_at / expires_at: rely on DB defaults
  };

  // Preserve the table name as a literal + give insert an array of the correct type
  const { error: rowErr } = await supabase
    .from("employee_documents" as const)
    .insert([row] as EmpDocInsert[]);
  if (rowErr) throw rowErr;

  return { ok: true as const, path: storagePath };
}