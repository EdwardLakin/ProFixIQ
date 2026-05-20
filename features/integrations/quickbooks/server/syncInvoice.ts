import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DB,
  InvoiceRow,
  WorkOrderRow,
  QuickBooksConnectionRow,
} from "../types";
import type { Json } from "@shared/types/types/supabase";
import { quickBooksFetch } from "./http";
import { ensureQuickBooksCustomer } from "./syncCustomer";
import { mapInvoiceToQuickBooksPayload } from "./mapInvoice";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";

type QuickBooksItemEntity = {
  Id: string;
  Name?: string;
  SyncToken?: string;
};

type QuickBooksInvoiceEntity = {
  Id: string;
  SyncToken?: string;
  DocNumber?: string;
};

type QuickBooksItemQueryResponse = {
  QueryResponse?: {
    Item?: QuickBooksItemEntity[];
  };
};

type QuickBooksItemCreateResponse = {
  Item?: QuickBooksItemEntity;
};

type QuickBooksInvoiceCreateResponse = {
  Invoice?: QuickBooksInvoiceEntity;
};

async function logSyncEvent(
  supabase: SupabaseClient<DB>,
  payload: DB["public"]["Tables"]["quickbooks_sync_events"]["Insert"],
) {
  await supabase.from("quickbooks_sync_events").insert(payload);
}

async function ensureQuickBooksSalesItem(
  connection: QuickBooksConnectionRow,
): Promise<string> {
  const itemName = "ProFixIQ Service";

  const query = `select * from Item where Name = '${itemName.replace(/'/g, "\\'")}' maxresults 1`;
  const queryResponse = await quickBooksFetch<QuickBooksItemQueryResponse>(
    connection,
    `/query?query=${encodeURIComponent(query)}`,
    { method: "GET" },
  );

  const found = queryResponse?.QueryResponse?.Item?.[0];
  if (found?.Id) return found.Id;

  const created = await quickBooksFetch<QuickBooksItemCreateResponse>(
    connection,
    "/item",
    {
      method: "POST",
      body: JSON.stringify({
        Name: itemName,
        Type: "Service",
        IncomeAccountRef: {
          value: "1",
        },
      }),
    },
  );

  const createdId = created?.Item?.Id ?? "";
  if (!createdId) {
    throw new Error("Failed to create QuickBooks service item.");
  }

  return createdId;
}

