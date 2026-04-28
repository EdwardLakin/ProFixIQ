import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { upsertOnboardingReviewItems } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type PartRow = Database["public"]["Tables"]["parts"]["Row"];
type PartInsert = Database["public"]["Tables"]["parts"]["Insert"];
type PartUpdate = Database["public"]["Tables"]["parts"]["Update"];
type StockLocationRow = Database["public"]["Tables"]["stock_locations"]["Row"];
type PartStockRow = Database["public"]["Tables"]["part_stock"]["Row"];
type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];

type NormalizedPart = {
  name: string | null;
  partNumber: string | null;
  sku: string | null;
  vendorName: string | null;
  quantity: number | null;
  cost: number | null;
  price: number | null;
  sourceExternalId: string | null;
};

export type PartsActivationResult = {
  ok: true;
  stagedParts: number;
  partsCreated: number;
  existingPartsMatched: number;
  partsNullOnlyUpdated: number;
  stockRecordsCreated: number;
  stockQuantitiesInitialized: number;
  vendorLinksCreated: number;
  skipped: number;
  needsReview: number;
  reviewItemsCreated: number;
  warnings: string[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLookupKey(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[\s\-_.]+/g, " ").replace(/[^a-z0-9]/g, "").trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = normalizeText(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNormalizedPart(entity: Pick<OnboardingEntityRow, "normalized" | "display_name" | "source_external_id">): NormalizedPart {
  const normalized = (entity.normalized ?? {}) as Record<string, unknown>;
  return {
    name: normalizeText(normalized.description ?? entity.display_name) || null,
    partNumber: normalizeText(normalized.partNumber) || null,
    sku: normalizeText(normalized.sku) || null,
    vendorName: normalizeText(normalized.vendorName) || null,
    quantity: parseNumber(normalized.quantityOnHandRaw),
    cost: parseNumber(normalized.cost),
    price: parseNumber(normalized.price),
    sourceExternalId: normalizeText(entity.source_external_id) || null,
  };
}

function reviewItem(params: {
  shopId: string;
  sessionId: string;
  entityId: string;
  issueType: string;
  summary: string;
  severity?: "low" | "medium" | "high" | "blocking";
  details?: Record<string, unknown>;
}): OnboardingReviewItemInsert {
  return {
    id: stableUuidFromParts(["onboarding-review", params.shopId, params.sessionId, "parts", params.issueType, params.entityId]),
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: params.entityId,
    issue_type: params.issueType,
    domain: "parts",
    summary: params.summary,
    severity: params.severity ?? "medium",
    status: "pending",
    details: (params.details ?? {}) as any,
  };
}

function getPartMatchCandidates(partRows: PartRow[], part: NormalizedPart): PartRow[] {
  const partNumberKey = normalizeLookupKey(part.partNumber);
  if (partNumberKey) {
    const exact = partRows.filter((row) => normalizeLookupKey(row.part_number) === partNumberKey);
    if (exact.length > 0) return exact;
  }

  const skuKey = normalizeLookupKey(part.sku);
  if (skuKey) {
    const exact = partRows.filter((row) => normalizeLookupKey(row.sku) === skuKey);
    if (exact.length > 0) return exact;
  }

  const nameKey = normalizeLookupKey(part.name);
  if (nameKey) return partRows.filter((row) => normalizeLookupKey(row.name) === nameKey);
  return [];
}

function buildNullOnlyPartUpdate(current: PartRow, incoming: NormalizedPart, supplierName: string | null): PartUpdate | null {
  const update: PartUpdate = {};
  if (!normalizeText(current.part_number) && incoming.partNumber) update.part_number = incoming.partNumber;
  if (!normalizeText(current.sku) && incoming.sku) update.sku = incoming.sku;
  if (!normalizeText(current.description) && incoming.name) update.description = incoming.name;
  if (current.cost === null && incoming.cost !== null) update.cost = incoming.cost;
  if (current.default_cost === null && incoming.cost !== null) update.default_cost = incoming.cost;
  if (current.price === null && incoming.price !== null) update.price = incoming.price;
  if (current.default_price === null && incoming.price !== null) update.default_price = incoming.price;
  if (!normalizeText(current.supplier) && supplierName) update.supplier = supplierName;
  return Object.keys(update).length > 0 ? update : null;
}

export async function activateOnboardingParts(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<PartsActivationResult> {
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId });

  const [{ data: staged }, { data: parts }, { data: suppliers }, { data: stockLocations }] = await Promise.all([
    sb
      .from("onboarding_entities")
      .select("id, normalized, display_name, source_external_id")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("entity_type", "part")
      .eq("status", "ready")
      .order("id", { ascending: true }),
    sb.from("parts").select("*").eq("shop_id", params.shopId),
    sb.from("suppliers").select("id, name").eq("shop_id", params.shopId),
    sb.from("stock_locations").select("*").eq("shop_id", params.shopId).order("code", { ascending: true }).order("name", { ascending: true }).order("id", { ascending: true }).limit(1),
  ]);

  const stagedRows = (staged ?? []) as Array<Pick<OnboardingEntityRow, "id" | "normalized" | "display_name" | "source_external_id">>;
  const partRows = [...((parts ?? []) as PartRow[])];
  const supplierRows = suppliers ?? [];
  const defaultLocation = (stockLocations?.[0] ?? null) as StockLocationRow | null;
  const shopPartIds = partRows.map((row) => row.id).filter((id): id is string => Boolean(id));

  let stockRows: PartStockRow[] = [];
  if (defaultLocation && shopPartIds.length > 0) {
    const { data: partStockRows, error: partStockError } = await sb
      .from("part_stock")
      .select("id, part_id, location_id, qty_on_hand, qty_reserved, reorder_point, reorder_qty")
      .eq("location_id", defaultLocation.id)
      .in("part_id", shopPartIds);
    if (partStockError) throw new Error(partStockError.message);
    stockRows = [...((partStockRows ?? []) as PartStockRow[])];
  }

  const reviewItems: OnboardingReviewItemInsert[] = [];
  const warnings: string[] = [];

  let partsCreated = 0;
  let existingPartsMatched = 0;
  let partsNullOnlyUpdated = 0;
  let stockRecordsCreated = 0;
  let stockQuantitiesInitialized = 0;
  let vendorLinksCreated = 0;
  let skipped = 0;
  let needsReview = 0;

  for (const entity of stagedRows) {
    const normalized = toNormalizedPart(entity);
    if (!normalized.name) {
      skipped += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_part_name", summary: "Part row skipped: missing part name.", severity: "high" }));
      continue;
    }

    if (normalized.quantity !== null && normalized.quantity < 0) {
      skipped += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_quantity", summary: `Part ${normalized.name} has invalid quantity.`, details: { quantity: normalized.quantity } }));
      continue;
    }
    if (normalized.cost !== null && normalized.cost < 0) {
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_cost", summary: `Part ${normalized.name} has invalid cost.`, details: { cost: normalized.cost } }));
      needsReview += 1;
    }
    if (normalized.price !== null && normalized.price < 0) {
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_sale_price", summary: `Part ${normalized.name} has invalid sale price.`, details: { price: normalized.price } }));
      needsReview += 1;
    }

    const candidates = getPartMatchCandidates(partRows, normalized);
    if (candidates.length > 1) {
      skipped += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({
        shopId: params.shopId,
        sessionId: params.sessionId,
        entityId: entity.id,
        issueType: "ambiguous_part_match",
        summary: `Part ${normalized.name} matched multiple parts and requires review.`,
        details: { candidates: candidates.slice(0, 3).map((row) => ({ id: row.id, name: row.name, partNumber: row.part_number, sku: row.sku })) },
      }));
      continue;
    }

    const supplierMatch = normalized.vendorName
      ? supplierRows.filter((row: any) => normalizeLookupKey(row.name) === normalizeLookupKey(normalized.vendorName))
      : [];
    let supplierNameToWrite: string | null = null;
    if (supplierMatch.length === 1) {
      supplierNameToWrite = supplierMatch[0].name;
      vendorLinksCreated += 1;
    } else if (supplierMatch.length > 1) {
      reviewItems.push(reviewItem({
        shopId: params.shopId,
        sessionId: params.sessionId,
        entityId: entity.id,
        issueType: "ambiguous_vendor_for_part",
        summary: `Vendor for part ${normalized.name} is ambiguous.`,
        details: { vendorName: normalized.vendorName },
      }));
      needsReview += 1;
    } else if (normalized.vendorName) {
      reviewItems.push(reviewItem({
        shopId: params.shopId,
        sessionId: params.sessionId,
        entityId: entity.id,
        issueType: "ambiguous_vendor_for_part",
        summary: `Vendor for part ${normalized.name} was not found.`,
        details: { vendorName: normalized.vendorName },
      }));
      needsReview += 1;
    }

    let targetPart: PartRow;
    if (candidates.length === 1) {
      targetPart = candidates[0]!;
      const update = buildNullOnlyPartUpdate(targetPart, normalized, supplierNameToWrite);
      if (update) {
        const { error } = await sb.from("parts").update(update).eq("id", targetPart.id).eq("shop_id", params.shopId);
        if (error) throw new Error(error.message);
        Object.assign(targetPart, update);
        partsNullOnlyUpdated += 1;
      } else {
        existingPartsMatched += 1;
      }
    } else {
      const payload: PartInsert = {
        shop_id: params.shopId,
        name: normalized.name,
        description: normalized.name,
        part_number: normalized.partNumber,
        sku: normalized.sku,
        supplier: supplierNameToWrite,
        cost: normalized.cost,
        default_cost: normalized.cost,
        price: normalized.price,
        default_price: normalized.price,
        external_id: normalized.sourceExternalId,
        source_intake_id: params.sessionId,
      };
      const { data, error } = await sb.from("parts").insert(payload).select("*").single();
      if (error) throw new Error(error.message);
      targetPart = data as PartRow;
      partRows.push(targetPart);
      partsCreated += 1;
    }

    if (!defaultLocation) {
      warnings.push("No stock location found; quantity seed skipped.");
      continue;
    }

    const sourceKey = stableUuidFromParts([params.shopId, params.sessionId, entity.id, "stock-seed"]);
    const stock = stockRows.find((row) => row.part_id === targetPart.id && row.location_id === defaultLocation.id);

    if (!stock) {
      const initialQty = Math.max(0, normalized.quantity ?? 0);
      const { data, error } = await sb.from("part_stock").insert({
        part_id: targetPart.id,
        location_id: defaultLocation.id,
        qty_on_hand: initialQty,
        qty_reserved: 0,
      }).select("*").single();
      if (error) throw new Error(error.message);
      stockRows.push(data as PartStockRow);
      stockRecordsCreated += 1;
      stockQuantitiesInitialized += 1;

      if (initialQty > 0) {
        await sb.from("stock_moves").upsert({
          id: sourceKey,
          shop_id: params.shopId,
          part_id: targetPart.id,
          location_id: defaultLocation.id,
          qty_change: initialQty,
          reason: "seed",
          created_by: params.actorId,
          reference_kind: "onboarding_parts_seed",
          reference_id: entity.id,
        }, { onConflict: "id" });
      }
    }
  }

  if (reviewItems.length > 0) {
    await upsertOnboardingReviewItems({
      supabase: params.supabase,
      phase: "parts",
      shopId: params.shopId,
      sessionId: params.sessionId,
      reviewItems,
    });
  }

  return {
    ok: true,
    stagedParts: stagedRows.length,
    partsCreated,
    existingPartsMatched,
    partsNullOnlyUpdated,
    stockRecordsCreated,
    stockQuantitiesInitialized,
    vendorLinksCreated,
    skipped,
    needsReview,
    reviewItemsCreated: reviewItems.length,
    warnings,
  };
}
