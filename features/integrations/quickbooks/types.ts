import type { Database } from "@shared/types/types/supabase";

export type DB = Database;

export type QuickBooksConnectionRow =
  DB["public"]["Tables"]["quickbooks_connections"]["Row"];

export type QuickBooksCustomerLinkRow =
  DB["public"]["Tables"]["quickbooks_customer_links"]["Row"];

export type QuickBooksInvoiceLinkRow =
  DB["public"]["Tables"]["quickbooks_invoice_links"]["Row"];

export type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
export type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
export type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
export type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
export type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

export type QuickBooksStatusResponse = {
  ok: boolean;
  connected: boolean;
  connection?: {
    id: string;
    realmId: string;
    environment: "sandbox" | "production";
    connectedAt: string;
    isActive: boolean;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
  error?: string;
};

export type QuickBooksConnectResponse = {
  ok: boolean;
  authorizeUrl?: string;
  error?: string;
};

export type QuickBooksSyncResponse = {
  ok: boolean;
  invoiceId?: string;
  quickbooksInvoiceId?: string;
  docNumber?: string | null;
  alreadySynced?: boolean;
  error?: string;
};