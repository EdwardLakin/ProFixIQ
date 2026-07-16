import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export type DB = Database;

export type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
export type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
export type ShopRow = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "slug" | "timezone"
>;

type CustomerPortalInviteRow =
  DB["public"]["Tables"]["customer_portal_invites"]["Row"];

export type PortalCustomer = Pick<
  CustomerRow,
  "id" | "user_id" | "shop_id" | "first_name" | "last_name" | "email" | "phone"
>;

export type PortalInviteEvidence = Pick<
  CustomerPortalInviteRow,
  "id" | "customer_id" | "email" | "accepted_at" | "accepted_by_user_id" | "revoked_at"
>;

export class PortalAccessError extends Error {
  status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "PortalAccessError";
    this.status = status;
  }
}

export type PortalCustomerAccess = {
  user: { id: string; email: string };
  customer: PortalCustomer;
  inviteEvidence: PortalInviteEvidence;
};

export function nonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function asIsoOrThrow(iso: string, label: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
  return d.toISOString();
}

export async function requireAuthedUser(
  supabase: SupabaseClient<DB>,
): Promise<{ id: string; email: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new PortalAccessError(error?.message || "Not authenticated", 401);
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    throw new PortalAccessError("Not authenticated", 401);
  }

  return { id: user.id, email };
}

export async function requirePortalCustomerAccess(
  supabase: SupabaseClient<DB>,
  userId: string,
  userEmail: string,
): Promise<PortalCustomerAccess> {
  const { data, error } = await supabase
    .from("customers")
    .select("id,user_id,shop_id,first_name,last_name,email,phone")
    .eq("user_id", userId)
    .maybeSingle<PortalCustomer>();

  if (error) throw new Error(error.message);
  if (!data) throw new PortalAccessError("Customer profile not found for this user", 403);

  const { data: invites, error: invitesErr } = await supabase
    .from("customer_portal_invites")
    .select("id,customer_id,email,accepted_at,accepted_by_user_id,revoked_at")
    .eq("customer_id", data.id)
    .eq("accepted_by_user_id", userId)
    .not("accepted_at", "is", null)
    .is("revoked_at", null)
    .limit(20)
    .returns<PortalInviteEvidence[]>();

  if (invitesErr) throw new Error(invitesErr.message);

  const inviteEvidence = (invites ?? []).find(
    (row) =>
      row.customer_id === data.id &&
      row.accepted_by_user_id === userId &&
      Boolean(row.accepted_at) &&
      !row.revoked_at &&
      row.email.trim().toLowerCase() === userEmail,
  );

  if (!inviteEvidence) {
    throw new PortalAccessError("Portal invite required", 403);
  }

  return {
    user: { id: userId, email: userEmail },
    customer: data,
    inviteEvidence,
  };
}

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
  if (!data) throw new PortalAccessError("Customer profile not found for this user", 403);

  return data;
}

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

export async function requireCustomerWorkOrderForIntake(
  supabase: SupabaseClient<DB>,
  workOrderId: string,
  customerId: string,
): Promise<PortalWorkOrder> {
  return requireWorkOrderOwnedByCustomer(supabase, workOrderId, customerId);
}

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
