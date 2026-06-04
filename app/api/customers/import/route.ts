import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type DB = Database;
type CustomerInsert = DB["public"]["Tables"]["customers"]["Insert"];
type CustomerUpdate = DB["public"]["Tables"]["customers"]["Update"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type CustomerMatch = Pick<
  CustomerRow,
  | "id"
  | "shop_id"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "phone_number"
  | "address"
  | "street"
  | "city"
  | "province"
  | "postal_code"
  | "notes"
  | "import_notes"
>;
type SupabaseRouteClient = ReturnType<typeof createServerSupabaseRoute>;
type SupabaseQuery = {
  eq: (column: string, value: unknown) => SupabaseQuery;
  or: (filters: string) => SupabaseQuery;
};

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

type ImportDiagnostic = {
  row: number;
  identity: SafeRowIdentity;
  reason: string;
  code?: string;
  constraint?: string;
};

type SafeRowIdentity = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
  name?: string;
};

const CUSTOMER_SELECT =
  "id,shop_id,business_name,name,first_name,last_name,email,phone,phone_number,address,street,city,province,postal_code,notes,import_notes";
const MAX_IMPORT_ROWS = 5000;
const MAX_DIAGNOSTICS = 25;

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

function normalizeComparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? null,
  };
}

function escapeOrValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(",", "\\,")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function normalizeRow(
  row: ImportRow,
  userId: string,
  shopId: string,
): CustomerInsert | null {
  const businessName =
    cleanString(row.business_name) ?? cleanString(row.company_name);
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

async function findSingleCustomer(
  supabase: SupabaseRouteClient,
  buildQuery: (query: SupabaseQuery) => unknown,
): Promise<CustomerMatch | null> {
  const query = buildQuery(
    supabase.from("customers").select(CUSTOMER_SELECT).limit(1),
  );
  const { data, error } = (await query) as {
    data: CustomerMatch[] | null;
    error: SupabaseErrorLike | null;
  };
  if (error) return null;
  return data?.[0] ?? null;
}

function locationKey(customer: CustomerInsert | CustomerMatch): string {
  return [
    customer.street ?? customer.address,
    customer.city,
    customer.province,
    customer.postal_code,
  ]
    .map(normalizeComparable)
    .filter(Boolean)
    .join("|");
}

function nameKey(customer: CustomerInsert | CustomerMatch): string {
  const displayName =
    customer.business_name ||
    customer.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return normalizeComparable(displayName);
}

async function findByNameAndLocationFallback(
  supabase: SupabaseRouteClient,
  shopId: string,
  customer: CustomerInsert,
): Promise<CustomerMatch | null> {
  const targetName = nameKey(customer);
  if (!targetName) return null;

  const targetLocation = locationKey(customer);
  if (!targetLocation && !customer.city && !customer.postal_code) return null;

  const { data, error } = (await supabase
    .from("customers")
    .select(CUSTOMER_SELECT)
    .eq("shop_id", shopId)
    .limit(5000)) as {
    data: CustomerMatch[] | null;
    error: SupabaseErrorLike | null;
  };

  if (error || !data?.length) return null;

  return (
    data.find((candidate) => {
      if (candidate.shop_id !== shopId) return false;
      if (nameKey(candidate) !== targetName) return false;
      const candidateLocation = locationKey(candidate);
      if (targetLocation && candidateLocation)
        return candidateLocation === targetLocation;
      return (
        normalizeComparable(candidate.city) ===
          normalizeComparable(customer.city) &&
        normalizeComparable(candidate.postal_code) ===
          normalizeComparable(customer.postal_code)
      );
    }) ?? null
  );
}

async function findExistingCustomer(
  supabase: SupabaseRouteClient,
  shopId: string,
  customer: CustomerInsert,
): Promise<CustomerMatch | null> {
  if (customer.email) {
    const match = await findSingleCustomer(supabase, (query) =>
      query.eq("shop_id", shopId).eq("email", customer.email),
    );
    if (match?.id) return match;
  }

  const phone = customer.phone ?? customer.phone_number;
  if (phone) {
    const match = await findSingleCustomer(supabase, (query) =>
      query
        .eq("shop_id", shopId)
        .or(
          `phone.eq.${escapeOrValue(phone)},phone_number.eq.${escapeOrValue(phone)}`,
        ),
    );
    if (match?.id) return match;
  }

  return findByNameAndLocationFallback(supabase, shopId, customer);
}

function getCustomerImportCookieDiagnostics() {
  try {
    const cookieStore = cookies() as unknown as {
      getAll?: () => { name: string; value?: string }[];
    };
    const cookieNames =
      cookieStore.getAll?.().map((cookie) => cookie.name) ?? [];
    const supabaseAuthCookieCount = cookieNames.filter((name) =>
      name.startsWith("sb-"),
    ).length;

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

function hasMeaningfulChanges(
  existing: CustomerMatch,
  update: CustomerUpdate,
): boolean {
  return (Object.keys(update) as Array<keyof CustomerUpdate>).some((key) => {
    if (key === "updated_at") return false;
    return (
      update[key] != null &&
      update[key] !== existing[key as keyof CustomerMatch]
    );
  });
}

function getSafeIdentity(customer: CustomerInsert): SafeRowIdentity {
  return {
    email: customer.email ?? null,
    phone: customer.phone ?? customer.phone_number ?? null,
    name:
      (customer.name ??
        customer.business_name ??
        [customer.first_name, customer.last_name].filter(Boolean).join(" ")) ||
      null,
  };
}

function getConstraint(
  error: SupabaseErrorLike | null | undefined,
): string | undefined {
  const text = [error?.message, error?.details].filter(Boolean).join(" ");
  return (
    text.match(/constraint\s+"([^"]+)"/)?.[1] ??
    text.match(/unique\s+constraint\s+"([^"]+)"/)?.[1]
  );
}

function isDuplicateError(
  error: SupabaseErrorLike | null | undefined,
): boolean {
  return (
    error?.code === "23505" ||
    error?.status === 409 ||
    /duplicate key|unique constraint/i.test(error?.message ?? "")
  );
}

function addDiagnostic(
  collection: ImportDiagnostic[],
  diagnostic: ImportDiagnostic,
) {
  if (collection.length < MAX_DIAGNOSTICS) collection.push(diagnostic);
}

function logRowImportIssue(
  row: number,
  customer: CustomerInsert,
  error: SupabaseErrorLike,
  context: string,
) {
  console.warn("[customers-import] row import issue", {
    row,
    context,
    identity: getSafeIdentity(customer),
    code: error.code,
    status: error.status,
    constraint: getConstraint(error),
    message: error.message,
  });
}

async function updateExistingCustomer(
  supabase: SupabaseRouteClient,
  shopId: string,
  existing: CustomerMatch,
  customer: CustomerInsert,
): Promise<{
  status: "updated" | "skipped" | "failed";
  error?: SupabaseErrorLike;
  reason?: string;
}> {
  if (existing.shop_id && existing.shop_id !== shopId) {
    return {
      status: "failed",
      reason: "Matched customer is outside the authenticated shop scope.",
    };
  }

  const update = updatePayload(customer);
  if (!hasMeaningfulChanges(existing, update))
    return {
      status: "skipped",
      reason: "Existing customer already has the same import values.",
    };

  const { error } = (await supabase
    .from("customers")
    .update(update)
    .eq("shop_id", shopId)
    .eq("id", existing.id)) as { error: SupabaseErrorLike | null };
  if (error) return { status: "failed", error };
  return { status: "updated" };
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
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
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
    return NextResponse.json(
      { ok: false, error: "Profile for current user not found" },
      { status: 403 },
    );
  }

  if (!profile.shop_id) {
    return NextResponse.json(
      { ok: false, error: "Missing shop" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body) || !Array.isArray(body.rows)) {
    return NextResponse.json(
      { ok: false, error: "Invalid customer import payload" },
      { status: 400 },
    );
  }

  const counts: Counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const warnings: ImportDiagnostic[] = [];
  const errors: ImportDiagnostic[] = [];
  const shopId = profile.shop_id;
  const inputRows = body.rows.slice(0, MAX_IMPORT_ROWS);

  if (body.rows.length > MAX_IMPORT_ROWS) {
    const skipped = body.rows.length - MAX_IMPORT_ROWS;
    counts.skipped += skipped;
    addDiagnostic(warnings, {
      row: MAX_IMPORT_ROWS + 1,
      identity: {},
      reason: `Import is limited to ${MAX_IMPORT_ROWS} rows per request; ${skipped} extra rows were skipped.`,
    });
  }

  for (const [index, rawRow] of inputRows.entries()) {
    const rowNumber = index + 1;
    if (!isRecord(rawRow)) {
      counts.skipped += 1;
      addDiagnostic(warnings, {
        row: rowNumber,
        identity: {},
        reason: "Row is not an object.",
      });
      continue;
    }

    const customer = normalizeRow(rawRow as ImportRow, user.id, shopId);
    if (!customer) {
      counts.skipped += 1;
      addDiagnostic(warnings, {
        row: rowNumber,
        identity: {},
        reason: "Missing customer identity fields.",
      });
      continue;
    }

    try {
      const existing = await findExistingCustomer(supabase, shopId, customer);
      if (existing?.id) {
        const result = await updateExistingCustomer(
          supabase,
          shopId,
          existing,
          customer,
        );
        if (result.status === "updated") counts.updated += 1;
        else if (result.status === "skipped") {
          counts.skipped += 1;
          addDiagnostic(warnings, {
            row: rowNumber,
            identity: getSafeIdentity(customer),
            reason: result.reason ?? "Existing customer skipped.",
          });
        } else {
          counts.failed += 1;
          if (result.error)
            logRowImportIssue(rowNumber, customer, result.error, "update");
          addDiagnostic(errors, {
            row: rowNumber,
            identity: getSafeIdentity(customer),
            reason:
              result.error?.message ??
              result.reason ??
              "Unable to update existing customer.",
            code: result.error?.code,
            constraint: getConstraint(result.error),
          });
        }
        continue;
      }

      const { error } = (await supabase.from("customers").insert(customer)) as {
        error: SupabaseErrorLike | null;
      };
      if (!error) {
        counts.created += 1;
        continue;
      }

      logRowImportIssue(rowNumber, customer, error, "insert");

      if (isDuplicateError(error)) {
        const duplicateMatch = await findExistingCustomer(
          supabase,
          shopId,
          customer,
        );
        if (duplicateMatch?.id) {
          const result = await updateExistingCustomer(
            supabase,
            shopId,
            duplicateMatch,
            customer,
          );
          if (result.status === "updated") counts.updated += 1;
          else if (result.status === "skipped") {
            counts.skipped += 1;
            addDiagnostic(warnings, {
              row: rowNumber,
              identity: getSafeIdentity(customer),
              reason: result.reason ?? "Duplicate customer already exists.",
            });
          } else {
            counts.failed += 1;
            if (result.error)
              logRowImportIssue(
                rowNumber,
                customer,
                result.error,
                "duplicate-update",
              );
            addDiagnostic(errors, {
              row: rowNumber,
              identity: getSafeIdentity(customer),
              reason:
                result.error?.message ??
                result.reason ??
                "Duplicate customer could not be updated.",
              code: result.error?.code,
              constraint: getConstraint(result.error),
            });
          }
          continue;
        }

        counts.skipped += 1;
        addDiagnostic(warnings, {
          row: rowNumber,
          identity: getSafeIdentity(customer),
          reason:
            "Duplicate customer constraint hit, but no safe same-shop match was found to update.",
          code: error.code,
          constraint: getConstraint(error),
        });
        continue;
      }

      counts.failed += 1;
      addDiagnostic(errors, {
        row: rowNumber,
        identity: getSafeIdentity(customer),
        reason: error.message ?? "Unable to import customer.",
        code: error.code,
        constraint: getConstraint(error),
      });
    } catch (error) {
      counts.failed += 1;
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected customer import error.";
      console.warn("[customers-import] row import exception", {
        row: rowNumber,
        message,
      });
      addDiagnostic(errors, {
        row: rowNumber,
        identity: getSafeIdentity(customer),
        reason: message,
      });
    }
  }

  return NextResponse.json({ ok: true, counts, warnings, errors });
}
