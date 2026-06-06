"use server";
import { createServerSupabaseRSC, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function listSuppliers(shopId: string) {
  const supabase = createServerSupabaseRSC();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, is_active")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(input: { shop_id: string; name: string; email?: string; phone?: string }) {
  const supabase = createServerSupabaseRoute();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
