import type { Database } from "@shared/types/types/supabase";

type SupplierRow = Pick<Database["public"]["Tables"]["suppliers"]["Row"], "id" | "name">;
type PurchaseOrderRow = Pick<Database["public"]["Tables"]["purchase_orders"]["Row"], "id" | "supplier_id" | "status" | "created_at">;
type PurchaseOrderLineRow = Pick<Database["public"]["Tables"]["purchase_order_lines"]["Row"], "po_id" | "part_id" | "description" | "unit_cost" | "created_at">;
type VendorPartNumberRow = Pick<Database["public"]["Tables"]["vendor_part_numbers"]["Row"], "part_id" | "supplier_id" | "vendor_sku">;
type PartRow = Pick<Database["public"]["Tables"]["parts"]["Row"], "id" | "supplier">;

export type DeterministicSupplierSuggestion = {
  supplier_id: string | null;
  supplier_name: string | null;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  open_po_id: string | null;
  open_po_number: string | null;
  suggested_unit_cost: number | null;
  vendor_sku: string | null;
  recommended_action:
    | "add_to_existing_open_po"
    | "create_new_po"
    | "review_supplier"
    | "keep_free_text";
};

type MatcherInput = {
  requestedDescription: string;
  partId?: string | null;
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  purchaseOrderLines: PurchaseOrderLineRow[];
  vendorPartNumbers?: VendorPartNumberRow[];
  parts?: PartRow[];
};

const CLOSED_PO_STATUSES = new Set(["received", "closed", "cancelled", "canceled", "void"]);

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function scoreDescriptionOverlap(requested: string, candidate: string): number {
  const a = new Set(normalize(requested).split(" ").filter((token) => token.length >= 3));
  const b = new Set(normalize(candidate).split(" ").filter((token) => token.length >= 3));
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / a.size;
}

