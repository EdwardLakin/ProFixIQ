// lib/parts/searchParts.ts

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/supabase";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Search parts by keyword (fuzzy match on name, description, sku, or supplier).
 */
export async function searchPartsByKeyword(keyword: string): Promise<string[]> {
  if (!keyword || keyword.length < 2) return [];

  const { data, error } = await supabase
    .from("parts")
    .select("name")
    .or(
      `name.ilike.%${keyword}%,description.ilike.%${keyword}%,sku.ilike.%${keyword}%,supplier.ilike.%${keyword}%`,
    )
    .limit(10);

  if (error) {
    console.error("Part search error:", error.message);
    return [];
  }

  return data?.map((part) => part.name) ?? [];
}
