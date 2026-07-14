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
import {
  getInvoiceVersionById,
  getLatestCustomerVisibleInvoiceVersion,
} from "@/features/invoices/server/invoiceVersionQueries";

type QuickBooksItemEntity = { Id: string; Name?: string; SyncToken?: string };
type QuickBooksInvoiceEntity = { Id: string; SyncToken?: string; DocNumber?: string };
type QuickBooksItemQueryResponse = { QueryResponse?: { Item?: QuickBooksItemEntity[] } };
type QuickBooksItemCreateResponse = { Item?: QuickBooksItemEntity };
type QuickBooksInvoiceCreateResponse = { Invoice?: QuickBooksInvoiceEntity };
type QuickBooksInvoiceQueryResponse = { QueryResponse?: { Invoice?: QuickBooksInvoiceEntity[] } };

async function logSyncEvent(
  supabase: SupabaseClient<DB>,
  payload: DB["public"]["Tables"]["quickbooks_sync_events"]["Insert"],
) {
  await supabase.from("quickbooks_sync_events").insert(payload);
}

async function ensureQuickBooksSalesItem(connection: QuickBooksConnectionRow): Promise<string> {
  const itemName = "ProFixIQ Service";
  const query = `select * from Item where Name = '${itemName.replace(/'/g, "\\'")}' maxresults 1`;
  const existing = await quickBooksFetch<QuickBooksItemQueryResponse>(
    connection,
    `/query?query=${encodeURIComponent(query)}`,
    { method: "GET" },
  );
  const found = existing?.QueryResponse?.Item?.[0];
  if (found?.Id) return found.Id;

  const created = await quickBooksFetch<QuickBooksItemCreateResponse>(connection, "/item", {
    method: "POST",
    body: JSON.stringify({
      Name: itemName,
      Type: "Service",
      IncomeAccountRef: { value: "1" },
    }),
  });
  if (!created?.Item?.Id) throw new Error("Failed to create QuickBooks service item.");
  return created.Item.Id;
}

