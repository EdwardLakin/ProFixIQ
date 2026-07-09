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
type CustomerMatch = Pick<CustomerRow, "id" | "external_id"> & {
  matchedBy?: string;
  matchedValue?: string | null;
};

type ExistingCustomerIdentityMaps = {
  byExternalId: Map<string, CustomerMatch>;
  byFallbackIdentity: Map<string, CustomerMatch>;
};

const CUSTOMER_IDENTITY_PAGE_SIZE = 1000;

type ImportRowSummary = {
  customerName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  detectedExternalId: string | null;
  detectedCustomerId: string | null;
  detectedCustomerNumber: string | null;
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
  matchedExistingExternalId?: string | null;
  matchedExistingCustomerId?: string | null;
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
  headers?: unknown;
};

const CUSTOMER_IMPORT_DEBUG =
  process.env.CUSTOMER_IMPORT_DEBUG === "1" ||
  process.env.NODE_ENV === "development";
const CUSTOMER_IMPORT_TRACE_ROW = 385;

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

function customerExternalIdentityKey(
  customer: Partial<CustomerRow | CustomerInsert>,
): string | null {
  const externalId = normalizeIdentity(customer.external_id);
  return externalId ? `external:${externalId}` : null;
}

function customerFallbackIdentityKeys(
  customer: Partial<CustomerRow | CustomerInsert>,
): string[] {
  const keys: string[] = [];

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

function customerIdentityKeys(
  customer: Partial<CustomerRow | CustomerInsert>,
): string[] {
  const externalKey = customerExternalIdentityKey(customer);
  return externalKey ? [externalKey] : customerFallbackIdentityKeys(customer);
}

async function loadExistingCustomerIdentities(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<ExistingCustomerIdentityMaps> {
  const byExternalId = new Map<string, CustomerMatch>();
  const byFallbackIdentity = new Map<string, CustomerMatch>();
  let from = 0;

  while (true) {
    const to = from + CUSTOMER_IDENTITY_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, external_id, email, phone, phone_number, name, business_name, address, city, province, postal_code, customer_since, updated_at",
      )
      .eq("shop_id", shopId)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;

    const customers = (data ?? []) as CustomerRow[];
    for (const customer of customers) {
      const externalKey = customerExternalIdentityKey(customer);
      if (externalKey) {
        if (!byExternalId.has(externalKey)) {
          byExternalId.set(externalKey, {
            id: customer.id,
            external_id: customer.external_id,
            ...describeIdentityKey(externalKey),
          });
        }
        continue;
      }

      for (const key of customerFallbackIdentityKeys(customer)) {
        if (!byFallbackIdentity.has(key))
          byFallbackIdentity.set(key, {
            id: customer.id,
            external_id: customer.external_id,
            ...describeIdentityKey(key),
          });
      }
    }

    if (customers.length < CUSTOMER_IDENTITY_PAGE_SIZE) break;
    from += CUSTOMER_IDENTITY_PAGE_SIZE;
  }

  return { byExternalId, byFallbackIdentity };
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
  const businessName =
    cleanString(row.company_name) ??
    cleanString(row.business_name) ??
    normalized?.business_name ??
    null;
  const rawName =
    businessName ??
    cleanString(row.display_name) ??
    cleanString(row.name) ??
    [cleanString(row.first_name), cleanString(row.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
  const name = rawName || normalized?.name || normalized?.business_name || null;
  return {
    customerName: name || null,
    businessName,
    email: cleanString(row.email) ?? normalized?.email ?? null,
    phone:
      cleanPhone(row.phone) ??
      cleanPhone(row.phone_primary) ??
      cleanPhone(row.phone_number) ??
      cleanPhone(row.phone_secondary) ??
      normalized?.phone ??
      normalized?.phone_number ??
      null,
    detectedExternalId: cleanString(row.external_id),
    detectedCustomerId: cleanString(row.customer_id),
    detectedCustomerNumber: cleanString(row.customer_number),
  };
}

function matchedExistingDetails(match: CustomerMatch): {
  matchedExistingExternalId: string | null;
  matchedExistingCustomerId: string | null;
} {
  return {
    matchedExistingExternalId: match.external_id ?? null,
    matchedExistingCustomerId: match.id ?? null,
  };
}

function noMatchedExistingDetails(): {
  matchedExistingExternalId: null;
  matchedExistingCustomerId: null;
} {
  return {
    matchedExistingExternalId: null,
    matchedExistingCustomerId: null,
  };
}

function logCustomerImportTrace(label: string, payload: unknown) {
  if (!CUSTOMER_IMPORT_DEBUG) return;
  console.info(`[customer-csv-import] ${label}`, payload);
}

function logCustomerImportRow385Trace(label: string, payload: unknown) {
  console.info(`[customer-csv-import][row-385] ${label}`, payload);
}

function traceCustomerImportRow(
  rowNumber: number | undefined,
  label: string,
  payload: unknown,
) {
  if (rowNumber === CUSTOMER_IMPORT_TRACE_ROW) {
    logCustomerImportRow385Trace(label, payload);
    return;
  }

  logCustomerImportTrace(label, payload);
}

function findExistingCustomer(
  existingIdentities: ExistingCustomerIdentityMaps,
  normalized: CustomerInsert,
  rowNumber?: number,
): CustomerMatch | null {
  traceCustomerImportRow(rowNumber, "findExistingCustomer input", {
    normalized,
    externalIdentityKey: customerExternalIdentityKey(normalized),
    fallbackIdentityKeys: customerFallbackIdentityKeys(normalized),
  });

  const externalKey = customerExternalIdentityKey(normalized);
  if (externalKey) {
    // CSV customer_id/external_id values are authoritative. Rows with an
    // external identity may only update when that exact external_id already
    // exists; company/email/phone/name fallbacks are intentionally disabled.
    const existing = existingIdentities.byExternalId.get(externalKey) ?? null;
    traceCustomerImportRow(rowNumber, "Matching branch", {
      row: rowNumber,
      externalId: normalized.external_id ?? null,
      branch: "EXTERNAL_ID",
      reason:
        "normalized.external_id is present, so fallback email/phone/name matching is skipped",
      matchedBy: existing?.matchedBy ?? null,
      existingCustomer: existing?.matchedValue ?? existing?.id ?? null,
    });
    traceCustomerImportRow(rowNumber, "findExistingCustomer early return", {
      row: rowNumber,
      branch: "EXTERNAL_ID",
      returnValue: existing,
    });
    return existing;
  }

  const fallbackKeys = customerFallbackIdentityKeys(normalized);
  for (const key of fallbackKeys) {
    const existing = existingIdentities.byFallbackIdentity.get(key);
    if (existing) {
      traceCustomerImportRow(rowNumber, "Matching branch", {
        row: rowNumber,
        externalId: normalized.external_id ?? null,
        branch: `${(existing.matchedBy ?? "identity").toUpperCase()}_FALLBACK`,
        reason: "externalId missing",
        matchedBy: existing.matchedBy ?? null,
        existingCustomer: existing.matchedValue ?? existing.id,
      });
      traceCustomerImportRow(rowNumber, "findExistingCustomer early return", {
        row: rowNumber,
        branch: `${(existing.matchedBy ?? "identity").toUpperCase()}_FALLBACK`,
        returnValue: existing,
      });
      return existing;
    }
  }
  traceCustomerImportRow(rowNumber, "Matching branch", {
    row: rowNumber,
    externalId: normalized.external_id ?? null,
    branch: "NO_MATCH",
    reason: externalKey ? "external_id_not_found" : "externalId missing",
    fallbackKeys,
  });
  traceCustomerImportRow(rowNumber, "findExistingCustomer early return", {
    row: rowNumber,
    branch: "NO_MATCH",
    returnValue: null,
  });
  return null;
}

function rememberPendingCustomerIdentity(
  existingIdentities: ExistingCustomerIdentityMaps,
  key: string,
  rowIndex: number,
) {
  const match = {
    id: `pending-${rowIndex}`,
    external_id: key.startsWith("external:")
      ? (describeIdentityKey(key).matchedValue ?? null)
      : null,
    ...describeIdentityKey(key),
  };
  if (key.startsWith("external:"))
    existingIdentities.byExternalId.set(key, match);
  else existingIdentities.byFallbackIdentity.set(key, match);
}

function rememberCreatedCustomerIdentity(
  existingIdentities: ExistingCustomerIdentityMaps,
  key: string,
  row: number,
) {
  const match = {
    id: `created-${row}`,
    external_id: key.startsWith("external:")
      ? (describeIdentityKey(key).matchedValue ?? null)
      : null,
    ...describeIdentityKey(key),
  };
  if (key.startsWith("external:"))
    existingIdentities.byExternalId.set(key, match);
  else existingIdentities.byFallbackIdentity.set(key, match);
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
    const detectedHeaders = Array.isArray(body.headers) ? body.headers : [];
    logCustomerImportTrace("Detected headers", detectedHeaders);

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
    const existingIdentities = await loadExistingCustomerIdentities(
      supabase,
      shopId,
    );
    const seenImportIdentities = new Set<string>();
    const customersToCreate: PendingCustomerInsert[] = [];

    for (const [index, raw] of rawRows.entries()) {
      const rowNumber = index + 1;
      try {
        if (rowNumber === CUSTOMER_IMPORT_TRACE_ROW || index < 10) {
          traceCustomerImportRow(rowNumber, "Raw CSV row", {
            row: rowNumber,
            raw,
          });
        }

        const normalized = normalizeImportedCustomerRow(
          raw as ImportRow,
          shopId,
        );

        if (rowNumber === CUSTOMER_IMPORT_TRACE_ROW || index < 10) {
          traceCustomerImportRow(rowNumber, "Normalized row", {
            row: rowNumber,
            normalized,
            rawCustomerId: (raw as ImportRow).customer_id ?? null,
            rawExternalId: (raw as ImportRow).external_id ?? null,
            rawCustomerNumber: (raw as ImportRow).customer_number ?? null,
          });
        }

        if (!normalized) {
          traceCustomerImportRow(rowNumber, "Early return: missing identity", {
            row: rowNumber,
            reason: "normalizeImportedCustomerRow returned null",
          });
          counts.skipped += 1;
          skippedRows.push({
            row: rowNumber,
            reason: "Missing customer name, company, email, and phone.",
            ...importRowSummary(raw as ImportRow),
            matchedBy: "missing_identity",
            ...noMatchedExistingDetails(),
          });
          continue;
        }

        const identityKeys = customerIdentityKeys(normalized);
        traceCustomerImportRow(rowNumber, "Derived identity keys", {
          row: rowNumber,
          externalIdentityKey: customerExternalIdentityKey(normalized),
          fallbackIdentityKeys: customerFallbackIdentityKeys(normalized),
          selectedIdentityKeys: identityKeys,
        });

        const duplicateKey = identityKeys.find((key) =>
          seenImportIdentities.has(key),
        );
        if (duplicateKey) {
          traceCustomerImportRow(rowNumber, "Early return: duplicate in CSV", {
            row: rowNumber,
            duplicateKey,
          });
          counts.duplicates += 1;
          counts.skipped += 1;
          const duplicateMatch = describeIdentityKey(duplicateKey);
          skippedRows.push({
            row: rowNumber,
            reason: "Duplicate customer identity within this CSV.",
            ...importRowSummary(raw as ImportRow, normalized),
            matchedBy: "duplicate_in_csv",
            matchedValue: duplicateMatch.matchedValue,
            ...noMatchedExistingDetails(),
          });
          continue;
        }

        const existing = findExistingCustomer(
          existingIdentities,
          normalized,
          rowNumber,
        );

        if (existing?.id) {
          traceCustomerImportRow(rowNumber, "Existing customer selected", {
            row: rowNumber,
            existing,
          });
          const datePatch: Pick<
            CustomerInsert,
            "customer_since" | "updated_at"
          > = {};
          if (normalized.customer_since)
            datePatch.customer_since = normalized.customer_since;
          if (normalized.updated_at)
            datePatch.updated_at = normalized.updated_at;

          if (Object.keys(datePatch).length > 0) {
            traceCustomerImportRow(rowNumber, "Updating existing customer", {
              row: rowNumber,
              customerId: existing.id,
              datePatch,
            });
            const { error } = await supabase
              .from("customers")
              .update(datePatch)
              .eq("id", existing.id)
              .eq("shop_id", shopId);
            if (error) throw error;
            counts.updated += 1;
          } else {
            traceCustomerImportRow(rowNumber, "Early return: existing customer skipped", {
              row: rowNumber,
              reason: "No date fields changed",
            });
            counts.skipped += 1;
          }

          const matchedBy =
            (existing.matchedBy as SkippedCustomerImportRow["matchedBy"]) ??
            "existing_customer";
          skippedRows.push({
            row: rowNumber,
            reason:
              Object.keys(datePatch).length > 0
                ? "Matched existing customer; historical date fields were updated."
                : matchedBy === "email"
                  ? "Matched existing customer by email."
                  : "Matched an existing customer for this shop.",
            ...importRowSummary(raw as ImportRow, normalized),
            matchedBy,
            matchedValue: existing.matchedValue ?? existing.id,
            ...matchedExistingDetails(existing),
          });
          continue;
        }

        for (const key of identityKeys) {
          seenImportIdentities.add(key);
          rememberPendingCustomerIdentity(existingIdentities, key, index);
          traceCustomerImportRow(rowNumber, "Row identity mutation", {
            row: rowNumber,
            mutation:
              key.startsWith("external:")
                ? "rememberPendingCustomerIdentity(byExternalId)"
                : "rememberPendingCustomerIdentity(byFallbackIdentity)",
            key,
            customerIdChange: `pending-${index}`,
            externalIdChange: key.startsWith("external:")
              ? describeIdentityKey(key).matchedValue
              : null,
          });
        }

        customersToCreate.push({
          row: rowNumber,
          customer: { ...normalized, user_id: null },
          summary: importRowSummary(raw as ImportRow, normalized),
          identityKeys,
        });
        traceCustomerImportRow(rowNumber, "Queued customer insert payload", {
          row: rowNumber,
          payload: { ...normalized, user_id: null },
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
      traceCustomerImportRow(pending.row, "Database insert payload", {
        row: pending.row,
        payload,
      });
      const { error } = await supabase.from("customers").insert(payload);

      if (error) {
        const safeError = describeSupabaseInsertError(error);
        const duplicateSkipReason = duplicateSkipReasonForConstraint(
          safeError.constraint,
        );
        traceCustomerImportRow(pending.row, "Database insert error", {
          row: pending.row,
          safeError,
          duplicateSkipReason,
          selectedMatchedBy: duplicateSkipReason
            ? matchedByForConstraint(safeError.constraint)
            : null,
          note:
            "This duplicate-constraint path runs after findExistingCustomer returned null; it can report matchedBy=email from the database email constraint even when the row carried an external_id.",
        });

        if (duplicateSkipReason) {
          counts.skipped += 1;
          skippedRows.push({
            row: pending.row,
            reason: duplicateSkipReason,
            ...pending.summary,
            matchedBy: pending.customer.external_id
              ? "external_id"
              : matchedByForConstraint(safeError.constraint),
            matchedValue:
              pending.customer.external_id
                ? pending.customer.external_id
                : safeError.constraint === "customers_shop_email_uq"
                ? normalizeEmail(pending.customer.email)
                : safeError.constraint,
            ...noMatchedExistingDetails(),
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
        rememberCreatedCustomerIdentity(existingIdentities, key, pending.row);
        traceCustomerImportRow(pending.row, "Row identity mutation", {
          row: pending.row,
          mutation:
            key.startsWith("external:")
              ? "rememberCreatedCustomerIdentity(byExternalId)"
              : "rememberCreatedCustomerIdentity(byFallbackIdentity)",
          key,
          customerIdChange: `created-${pending.row}`,
          externalIdChange: key.startsWith("external:")
            ? describeIdentityKey(key).matchedValue
            : null,
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
