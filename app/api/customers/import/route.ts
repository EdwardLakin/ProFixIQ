import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  normalizeImportedCustomerRow,
  type ImportRow,
} from "@/features/customers/import/normalizeImportedCustomerRow";

type DB = Database;
type CustomerInsert = DB["public"]["Tables"]["customers"]["Insert"];
type CustomerRow = Pick<
  DB["public"]["Tables"]["customers"]["Row"],
  | "id"
  | "external_id"
  | "email"
  | "phone"
  | "phone_number"
  | "name"
  | "business_name"
  | "address"
  | "city"
  | "province"
  | "postal_code"
  | "customer_since"
  | "updated_at"
>;
type CustomerMatch = Pick<CustomerRow, "id"> & {
  matchedBy?: string;
  matchedValue?: string | null;
};

type ImportRowSummary = {
  customerName: string | null;
  email: string | null;
  phone: string | null;
};

type SkippedCustomerImportRow = ImportRowSummary & {
  row: number;
  reason: string;
  matchedBy:
    | "email"
    | "phone"
    | "external_id"
    | "name_location"
    | "duplicate_in_csv"
    | "missing_identity"
    | "existing_customer";
  matchedValue?: string | null;
};

type FailedCustomerImportRow = ImportRowSummary & {
  row: number;
  error: string;
  constraint?: string | null;
};

type PendingCustomerInsert = {
  row: number;
  customer: CustomerInsert;
  summary: ImportRowSummary;
  identityKeys: string[];
};

type CustomerImportBody = {
  rows?: unknown;
};

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanPhone(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return text.length ? text : null;
}

function normalizeIdentity(value: string | null | undefined): string | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return text.length ? text : null;
}

function customerIdentityKeys(
  customer: Partial<CustomerRow | CustomerInsert>,
): string[] {
  const keys: string[] = [];
  const externalId = normalizeIdentity(customer.external_id);
  if (externalId) keys.push(`external:${externalId}`);

  const email = normalizeEmail(customer.email);
  if (email) keys.push(`email:${email}`);

  const phone = cleanPhone(customer.phone) ?? cleanPhone(customer.phone_number);
  if (phone) keys.push(`phone:${phone}`);

  const name = normalizeIdentity(customer.name ?? customer.business_name);
  if (name) {
    const location = [
      customer.address,
      customer.city,
      customer.province,
      customer.postal_code,
    ]
      .map((part) => normalizeIdentity(part))
      .filter(Boolean)
      .join("|");
    keys.push(`name-location:${name}|${location}`);
  }

  return keys;
}

async function loadExistingCustomerIdentities(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<Map<string, CustomerMatch>> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, external_id, email, phone, phone_number, name, business_name, address, city, province, postal_code, customer_since, updated_at",
    )
    .eq("shop_id", shopId);
  if (error) throw error;

  const byIdentity = new Map<string, CustomerMatch>();
  for (const customer of (data ?? []) as CustomerRow[]) {
    for (const key of customerIdentityKeys(customer)) {
      if (!byIdentity.has(key))
        byIdentity.set(key, { id: customer.id, ...describeIdentityKey(key) });
    }
  }

  return byIdentity;
}

function describeIdentityKey(
  key: string,
): Pick<CustomerMatch, "matchedBy" | "matchedValue"> {
  const [prefix, ...rest] = key.split(":");
  const value = rest.join(":") || null;
  if (prefix === "external")
    return { matchedBy: "external_id", matchedValue: value };
  if (prefix === "email") return { matchedBy: "email", matchedValue: value };
  if (prefix === "phone") return { matchedBy: "phone", matchedValue: value };
  if (prefix === "name-location")
    return { matchedBy: "name_location", matchedValue: value };
  return { matchedBy: "existing_customer", matchedValue: value };
}