export async function syncInvoiceToQuickBooks(
  supabase: SupabaseClient<DB>,
  connection: QuickBooksConnectionRow,
  invoiceId: string,
  actorId?: string,
): Promise<{
  qbInvoiceId: string;
  docNumber: string | null;
  alreadySynced: boolean;
}> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || "Invoice not found.");
  }

  if (!invoice.customer_id) {
    throw new Error("Invoice is missing customer_id.");
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", invoice.customer_id)
    .single();

  if (customerError || !customer) {
    throw new Error(customerError?.message || "Customer not found.");
  }

  const { data: workOrder } = invoice.work_order_id
    ? await supabase
        .from("work_orders")
        .select("id, custom_id")
        .eq("id", invoice.work_order_id)
        .maybeSingle()
    : { data: null as Pick<WorkOrderRow, "id" | "custom_id"> | null };

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("invoice_id", invoice.id)
    .maybeSingle();

  if (existingLinkError) {
    throw new Error(existingLinkError.message);
  }

  if (existingLink?.qb_invoice_id && existingLink.sync_status === "synced") {
    return {
      qbInvoiceId: existingLink.qb_invoice_id,
      docNumber: existingLink.qb_doc_number,
      alreadySynced: true,
    };
  }

  await logSyncEvent(supabase, {
    shop_id: invoice.shop_id,
    connection_id: connection.id,
    entity_type: "invoice",
    entity_id: invoice.id,
    action: "sync_invoice",
    status: "started",
    created_by: actorId ?? null,
    request_payload: { invoiceId: invoice.id } as Json,
  });

  try {
    const { qbCustomerId } = await ensureQuickBooksCustomer(
      supabase,
      connection,
      customer,
    );

    const qbSalesItemId = await ensureQuickBooksSalesItem(connection);

    const snapshot = invoice.work_order_id
      ? await getInvoiceSnapshotForWorkOrder({
          supabase: supabase as SupabaseClient<DB>,
          workOrderId: invoice.work_order_id,
        })
      : null;
    const canonicalInvoice = {
      ...(invoice as Pick<
        InvoiceRow,
        | "id"
        | "invoice_number"
        | "issued_at"
        | "due_date"
        | "notes"
        | "labor_cost"
        | "parts_cost"
        | "discount_total"
        | "tax_total"
        | "total"
        | "work_order_id"
      >),
      labor_cost: snapshot?.laborCost ?? invoice.labor_cost,
      parts_cost: snapshot?.partsCost ?? invoice.parts_cost,
      discount_total: snapshot?.discountTotal ?? invoice.discount_total,
      tax_total: snapshot?.taxTotal ?? invoice.tax_total,
      total: snapshot?.total ?? invoice.total,
    };
    const payload = mapInvoiceToQuickBooksPayload({
      invoice: canonicalInvoice,
      workOrder,
      qbCustomerId,
      qbSalesItemId,
    });

    const created = await quickBooksFetch<QuickBooksInvoiceCreateResponse>(
      connection,
      "/invoice",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const qbInvoiceId = created?.Invoice?.Id ?? "";
    const qbSyncToken = created?.Invoice?.SyncToken ?? null;
    const docNumber =
      created?.Invoice?.DocNumber ?? invoice.invoice_number ?? null;

    if (!qbInvoiceId) {
      throw new Error(
        "QuickBooks invoice creation did not return an invoice id.",
      );
    }

    const upsertPayload: DB["public"]["Tables"]["quickbooks_invoice_links"]["Insert"] =
      {
        shop_id: invoice.shop_id,
        invoice_id: invoice.id,
        work_order_id: invoice.work_order_id,
        qb_invoice_id: qbInvoiceId,
        qb_doc_number: docNumber,
        qb_sync_token: qbSyncToken,
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
        last_error: null,
        metadata: {},
      };

    const { error: upsertError } = await supabase
      .from("quickbooks_invoice_links")
      .upsert(upsertPayload, { onConflict: "invoice_id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    await supabase
      .from("quickbooks_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", connection.id);

    await logSyncEvent(supabase, {
      shop_id: invoice.shop_id,
      connection_id: connection.id,
      entity_type: "invoice",
      entity_id: invoice.id,
      action: "sync_invoice",
      status: "succeeded",
      created_by: actorId ?? null,
      request_payload: payload as Json,
      response_payload: {
        qbInvoiceId,
        docNumber,
      } as Json,
    });

    return {
      qbInvoiceId,
      docNumber,
      alreadySynced: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "QuickBooks invoice sync failed.";

    try {
      const errorPayload: DB["public"]["Tables"]["quickbooks_invoice_links"]["Insert"] =
        {
          shop_id: invoice.shop_id,
          invoice_id: invoice.id,
          work_order_id: invoice.work_order_id,
          qb_invoice_id: `error-${invoice.id}`,
          sync_status: "error",
          last_synced_at: new Date().toISOString(),
          last_error: message,
          metadata: {},
        };

      await supabase
        .from("quickbooks_invoice_links")
        .upsert(errorPayload, {
          onConflict: "invoice_id",
          ignoreDuplicates: false,
        });
    } catch {
      // swallow secondary persistence error
    }

    try {
      await supabase
        .from("quickbooks_connections")
        .update({
          last_error: message,
        })
        .eq("id", connection.id);
    } catch {
      // swallow secondary persistence error
    }

    await logSyncEvent(supabase, {
      shop_id: invoice.shop_id,
      connection_id: connection.id,
      entity_type: "invoice",
      entity_id: invoice.id,
      action: "sync_invoice",
      status: "failed",
      created_by: actorId ?? null,
      error_message: message,
    });

    throw error;
  }
}
