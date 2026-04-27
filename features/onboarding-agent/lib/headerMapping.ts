import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import { normalizeHeader } from "@/features/onboarding-agent/lib/domains";

const DOMAIN_FIELD_ALIASES: Record<OnboardingDomain, Record<string, string[]>> = {
  customers: {
    sourceCustomerId: ["customer id", "id", "external customer id"],
    name: ["customer name", "full name", "name"],
    businessName: ["company", "company name", "business"],
    email: ["email", "email address"],
    phone: ["phone", "phone number", "mobile"],
  },
  vehicles: {
    sourceVehicleId: ["vehicle id", "id", "external vehicle id"],
    sourceCustomerId: ["customer id"],
    vin: ["vin"],
    plate: ["plate", "license", "license plate"],
    unitNumber: ["unit", "unit number", "truck number"],
    year: ["year"],
    make: ["make"],
    model: ["model"],
  },
  history: {
    sourceWorkOrderId: ["work order", "ro id", "repair order", "ro number", "work order number"],
    invoiceId: ["invoice id", "invoice number", "invoice"],
    sourceCustomerId: ["customer id"],
    sourceVehicleId: ["vehicle id"],
    openedDate: ["opened", "opened date", "open date", "date", "service date"],
    complaint: ["complaint", "description", "concern", "service text", "service performed"],
    correction: ["correction", "resolution"],
    total: ["total", "amount"],
  },
  invoices: {
    invoiceNumber: ["invoice", "invoice number", "invoice id"],
    sourceWorkOrderId: ["work order", "ro", "ro id", "repair order", "work order number"],
    sourceCustomerId: ["customer id"],
    customerName: ["customer", "customer name", "name"],
    customerEmail: ["customer email", "email"],
    invoiceDate: ["issue date", "invoice date", "date"],
    paymentStatus: ["status", "payment status"],
    total: ["total", "amount", "invoice total"],
  },
  parts: {
    sku: ["sku", "part sku"],
    partNumber: ["part number", "part #", "number"],
    description: ["description", "name", "part"],
    vendorName: ["vendor", "supplier", "vendor name", "supplier name"],
    cost: ["cost", "unit cost"],
    price: ["price", "list price", "sale price"],
  },
  vendors: {
    name: ["vendor", "supplier", "company", "vendor name", "supplier name"],
    email: ["email", "vendor email"],
    phone: ["phone", "vendor phone"],
    accountNumber: ["account", "account number", "vendor account"],
  },
  staff: {
    name: ["name", "full name", "employee"],
    email: ["email", "email address"],
    phone: ["phone", "mobile"],
    role: ["role", "job title", "position", "technician", "advisor"],
  },
  menu: {
    serviceName: ["service", "service name", "name"],
    description: ["description", "service description"],
    category: ["category", "service category"],
    laborHours: ["labor hours", "hours"],
    laborPrice: ["labor price", "price", "labor rate"],
    opCode: ["operation code", "op code", "labor operation", "canned job"],
  },
  inspections: {},
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
}): Record<string, string> {
  const output = buildDeterministicHeaderMap(params.domain, params.headers);
  const ai = params.aiHeaderMap ?? {};

  for (const [left, right] of Object.entries(ai)) {
    if (!left || !right) continue;
    const canonicalFromRight = resolveCanonicalField(params.domain, right);
    if (canonicalFromRight) {
      output[left] = canonicalFromRight;
      continue;
    }

    const canonicalFromLeft = resolveCanonicalField(params.domain, left);
    if (canonicalFromLeft) {
      output[right] = canonicalFromLeft;
    }
  }

  return output;
}
