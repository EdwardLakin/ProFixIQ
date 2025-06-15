// src/lib/menuItems.ts
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/supabase";

const supabase = createBrowserClient<Database>();

export async function searchMenuItems(
  keyword: string,
  vehicle?: { year?: string; make?: string; model?: string },
) {
  let query = supabase
    .from("menu_items")
    .select("*")
    .ilike("complaint", `%${keyword}%`);

  if (vehicle?.make) query = query.ilike("vehicle_make", vehicle.make);
  if (vehicle?.model) query = query.ilike("vehicle_model", vehicle.model);
  if (vehicle?.year) query = query.eq("vehicle_year", vehicle.year);

  const { data, error } = await query.limit(5);

  if (error) {
    console.error("Error fetching menu items:", error);
    return [];
  }

  return data;
}