export function buildDeterministicSupplierSuggestions(input: MatcherInput): DeterministicSupplierSuggestion[] {
  const description = String(input.requestedDescription ?? "").trim();
  const supplierNameById = new Map(input.suppliers.map((s) => [String(s.id), String(s.name ?? "").trim()]));

  type Candidate = {
    supplierId: string;
    score: number;
    confidence: "high" | "medium" | "low";
    reasons: string[];
    vendorSku: string | null;
    latestCost: number | null;
    latestCostAt: string | null;
  };

  const candidates = new Map<string, Candidate>();

  const getCandidate = (supplierId: string): Candidate => {
    const id = String(supplierId);
    const existing = candidates.get(id);
    if (existing) return existing;
    const created: Candidate = {
      supplierId: id,
      score: 0,
      confidence: "low",
      reasons: [],
      vendorSku: null,
      latestCost: null,
      latestCostAt: null,
    };
    candidates.set(id, created);
    return created;
  };

  const poById = new Map(input.purchaseOrders.map((po) => [String(po.id), po]));

  const partId = input.partId ? String(input.partId) : null;

  if (partId) {
    for (const vpn of input.vendorPartNumbers ?? []) {
      if (String(vpn.part_id) !== partId || !vpn.supplier_id) continue;
      const c = getCandidate(String(vpn.supplier_id));
      c.score += 90;
      c.confidence = "high";
      c.vendorSku = c.vendorSku ?? (vpn.vendor_sku ? String(vpn.vendor_sku) : null);
      c.reasons.push("Vendor part number maps this part to supplier");
    }

    const historyCountBySupplier = new Map<string, number>();
    for (const line of input.purchaseOrderLines) {
      if (!line.part_id || String(line.part_id) !== partId) continue;
      const po = poById.get(String(line.po_id));
      const supplierId = po?.supplier_id ? String(po.supplier_id) : null;
      if (!supplierId) continue;
      const c = getCandidate(supplierId);
      const count = (historyCountBySupplier.get(supplierId) ?? 0) + 1;
      historyCountBySupplier.set(supplierId, count);
      c.score += count >= 2 ? 45 : 25;
      if (count >= 2) c.confidence = "high";
      else if (c.confidence === "low") c.confidence = "medium";
      c.reasons.push(count >= 2 ? "Repeated PO history for same part/supplier" : "Recent PO history for same part");
      const cost = Number(line.unit_cost);
      if (Number.isFinite(cost)) {
        const createdAt = line.created_at ? String(line.created_at) : "";
        if (!c.latestCostAt || createdAt > c.latestCostAt) {
          c.latestCost = cost;
          c.latestCostAt = createdAt;
        }
      }
    }

    const legacySupplier = input.parts?.find((p) => String(p.id) === partId)?.supplier;
    const legacySupplierNorm = legacySupplier ? normalize(String(legacySupplier)) : "";
    if (legacySupplierNorm) {
      for (const [supplierId, supplierName] of supplierNameById.entries()) {
        if (!supplierName) continue;
        if (normalize(supplierName) === legacySupplierNorm) {
          const c = getCandidate(supplierId);
          c.score += 20;
          if (c.confidence === "low") c.confidence = "medium";
          c.reasons.push("Legacy part supplier text matches canonical supplier");
        }
      }
    }
  }

  if (description.length >= 3) {
    const supplierDescHits = new Map<string, { strong: number; weak: number }>();
    for (const line of input.purchaseOrderLines) {
      const po = poById.get(String(line.po_id));
      const supplierId = po?.supplier_id ? String(po.supplier_id) : null;
      if (!supplierId) continue;
      const overlap = scoreDescriptionOverlap(description, String(line.description ?? ""));
      if (overlap < 0.3) continue;
      const bucket = supplierDescHits.get(supplierId) ?? { strong: 0, weak: 0 };
      if (overlap >= 0.65) bucket.strong += 1;
      else bucket.weak += 1;
      supplierDescHits.set(supplierId, bucket);
    }

    for (const [supplierId, hits] of supplierDescHits.entries()) {
      const c = getCandidate(supplierId);
      if (hits.strong >= 2) {
        c.score += 40;
        if (c.confidence === "low") c.confidence = "medium";
        c.reasons.push("Repeated strong description match in PO history");
      } else if (hits.strong >= 1 || hits.weak >= 2) {
        c.score += 20;
        c.reasons.push("Description overlap in prior PO lines");
      } else {
        c.score += 10;
        c.reasons.push("Weak description match in prior PO lines");
      }
    }
  }

  const ranked = Array.from(candidates.values())
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map<DeterministicSupplierSuggestion>((c) => {
      const openPo = input.purchaseOrders.find((po) => {
        if (String(po.supplier_id ?? "") !== c.supplierId) return false;
        return !CLOSED_PO_STATUSES.has(String(po.status ?? "open").toLowerCase());
      });

      const recommendedAction: DeterministicSupplierSuggestion["recommended_action"] = !c.supplierId
        ? "keep_free_text"
        : openPo
          ? "add_to_existing_open_po"
          : c.confidence === "high" || c.confidence === "medium"
            ? "create_new_po"
            : "review_supplier";

      return {
        supplier_id: c.supplierId,
        supplier_name: supplierNameById.get(c.supplierId) || null,
        confidence: c.confidence,
        reasons: Array.from(new Set(c.reasons)).slice(0, 4),
        open_po_id: openPo?.id ? String(openPo.id) : null,
        open_po_number: openPo?.id ? String(openPo.id).slice(0, 8) : null,
        suggested_unit_cost: c.latestCost,
        vendor_sku: c.vendorSku,
        recommended_action: recommendedAction,
      };
    });

  if (ranked.length > 0) return ranked;

  return [{
    supplier_id: null,
    supplier_name: null,
    confidence: "low",
    reasons: ["No supplier history match; keep manual supplier choice"],
    open_po_id: null,
    open_po_number: null,
    suggested_unit_cost: null,
    vendor_sku: null,
    recommended_action: "keep_free_text",
  }];
}
