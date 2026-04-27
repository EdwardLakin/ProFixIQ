import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import { normalizeHeader } from "@/features/onboarding-agent/lib/domains";

const DOMAIN_FIELD_ALIASES: Record<OnboardingDomain, Record<string, string[]>> = {
  customers: {
    sourceCustomerId: ["customer id", "id", "external customer id", "customer_number"],
    name: ["customer name", "full name", "name", "customer"],
    firstName: ["first name", "firstname"],
    lastName: ["last name", "lastname"],
    businessName: ["company", "company name", "business"],
    email: ["email", "email address", "e mail", "e-mail"],
    phone: ["phone", "phone number", "mobile", "phone_number"],
    address: ["address", "street", "street address"],
  },
  vehicles: {
    sourceVehicleId: ["vehicle id", "id", "external vehicle id", "vehicle_number"],
    sourceCustomerId: ["customer id", "customer_number"],
    vin: ["vin", "vehicle vin", "vehicle_vin"],
    plate: ["plate", "license", "license plate", "license_plate"],
    unitNumber: ["unit", "unit number", "truck number"],
    customerEmail: ["customer email", "customer_email", "customer e-mail", "customer e mail"],
    customerPhone: ["customer phone", "customer_phone"],
    year: ["year"],
    make: ["make"],
    model: ["model"],
  },
  history: {
    sourceWorkOrderId: ["work order", "ro id", "repair order", "ro number", "work order number", "work_order_number"],
    invoiceId: ["invoice id", "invoice number", "invoice", "invoice_number"],
    invoiceNumber: ["invoice number", "invoice", "invoice id", "invoice_number"],
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
    customerEmail: ["customer email", "email", "customer e-mail", "customer e mail"],
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
    sourceVendorId: ["vendor id", "external vendor id", "vendor_number"],
    name: ["vendor", "supplier", "company", "vendor name", "supplier name"],
    email: ["email", "vendor email", "e mail", "e-mail"],
    phone: ["phone", "vendor phone"],
    accountNumber: ["account", "account number", "vendor account", "account_number"],
  },
  staff: {
    name: ["name", "full name", "employee"],
    firstName: ["first name", "firstname"],
    lastName: ["last name", "lastname"],
    email: ["email", "email address", "e mail", "e-mail"],
    username: ["username", "user name", "login"],
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
  const loose = normalizeLooseKey(value);
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    if (normalized === normalizeHeader(field) || loose === normalizeLooseKey(field)) return field;
    if (fieldAliases.some((alias) => normalizeHeader(alias) === normalized || normalizeLooseKey(alias) === loose)) return field;
  }
  return null;
}

function isCanonicalFieldName(domain: OnboardingDomain, value: string): boolean {
  const aliases = DOMAIN_FIELD_ALIASES[domain] ?? {};
  const normalized = normalizeHeader(value);
  return Object.keys(aliases).some((field) => normalizeHeader(field) === normalized);
}

export function buildDeterministicHeaderMap(domain: OnboardingDomain, headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const canonical = resolveCanonicalField(domain, header);
    if (canonical) map[header] = canonical;
  }
  return map;
}

function normalizeLooseKey(value: string): string {
  return normalizeHeader(value).replace(/\s+/g, "");
}

function buildHeaderLookup(headers: string[]) {
  const byLoose = new Map<string, string>();
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    byLoose.set(normalizeLooseKey(header), header);
    byNormalized.set(normalizeHeader(header), header);
  }
  return { byLoose, byNormalized };
}

function resolveSourceHeader(value: string, headers: string[], lookup?: ReturnType<typeof buildHeaderLookup>): string {
  const table = lookup ?? buildHeaderLookup(headers);
  return table.byLoose.get(normalizeLooseKey(value))
    ?? table.byNormalized.get(normalizeHeader(value))
    ?? value;
}

export function normalizeAiHeaderMap(params: {
  domain: OnboardingDomain;
  headers: string[];
  aiHeaderMap?: Record<string, string> | null;
}): Record<string, string> {
  const ai = params.aiHeaderMap ?? {};
  const output: Record<string, string> = {};
  const lookup = buildHeaderLookup(params.headers);

  for (const [leftRaw, rightRaw] of Object.entries(ai)) {
    const left = String(leftRaw ?? "").trim();
    const right = String(rightRaw ?? "").trim();
    if (!left || !right) continue;

    const leftCanonical = resolveCanonicalField(params.domain, left);
    const rightCanonical = resolveCanonicalField(params.domain, right);
    const leftIsFieldName = isCanonicalFieldName(params.domain, left);
    const rightIsFieldName = isCanonicalFieldName(params.domain, right);

    if (leftIsFieldName && !rightIsFieldName && leftCanonical) {
      output[resolveSourceHeader(right, params.headers, lookup)] = leftCanonical;
      continue;
    }

    if (rightIsFieldName && !leftIsFieldName && rightCanonical) {
      output[resolveSourceHeader(left, params.headers, lookup)] = rightCanonical;
      continue;
    }

    if (rightCanonical && !leftCanonical) {
      output[resolveSourceHeader(left, params.headers, lookup)] = rightCanonical;
      continue;
    }

    if (leftCanonical && !rightCanonical) {
      output[resolveSourceHeader(right, params.headers, lookup)] = leftCanonical;
      continue;
    }

    if (rightCanonical && leftCanonical) {
      output[resolveSourceHeader(left, params.headers, lookup)] = rightCanonical;
    }
  }

  return output;
}

export function buildEffectiveHeaderMap(params: {
  domain: OnboardingDomain;
  headers: string[];
  aiHeaderMap?: Record<string, string> | null;
}): {
  headerMap: Record<string, string>;
  mappingSource: "ai" | "deterministic_alias" | "mixed" | "none";
  mappedColumnCount: number;
  diagnostics: {
    aiMappedColumns: number;
    deterministicMappedColumns: number;
    canonicalPassthroughColumns: number;
  };
} {
  const deterministicMap = buildDeterministicHeaderMap(params.domain, params.headers);
  const aiMap = normalizeAiHeaderMap({
    domain: params.domain,
    headers: params.headers,
    aiHeaderMap: params.aiHeaderMap ?? {},
  });
  const output: Record<string, string> = { ...aiMap };
  const aiApplied = Object.keys(aiMap).length;
  let passthroughCount = 0;

  for (const [header, canonical] of Object.entries(deterministicMap)) {
    if (!output[header]) output[header] = canonical;
  }

  for (const header of params.headers) {
    const canonical = resolveCanonicalField(params.domain, header);
    if (canonical && !output[header]) {
      output[header] = canonical;
      passthroughCount += 1;
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
    mappedColumnCount: totalCount,
    diagnostics: {
      aiMappedColumns: aiApplied,
      deterministicMappedColumns: deterministicCount,
      canonicalPassthroughColumns: passthroughCount,
    },
  };
}
