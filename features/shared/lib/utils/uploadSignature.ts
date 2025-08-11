import { supabase } from "@shared/lib/supabase/client";

export async function uploadSignatureImage(
  base64: string,
  workOrderId: string,
): Promise<string | null> {
  // Convert base64 to Blob
  const res = await fetch(base64);
  const blob = await res.blob();

  const filePath = `signatures/${workOrderId}-${Date.now()}.png`;

  const { error } = await supabase.storage
    .from("signatures")
    .upload(filePath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/png",
    });

  if (error) {
    console.error("Upload error:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("signatures")
    .getPublicUrl(filePath);

  return urlData?.publicUrl || null;
}
