import type { SessionCustomer } from "./inspection/types";

export type NormalizableCustomer = Partial<SessionCustomer> & {
  business_name?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
  street?: string | null;
};

const BUSINESS_NAME_INDICATORS = [
  "Ltd",
  "Ltd.",
  "Inc",
  "Inc.",
  "LLC",
  "Corp",
  "Corporation",
  "Co.",
  "Company",
  "Services",
  "Logistics",
  "Fleet",
  "Transport",
  "Trucking",
  "Diesel",
  "Municipal",
  "Enterprises",
  "Industries",
  "Group",
] as const;

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitPersonNameFallback(name: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  const clean = textOrNull(name);
  if (!clean) return { first_name: null, last_name: null };
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts.at(-1) ?? null,
  };
}

export function looksLikeBusinessName(name: string | null | undefined): boolean {
  const clean = textOrNull(name);
  if (!clean) return false;

  return BUSINESS_NAME_INDICATORS.some((indicator) => {
    const escaped = indicator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(clean);
  });
}

export function normalizeCustomerForIntake(
  customer: NormalizableCustomer,
): SessionCustomer {
  const businessName = textOrNull(customer.business_name);
  const explicitFirstName =
    textOrNull(customer.first_name) ?? textOrNull(customer.contact_first_name);
  const explicitLastName =
    textOrNull(customer.last_name) ?? textOrNull(customer.contact_last_name);
  const fallbackName =
    textOrNull(customer.name) ??
    textOrNull(customer.display_name) ??
    textOrNull(customer.full_name);

  if (businessName) {
    return {
      business_name: businessName,
      name: fallbackName,
      first_name: explicitFirstName,
      last_name: explicitLastName,
      phone: textOrNull(customer.phone) ?? textOrNull(customer.phone_number),
      email: textOrNull(customer.email),
      address: textOrNull(customer.address) ?? textOrNull(customer.street),
      city: textOrNull(customer.city),
      province: textOrNull(customer.province),
      postal_code: textOrNull(customer.postal_code),
    };
  }

  if (looksLikeBusinessName(fallbackName)) {
    return {
      business_name: fallbackName,
      name: fallbackName,
      first_name: explicitFirstName,
      last_name: explicitLastName,
      phone: textOrNull(customer.phone) ?? textOrNull(customer.phone_number),
      email: textOrNull(customer.email),
      address: textOrNull(customer.address) ?? textOrNull(customer.street),
      city: textOrNull(customer.city),
      province: textOrNull(customer.province),
      postal_code: textOrNull(customer.postal_code),
    };
  }

  const personFallback = splitPersonNameFallback(fallbackName);

  return {
    business_name: null,
    name: fallbackName,
    first_name: explicitFirstName ?? personFallback.first_name,
    last_name: explicitLastName ?? personFallback.last_name,
    phone: textOrNull(customer.phone) ?? textOrNull(customer.phone_number),
    email: textOrNull(customer.email),
    address: textOrNull(customer.address) ?? textOrNull(customer.street),
    city: textOrNull(customer.city),
    province: textOrNull(customer.province),
    postal_code: textOrNull(customer.postal_code),
  };
}
