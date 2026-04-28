import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import type { Database } from "@/features/shared/types/types/supabase";

type JsonObject = Record<string, unknown>;
type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = Database["public"]["Tables"]["suppliers"]["Insert"];
type SupplierUpdate = Database["public"]["Tables"]["suppliers"]["Update"];

export type VendorActivationRecordResult = {
  entityId: string;
  supplierId: string | null;
  action: "inserted" | "updated" | "skipped";
  reason: string;
};

export type VendorActivationResult = {
  inserted: number;
  updated: number;
  skipped: number;
  warnings: number;
  records: VendorActivationRecordResult[];
};

type NormalizedVendor = {
  name: string;
  accountNo: string | null;
  email: string | null;
  phone: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLookupKey(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s\-_.]+/g, " ")
    .replace(/[^a-z0-9 @+]/g, "")
    .trim();
}

function normalizeEmail(value: unknown): string | null {
  const text = normalizeText(value).toLowerCase();
  return text ? text : null;
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return null;
}

function toNormalizedVendor(entity: Pick<OnboardingEntityRow, "normalized" | "display_name">): NormalizedVendor | null {
  const normalized = (entity.normalized ?? {}) as JsonObject;
  const name = firstText([normalized.name, entity.display_name]);
  if (!name) return null;

  const accountNo = firstText([
    normalized.account_no,
    normalized.accountNo,
    normalized.accountNumber,
    normalized.vendorCode,
    normalized.sourceVendorId,
  ]);

  return {
    name,
    accountNo,
    email: normalizeEmail(normalized.email),
    phone: firstText([normalized.phone]),
  };
}

function collectMatchCandidates(params: { supplierRows: SupplierRow[]; vendor: NormalizedVendor }) {
  const nameKey = normalizeLookupKey(params.vendor.name);
  const accountKey = params.vendor.accountNo ? normalizeLookupKey(params.vendor.accountNo) : "";
  const emailKey = params.vendor.email ? normalizeLookupKey(params.vendor.email) : "";

  const matches = params.supplierRows.filter((row) => {
    if (accountKey && normalizeLookupKey(row.account_no) === accountKey) return true;
    if (emailKey && normalizeLookupKey(row.email) === emailKey) return true;
    if (nameKey && normalizeLookupKey(row.name) === nameKey) return true;
    return false;
  });

  return matches;
}

function buildNullSafeUpdate(params: { current: SupplierRow; vendor: NormalizedVendor }): SupplierUpdate | null {
  const update: SupplierUpdate = {};
  if (!normalizeText(params.current.name)) update.name = params.vendor.name;
  if (!normalizeText(params.current.account_no) && params.vendor.accountNo) update.account_no = params.vendor.accountNo;
  if (!normalizeText(params.current.email) && params.vendor.email) update.email = params.vendor.email;
  if (!normalizeText(params.current.phone) && params.vendor.phone) update.phone = params.vendor.phone;

  return Object.keys(update).length ? update : null;
}

