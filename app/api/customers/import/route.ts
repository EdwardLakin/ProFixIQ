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
  | "external_id"
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
  | "created_at"
>;
type SupabaseRouteClient = ReturnType<typeof createServerSupabaseRoute>;
type ImportRow = {
  customer_id?: unknown;
  external_id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  name?: unknown;
  display_name?: unknown;
  company_name?: unknown;
  business_name?: unknown;
  email?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  phone_primary?: unknown;
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
  tags?: unknown;
  customer_type?: unknown;
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
  status?: number;
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
  "id,shop_id,external_id,business_name,name,first_name,last_name,email,phone,phone_number,address,street,city,province,postal_code,notes,import_notes,created_at";
const MAX_IMPORT_ROWS = 5000;
const MAX_DIAGNOSTICS = 25;
const INSERT_BATCH_SIZE = 250;
const CUSTOMER_PREFETCH_PAGE_SIZE = 1000;

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

function normalizeEmailComparable(value: unknown): string {
  return cleanEmail(value) ?? "";
}

function cleanPhone(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits || raw;
}

function normalizePhoneComparable(value: unknown): string {
  return cleanPhone(value) ?? "";
}

function normalizeComparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExternalIdComparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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

function normalizeRow(row: ImportRow, shopId: string): CustomerInsert | null {
  const externalId =
    cleanString(row.external_id) ?? cleanString(row.customer_id);
  const businessName =
    cleanString(row.business_name) ?? cleanString(row.company_name);
  const explicitName = cleanString(row.display_name) ?? cleanString(row.name);
  const split = splitName(explicitName);
  const firstName = cleanString(row.first_name) ?? split.firstName;
  const lastName = cleanString(row.last_name) ?? split.lastName;
  const email = cleanEmail(row.email);
  const primaryPhone = cleanPhone(row.phone_primary) ?? cleanPhone(row.phone);
  const secondaryPhone =
    cleanPhone(row.phone_secondary) ?? cleanPhone(row.phone_number);
  const phone = primaryPhone ?? secondaryPhone;
  const personName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = explicitName ?? businessName ?? (personName || null);
  const customerType = normalizeComparable(row.customer_type);
  const isFleet =
    Boolean(businessName) ||
    customerType === "fleet" ||
    customerType === "business" ||
    customerType === "company";

  if (!externalId && !displayName && !email && !phone) return null;

  return {
    shop_id: shopId,
    external_id: externalId,
    is_fleet: isFleet,
    business_name: businessName,
    name: displayName,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    phone_number: secondaryPhone ?? phone,
    address:
      cleanString(row.address1) ??
      cleanString(row.address) ??
      cleanString(row.street),
    street:
      cleanString(row.street) ??
      cleanString(row.address1) ??
      cleanString(row.address),
    city: cleanString(row.city),
    province: cleanString(row.province) ?? cleanString(row.state),
    postal_code: cleanString(row.postal_code) ?? cleanString(row.zip),
    notes: cleanString(row.notes),
    import_notes: "Imported from Customers CSV import.",
  };
}

type CustomerMatchIndex = {
  byExternalId: Map<string, CustomerMatch>;
  byEmail: Map<string, CustomerMatch>;
  byPhone: Map<string, CustomerMatch>;
  byNameLocation: Map<string, CustomerMatch>;
};

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

function nameLocationKey(customer: CustomerInsert | CustomerMatch): string {
  const targetName = nameKey(customer);
  if (!targetName) return "";

  const targetLocation = locationKey(customer);
  if (targetLocation) return `${targetName}|${targetLocation}`;

  const city = normalizeComparable(customer.city);
  const postalCode = normalizeComparable(customer.postal_code);
  if (!city && !postalCode) return "";
  return `${targetName}|${city}|${postalCode}`;
}

function createCustomerMatchIndex(
  customers: CustomerMatch[],
): CustomerMatchIndex {
  const index: CustomerMatchIndex = {
    byExternalId: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byNameLocation: new Map(),
  };

  for (const customer of customers) {
    const externalId = normalizeExternalIdComparable(customer.external_id);
    if (externalId && !index.byExternalId.has(externalId))
      index.byExternalId.set(externalId, customer);

    const email = normalizeEmailComparable(customer.email);
    if (email && !index.byEmail.has(email)) index.byEmail.set(email, customer);

    for (const phoneValue of [customer.phone, customer.phone_number]) {
      const phone = normalizePhoneComparable(phoneValue);
      if (phone && !index.byPhone.has(phone))
        index.byPhone.set(phone, customer);
    }

    const combinedNameLocation = nameLocationKey(customer);
    if (combinedNameLocation && !index.byNameLocation.has(combinedNameLocation))
      index.byNameLocation.set(combinedNameLocation, customer);
  }

  return index;
}

function addCustomerToMatchIndex(
  index: CustomerMatchIndex,
  customer: CustomerMatch,
) {
  const scopedIndex = createCustomerMatchIndex([customer]);
  for (const [key, value] of scopedIndex.byExternalId) {
    if (!index.byExternalId.has(key)) index.byExternalId.set(key, value);
  }
  for (const [key, value] of scopedIndex.byEmail) {
    if (!index.byEmail.has(key)) index.byEmail.set(key, value);
  }
  for (const [key, value] of scopedIndex.byPhone) {
    if (!index.byPhone.has(key)) index.byPhone.set(key, value);
  }
  for (const [key, value] of scopedIndex.byNameLocation) {
    if (!index.byNameLocation.has(key)) index.byNameLocation.set(key, value);
  }
}

function customerInsertToMatch(
  customer: CustomerInsert,
  id = customer.id ?? `pending-${Math.random().toString(36).slice(2)}`,
): CustomerMatch {
  return {
    id,
    shop_id: customer.shop_id ?? null,
    external_id: customer.external_id ?? null,
    business_name: customer.business_name ?? null,
    name: customer.name ?? null,
    first_name: customer.first_name ?? null,
    last_name: customer.last_name ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    phone_number: customer.phone_number ?? null,
    address: customer.address ?? null,
    street: customer.street ?? null,
    city: customer.city ?? null,
    province: customer.province ?? null,
    postal_code: customer.postal_code ?? null,
    notes: customer.notes ?? null,
    import_notes: customer.import_notes ?? null,
    created_at: customer.created_at ?? null,
  };
}

async function getShopCustomerCandidates(
  supabase: SupabaseRouteClient,
  shopId: string,
): Promise<CustomerMatch[]> {
  const customers: CustomerMatch[] = [];

  for (let from = 0; ; from += CUSTOMER_PREFETCH_PAGE_SIZE) {
    const to = from + CUSTOMER_PREFETCH_PAGE_SIZE - 1;
    const { data, error } = (await supabase
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)) as {
      data: CustomerMatch[] | null;
      error: SupabaseErrorLike | null;
    };

    if (error) {
      console.warn("[customers-import] customer prefetch failed", {
        shopId,
        from,
        to,
        code: error.code,
        status: error.status,
        message: error.message,
      });
      break;
    }

    const page = (data ?? []).filter(
      (candidate) => candidate.shop_id === shopId,
    );
    customers.push(...page);

    if (!data || data.length < CUSTOMER_PREFETCH_PAGE_SIZE) break;
  }

  return customers;
}

