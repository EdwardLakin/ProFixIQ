"use server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function ensureMainLocation(shopId: string) {
  const supabase = createServerSupabaseRoute();
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
  const supabase = createServerSupabaseRSC();
  const { data, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId)
    .order("code");
  if (error) throw error;
  return data ?? [];
}

/** Existing contract retained for callers outside Parts → Inventory. */
export async function createLocation(input: { shop_id: string; code: string; name: string }) {
  const supabase = createServerSupabaseRoute();
  const { data, error } = await supabase
    .from("stock_locations")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

type StockLocationClient = ReturnType<typeof createServerSupabaseRoute>;

async function findOrCreateInventoryMainLocation(
  supabase: StockLocationClient,
  shopId: string,
) {
  const { data: locations, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId);
  if (error) throw error;

  const existing = (locations ?? []).find(
    (location) => (location.code ?? "").trim().toUpperCase() === "MAIN",
  );
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("stock_locations")
    .insert({ shop_id: shopId, code: "MAIN", name: "Main Stock" })
    .select("id, code, name")
    .single();
  if (!createError) return created;

  // Another request may have seeded MAIN between the read and insert.
  if (createError.code === "23505") {
    const { data: refreshed, error: refreshError } = await supabase
      .from("stock_locations")
      .select("id, code, name")
      .eq("shop_id", shopId);
    if (refreshError) throw refreshError;
    const raced = (refreshed ?? []).find(
      (location) => (location.code ?? "").trim().toUpperCase() === "MAIN",
    );
    if (raced) return raced;
  }

  throw createError;
}

/** Additive default path used only by the inventory page. */
export async function ensureInventoryMainLocation() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) {
    if (access.response.status >= 500) {
      throw new Error("Stock locations could not be prepared.");
    }
    return null;
  }

  return findOrCreateInventoryMainLocation(access.supabase, access.profile.shop_id);
}

/** Authorized, tenant-derived mutation for the new inventory manager. */
export async function createInventoryLocation(input: {
  shop_id: string;
  code: string;
  name: string;
}) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageParts",
  });
  if (!access.ok) {
    throw new Error(
      access.response.status === 401
        ? "Not authenticated."
        : "Not authorized to manage parts.",
    );
  }

  const shopId = access.profile.shop_id;
  if (input.shop_id !== shopId) {
    throw new Error("Stock location shop does not match the signed-in shop.");
  }

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new Error("Location code and name are required.");

  const { data, error } = await access.supabase
    .from("stock_locations")
    .insert({ shop_id: shopId, code, name })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