export function computeVendorActivationResult(params: {
  shopId: string;
  sessionId: string;
  entities: Array<Pick<OnboardingEntityRow, "id" | "shop_id" | "session_id" | "entity_type" | "status" | "normalized" | "display_name">>;
  supplierRows: SupplierRow[];
}) {
  const records: VendorActivationRecordResult[] = [];
  const preparedInserts: Array<{ entityId: string; payload: SupplierInsert }> = [];
  const preparedUpdates: Array<{ entityId: string; supplierId: string; payload: SupplierUpdate }> = [];
  const supplierPool = [...params.supplierRows];

  for (const entity of params.entities) {
    if (entity.shop_id !== params.shopId || entity.session_id !== params.sessionId) continue;
    if (entity.entity_type !== "vendor" || entity.status !== "ready") continue;

    const normalizedVendor = toNormalizedVendor(entity);
    if (!normalizedVendor) {
      records.push({ entityId: entity.id, supplierId: null, action: "skipped", reason: "Missing vendor name in staged normalized payload" });
      continue;
    }

    const matches = collectMatchCandidates({ supplierRows: supplierPool, vendor: normalizedVendor });
    if (matches.length > 1) {
      records.push({ entityId: entity.id, supplierId: null, action: "skipped", reason: "Ambiguous supplier match; manual review required" });
      continue;
    }

    if (matches.length === 1) {
      const current = matches[0];
      const update = buildNullSafeUpdate({ current, vendor: normalizedVendor });
      if (!update) {
        records.push({ entityId: entity.id, supplierId: current.id, action: "skipped", reason: "Existing supplier already has mapped fields" });
        continue;
      }

      preparedUpdates.push({ entityId: entity.id, supplierId: current.id, payload: update });
      Object.assign(current, update);
      records.push({ entityId: entity.id, supplierId: current.id, action: "updated", reason: "Matched existing supplier and filled null-only fields" });
      continue;
    }

    const insertPayload: SupplierInsert = {
      shop_id: params.shopId,
      name: normalizedVendor.name,
      account_no: normalizedVendor.accountNo,
      email: normalizedVendor.email,
      phone: normalizedVendor.phone,
    };

    preparedInserts.push({ entityId: entity.id, payload: insertPayload });
    supplierPool.push({
      id: `pending:${entity.id}`,
      created_at: new Date(0).toISOString(),
      created_by: null,
      is_active: true,
      notes: null,
      ...insertPayload,
    } as SupplierRow);
    records.push({ entityId: entity.id, supplierId: null, action: "inserted", reason: "Inserted new supplier from staged vendor" });
  }

  const inserted = records.filter((item) => item.action === "inserted").length;
  const updated = records.filter((item) => item.action === "updated").length;
  const skipped = records.filter((item) => item.action === "skipped").length;
  const warnings = records.filter((item) => item.reason.toLowerCase().includes("ambiguous")).length;

  return {
    inserted,
    updated,
    skipped,
    warnings,
    records,
    preparedInserts,
    preparedUpdates,
  };
}

export async function activateOnboardingVendors(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<VendorActivationResult> {
  const sb = params.supabase as any;

  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const { data: entities, error: entityError } = await sb
    .from("onboarding_entities")
    .select("id, shop_id, session_id, entity_type, status, normalized, display_name")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("entity_type", "vendor")
    .eq("status", "ready")
    .order("id", { ascending: true });

  if (entityError) throw new Error(entityError.message);

  const { data: suppliers, error: supplierError } = await sb
    .from("suppliers")
    .select("id, shop_id, name, account_no, email, phone, notes, is_active, created_at, created_by")
    .eq("shop_id", params.shopId)
    .order("name", { ascending: true });

  if (supplierError) throw new Error(supplierError.message);

  const computed = computeVendorActivationResult({
    shopId: params.shopId,
    sessionId: params.sessionId,
    entities: (entities ?? []) as Array<Pick<OnboardingEntityRow, "id" | "shop_id" | "session_id" | "entity_type" | "status" | "normalized" | "display_name">>,
    supplierRows: (suppliers ?? []) as SupplierRow[],
  });

  for (const pendingInsert of computed.preparedInserts) {
    const payload = {
      ...pendingInsert.payload,
      created_by: params.actorId,
    };
    const { data, error } = await sb.from("suppliers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    const target = computed.records.find((record) => record.entityId === pendingInsert.entityId && record.action === "inserted");
    if (target) target.supplierId = data?.id ?? null;
  }

  for (const pendingUpdate of computed.preparedUpdates) {
    const { error } = await sb
      .from("suppliers")
      .update(pendingUpdate.payload)
      .eq("shop_id", params.shopId)
      .eq("id", pendingUpdate.supplierId);

    if (error) throw new Error(error.message);
  }

  return {
    inserted: computed.inserted,
    updated: computed.updated,
    skipped: computed.skipped,
    warnings: computed.warnings,
    records: computed.records,
  };
}