function findExistingCustomer(
  index: CustomerMatchIndex,
  shopId: string,
  customer: CustomerInsert,
): CustomerMatch | null {
  const externalId = normalizeExternalIdComparable(customer.external_id);
  const externalMatch = externalId ? index.byExternalId.get(externalId) : null;
  if (externalMatch?.shop_id === shopId) return externalMatch;

  const email = normalizeEmailComparable(customer.email);
  const emailMatch = email ? index.byEmail.get(email) : null;
  if (emailMatch?.shop_id === shopId) return emailMatch;

  const phone = normalizePhoneComparable(
    customer.phone ?? customer.phone_number,
  );
  const phoneMatch = phone ? index.byPhone.get(phone) : null;
  if (phoneMatch?.shop_id === shopId) return phoneMatch;

  const namedLocation = nameLocationKey(customer);
  const namedLocationMatch = namedLocation
    ? index.byNameLocation.get(namedLocation)
    : null;
  if (namedLocationMatch?.shop_id === shopId) return namedLocationMatch;

  return null;
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
    "external_id",
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

function getPayloadKeys(customer: CustomerInsert): string[] {
  return Object.keys(customer).sort();
}

function payloadHasUserId(customer: CustomerInsert): boolean {
  return Object.hasOwn(customer, "user_id");
}

function logBatchImportIssue(
  rows: PendingCustomerInsert[],
  error: SupabaseErrorLike,
  context: string,
) {
  const rowNumbers = rows.map(({ rowNumber }) => rowNumber);
  const startRow = Math.min(...rowNumbers);
  const endRow = Math.max(...rowNumbers);
  const payloadKeyList = Array.from(
    new Set(rows.flatMap(({ customer }) => getPayloadKeys(customer))),
  ).sort();
  console.warn("[customers-import] batch import issue", {
    rowRange: `${startRow}-${endRow}`,
    context,
    rowCount: rows.length,
    code: error.code,
    status: error.status,
    constraint: getConstraint(error),
    message: error.message,
    containsUserId: rows.some(({ customer }) => payloadHasUserId(customer)),
    payloadKeyList,
    identities: rows.slice(0, 5).map(({ rowNumber, customer }) => ({
      row: rowNumber,
      identity: getSafeIdentity(customer),
    })),
  });
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
    containsUserId: payloadHasUserId(customer),
    payloadKeyList: getPayloadKeys(customer),
  });
}

