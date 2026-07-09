export type InvoiceImportRow = {
  invoice_id?: string | null;
  imported_invoice_id?: string | null;
  invoice_number?: string | null;
  work_order_number?: string | null;
  customer_id?: string | null;
  external_id?: string | null;
  customer_number?: string | null;
  customerid?: string | null;
  customernumber?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  customer?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  vehicle_id?: string | null;
  vehicle_external_id?: string | null;
  vehicle_number?: string | null;
  vehicleid?: string | null;
  vehiclenumber?: string | null;
  vin?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
  status?: string | null;
  payment_status?: string | null;
  service_category?: string | null;
  description?: string | null;
  labor_hours?: string | null;
  labor_total?: string | null;
  parts_total?: string | null;
  shop_supplies?: string | null;
  subtotal?: string | null;
  tax?: string | null;
  total?: string | null;
  amount_paid?: string | null;
  balance_due?: string | null;
  advisor?: string | null;
  technician?: string | null;
  notes?: string | null;
  source_system?: string | null;
};

export const INVOICE_IMPORT_SUPPORTED_COLUMNS = [
  "invoice_id",
  "imported_invoice_id",
  "invoice_number",
  "work_order_number",
  "customer_id",
  "external_id",
  "customer_number",
  "customerid",
  "customernumber",
  "customer_email",
  "customer_phone",
  "customer_name",
  "customer",
  "email",
  "phone",
  "name",
  "vehicle_id",
  "vehicle_external_id",
  "vehicle_number",
  "vehicleid",
  "vehiclenumber",
  "vin",
  "invoice_date",
  "due_date",
  "paid_date",
  "status",
  "payment_status",
  "service_category",
  "description",
  "labor_hours",
  "labor_total",
  "parts_total",
  "shop_supplies",
  "subtotal",
  "tax",
  "total",
  "amount_paid",
  "balance_due",
  "advisor",
  "technician",
  "notes",
  "source_system",
] as const;

const HEADER_ALIASES: Record<string, keyof InvoiceImportRow> = {
  importedinvoiceid: "imported_invoice_id",
  imported_invoice_id: "imported_invoice_id",
  source_invoice_id: "imported_invoice_id",
  sourceinvoiceid: "imported_invoice_id",
  invoiceid: "invoice_id",
  invoice_id: "invoice_id",
  invoicenumber: "invoice_number",
  invoice_number: "invoice_number",
  workordernumber: "work_order_number",
  work_order_number: "work_order_number",
  ro_number: "work_order_number",
  ronumber: "work_order_number",
  customerid: "customerid",
  customer_id: "customer_id",
  externalid: "external_id",
  external_id: "external_id",
  customernumber: "customernumber",
  customer_number: "customer_number",
  vehicleid: "vehicleid",
  vehicle_id: "vehicle_id",
  vehicleexternalid: "vehicle_external_id",
  vehicle_external_id: "vehicle_external_id",
  vehiclenumber: "vehiclenumber",
  vehicle_number: "vehicle_number",
};

export function cleanInvoiceImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
export function cleanInvoiceImportCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}
export function normalizeInvoiceImportRow(
  row: Record<string, unknown>,
): InvoiceImportRow {
  const normalized: InvoiceImportRow = {};
  for (const [header, value] of Object.entries(row)) {
    const cleaned = cleanInvoiceImportHeader(header);
    const aliasKey = cleaned.replace(/_/g, "");
    const canonical =
      HEADER_ALIASES[cleaned] ?? HEADER_ALIASES[aliasKey] ?? cleaned;
    if (
      !(INVOICE_IMPORT_SUPPORTED_COLUMNS as readonly string[]).includes(
        canonical,
      )
    )
      continue;
    normalized[canonical as keyof InvoiceImportRow] =
      cleanInvoiceImportCell(value);
  }
  return normalized;
}
export function getInvoiceSourceId(
  row: InvoiceImportRow | Record<string, unknown>,
): string | null {
  return cleanInvoiceImportCell(row.imported_invoice_id ?? row.invoice_id);
}
export function getInvoiceNumber(
  row: InvoiceImportRow | Record<string, unknown>,
): string | null {
  return cleanInvoiceImportCell(row.invoice_number) ?? getInvoiceSourceId(row);
}
export function getCustomerAuthoritativeId(
  row: InvoiceImportRow | Record<string, unknown>,
): string | null {
  return cleanInvoiceImportCell(
    row.customer_id ??
      row.external_id ??
      row.customer_number ??
      row.customerid ??
      row.customernumber,
  );
}
export function getVehicleAuthoritativeId(
  row: InvoiceImportRow | Record<string, unknown>,
): string | null {
  return cleanInvoiceImportCell(
    row.vehicle_id ??
      row.vehicle_external_id ??
      row.vehicle_number ??
      row.vehicleid ??
      row.vehiclenumber,
  );
}
