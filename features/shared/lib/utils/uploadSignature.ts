import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

export async function uploadSignatureImage(
  base64: string,
  workOrderId: string
): Promise<string | null> {
  if (!base64 || !workOrderId) {
    console.error("Missing base64 string or workOrderId");
    return null;
  }

  let blob: Blob;
  try {
    const res = await fetch(base64);
    blob = await res.blob();
  } catch (err) {
    console.error("Invalid base64 data:", err);
    return null;
  }

  const filePath = `signatures/${workOrderId}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(filePath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/png",
    });

  if (uploadError) {
    console.error("Upload error:", uploadError.message);
    return null;
  }

  const { data: urlData } = await supabase.storage
    .from("signatures")
    .getPublicUrl(filePath);

  return urlData?.publicUrl || null;
}