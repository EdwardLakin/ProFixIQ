import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { upsertOnboardingReviewItems } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
import type { Database } from "@/features/shared/types/types/supabase";

type JsonObject = Record<string, unknown>;
type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = Database["public"]["Tables"]["suppliers"]["Insert"];
type SupplierUpdate = Database["public"]["Tables"]["suppliers"]["Update"];
type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];

export type VendorActivationResult = {
  ok: true;
  stagedVendors: number;
  created: number;
  matchedExisting: number;
  updatedNullOnly: number;
  skipped: number;
  needsReview: number;
  suppliersBefore: number;
  suppliersAfter: number;
  reviewItemsAttempted: number;
  reviewItemsPersisted: number;
  reviewItemsReused: number;
  reviewItemsCreated: number;
  reviewItemsOpenForDomain: number;
  warnings: string[];
  records: Array<{
    entityId: string;
    supplierId: string | null;
    action: "created" | "matched_existing" | "updated_null_only" | "skipped" | "needs_review";
    reason: string;
  }>;
};

type NormalizedVendor = {
  name: string | null;
  accountNo: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  sourceExternalId: string | null;
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

function toNormalizedVendor(entity: Pick<OnboardingEntityRow, "normalized" | "display_name" | "source_external_id">): NormalizedVendor {
  const normalized = (entity.normalized ?? {}) as JsonObject;
  return {
    name: firstText([normalized.name, entity.display_name]),
    accountNo: firstText([normalized.account_no, normalized.accountNo, normalized.accountNumber]),
    email: normalizeEmail(normalized.email),
    phone: firstText([normalized.phone]),
    notes: firstText([normalized.notes, normalized.note]),
    sourceExternalId: firstText([entity.source_external_id, normalized.sourceVendorId]),
  };
}

function buildNullOnlySupplierUpdate(current: SupplierRow, vendor: NormalizedVendor): SupplierUpdate | null {
  const update: SupplierUpdate = {};
  if (!normalizeText(current.account_no) && vendor.accountNo) update.account_no = vendor.accountNo;
  if (!normalizeText(current.email) && vendor.email) update.email = vendor.email;
  if (!normalizeText(current.phone) && vendor.phone) update.phone = vendor.phone;
  if (!normalizeText(current.notes) && vendor.notes) update.notes = vendor.notes;
  return Object.keys(update).length > 0 ? update : null;
}

function vendorMatchScore(row: SupplierRow, vendor: NormalizedVendor): number {
  let score = 0;
  if (vendor.sourceExternalId && normalizeLookupKey(vendor.sourceExternalId) === normalizeLookupKey(row.account_no)) score += 100;
  if (vendor.accountNo && normalizeLookupKey(vendor.accountNo) === normalizeLookupKey(row.account_no)) score += 90;
  if (vendor.email && normalizeLookupKey(vendor.email) === normalizeLookupKey(row.email)) score += 80;
  if (vendor.phone && normalizeLookupKey(vendor.phone) === normalizeLookupKey(row.phone)) score += 70;
  if (vendor.name && normalizeLookupKey(vendor.name) === normalizeLookupKey(row.name)) score += 60;
  return score;
}

function makeReviewItem(params: {
  shopId: string;
  sessionId: string;
  entityId: string;
  issueType: string;
  summary: string;
  details: Record<string, unknown>;
  severity?: "low" | "medium" | "high" | "blocking";
}): OnboardingReviewItemInsert {
  return {
    id: stableUuidFromParts(["onboarding-review", params.shopId, params.sessionId, "vendor", params.issueType, params.entityId]),
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: params.entityId,
    domain: "vendors",
    issue_type: params.issueType,
    summary: params.summary,
    severity: params.severity ?? "medium",
    status: "pending",
    details: params.details as any,
  };
}

export async function activateOnboardingVendors(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<VendorActivationResult> {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId });

  const [{ data: entities, error: entityError }, { data: suppliers, error: supplierError }] = await Promise.all([
    sb
      .from("onboarding_entities")
      .select("id, shop_id, session_id, entity_type, status, normalized, display_name, source_external_id")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("entity_type", "vendor")
      .eq("status", "ready")
      .order("id", { ascending: true }),
    sb.from("suppliers").select("id, shop_id, name, account_no, email, phone, notes, is_active, created_at, created_by").eq("shop_id", params.shopId),
  ]);
  if (entityError) throw new Error(entityError.message);
  if (supplierError) throw new Error(supplierError.message);

  const staged = (entities ?? []) as Array<Pick<OnboardingEntityRow, "id" | "normalized" | "display_name" | "source_external_id">>;
  const supplierPool = [...((suppliers ?? []) as SupplierRow[])];
  const suppliersBefore = supplierPool.length;
  const reviewItems: OnboardingReviewItemInsert[] = [];
  const warnings: string[] = [];
  const records: VendorActivationResult["records"] = [];

  let created = 0;
  let matchedExisting = 0;
  let updatedNullOnly = 0;
  let skipped = 0;
  let needsReview = 0;

  for (const entity of staged) {
    const vendor = toNormalizedVendor(entity);
    if (!vendor.name) {
      skipped += 1;
      needsReview += 1;
      records.push({ entityId: entity.id, supplierId: null, action: "needs_review", reason: "Missing vendor name" });
      reviewItems.push(
        makeReviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          entityId: entity.id,
          issueType: "missing_vendor_name",
          summary: "Vendor row skipped: name is required.",
          details: { sourceExternalId: vendor.sourceExternalId },
          severity: "high",
        }),
      );
      continue;
    }

    const scored = supplierPool
      .map((row) => ({ row, score: vendorMatchScore(row, vendor) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 1 && scored[0]?.score === scored[1]?.score) {
      skipped += 1;
      needsReview += 1;
      warnings.push(`Ambiguous vendor match for entity ${entity.id}`);
      records.push({ entityId: entity.id, supplierId: null, action: "needs_review", reason: "Ambiguous vendor match" });
      reviewItems.push(
        makeReviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          entityId: entity.id,
          issueType: "ambiguous_vendor_match",
          summary: `Vendor "${vendor.name}" matched multiple suppliers and requires review.`,
          details: {
            sourceExternalId: vendor.sourceExternalId,
            vendorName: vendor.name,
            candidates: scored.slice(0, 3).map((entry) => ({ id: entry.row.id, name: entry.row.name, email: entry.row.email, phone: entry.row.phone })),
          },
          severity: "high",
        }),
      );
      continue;
    }

    if (scored.length > 0) {
      const target = scored[0]!.row;
      const update = buildNullOnlySupplierUpdate(target, vendor);
      if (update) {
        const { error } = await sb.from("suppliers").update(update).eq("shop_id", params.shopId).eq("id", target.id);
        if (error) throw new Error(error.message);
        Object.assign(target, update);
        updatedNullOnly += 1;
        records.push({ entityId: entity.id, supplierId: target.id, action: "updated_null_only", reason: "Matched existing supplier and applied null-only updates" });
      } else {
        matchedExisting += 1;
        records.push({ entityId: entity.id, supplierId: target.id, action: "matched_existing", reason: "Matched existing supplier" });
      }
      continue;
    }

    const insertPayload: SupplierInsert = {
      shop_id: params.shopId,
      name: vendor.name,
      account_no: vendor.accountNo,
      email: vendor.email,
      phone: vendor.phone,
      notes: vendor.notes,
      is_active: true,
      created_by: params.actorId,
    };
    const { data, error } = await sb.from("suppliers").insert(insertPayload).select("id").single();
    if (error) throw new Error(error.message);

    created += 1;
    supplierPool.push({
      id: data?.id,
      shop_id: params.shopId,
      name: vendor.name,
      account_no: vendor.accountNo,
      email: vendor.email,
      phone: vendor.phone,
      notes: vendor.notes,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: params.actorId,
    } as SupplierRow);
    records.push({ entityId: entity.id, supplierId: data?.id ?? null, action: "created", reason: "Created supplier" });
  }

  let reviewItemsPersisted = 0;
  let reviewItemsReused = 0;
  if (reviewItems.length > 0) {
    const writeResult = await upsertOnboardingReviewItems({
      supabase: params.supabase,
      phase: "vendors",
      shopId: params.shopId,
      sessionId: params.sessionId,
      reviewItems,
    });
    reviewItemsPersisted = writeResult.persisted;
    reviewItemsReused = writeResult.reused;
  }
  const { count: reviewItemsOpenCount, error: reviewItemsOpenError } = await sb
    .from("onboarding_review_items")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("domain", "vendors")
    .eq("status", "pending");
  if (reviewItemsOpenError) throw new Error(reviewItemsOpenError.message);

  const { count: suppliersAfterCount, error: suppliersAfterError } = await sb.from("suppliers").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId);
  if (suppliersAfterError) throw new Error(suppliersAfterError.message);

  return {
    ok: true,
    stagedVendors: staged.length,
    created,
    matchedExisting,
    updatedNullOnly,
    skipped,
    needsReview,
    suppliersBefore,
    suppliersAfter: Number(suppliersAfterCount ?? supplierPool.length),
    reviewItemsAttempted: reviewItems.length,
    reviewItemsPersisted,
    reviewItemsReused,
    reviewItemsCreated: Math.max(0, reviewItemsPersisted - reviewItemsReused),
    reviewItemsOpenForDomain: Number(reviewItemsOpenCount ?? 0),
    warnings,
    records,
  };
}
