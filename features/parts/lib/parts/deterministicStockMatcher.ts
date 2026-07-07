import type { Database } from "@shared/types/types/supabase";

type PartRow = Pick<
  Database["public"]["Tables"]["parts"]["Row"],
  "id" | "name" | "sku" | "part_number" | "normalized_part_key" | "category"
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
  | "alias part number match"
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
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
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

export function normalizePartNumber(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
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

const OIL_FLUID_TOKENS = new Set([
  "oil",
  "fluid",
  "5w",
  "5w20",
  "5w30",
  "5w40",
  "0w",
  "0w20",
  "0w30",
  "10w",
  "10w30",
  "10w40",
  "atf",
  "coolant",
  "antifreeze",
  "dexron",
  "mercon",
  "synthetic",
]);

const FILTER_TOKENS = new Set(["filter", "filters", "oilfilter", "airfilter", "cabinfilter", "fuelfilter"]);

export type PartDescriptionConflict = {
  title: "Possible mismatch";
  message: string;
};

type ConflictCandidatePart = {
  name?: string | null;
  sku?: string | null;
  part_number?: string | null;
  category?: string | null;
  description?: string | null;
};

function containsAnyToken(value: string, tokens: Set<string>): boolean {
  const compact = normalize(value).replace(/\s+/g, "");
  return tokenize(value).some((token) => tokens.has(token)) || Array.from(tokens).some((token) => compact.includes(token));
}

function humanPartKind(partText: string): string {
  if (containsAnyToken(partText, FILTER_TOKENS)) return "Oil filter";
  if (containsAnyToken(partText, OIL_FLUID_TOKENS)) return "Oil / fluid";
  return "a different part category";
}

export function detectPartDescriptionConflict(args: {
  requestedDescription?: string | null;
  requestedPartNumber?: string | null;
  matchedPart?: ConflictCandidatePart | null;
}): PartDescriptionConflict | null {
  const requestedDescription = String(args.requestedDescription ?? "").trim();
  const requestedPartNumber = String(args.requestedPartNumber ?? "").trim();
  const matchedPart = args.matchedPart;
  if (!requestedDescription || !matchedPart) return null;

  const partText = [
    matchedPart.name,
    matchedPart.category,
    matchedPart.description,
    matchedPart.sku,
    matchedPart.part_number,
  ]
    .filter(Boolean)
    .join(" ");

  const requestLooksFluid = containsAnyToken(requestedDescription, OIL_FLUID_TOKENS);
  const requestLooksFilter = containsAnyToken(requestedDescription, FILTER_TOKENS);
  const partLooksFluid = containsAnyToken(partText, OIL_FLUID_TOKENS);
  const partLooksFilter = containsAnyToken(partText, FILTER_TOKENS);
  const partNumberExact =
    !!requestedPartNumber &&
    [matchedPart.sku, matchedPart.part_number].some(
      (value) => normalizePartNumber(value) === normalizePartNumber(requestedPartNumber),
    );

  if (requestLooksFluid && partLooksFilter) {
    return {
      title: "Possible mismatch",
      message: `Description says ${requestedDescription}, but part # ${requestedPartNumber || matchedPart.sku || matchedPart.part_number || "selected"} matches ${humanPartKind(partText)}.`,
    };
  }

  if (requestLooksFilter && partLooksFluid && !partLooksFilter) {
    return {
      title: "Possible mismatch",
      message: `Description says ${requestedDescription}, but part # ${requestedPartNumber || matchedPart.sku || matchedPart.part_number || "selected"} matches ${humanPartKind(partText)}.`,
    };
  }

  if (partNumberExact) {
    const requestTokens = tokenize(requestedDescription).filter(
      (token) => !OIL_FLUID_TOKENS.has(token) && !FILTER_TOKENS.has(token),
    );
    const partTokens = tokenize(partText);
    const overlap = overlapScore(requestTokens, partTokens);
    if (requestTokens.length >= 2 && overlap === 0 && (partLooksFilter || partLooksFluid)) {
      return {
        title: "Possible mismatch",
        message: `Description says ${requestedDescription}, but part # ${requestedPartNumber} matches ${humanPartKind(partText)}.`,
      };
    }
  }

  return null;
}

export function buildDeterministicStockSuggestions(args: MatcherArgs): DeterministicStockSuggestion[] {
  const text = (args.requestedDescription ?? "").trim();
  const requestedPartNumber = String(args.requestedPartNumber ?? "").trim();
  if (text.length < 2 && requestedPartNumber.length < 2) return [];

  const requestedQty = Math.max(1, Math.floor(Number(args.requestedQty ?? 1) || 1));
  const requestedManufacturer = String(args.requestedManufacturer ?? "").trim();
  const searchText = [requestedPartNumber, text, requestedManufacturer].filter(Boolean).join(" ");
  const requestedNorm = normalize(text);
  const requestedTokens = tokenize(searchText);
  const requestedTight = requestedNorm.replace(/\s+/g, "");
  const requestedPartTight = normalizePartNumber(requestedPartNumber);
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
    const partKeys = [sku, pn, String(part.normalized_part_key ?? ""), ...((vendorByPart.get(part.id) ?? []).map((v) => v.trim()))].filter(Boolean);
    const candidateText = `${name} ${sku} ${pn}`.trim();
    const candidateNorm = normalize(candidateText);
    const candidateTokens = tokenize(candidateText);
    const qtyAvailable = stockByPart.get(part.id) ?? 0;

    let score = 0;
    let confidence: StockMatchConfidence = "low";

    const exactKey = partKeys.find((key) => {
      const normalizedKey = normalize(key).replace(/\s+/g, "");
      const partKey = normalizePartNumber(key);
      return normalizedKey === requestedTight || (!!requestedPartTight && partKey === requestedPartTight);
    });
    if (exactKey) {
      if (sku && normalizePartNumber(sku) === requestedPartTight) reasons.push("exact sku match");
      else if (pn && normalizePartNumber(pn) === requestedPartTight) reasons.push("exact part number match");
      else if (String(part.normalized_part_key ?? "") && normalizePartNumber(part.normalized_part_key) === requestedPartTight) reasons.push("alias part number match");
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
