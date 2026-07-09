export type HistoryImportRow = {
  customer_id?: string | null;
  external_id?: string | null;
  customer_number?: string | null;
  customerid?: string | null;
  customernumber?: string | null;
  vehicle_id?: string | null;
  vehicle_external_id?: string | null;
  vehicle_number?: string | null;
  vehicleid?: string | null;
  vehiclenumber?: string | null;
  vin?: string | null;
  customer_email?: string | null;
  email?: string | null;
  customer_phone?: string | null;
  phone?: string | null;
  customer_name?: string | null;
  name?: string | null;
  service_date?: string | null;
  repair_order_number?: string | null;
  work_order_number?: string | null;
  invoice_number?: string | null;
  odometer?: string | null;
  service_category?: string | null;
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  parts?: string | null;
  labor_hours?: string | null;
  total?: string | null;
  technician?: string | null;
  advisor?: string | null;
  notes?: string | null;
};

const CUSTOMER_ID_HEADER_ALIASES = new Set([
  "customer_id",
  "external_id",
  "customer_number",
  "customerid",
  "customernumber",
]);

const VEHICLE_ID_HEADER_ALIASES = new Set([
  "vehicle_id",
  "vehicle_external_id",
  "vehicle_number",
  "vehicleid",
  "vehiclenumber",
]);

const SUPPORTED_COLUMNS = new Set([
  "customer_id",
  "external_id",
  "customer_number",
  "customerid",
  "customernumber",
  "vehicle_id",
  "vehicle_external_id",
  "vehicle_number",
  "vehicleid",
  "vehiclenumber",
  "vin",
  "customer_name",
  "customer_email",
  "email",
  "customer_phone",
  "phone",
  "name",
  "service_date",
  "repair_order_number",
  "work_order_number",
  "invoice_number",
  "odometer",
  "service_category",
  "complaint",
  "cause",
  "correction",
  "parts",
  "labor_hours",
  "total",
  "technician",
  "advisor",
  "notes",
]);

export function cleanVehicleHistoryHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function cleanVehicleHistoryCell(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export function rowCustomerExternalId(row: HistoryImportRow): string | null {
  return (
    cleanVehicleHistoryCell(row.customer_id) ??
    cleanVehicleHistoryCell(row.external_id) ??
    cleanVehicleHistoryCell(row.customer_number) ??
    cleanVehicleHistoryCell(row.customerid) ??
    cleanVehicleHistoryCell(row.customernumber)
  );
}

export function rowVehicleExternalId(row: HistoryImportRow): string | null {
  return (
    cleanVehicleHistoryCell(row.vehicle_id) ??
    cleanVehicleHistoryCell(row.vehicle_external_id) ??
    cleanVehicleHistoryCell(row.vehicle_number) ??
    cleanVehicleHistoryCell(row.vehicleid) ??
    cleanVehicleHistoryCell(row.vehiclenumber)
  );
}

export function normalizeVehicleHistoryImportRow(
  row: Record<string, unknown>,
): HistoryImportRow {
  const normalized: HistoryImportRow = {};
  for (const [header, value] of Object.entries(row)) {
    const cleanedHeader = cleanVehicleHistoryHeader(header);
    const key = CUSTOMER_ID_HEADER_ALIASES.has(cleanedHeader)
      ? "customer_id"
      : VEHICLE_ID_HEADER_ALIASES.has(cleanedHeader)
        ? "vehicle_id"
        : cleanedHeader;
    if (!SUPPORTED_COLUMNS.has(cleanedHeader) && !SUPPORTED_COLUMNS.has(key))
      continue;
    const cell = cleanVehicleHistoryCell(value);
    normalized[key as keyof HistoryImportRow] = cell;
  }
  return normalized;
}
