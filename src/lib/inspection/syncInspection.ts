import { createServerSupabaseClient } from "@/lib/utils/supabase/server";
import { Database } from "@/types/supabase";
import { cookies } from "next/headers";

const supabase = createServerSupabaseClient<Database>({ cookies });

export async function syncInspectionDraft({
  inspectionId,
  userId,
  vehicleId,
  draft,
}: {
  inspectionId: string;
  userId: string;
  vehicleId: string;
  draft: Record<string, any>;
}) {
  const { data, error } = await supabase
    .from("inspections")
    .upsert(
      [
        {
          id: inspectionId,
          user_id: userId,
          vehicle_id: vehicleId,
          draft_json: draft,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" }
    )
    .select();

  if (error) throw error;
  return data?.[0];
}