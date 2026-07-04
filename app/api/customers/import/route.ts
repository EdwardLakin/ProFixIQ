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
>;
type CustomerMatch = Pick<CustomerRow, "id">;

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

  const email = normalizeIdentity(customer.email);
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
      "id, external_id, email, phone, phone_number, name, business_name, address, city, province, postal_code",
    )
    .eq("shop_id", shopId)
    .limit(10000);

  if (error) throw error;

  const byIdentity = new Map<string, CustomerMatch>();
  for (const customer of (data ?? []) as CustomerRow[]) {
    for (const key of customerIdentityKeys(customer)) {
      if (!byIdentity.has(key)) byIdentity.set(key, { id: customer.id });
    }
  }

  return byIdentity;
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
    const existingByIdentity = await loadExistingCustomerIdentities(
      supabase,
      shopId,
    );
    const seenImportIdentities = new Set<string>();
    const customersToCreate: CustomerInsert[] = [];

    for (const [index, raw] of rawRows.entries()) {
      try {
        const normalized = normalizeImportedCustomerRow(
          raw as ImportRow,
          shopId,
        );

        if (!normalized) {
          counts.skipped += 1;
          continue;
        }

        const identityKeys = customerIdentityKeys(normalized);

        if (identityKeys.some((key) => seenImportIdentities.has(key))) {
          counts.duplicates += 1;
          counts.skipped += 1;
          continue;
        }

        const existing = findExistingCustomer(existingByIdentity, normalized);

        if (existing?.id) {
          counts.skipped += 1;
          continue;
        }

        for (const key of identityKeys) {
          seenImportIdentities.add(key);
          existingByIdentity.set(key, { id: `pending-${index}` });
        }

        customersToCreate.push({ ...normalized, user_id: null });
      } catch (error) {
        counts.failed += 1;
        errors.push({
          row: index + 1,
          error:
            error instanceof Error ? error.message : "Unable to import row.",
        });
      }
    }

    if (customersToCreate.length) {
      const { error } = await supabase
        .from("customers")
        .insert(customersToCreate);
      if (error) {
        counts.failed += customersToCreate.length;
        errors.push({ row: 0, error: error.message });
      } else {
        counts.created = customersToCreate.length;
      }
    }

    return NextResponse.json({
      ok: true,
      counts,
      errors,
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
