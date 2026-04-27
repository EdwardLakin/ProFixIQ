import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import { normalizeHeader } from "@/features/onboarding-agent/lib/domains";

const DOMAIN_FIELD_ALIASES: Record<OnboardingDomain, Record<string, string[]>> = {
  customers: {
    sourceCustomerId: ["customer id", "id", "external customer id", "customer_number"],
    name: ["customer name", "full name", "name", "customer"],
    firstName: ["first name", "firstname"],
    lastName: ["last name", "lastname"],
    businessName: ["company", "company name", "business"],
    email: ["email", "email address"],
    phone: ["phone", "phone number", "mobile", "phone_number"],
    address: ["address", "street", "street address"],
  },
  vehicles: {
    sourceVehicleId: ["vehicle id", "id", "external vehicle id", "vehicle_number"],
    sourceCustomerId: ["customer id", "customer_number"],
    vin: ["vin", "vehicle vin", "vehicle_vin"],
    plate: ["plate", "license", "license plate", "license_plate"],
    unitNumber: ["unit", "unit number", "truck number"],
    customerEmail: ["customer email", "customer_email"],
    customerPhone: ["customer phone", "customer_phone"],
    year: ["year"],
    make: ["make"],
    model: ["model"],
  },
  history: {
    sourceWorkOrderId: ["work order", "ro id", "repair order", "ro number", "work order number", "work_order_number"],
    invoiceId: ["invoice id", "invoice number", "invoice", "invoice_number"],
    sourceCustomerId: ["customer id", "customer_number"],
    sourceVehicleId: ["vehicle id", "vehicle_number"],
    vehicleVin: ["vin", "vehicle vin", "vehicle_vin"],
    openedDate: ["opened", "opened date", "open date", "date", "service date"],
    complaint: ["complaint", "description", "concern", "service text", "service performed"],
    cause: ["cause"],
    correction: ["correction", "resolution"],
    serviceDescription: ["service", "service name", "line description", "service description"],
    laborRaw: ["labor", "labor total"],
    total: ["total", "amount"],
    odometer: ["odometer"],
  },
  invoices: {
    invoiceNumber: ["invoice", "invoice number", "invoice id", "invoice_number"],
    sourceWorkOrderId: ["work order", "ro", "ro id", "repair order", "work order number", "work_order_number"],
    sourceCustomerId: ["customer id", "customer_number"],
    sourceVehicleId: ["vehicle id", "vehicle_number"],
    vehicleVin: ["vin", "vehicle vin", "vehicle_vin"],
    customerName: ["customer", "customer name", "name"],
    customerEmail: ["customer email", "email"],
    invoiceDate: ["issue date", "invoice date", "date", "invoice_date"],
    subtotal: ["subtotal"],
    tax: ["tax"],
    paymentStatus: ["status", "payment status"],
    total: ["total", "amount", "invoice total"],
  },
  parts: {
    sku: ["sku", "part sku"],
    partNumber: ["part number", "part #", "number", "part_number"],
    description: ["description", "name", "part"],
    vendorName: ["vendor", "supplier", "vendor name", "supplier name", "vendor_id"],
    cost: ["cost", "unit cost"],
    price: ["price", "list price", "sale price"],
    quantityOnHandRaw: ["qty", "quantity", "on hand", "quantity on hand", "on_hand"],
  },
  vendors: {
    name: ["vendor", "supplier", "company", "vendor name", "supplier name"],
    email: ["email", "vendor email"],
    phone: ["phone", "vendor phone"],
    accountNumber: ["account", "account number", "vendor account", "account_number"],
  },
  staff: {
    name: ["name", "full name", "employee"],
    firstName: ["first name", "firstname"],
    lastName: ["last name", "lastname"],
    email: ["email", "email address"],
    phone: ["phone", "mobile"],
    role: ["role", "job title", "position", "technician", "advisor", "username"],
  },
  menu: {
    serviceName: ["service", "service name", "name"],
    description: ["description", "service description"],
    category: ["category", "service category", "service_type"],
    laborHours: ["labor hours", "hours"],
    laborPrice: ["labor price", "price", "labor rate"],
    opCode: ["operation code", "op code", "labor operation", "canned job"],
    interval: ["interval", "frequency"],
  },
  inspections: {
    name: ["name", "inspection", "inspection name"],
    description: ["description", "inspection description"],
    category: ["category", "group"],
  },
  unknown: {},
};

function resolveCanonicalField(domain: OnboardingDomain, value: string): string | null {
  const aliases = DOMAIN_FIELD_ALIASES[domain] ?? {};
  const normalized = normalizeHeader(value);
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    if (normalized === normalizeHeader(field)) return field;
    if (fieldAliases.some((alias) => normalizeHeader(alias) === normalized)) return field;
  }
  return null;
}

export function buildDeterministicHeaderMap(domain: OnboardingDomain, headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const canonical = resolveCanonicalField(domain, header);
    if (canonical) map[header] = canonical;
  }
  return map;
}

export function buildEffectiveHeaderMap(params: {
  domain: OnboardingDomain;
  headers: string[];
  aiHeaderMap?: Record<string, string> | null;
}): { headerMap: Record<string, string>; mappingSource: "ai" | "deterministic_alias" | "mixed" | "none" } {
  const deterministicMap = buildDeterministicHeaderMap(params.domain, params.headers);
  const output: Record<string, string> = { ...deterministicMap };
  const ai = params.aiHeaderMap ?? {};
  let aiApplied = 0;

  for (const [left, right] of Object.entries(ai)) {
    if (!left || !right) continue;
    const canonicalFromRight = resolveCanonicalField(params.domain, right);
    if (canonicalFromRight) {
      output[left] = canonicalFromRight;
      aiApplied += 1;
      continue;
    }

    const canonicalFromLeft = resolveCanonicalField(params.domain, left);
    if (canonicalFromLeft) {
      output[right] = canonicalFromLeft;
      aiApplied += 1;
    }
  }

  const deterministicCount = Object.keys(deterministicMap).length;
  const totalCount = Object.keys(output).length;
  const mappingSource = aiApplied > 0 && deterministicCount > 0
    ? "mixed"
    : aiApplied > 0
      ? "ai"
      : deterministicCount > 0
        ? "deterministic_alias"
        : "none";

  return {
    headerMap: output,
    mappingSource: totalCount > 0 ? mappingSource : "none",
  };
}
