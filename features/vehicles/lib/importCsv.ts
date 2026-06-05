import Papa from "papaparse";

export type VehicleImportCustomerOption = {
  id: string;
  business_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  external_id?: string | null;
};

export type VehicleImportRow = {
  sourceRowNumber: number;
  sourceFilename?: string;
  external_id?: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  year?: number;
  make?: string;
  model?: string;
  submodel?: string;
  color?: string;
  engine?: string;
  engine_type?: string;
  engine_family?: string;
  transmission?: string;
  fuel_type?: string;
  drivetrain?: string;
  engine_hours?: number;
  odometer?: string;
  notes?: string;
  status?: string;
  customer_id?: string;
  customer_external_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
};

export type VehicleImportPreviewRow = VehicleImportRow & {
  status: "valid" | "invalid";
  warnings: string[];
  errors: string[];
  resolvedCustomerId?: string;
  resolvedCustomerLabel?: string;
};

export type VehicleImportPreview = {
  rows: VehicleImportPreviewRow[];
  rowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateWarnings: number;
  unlinkedCustomerWarnings: number;
};

const HEADER_ALIASES: Record<string, keyof VehicleImportRow> = {
  vehicleid: "external_id",
  vehicle_id: "external_id",
  externalid: "external_id",
  external_id: "external_id",
  unitnumber: "unit_number",
  unit: "unit_number",
  unitno: "unit_number",
  unitnum: "unit_number",
  unitid: "unit_number",
  unitfleetnumber: "unit_number",
  fleetnumber: "unit_number",
  fleet_number: "unit_number",
  vehiclenumber: "unit_number",
  vin: "vin",
  serial: "vin",
  serialnumber: "vin",
  licenseplate: "license_plate",
  plate: "license_plate",
  platenumber: "license_plate",
  licplate: "license_plate",
  year: "year",
  make: "make",
  model: "model",
  submodel: "submodel",
  trim: "submodel",
  color: "color",
  engine: "engine",
  enginetype: "engine_type",
  enginefamily: "engine_family",
  transmission: "transmission",
  transmissiontype: "transmission",
  fueltype: "fuel_type",
  fuel: "fuel_type",
  drivetrain: "drivetrain",
  enginehours: "engine_hours",
  hours: "engine_hours",
  odometer: "odometer",
  mileage: "odometer",
  notes: "notes",
  status: "status",
  customerid: "customer_id",
  customerexternalid: "customer_external_id",
  customer_external_id: "customer_external_id",
  externalcustomerid: "customer_external_id",
  external_customer_id: "customer_external_id",
  customername: "customer_name",
  customer: "customer_name",
  customeremail: "customer_email",
  email: "customer_email",
  customerphone: "customer_phone",
  phone: "customer_phone",
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[#_\-./()]/g, " ").replace(/\s+/g, "").trim();
}

export function cleanVehicleImportText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text.length ? text : undefined;
}

export function normalizeImportVin(value: unknown): string | undefined {
  const text = cleanVehicleImportText(value)?.replace(/\s+/g, "").toUpperCase();
  return text || undefined;
}

export function normalizeImportPlate(value: unknown): string | undefined {
  const text = cleanVehicleImportText(value)?.toUpperCase();
  return text || undefined;
}