function importRowSummary(
  row: ImportRow,
  normalized?: CustomerInsert | null,
): ImportRowSummary {
  const rawName =
    cleanString(row.company_name) ??
    cleanString(row.business_name) ??
    cleanString(row.display_name) ??
    cleanString(row.name) ??
    [cleanString(row.first_name), cleanString(row.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
  const name = rawName || normalized?.name || normalized?.business_name || null;
  return {
    customerName: name || null,
    email: cleanString(row.email) ?? normalized?.email ?? null,
    phone:
      cleanPhone(row.phone) ??
      cleanPhone(row.phone_primary) ??
      cleanPhone(row.phone_number) ??
      cleanPhone(row.phone_secondary) ??
      normalized?.phone ??
      normalized?.phone_number ??
      null,
  };
}

function findExistingCustomer(
  existingByIdentity: Map<string, CustomerMatch>,
  normalized: CustomerInsert,
): CustomerMatch | null {
  for (const key of customerIdentityKeys(normalized)) {
    const existing = existingByIdentity.get(key);
    if (existing) return existing;
  }
  return null;
}

function extractConstraintName(error: unknown): string | null {
  const fields = [
    (error as { constraint?: unknown }).constraint,
    (error as { details?: unknown }).details,
    (error as { message?: unknown }).message,
  ];

  for (const field of fields) {
    const text = typeof field === "string" ? field : "";
    const quoted = text.match(/constraint ["']([^"']+)["']/i);
    if (quoted?.[1]) return quoted[1];

    const known = text.match(
      /(customers_user_id_uq|customers_shop_email_uq|customers_[a-z0-9_]*(?:email|phone|external|customer_id)[a-z0-9_]*)/i,
    );
    if (known?.[1]) return known[1];
  }

  return null;
}

function duplicateSkipReasonForConstraint(
  constraint: string | null,
): string | null {
  if (!constraint) return null;
  if (constraint === "customers_shop_email_uq")
    return "Matched existing customer by email.";
  if (/email/i.test(constraint)) return "Duplicate email for this shop.";
  if (/phone/i.test(constraint)) return "Duplicate phone for this shop.";
  if (/external|customer_id/i.test(constraint))
    return "Duplicate external customer ID for this shop.";
  return null;
}

function matchedByForConstraint(
  constraint: string | null,
): SkippedCustomerImportRow["matchedBy"] {
  if (!constraint) return "existing_customer";
  if (/email/i.test(constraint)) return "email";
  if (/phone/i.test(constraint)) return "phone";
  if (/external|customer_id/i.test(constraint)) return "external_id";
  return "existing_customer";
}

function describeSupabaseInsertError(error: unknown): {
  message: string;
  constraint: string | null;
} {
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Customer row failed a database insert check.";
  const details =
    typeof (error as { details?: unknown }).details === "string"
      ? (error as { details: string }).details
      : null;
  const constraint = extractConstraintName(error);
  const parts = [message];
  if (constraint) parts.push(`Constraint: ${constraint}.`);
  if (details && !details.includes(message)) parts.push(details);
  return { message: parts.join(" "), constraint };
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId) {
      return NextResponse.json(
        { error: "Missing shop context." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as CustomerImportBody;
    const rawRows = Array.isArray(body.rows) ? body.rows : [];

    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    };

    const errors: Array<{ row: number; error: string }> = [];
    const skippedRows: SkippedCustomerImportRow[] = [];
    const failedRows: FailedCustomerImportRow[] = [];
    const existingByIdentity = await loadExistingCustomerIdentities(
      supabase,
      shopId,
    );
    const seenImportIdentities = new Set<string>();
    const customersToCreate: PendingCustomerInsert[] = [];

    for (const [index, raw] of rawRows.entries()) {
      try {
        const normalized = normalizeImportedCustomerRow(
          raw as ImportRow,
          shopId,
        );

        if (!normalized) {
          counts.skipped += 1;
          skippedRows.push({
            row: index + 1,
            reason: "Missing customer name, company, email, and phone.",
            ...importRowSummary(raw as ImportRow),
            matchedBy: "missing_identity",
          });
          continue;
        }

        const identityKeys = customerIdentityKeys(normalized);

        const duplicateKey = identityKeys.find((key) =>
          seenImportIdentities.has(key),
        );
        if (duplicateKey) {
          counts.duplicates += 1;
          counts.skipped += 1;
          const duplicateMatch = describeIdentityKey(duplicateKey);
          skippedRows.push({
            row: index + 1,
            reason: "Duplicate customer identity within this CSV.",
            ...importRowSummary(raw as ImportRow, normalized),
            matchedBy: "duplicate_in_csv",
            matchedValue: duplicateMatch.matchedValue,
          });
          continue;
        }

        const existing = findExistingCustomer(existingByIdentity, normalized);

        if (existing?.id) {
          const datePatch: Pick<CustomerInsert, "customer_since" | "updated_at"> = {};
          if (normalized.customer_since) datePatch.customer_since = normalized.customer_since;
          if (normalized.updated_at) datePatch.updated_at = normalized.updated_at;

          if (Object.keys(datePatch).length > 0) {
            const { error } = await supabase
              .from("customers")
              .update(datePatch)
              .eq("id", existing.id)
              .eq("shop_id", shopId);
            if (error) throw error;
            counts.updated += 1;
          } else {
            counts.skipped += 1;
          }

          const matchedBy =
            (existing.matchedBy as SkippedCustomerImportRow["matchedBy"]) ??
            "existing_customer";
          skippedRows.push({
            row: index + 1,
            reason:
              Object.keys(datePatch).length > 0
                ? "Matched existing customer; historical date fields were updated."
                : matchedBy === "email"
                  ? "Matched existing customer by email."
                  : "Matched an existing customer for this shop.",
            ...importRowSummary(raw as ImportRow, normalized),
            matchedBy,
            matchedValue: existing.matchedValue ?? existing.id,
          });
          continue;
        }

        for (const key of identityKeys) {
          seenImportIdentities.add(key);
          existingByIdentity.set(key, {
            id: `pending-${index}`,
            ...describeIdentityKey(key),
          });
        }

        customersToCreate.push({
          row: index + 1,
          customer: { ...normalized, user_id: null },
          summary: importRowSummary(raw as ImportRow, normalized),
          identityKeys,
        });
      } catch (error) {
        counts.failed += 1;
        errors.push({
          row: index + 1,
          error:
            error instanceof Error ? error.message : "Unable to import row.",
        });
      }
    }

    for (const pending of customersToCreate) {
      const payload: CustomerInsert = { ...pending.customer, user_id: null };
      const { error } = await supabase.from("customers").insert(payload);

      if (error) {
        const safeError = describeSupabaseInsertError(error);
        const duplicateSkipReason = duplicateSkipReasonForConstraint(
          safeError.constraint,
        );

        if (duplicateSkipReason) {
          counts.skipped += 1;
          skippedRows.push({
            row: pending.row,
            reason: duplicateSkipReason,
            ...pending.summary,
            matchedBy: matchedByForConstraint(safeError.constraint),
            matchedValue:
              safeError.constraint === "customers_shop_email_uq"
                ? normalizeEmail(pending.customer.email)
                : safeError.constraint,
          });
          continue;
        }

        counts.failed += 1;
        errors.push({ row: pending.row, error: safeError.message });
        failedRows.push({
          row: pending.row,
          ...pending.summary,
          error: safeError.message,
          constraint: safeError.constraint,
        });
        continue;
      }

      counts.created += 1;
      for (const key of pending.identityKeys) {
        existingByIdentity.set(key, {
          id: `created-${pending.row}`,
          ...describeIdentityKey(key),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      counts,
      errors,
      skippedRows,
      failedRows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import customers.",
      },
      { status: 500 },
    );
  }
}
