import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB, CustomerRow, QuickBooksConnectionRow } from "../types";
import { mapCustomerToQuickBooksPayload, getQuickBooksCustomerDisplayName } from "./mapCustomer";
import { quickBooksFetch } from "./http";

type QuickBooksCustomerEntity = {
  Id: string;
  SyncToken?: string;
  DisplayName?: string;
};

type QuickBooksCustomerQueryResponse = {
  QueryResponse?: {
    Customer?: QuickBooksCustomerEntity[];
  };
};

type QuickBooksCustomerCreateResponse = {
  Customer?: QuickBooksCustomerEntity;
};

export async function ensureQuickBooksCustomer(
  supabase: SupabaseClient<DB>,
  connection: QuickBooksConnectionRow,
  customer: Pick<
    CustomerRow,
    | "id"
    | "shop_id"
    | "business_name"
    | "name"
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "phone_number"
    | "street"
    | "city"
    | "province"
    | "postal_code"
    | "notes"
  >,
): Promise<{ qbCustomerId: string; qbSyncToken: string | null }> {
  const { data: existingLink, error: linkError } = await supabase
    .from("quickbooks_customer_links")
    .select("*")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (linkError) {
    throw new Error(linkError.message);
  }

  if (existingLink?.qb_customer_id) {
    return {
      qbCustomerId: existingLink.qb_customer_id,
      qbSyncToken: existingLink.qb_sync_token,
    };
  }

  const displayName = getQuickBooksCustomerDisplayName(customer);

  const query = `select * from Customer where DisplayName = '${displayName.replace(/'/g, "\\'")}' maxresults 1`;
  const queryResponse = await quickBooksFetch<QuickBooksCustomerQueryResponse>(
    connection,
    `/query?query=${encodeURIComponent(query)}`,
    { method: "GET" },
  );

  const found = queryResponse?.QueryResponse?.Customer?.[0];

  let qbCustomerId = found?.Id ?? "";
  let qbSyncToken = found?.SyncToken ?? null;

  if (!qbCustomerId) {
    const createPayload = mapCustomerToQuickBooksPayload(customer);

    const created = await quickBooksFetch<QuickBooksCustomerCreateResponse>(
      connection,
      "/customer",
      {
        method: "POST",
        body: JSON.stringify(createPayload),
      },
    );

    qbCustomerId = created?.Customer?.Id ?? "";
    qbSyncToken = created?.Customer?.SyncToken ?? null;
  }

  if (!qbCustomerId) {
    throw new Error("QuickBooks customer sync did not return a customer id.");
  }

  const payload: DB["public"]["Tables"]["quickbooks_customer_links"]["Insert"] = {
    shop_id: customer.shop_id as string,
    customer_id: customer.id,
    qb_customer_id: qbCustomerId,
    qb_sync_token: qbSyncToken,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
    last_error: null,
    metadata: {},
  };

  const { error: upsertError } = await supabase
    .from("quickbooks_customer_links")
    .upsert(payload, { onConflict: "customer_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return { qbCustomerId, qbSyncToken };
}