function numberValue(value: unknown): number | undefined {
  const text = cleanVehicleImportText(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseYear(value: unknown): number | undefined {
  const year = numberValue(value);
  if (!year || !Number.isInteger(year) || year < 1900 || year > 2100) return undefined;
  return year;
}

function hasIdentity(row: VehicleImportRow): boolean {
  return Boolean(row.vin || row.unit_number || row.license_plate || (row.year && row.make && row.model));
}

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function normalizeImportLookupValue(value: unknown): string | undefined {
  const text = cleanVehicleImportText(value);
  return text ? text.toLowerCase() : undefined;
}

function normalizeCustomerReference(row: VehicleImportRow): VehicleImportRow {
  const customerId = cleanVehicleImportText(row.customer_id);
  const customerExternalId = cleanVehicleImportText(row.customer_external_id);
  if (!customerId && !customerExternalId) return row;
  if (customerExternalId) return { ...row, customer_id: customerId && isUuid(customerId) ? customerId.trim() : undefined, customer_external_id: customerExternalId.trim() };
  if (!customerId) return row;
  if (isUuid(customerId)) return { ...row, customer_id: customerId.trim() };
  return { ...row, customer_id: undefined, customer_external_id: customerId.trim() };
}

function customerLabel(customer: VehicleImportCustomerOption): string {
  return [customer.business_name, customer.name, [customer.first_name, customer.last_name].filter(Boolean).join(" "), customer.email, customer.phone, customer.phone_number]
    .map((value) => value?.trim())
    .find(Boolean) ?? customer.id;
}

function resolveCustomer(row: VehicleImportRow, customers: VehicleImportCustomerOption[]): { id?: string; label?: string; warning?: string } {
  const customerExternalId = normalizeImportLookupValue(row.customer_external_id);
  if (customerExternalId) {
    const externalMatches = customers.filter((customer) => normalizeImportLookupValue(customer.external_id) === customerExternalId);
    if (externalMatches.length === 1) return { id: externalMatches[0].id, label: customerLabel(externalMatches[0]) };
    if (externalMatches.length > 1) return { warning: `Ambiguous customer external ID match (${externalMatches.map(customerLabel).join(", ")}); this vehicle will import without a customer link.` };

    return { warning: "No matching customer found by external ID; this vehicle will import without a customer link." };
  }

  const customerUuid = row.customer_id?.trim();
  if (customerUuid && isUuid(customerUuid)) {
    const directIdMatch = customers.find((customer) => customer.id === customerUuid);
    if (directIdMatch) return { id: directIdMatch.id, label: customerLabel(directIdMatch) };
    return { warning: "No matching customer found by ID; this vehicle will import without a customer link." };
  }

  const candidates = customers.filter((customer) => {
    const emailMatch = row.customer_email && customer.email?.trim().toLowerCase() === row.customer_email.trim().toLowerCase();
    const phoneValue = row.customer_phone?.replace(/\D/g, "");
    const customerPhones = [customer.phone, customer.phone_number].map((value) => value?.replace(/\D/g, ""));
    const phoneMatch = phoneValue && customerPhones.some((value) => value === phoneValue);
    const wantedName = row.customer_name?.trim().toLowerCase();
    const names = [customer.business_name, customer.name, [customer.first_name, customer.last_name].filter(Boolean).join(" ")].map((value) => value?.trim().toLowerCase());
    const nameMatch = wantedName && names.some((value) => value === wantedName);
    return Boolean(emailMatch || phoneMatch || nameMatch);
  });

  if (candidates.length === 1) return { id: candidates[0].id, label: customerLabel(candidates[0]) };
  if (candidates.length > 1) return { warning: `Ambiguous customer match (${candidates.map(customerLabel).join(", ")}); this vehicle will import without a customer link.` };
  if (row.customer_external_id || row.customer_name || row.customer_email || row.customer_phone) return { warning: "No matching customer found; this vehicle will import without a customer link." };
  return {};
}

export function parseVehicleCsv(csvText: string, sourceFilename?: string): VehicleImportRow[] {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, { header: true, skipEmptyLines: false, transformHeader: (header) => header.trim() });
  return parsed.data.map((raw, index) => {
    const row: VehicleImportRow = { sourceRowNumber: index + 2, sourceFilename };
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_ALIASES[normalizeHeader(header)];
      if (!key) continue;
      if (key === "year") {
        row.year = parseYear(value);
      } else if (key === "engine_hours") {
        row.engine_hours = numberValue(value);
      } else if (key === "vin") {
        row.vin = normalizeImportVin(value);
      } else if (key === "license_plate") {
        row.license_plate = normalizeImportPlate(value);
      } else {
        const text = cleanVehicleImportText(value);
        if (text) (row as Record<string, unknown>)[key] = text;
      }
    }
    return normalizeCustomerReference(row);
  });
}

export function previewVehicleCsv(csvText: string, customers: VehicleImportCustomerOption[] = [], sourceFilename?: string): VehicleImportPreview {
  const rows = parseVehicleCsv(csvText, sourceFilename);
  const vinCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.vin) vinCounts.set(row.vin, (vinCounts.get(row.vin) ?? 0) + 1);
    if (row.unit_number) unitCounts.set(row.unit_number.trim().toLowerCase(), (unitCounts.get(row.unit_number.trim().toLowerCase()) ?? 0) + 1);
  }

  const previewRows = rows.map((row): VehicleImportPreviewRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const hasAnyValue = Object.entries(row).some(([key, value]) => key !== "sourceRowNumber" && key !== "sourceFilename" && value !== undefined && value !== null && String(value).trim().length > 0);

    if (!hasAnyValue) errors.push("Row is empty.");
    if (hasAnyValue && !hasIdentity(row)) errors.push("Add VIN, unit number, license plate, or year + make + model.");
    if (row.vin && (vinCounts.get(row.vin) ?? 0) > 1) warnings.push("Duplicate VIN inside this CSV; the server will import only one unambiguous vehicle.");
    if (row.unit_number && (unitCounts.get(row.unit_number.trim().toLowerCase()) ?? 0) > 1) warnings.push("Duplicate unit number inside this CSV; expected for some fleets and will not block rows with a unique VIN or external vehicle ID.");

    const customer = resolveCustomer(row, customers);
    if (customer.warning) warnings.push(customer.warning);

    return { ...row, resolvedCustomerId: customer.id, resolvedCustomerLabel: customer.label, status: errors.length ? "invalid" : "valid", errors, warnings };
  });

  return {
    rows: previewRows,
    rowCount: previewRows.length,
    validCount: previewRows.filter((row) => row.status === "valid").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length,
    duplicateWarnings: previewRows.filter((row) => row.warnings.some((warning) => warning.toLowerCase().includes("duplicate"))).length,
    unlinkedCustomerWarnings: previewRows.filter((row) => row.warnings.some((warning) => warning.toLowerCase().includes("without a customer link"))).length,
  };
}