function isPendingImportMatch(customer: CustomerMatch): boolean {
  return customer.id.startsWith("pending-");
}

type PendingCustomerInsert = {
  rowNumber: number;
  customer: CustomerInsert;
};

function duplicateUserIdConstraintReason(constraint?: string): string {
  if (constraint === "customers_user_id_uq")
    return "CSV import unexpectedly hit customers_user_id_uq even though customer user_id is not set; row skipped for safe recovery.";
  return "Duplicate customer constraint hit, but no safe same-shop match was found to update.";
}

async function insertCustomerBatch(
  supabase: SupabaseRouteClient,
  shopId: string,
  rows: PendingCustomerInsert[],
  matchIndex: CustomerMatchIndex,
  counts: Counts,
  warnings: ImportDiagnostic[],
  errors: ImportDiagnostic[],
) {
  if (!rows.length) return;

  const payload = rows.map(({ customer }) => customer);
  const { error } = (await supabase.from("customers").insert(payload)) as {
    error: SupabaseErrorLike | null;
  };

  if (!error) {
    counts.created += rows.length;
    for (const { customer } of rows) {
      addCustomerToMatchIndex(matchIndex, customerInsertToMatch(customer));
    }
    return;
  }

  logBatchImportIssue(rows, error, "batch-insert");

  if (!isDuplicateError(error)) {
    for (const { rowNumber, customer } of rows) {
      logRowImportIssue(rowNumber, customer, error, "batch-insert");
      counts.failed += 1;
      addDiagnostic(errors, {
        row: rowNumber,
        identity: getSafeIdentity(customer),
        reason: error.message ?? "Unable to import customer.",
        code: error.code,
        status: error.status,
        constraint: getConstraint(error),
      });
    }
    return;
  }

  const conflictedRows: Array<
    PendingCustomerInsert & { error: SupabaseErrorLike }
  > = [];

  for (const { rowNumber, customer } of rows) {
    const { error: rowError } = (await supabase
      .from("customers")
      .insert(customer)) as { error: SupabaseErrorLike | null };

    if (!rowError) {
      counts.created += 1;
      addCustomerToMatchIndex(matchIndex, customerInsertToMatch(customer));
      continue;
    }

    logRowImportIssue(rowNumber, customer, rowError, "single-insert-fallback");

    if (!isDuplicateError(rowError)) {
      counts.failed += 1;
      addDiagnostic(errors, {
        row: rowNumber,
        identity: getSafeIdentity(customer),
        reason: rowError.message ?? "Unable to import customer.",
        code: rowError.code,
        status: rowError.status,
        constraint: getConstraint(rowError),
      });
      continue;
    }

    conflictedRows.push({ rowNumber, customer, error: rowError });
  }

  if (!conflictedRows.length) return;

  const refreshedCustomers = await getShopCustomerCandidates(supabase, shopId);
  const refreshedIndex = createCustomerMatchIndex(refreshedCustomers);

  for (const { rowNumber, customer, error: rowError } of conflictedRows) {
    const duplicateMatch = findExistingCustomer(
      refreshedIndex,
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
      if (result.status === "updated") {
        counts.updated += 1;
        addCustomerToMatchIndex(
          matchIndex,
          customerInsertToMatch(customer, duplicateMatch.id),
        );
        addCustomerToMatchIndex(
          refreshedIndex,
          customerInsertToMatch(customer, duplicateMatch.id),
        );
      } else if (result.status === "skipped") {
        counts.skipped += 1;
        addDiagnostic(warnings, {
          row: rowNumber,
          identity: getSafeIdentity(customer),
          reason: result.reason ?? "Duplicate customer already exists.",
          code: result.error?.code,
          status: result.error?.status,
          constraint: getConstraint(result.error),
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
          status: result.error?.status,
          constraint: getConstraint(result.error),
        });
      }
      continue;
    }

    counts.skipped += 1;
    addDiagnostic(warnings, {
      row: rowNumber,
      identity: getSafeIdentity(customer),
      reason: duplicateUserIdConstraintReason(getConstraint(rowError)),
      code: rowError.code,
      status: rowError.status,
      constraint: getConstraint(rowError),
    });
  }
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
      status: "skipped",
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
  if (error) {
    if (isDuplicateError(error)) {
      return {
        status: "skipped",
        error,
        reason:
          "Existing customer update hit a duplicate constraint; the row was skipped to avoid merging unsafe data.",
      };
    }
    return { status: "failed", error };
  }
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

  const existingCustomers = await getShopCustomerCandidates(supabase, shopId);
  const matchIndex = createCustomerMatchIndex(existingCustomers);
  const pendingInserts: PendingCustomerInsert[] = [];
  const importedExternalIds = new Set<string>();

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

    const customer = normalizeRow(rawRow as ImportRow, shopId);
    if (!customer) {
      counts.skipped += 1;
      addDiagnostic(warnings, {
        row: rowNumber,
        identity: {},
        reason: "Missing customer identity fields.",
      });
      continue;
    }

    const externalId = normalizeExternalIdComparable(customer.external_id);
    if (externalId) {
      if (importedExternalIds.has(externalId)) {
        counts.skipped += 1;
        addDiagnostic(warnings, {
          row: rowNumber,
          identity: getSafeIdentity(customer),
          reason:
            "Duplicate external_id already exists earlier in this import batch.",
        });
        continue;
      }
      importedExternalIds.add(externalId);
    }

    try {
      const existing = findExistingCustomer(matchIndex, shopId, customer);
      if (existing?.id) {
        if (isPendingImportMatch(existing)) {
          counts.skipped += 1;
          addDiagnostic(warnings, {
            row: rowNumber,
            identity: getSafeIdentity(customer),
            reason:
              "Duplicate customer already exists earlier in this import batch.",
          });
          continue;
        }

        const result = await updateExistingCustomer(
          supabase,
          shopId,
          existing,
          customer,
        );
        if (result.status === "updated") {
          counts.updated += 1;
          addCustomerToMatchIndex(
            matchIndex,
            customerInsertToMatch(customer, existing.id),
          );
        } else if (result.status === "skipped") {
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
            status: result.error?.status,
            constraint: getConstraint(result.error),
          });
        }
        continue;
      }

      pendingInserts.push({ rowNumber, customer });
      addCustomerToMatchIndex(
        matchIndex,
        customerInsertToMatch(customer, `pending-${rowNumber}`),
      );
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

  for (
    let index = 0;
    index < pendingInserts.length;
    index += INSERT_BATCH_SIZE
  ) {
    await insertCustomerBatch(
      supabase,
      shopId,
      pendingInserts.slice(index, index + INSERT_BATCH_SIZE),
      matchIndex,
      counts,
      warnings,
      errors,
    );
  }

  return NextResponse.json({ ok: true, counts, warnings, errors });
}
