// features/shared/lib/utils/uploadSignature.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Upload a base64 signature image to the `signatures` bucket.
 * Returns the public URL (or null on failure).
 */
export async function uploadSignatureImage(base64: string, workOrderId: string): Promise<string | null> {
  if (!base64 || !workOrderId) return null;

  const blob = dataUrlToBlob(base64);
  const filePath = `wo/${workOrderId}/${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(filePath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/png",
    });

  if (uploadError) return null;

  const { data: urlData } = await supabase.storage.from("signatures").getPublicUrl(filePath);
  return urlData?.publicUrl || null;
}
