"use server";
import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function ensureMainLocation(shopId: string) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId)
    .eq("code", "MAIN")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: cerr } = await supabase
    .from("stock_locations")
    .insert({ shop_id: shopId, code: "MAIN", name: "Main Stock" })
    .select("id, code, name")
    .single();
  if (cerr) throw cerr;
  return created;
}

export async function listLocations(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId)
    .order("code");
  if (error) throw error;
  return data ?? [];
}

export async function createLocation(input: { shop_id: string; code: string; name: string }) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
