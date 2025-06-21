import { createServerSupabaseClient } from "@/lib/utils/supabase/server";
import type { Database } from "@/types/supabase";

type InspectionInput = {
  inspectionId: string;
  vehicleId: string;
  items: {
    itemId: string;
    status: "good" | "fail" | "recommend" | "na";
    notes?: string;
    measurement?: string;
  }[];
  photos?: string[];
};

export async function saveInspection(input: InspectionInput) {
  const supabase = createServerSupabaseClient();

  // Update inspection items
  const { data, error } = await supabase
    .from("inspection_items")
    .upsert(
      input.items.map((item) => ({
        inspection_id: input.inspectionId,
        item_id: item.itemId,
        status: item.status,
        notes: item.notes || "",
        measurement: item.measurement || "",
      })),
      { onConflict: "inspection_id,item_id" }
    );

  if (error) {
    console.error("Error saving inspection items:", error.message);
    throw new Error("Failed to save inspection items");
  }

  // Upload any photos
  if (input.photos?.length) {
    const { error: photoError } = await supabase
      .from("inspection_photos")
      .insert(
        input.photos.map((url) => ({
          inspection_id: input.inspectionId,
          photo_url: url,
        }))
      );

    if (photoError) {
      console.error("Photo upload error:", photoError.message);
      throw new Error("Failed to save inspection photos");
    }
  }

  return data;
}