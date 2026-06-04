import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

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

type Counts = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? null };
}

function escapeOrValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll("%", "\\%").replaceAll("_", "\\_");
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
    is_fleet: Boolean(businessName),
    business_name: businessName,
    name: displayName,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    phone_number: phone,
    address: cleanString(row.address) ?? cleanString(row.street),
    street: cleanString(row.street) ?? cleanString(row.address),
    city: cleanString(row.city),
    province: cleanString(row.province) ?? cleanString(row.state),
    postal_code: cleanString(row.postal_code) ?? cleanString(row.zip),
    notes: cleanString(row.notes),
    import_notes: "Imported from Customers CSV import.",
  };
}

async function findExistingCustomer(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  shopId: string,
  customer: CustomerInsert,
): Promise<CustomerMatch | null> {
  if (customer.email) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("email", customer.email)
      .maybeSingle<CustomerMatch>();
    if (data?.id) return data;
  }

  const phone = customer.phone ?? customer.phone_number;
  if (phone) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .or(`phone.eq.${escapeOrValue(phone)},phone_number.eq.${escapeOrValue(phone)}`)
      .maybeSingle<CustomerMatch>();
    if (data?.id) return data;
  }

  if (customer.name) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .eq("name", customer.name)
      .maybeSingle<CustomerMatch>();
    if (data?.id) return data;
  }

  return null;
}

function getCustomerImportCookieDiagnostics() {
  try {
    const cookieStore = cookies() as unknown as {
      getAll?: () => { name: string; value?: string }[];
    };
    const cookieNames = cookieStore.getAll?.().map((cookie) => cookie.name) ?? [];
    const supabaseAuthCookieCount = cookieNames.filter((name) => name.startsWith("sb-")).length;

    return {
      hasSupabaseAuthCookies: supabaseAuthCookieCount > 0,
      supabaseAuthCookieCount,
    };
  } catch {
    return {
      hasSupabaseAuthCookies: false,
      supabaseAuthCookieCount: 0,
    };
  }
}

function logCustomerImportAuthDiagnostic(
  stage: "auth" | "profile",
  details: {
    hasSupabaseAuthCookies: boolean;
    supabaseAuthCookieCount: number;
    hasUserId?: boolean;
    hasProfileShopId?: boolean;
  },
) {
  console.info("[customers-import] auth diagnostic", { stage, ...details });
}

function updatePayload(customer: CustomerInsert): CustomerUpdate {
  const update: CustomerUpdate = { updated_at: new Date().toISOString() };
  for (const key of [
    "business_name",
    "name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "phone_number",
    "address",
    "street",
    "city",
    "province",
    "postal_code",
    "notes",
    "import_notes",
  ] as const) {
    const value = customer[key];
    if (value != null && value !== "") update[key] = value;
  }
  return update;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  const cookieDiagnostics = getCustomerImportCookieDiagnostics();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  logCustomerImportAuthDiagnostic("auth", {
    ...cookieDiagnostics,
    hasUserId: Boolean(user?.id),
  });

  if (userError || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  logCustomerImportAuthDiagnostic("profile", {
    ...cookieDiagnostics,
    hasUserId: true,
    hasProfileShopId: Boolean(profile?.shop_id),
  });

  if (profileError || !profile) {
    return NextResponse.json({ ok: false, error: "Profile for current user not found" }, { status: 403 });
  }

  if (!profile.shop_id) {
    return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: "Invalid customer import payload" }, { status: 400 });
  }

  const counts: Counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const shopId = profile.shop_id;
  const inputRows = body.rows.slice(0, 1000);

  for (const rawRow of inputRows) {
    if (!isRecord(rawRow)) {
      counts.skipped += 1;
      continue;
    }

    const customer = normalizeRow(rawRow as ImportRow, user.id, shopId);
    if (!customer) {
      counts.skipped += 1;
      continue;
    }

    try {
      const existing = await findExistingCustomer(supabase, shopId, customer);
      if (existing?.id) {
        const { error } = await supabase
          .from("customers")
          .update(updatePayload(customer))
          .eq("shop_id", shopId)
          .eq("id", existing.id);
        if (error) counts.failed += 1;
        else counts.updated += 1;
        continue;
      }

      const { error } = await supabase.from("customers").insert(customer);
      if (error) counts.failed += 1;
      else counts.created += 1;
    } catch {
      counts.failed += 1;
    }
  }

  return NextResponse.json({ ok: true, counts });
}
