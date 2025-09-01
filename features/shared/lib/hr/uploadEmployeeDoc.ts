"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function uploadEmployeeDoc(file: File, docType: string, shopId: string) {
  const supabase = createClientComponentClient<Database>();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.name.split(".").pop();
  const path = \`\${shopId}/\${user.id}/\${docType}/\${crypto.randomUUID()}.\${ext}\`;

  const { error: uploadErr } = await supabase.storage
    .from("employee_docs")
    .upload(path, file, { upsert: false });
  if (uploadErr) throw uploadErr;

  const { error: metaErr } = await supabase
    .from("employee_documents")
    .insert({ user_id: user.id, shop_id: shopId, doc_type: docType, file_path: path });
  if (metaErr) throw metaErr;

  return path;
}
