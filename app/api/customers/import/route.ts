import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type CustomerInsert = DB["public"]["Tables"]["customers"]["Insert"];
type CustomerUpdate = DB["public"]["Tables"]["customers"]["Update"];
type CustomerMatch = Pick<DB["public"]["Tables"]["customers"]["Row"], "id">;

type ImportRow = {
  first_name?: unknown;
  last_name?: unknown;
  name?: unknown;
  company_name?: unknown;
  business_name?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  address?: unknown;
  street?: unknown;
  city?: unknown;
  province?: unknown;
  state?: unknown;
  postal_code?: unknown;
  zip?: unknown;
  notes?: unknown;
};

type CustomerImportBody = {
  rows?: unknown;
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

function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? null };
}


function normalizeRow(row: ImportRow, userId: string, shopId: string): CustomerInsert | null {
  const businessName = cleanString(row.business_name) ?? cleanString(row.company_name);
  const explicitName = cleanString(row.name);
  const split = splitName(explicitName);
  const firstName = cleanString(row.first_name) ?? split.firstName;
  const lastName = cleanString(row.last_name) ?? split.lastName;
  const email = cleanEmail(row.email);
  const phone = cleanPhone(row.phone) ?? cleanPhone(row.phone_number);
  const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = businessName ?? explicitName ?? (personName || null);

  if (!displayName && !email && !phone) return null;

  return {
    shop_id: shopId,
    user_id: userId,
    first_name: firstName,
    last_name: lastName,
    name: explicitName ?? displayName,
    business_name: businessName,
    email,
    phone,
    phone_number: phone,
    address: cleanString(row.address) ?? cleanString(row.street),
    city: cleanString(row.city),
    province: cleanString(row.province) ?? cleanString(row.state),
    postal_code: cleanString(row.postal_code) ?? cleanString(row.zip),
    notes: cleanString(row.notes),
  } satisfies CustomerInsert;
}

async function findExistingCustomer(
  supabase: SupabaseClient<DB>,
  shopId: string,
  normalized: CustomerInsert,
): Promise<CustomerMatch | null> {
  if (normalized.external_id) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("external_id", normalized.external_id)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.email) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("email", normalized.email)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.phone) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("phone", normalized.phone)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.name) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("name", normalized.name)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.business_name) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("business_name", normalized.business_name)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
    if (!access.ok) return access.response;

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    const userId = profile.id;

    if (!shopId) {
      return NextResponse.json({ error: "Missing shop context." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as CustomerImportBody;
    const rawRows = Array.isArray(body.rows) ? body.rows : [];

    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    const errors: Array<{ row: number; error: string }> = [];

    for (const [index, raw] of rawRows.entries()) {
      try {
        const normalized = normalizeRow(raw as ImportRow, userId, shopId);

        if (!normalized) {
          counts.skipped += 1;
          continue;
        }

        const existing = await findExistingCustomer(supabase, shopId, normalized);

        if (existing?.id) {
          const updatePayload: CustomerUpdate = {
            first_name: normalized.first_name,
            last_name: normalized.last_name,
            name: normalized.name,
            business_name: normalized.business_name,
            email: normalized.email,
            phone: normalized.phone,
            phone_number: normalized.phone_number,
            address: normalized.address,
            city: normalized.city,
            province: normalized.province,
            postal_code: normalized.postal_code,
            notes: normalized.notes,
          };

          const { error } = await supabase
            .from("customers")
            .update(updatePayload)
            .eq("id", existing.id)
            .eq("shop_id", shopId);

          if (error) throw error;
          counts.updated += 1;
        } else {
          const { error } = await supabase.from("customers").insert(normalized);
          if (error) throw error;
          counts.created += 1;
        }
      } catch (error) {
        counts.failed += 1;
        errors.push({
          row: index + 1,
          error: error instanceof Error ? error.message : "Unable to import row.",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      counts,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import customers." },
      { status: 500 },
    );
  }
}
