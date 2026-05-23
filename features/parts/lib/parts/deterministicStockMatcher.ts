import type { Database } from "@shared/types/types/supabase";

type PartRow = Pick<
  Database["public"]["Tables"]["parts"]["Row"],
  "id" | "name" | "sku" | "part_number"
>;

type VendorPartNumberRow =
  Database["public"]["Tables"]["vendor_part_numbers"]["Row"];

type PartStockSummaryRow = Database["public"]["Views"]["part_stock_summary"]["Row"];

export type StockMatchConfidence = "high" | "medium" | "low";
export type StockMatchAction = "allocate_from_stock" | "review_match" | "order_part";

export type StockMatchReason =
  | "exact sku match"
  | "exact part number match"
  | "exact normalized name match"
  | "vendor SKU match"
  | "token match"
  | "description match"
  | "in stock"
  | "no stock available";

export type DeterministicStockSuggestion = {
  part_id: string;
  name: string;
  sku_or_part_number: string | null;
  description: string | null;
  qty_available: number;
  confidence: StockMatchConfidence;
  reasons: StockMatchReason[];
  recommended_action: StockMatchAction;
};

type MatcherArgs = {
  requestedDescription: string;
  requestedQty?: number | null;
  parts: PartRow[];
  vendorPartNumbers?: VendorPartNumberRow[];
  stockSummaries?: PartStockSummaryRow[];
  limit?: number;
};

const STOP_TOKENS = new Set(["the", "and", "for", "with", "from", "rear", "front"]);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return Array.from(new Set(normalize(value).split(" ").filter((t) => t.length >= 2 && !STOP_TOKENS.has(t))));
}

function overlapScore(requestTokens: string[], candidateTokens: string[]): number {
  if (!requestTokens.length || !candidateTokens.length) return 0;
  const set = new Set(candidateTokens);
  let hits = 0;
  for (const token of requestTokens) if (set.has(token)) hits += 1;
  return hits / requestTokens.length;
}

export function buildDeterministicStockSuggestions(args: MatcherArgs): DeterministicStockSuggestion[] {
  const text = (args.requestedDescription ?? "").trim();
  if (text.length < 2) return [];

  const requestedQty = Math.max(1, Math.floor(Number(args.requestedQty ?? 1) || 1));
  const requestedNorm = normalize(text);
  const requestedTokens = tokenize(text);
  const requestedTight = requestedNorm.replace(/\s+/g, "");
  const limit = Math.min(5, Math.max(1, args.limit ?? 3));

  const vendorByPart = new Map<string, string[]>();
  for (const row of args.vendorPartNumbers ?? []) {
    const list = vendorByPart.get(row.part_id) ?? [];
    list.push(row.vendor_sku);
    vendorByPart.set(row.part_id, list);
  }

  const stockByPart = new Map<string, number>();
  for (const stock of args.stockSummaries ?? []) {
    if (!stock.part_id) continue;
    const qty = Number((stock as { qty_available?: number | null }).qty_available ?? stock.on_hand ?? 0);
    stockByPart.set(stock.part_id, Number.isFinite(qty) ? qty : 0);
  }

  const scored = args.parts.map((part) => {
    const reasons: StockMatchReason[] = [];
    const name = String(part.name ?? "").trim();
    const sku = String(part.sku ?? "").trim();
    const pn = String(part.part_number ?? "").trim();
    const partKeys = [sku, pn, ...((vendorByPart.get(part.id) ?? []).map((v) => v.trim()))].filter(Boolean);
    const candidateText = `${name} ${sku} ${pn}`.trim();
    const candidateNorm = normalize(candidateText);
    const candidateTokens = tokenize(candidateText);
    const qtyAvailable = stockByPart.get(part.id) ?? 0;

    let score = 0;
    let confidence: StockMatchConfidence = "low";

    const exactKey = partKeys.find((key) => normalize(key).replace(/\s+/g, "") === requestedTight);
    if (exactKey) {
      if (sku && normalize(sku).replace(/\s+/g, "") === requestedTight) reasons.push("exact sku match");
      else if (pn && normalize(pn).replace(/\s+/g, "") === requestedTight) reasons.push("exact part number match");
      else reasons.push("vendor SKU match");
      score += 120;
      confidence = "high";
    }

    if (name && normalize(name) === requestedNorm) {
      reasons.push("exact normalized name match");
      score += 100;
      confidence = "high";
    }

    const overlap = overlapScore(requestedTokens, candidateTokens);
    if (overlap >= 0.75) {
      reasons.push("token match");
      score += 50;
      if (confidence !== "high") confidence = "medium";
    } else if (overlap >= 0.4) {
      reasons.push("token match");
      score += 30;
      if (confidence === "low") confidence = "medium";
    } else if (overlap > 0) {
      reasons.push("token match");
      score += 10;
    }

    if (candidateNorm.includes(requestedNorm) || requestedNorm.includes(candidateNorm)) {
      reasons.push("description match");
      score += 20;
      if (confidence === "low" && overlap >= 0.3) confidence = "medium";
    }

    if (qtyAvailable > 0) {
      reasons.push("in stock");
      score += Math.min(15, qtyAvailable);
    } else {
      reasons.push("no stock available");
    }

    let recommended_action: StockMatchAction = "order_part";
    if (qtyAvailable > 0 && confidence === "high") recommended_action = "allocate_from_stock";
    else if (confidence === "medium" || (confidence === "high" && qtyAvailable <= 0)) recommended_action = "review_match";

    if (requestedQty > qtyAvailable && qtyAvailable > 0 && recommended_action === "allocate_from_stock") {
      recommended_action = "review_match";
    }

    return {
      part_id: part.id,
      name: name || sku || pn || part.id,
      sku_or_part_number: sku || pn || null,
      description: candidateText || null,
      qty_available: qtyAvailable,
      confidence,
      reasons,
      recommended_action,
      score,
    };
  });

  const highCountByKey = new Map<string, number>();
  for (const row of scored.filter((r) => r.confidence === "high")) {
    const key = normalize(`${row.name} ${row.sku_or_part_number ?? ""}`);
    highCountByKey.set(key, (highCountByKey.get(key) ?? 0) + 1);
  }

  return scored
    .filter((row) => row.score > 0)
    .map((row) => {
      const key = normalize(`${row.name} ${row.sku_or_part_number ?? ""}`);
      if (row.confidence === "high" && (highCountByKey.get(key) ?? 0) > 1) {
        return { ...row, confidence: "medium" as const, recommended_action: "review_match" as const };
      }
      return row;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}
