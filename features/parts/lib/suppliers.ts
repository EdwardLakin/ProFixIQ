"use server";
import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function listSuppliers(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, is_active")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(input: { shop_id: string; name: string; email?: string; phone?: string }) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("suppliers")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