async function findQuickBooksInvoiceByDocNumber(
  connection: QuickBooksConnectionRow,
  docNumber: string,
): Promise<QuickBooksInvoiceEntity | null> {
  const escaped = docNumber.replace(/'/g, "\\'");
  const query = `select * from Invoice where DocNumber = '${escaped}' maxresults 1`;
  const result = await quickBooksFetch<QuickBooksInvoiceQueryResponse>(
    connection,
    `/query?query=${encodeURIComponent(query)}`,
    { method: "GET" },
  );
  return result?.QueryResponse?.Invoice?.[0] ?? null;
}

export async function syncInvoiceToQuickBooks(
  supabase: SupabaseClient<DB>,
  connection: QuickBooksConnectionRow,
  invoiceId: string,
  actorId?: string,
  expectedShopId?: string,
): Promise<{ qbInvoiceId: string; docNumber: string | null; alreadySynced: boolean }> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message || "Invoice not found.");
  }
  if (expectedShopId && invoice.shop_id !== expectedShopId) {
    throw new Error("Invoice does not belong to the active shop.");
  }

  const invoiceStatus = String(invoice.status ?? "").trim().toLowerCase();
  if (!["issued", "partially_paid", "paid"].includes(invoiceStatus)) {
    throw new Error("Only finalized payable invoice states can be exported to QuickBooks.");
  }
  if (!invoice.customer_id) throw new Error("Invoice is missing customer_id.");
  if (!invoice.work_order_id) throw new Error("Invoice is missing work_order_id.");

  const versionId = (invoice as typeof invoice & { active_invoice_version_id?: string | null })
    .active_invoice_version_id;
  const invoiceVersion = versionId
    ? await getInvoiceVersionById({
        supabase,
        invoiceVersionId: versionId,
        shopId: invoice.shop_id,
        workOrderId: invoice.work_order_id,
      })
    : await getLatestCustomerVisibleInvoiceVersion({
        supabase,
        shopId: invoice.shop_id,
        workOrderId: invoice.work_order_id,
      });
  if (!invoiceVersion) throw new Error("Invoice has no immutable issued version.");
  if (!["issued", "partially_paid", "paid"].includes(invoiceVersion.lifecycle_status)) {
    throw new Error("Invoice version is not eligible for accounting export.");
  }

  const [{ data: customer, error: customerError }, { data: workOrder }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", invoice.customer_id).single(),
    supabase
      .from("work_orders")
      .select("id,custom_id")
      .eq("id", invoice.work_order_id)
      .maybeSingle<Pick<WorkOrderRow, "id" | "custom_id">>(),
  ]);
  if (customerError || !customer) {
    throw new Error(customerError?.message || "Customer not found.");
  }

  const links = supabase as unknown as {
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          maybeSingle<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      upsert(
        payload: Record<string, unknown>,
        options: { onConflict: string },
      ): Promise<{ error: { message: string } | null }>;
    };
  };

  const { data: existingLink, error: existingLinkError } = await links
    .from("quickbooks_invoice_links")
    .select("*")
    .eq("invoice_version_id", invoiceVersion.id)
    .maybeSingle<{
      qb_invoice_id: string | null;
      qb_doc_number: string | null;
      sync_status: string | null;
      operation_key: string | null;
    }>();
  if (existingLinkError) throw new Error(existingLinkError.message);
  if (existingLink?.qb_invoice_id && existingLink.sync_status === "synced") {
    return {
      qbInvoiceId: existingLink.qb_invoice_id,
      docNumber: existingLink.qb_doc_number,
      alreadySynced: true,
    };
  }

  const docNumber =
    invoice.invoice_number?.trim() ||
    `PF-${invoiceVersion.version_number}-${invoiceVersion.id.replaceAll("-", "").slice(0, 8)}`;
  const operationKey = `quickbooks-invoice:${connection.id}:${invoiceVersion.id}`;

  await logSyncEvent(supabase, {
    shop_id: invoice.shop_id,
    connection_id: connection.id,
    entity_type: "invoice_version",
    entity_id: invoiceVersion.id,
    action: "sync_invoice",
    status: "started",
    created_by: actorId ?? null,
    request_payload: {
      invoiceId: invoice.id,
      invoiceVersionId: invoiceVersion.id,
      operationKey,
    } as Json,
  });

  try {
    await links.from("quickbooks_invoice_links").upsert(
      {
        shop_id: invoice.shop_id,
        invoice_id: invoice.id,
        invoice_version_id: invoiceVersion.id,
        work_order_id: invoice.work_order_id,
        qb_invoice_id: existingLink?.qb_invoice_id || `pending-${invoiceVersion.id}`,
        qb_doc_number: docNumber,
        sync_status: "pending",
        operation_key: operationKey,
        external_request_id: docNumber,
        last_error: null,
        metadata: { invoice_version_id: invoiceVersion.id },
      },
      { onConflict: "invoice_version_id" },
    );

    const { qbCustomerId } = await ensureQuickBooksCustomer(supabase, connection, customer);
    const qbSalesItemId = await ensureQuickBooksSalesItem(connection);
    const snapshot = invoiceVersion.snapshot;
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
      invoice_number: docNumber,
      issued_at: invoiceVersion.issued_at,
      labor_cost: snapshot.laborCost ?? 0,
      parts_cost: snapshot.partsCost ?? 0,
      discount_total: snapshot.discountTotal ?? 0,
      tax_total: snapshot.taxTotal ?? 0,
      total: invoiceVersion.total,
    };
    const payload = mapInvoiceToQuickBooksPayload({
      invoice: canonicalInvoice,
      workOrder,
      qbCustomerId,
      qbSalesItemId,
    });

    let quickBooksInvoice = await findQuickBooksInvoiceByDocNumber(connection, docNumber);
    let alreadySynced = Boolean(quickBooksInvoice?.Id);
    if (!quickBooksInvoice?.Id) {
      const created = await quickBooksFetch<QuickBooksInvoiceCreateResponse>(
        connection,
        "/invoice",
        { method: "POST", body: JSON.stringify({ ...payload, DocNumber: docNumber }) },
      );
      quickBooksInvoice = created?.Invoice ?? null;
      alreadySynced = false;
    }
    if (!quickBooksInvoice?.Id) {
      throw new Error("QuickBooks invoice creation did not return an invoice id.");
    }

    const { error: linkError } = await links.from("quickbooks_invoice_links").upsert(
      {
        shop_id: invoice.shop_id,
        invoice_id: invoice.id,
        invoice_version_id: invoiceVersion.id,
        work_order_id: invoice.work_order_id,
        qb_invoice_id: quickBooksInvoice.Id,
        qb_doc_number: quickBooksInvoice.DocNumber ?? docNumber,
        qb_sync_token: quickBooksInvoice.SyncToken ?? null,
        sync_status: "synced",
        operation_key: operationKey,
        external_request_id: docNumber,
        last_synced_at: new Date().toISOString(),
        last_error: null,
        metadata: { invoice_version_id: invoiceVersion.id },
      },
      { onConflict: "invoice_version_id" },
    );
    if (linkError) throw new Error(linkError.message);

    await supabase
      .from("quickbooks_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", connection.id);

    await logSyncEvent(supabase, {
      shop_id: invoice.shop_id,
      connection_id: connection.id,
      entity_type: "invoice_version",
      entity_id: invoiceVersion.id,
      action: "sync_invoice",
      status: "succeeded",
      created_by: actorId ?? null,
      request_payload: payload as Json,
      response_payload: {
        qbInvoiceId: quickBooksInvoice.Id,
        docNumber: quickBooksInvoice.DocNumber ?? docNumber,
        recoveredExisting: alreadySynced,
      } as Json,
    });

    return {
      qbInvoiceId: quickBooksInvoice.Id,
      docNumber: quickBooksInvoice.DocNumber ?? docNumber,
      alreadySynced,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks invoice sync failed.";
    await links.from("quickbooks_invoice_links").upsert(
      {
        shop_id: invoice.shop_id,
        invoice_id: invoice.id,
        invoice_version_id: invoiceVersion.id,
        work_order_id: invoice.work_order_id,
        qb_invoice_id: existingLink?.qb_invoice_id || `pending-${invoiceVersion.id}`,
        qb_doc_number: docNumber,
        sync_status: "error",
        operation_key: operationKey,
        external_request_id: docNumber,
        last_synced_at: new Date().toISOString(),
        last_error: message,
        metadata: { invoice_version_id: invoiceVersion.id },
      },
      { onConflict: "invoice_version_id" },
    );
    await supabase
      .from("quickbooks_connections")
      .update({ last_error: message })
      .eq("id", connection.id);
    await logSyncEvent(supabase, {
      shop_id: invoice.shop_id,
      connection_id: connection.id,
      entity_type: "invoice_version",
      entity_id: invoiceVersion.id,
      action: "sync_invoice",
      status: "failed",
      created_by: actorId ?? null,
      error_message: message,
    });
    throw error;
  }
}
