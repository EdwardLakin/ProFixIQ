import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export type DB = Database;

export type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
export type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
export type ShopRow = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "slug" | "timezone"
>;

export type PortalCustomer = Pick<
  CustomerRow,
  "id" | "user_id" | "shop_id" | "first_name" | "last_name" | "email" | "phone"
>;

/**
 * Work order fields visible to the customer portal
 */
export type PortalWorkOrder = Pick<
  WorkOrderRow,
  | "id"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "status"
  | "approval_state"
  | "is_waiter"
  | "notes"
  | "created_at"
  | "updated_at"
  | "custom_id"
  | "invoice_sent_at"
  | "invoice_last_sent_to"
  | "invoice_pdf_url"
  | "invoice_url"
  | "invoice_total"
  | "labor_total"
  | "parts_total"
  | "intake_json"
  | "intake_status"
  | "intake_submitted_at"
  | "intake_submitted_by"
>;

export function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function asIsoOrThrow(iso: string, label: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
  return d.toISOString();
}

/**
 * Ensure the Supabase session has a valid user
 */
export async function requireAuthedUser(
  supabase: SupabaseClient<DB>,
): Promise<{ id: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(error?.message || "Not authenticated");
  }

  return { id: user.id };
}

/**
 * Ensure the logged-in user has a matching customer record
 */
export async function requirePortalCustomer(
  supabase: SupabaseClient<DB>,
  userId: string,
): Promise<PortalCustomer> {
  const { data, error } = await supabase
    .from("customers")
    .select("id,user_id,shop_id,first_name,last_name,email,phone")
    .eq("user_id", userId)
    .maybeSingle<PortalCustomer>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer profile not found for this user");

  return data;
}

/**
 * Verify the work order belongs to the authenticated customer
 */
export async function requireWorkOrderOwnedByCustomer(
  supabase: SupabaseClient<DB>,
  workOrderId: string,
  customerId: string,
): Promise<PortalWorkOrder> {
  const { data, error } = await supabase
    .from("work_orders")
    .select(
      [
        "id",
        "shop_id",
        "customer_id",
        "vehicle_id",
        "status",
        "approval_state",
        "is_waiter",
        "notes",
        "created_at",
        "updated_at",
        "custom_id",
        "invoice_sent_at",
        "invoice_last_sent_to",
        "invoice_pdf_url",
        "invoice_url",
        "invoice_total",
        "labor_total",
        "parts_total",
        "intake_json",
        "intake_status",
        "intake_submitted_at",
        "intake_submitted_by",
      ].join(","),
    )
    .eq("id", workOrderId)
    .eq("customer_id", customerId)
    .maybeSingle<PortalWorkOrder>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Work order not found or not owned by this customer");

  return data;
}

/**
 * Optional helper specifically for intake routes
 * (Same validation, but clearer intent)
 */
export async function requireCustomerWorkOrderForIntake(
  supabase: SupabaseClient<DB>,
  workOrderId: string,
  customerId: string,
): Promise<PortalWorkOrder> {
  return requireWorkOrderOwnedByCustomer(supabase, workOrderId, customerId);
}

/**
 * Load shop by slug (portal routing)
 */
export async function requireShopBySlug(
  supabase: SupabaseClient<DB>,
  shopSlug: string,
): Promise<ShopRow> {
  const { data, error } = await supabase
    .from("shops")
    .select("id,slug,timezone")
    .eq("slug", shopSlug)
    .maybeSingle<ShopRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Shop not found");

  return data;
}