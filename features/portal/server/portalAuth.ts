import type { Database } from "@shared/types/types/supabase";

export type DB = Database;

export type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
export type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
export type ShopRow = Pick<DB["public"]["Tables"]["shops"]["Row"], "id" | "slug" | "timezone">;

export function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function asIsoOrThrow(iso: string, label: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
  return d.toISOString();
}

export async function requireAuthedUser(
  supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> } },
): Promise<{ id: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const msg = error?.message || "Not authenticated";
    throw new Error(msg);
  }

  return { id: user.id };
}

export async function requirePortalCustomer(
  supabase: {
    from: (t: "customers") => {
      select: (cols: string) => any;
    };
  },
  userId: string,
): Promise<CustomerRow> {
  const { data, error } = await (supabase as any)
    .from("customers")
    .select("id,user_id,shop_id,first_name,last_name,email,phone")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer profile not found for this user");

  return data as CustomerRow;
}

export async function requireWorkOrderOwnedByCustomer(
  supabase: {
    from: (t: "work_orders") => {
      select: (cols: string) => any;
    };
  },
  workOrderId: string,
  customerId: string,
): Promise<WorkOrderRow> {
  const { data, error } = await (supabase as any)
    .from("work_orders")
    .select("id,shop_id,customer_id,vehicle_id,status,approval_state,is_waiter,notes,created_at,updated_at")
    .eq("id", workOrderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Work order not found or not owned by this customer");

  return data as WorkOrderRow;
}

export async function requireShopBySlug(
  supabase: {
    from: (t: "shops") => {
      select: (cols: string) => any;
    };
  },
  shopSlug: string,
): Promise<ShopRow> {
  const { data, error } = await (supabase as any)
    .from("shops")
    .select("id,slug,timezone")
    .eq("slug", shopSlug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Shop not found");

  return data as ShopRow;
}
