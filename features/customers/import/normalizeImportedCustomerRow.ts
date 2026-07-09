import type { Database } from "@shared/types/types/supabase";

type DB = Database;
export type CustomerInsert = DB["public"]["Tables"]["customers"]["Insert"];

export type ImportRow = {
  first_name?: unknown;
  last_name?: unknown;
  name?: unknown;
  customer_id?: unknown;
  external_id?: unknown;
  customer_number?: unknown;
  company_name?: unknown;
  business_name?: unknown;
  display_name?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_primary?: unknown;
  phone_number?: unknown;
  phone_secondary?: unknown;
  address?: unknown;
  address1?: unknown;
  street?: unknown;
  city?: unknown;
  province?: unknown;
  state?: unknown;
  postal_code?: unknown;
  zip?: unknown;
  notes?: unknown;
  created_at?: unknown;
  customer_since?: unknown;
  updated_at?: unknown;
};

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanEmail(value: unknown): string | null {
  return cleanString(value)?.toLowerCase() ?? null;
}

function cleanPhone(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function cleanDate(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return text;
}

function splitName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1)
    return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? null,
  };
}

export function normalizeImportedCustomerRow(
  row: ImportRow,
  shopId: string,
): CustomerInsert | null {
  const businessName =
    cleanString(row.business_name) ?? cleanString(row.company_name);
  const explicitName = cleanString(row.name) ?? cleanString(row.display_name);
  const split = splitName(explicitName);
  const firstName = cleanString(row.first_name) ?? split.firstName;
  const lastName = cleanString(row.last_name) ?? split.lastName;
  const email = cleanEmail(row.email);
  const phone =
    cleanPhone(row.phone) ??
    cleanPhone(row.phone_primary) ??
    cleanPhone(row.phone_number) ??
    cleanPhone(row.phone_secondary);
  const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = businessName ?? explicitName ?? (personName || null);

  if (!displayName && !email && !phone) return null;

  const createdAt = cleanDate(row.created_at);
  const customerSince = cleanDate(row.customer_since) ?? createdAt;
  const updatedAt = cleanDate(row.updated_at);

  return {
    shop_id: shopId,
    user_id: null,
    external_id:
      cleanString(row.customer_id) ??
      cleanString(row.external_id) ??
      cleanString(row.customer_number),
    first_name: firstName,
    last_name: lastName,
    name: explicitName ?? displayName,
    business_name: businessName,
    email,
    phone,
    phone_number: phone,
    address:
      cleanString(row.address) ??
      cleanString(row.address1) ??
      cleanString(row.street),
    city: cleanString(row.city),
    province: cleanString(row.province) ?? cleanString(row.state),
    postal_code: cleanString(row.postal_code) ?? cleanString(row.zip),
    notes: cleanString(row.notes),
    created_at: createdAt ?? undefined,
    customer_since: customerSince ?? undefined,
    updated_at: updatedAt ?? undefined,
  } satisfies CustomerInsert;
}
