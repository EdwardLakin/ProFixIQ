// features/vehicles/lib/vehicleMediaUpload.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// `vehicle_media.type` has a DB check constraint limited to 'photo' | 'document'
// (see supabase/migrations/20260705000000_public_schema_baseline.sql). Anything
// scanned (registration, insurance card, etc.) is stored as a "document" with a
// descriptive filename rather than a new type value, so it shows up wherever
// vehicle documents already appear (e.g. features/customers/app/customers/[id]/page.tsx).
export type VehicleMediaBucket = "vehicle-photos" | "vehicle-docs";
export type VehicleMediaKind = "photo" | "document";

export type UploadVehicleMediaResult =
  | { ok: true; id: string; storagePath: string }
  | { ok: false; error: string };

/**
 * Uploads a single file into vehicle storage and records it in
 * `vehicle_media`, using the same storage-path convention
 * (`${vehicleId}/${timestamp}_${filename}`) as the customer profile page's
 * document uploader.
 */
export async function uploadVehicleMediaFile(params: {
  supabase: SupabaseClient<DB>;
  vehicleId: string;
  shopId: string | null;
  uploadedBy: string | null;
  bucket: VehicleMediaBucket;
  type: VehicleMediaKind;
  file: File;
  /** Override the stored filename (defaults to file.name). */
  filename?: string;
}): Promise<UploadVehicleMediaResult> {
  const { supabase, vehicleId, shopId, uploadedBy, bucket, type, file } =
    params;

  const displayName = params.filename ?? file.name;
  const safeName = displayName.replaceAll("/", "_");
  const storagePath = `${vehicleId}/${Date.now()}_${safeName}`;

  const uploaded = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploaded.error) {
    return { ok: false, error: uploaded.error.message };
  }

  const { data, error: rowErr } = await supabase
    .from("vehicle_media")
    .insert({
      vehicle_id: vehicleId,
      type,
      storage_path: storagePath,
      filename: displayName,
      uploaded_by: uploadedBy,
      shop_id: shopId,
    })
    .select("id")
    .single();

  if (rowErr || !data) {
    return { ok: false, error: rowErr?.message ?? "Failed to record upload." };
  }

  return { ok: true, id: data.id, storagePath };
}
