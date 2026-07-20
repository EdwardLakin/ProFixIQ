import { createHash } from "crypto";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { setStockOnHandSnapshot } from "@/features/parts/server/setStockOnHandSnapshot";

type CsvRow = Record<string, string>;
type ExistingPartRow = Pick<
  Database["public"]["Tables"]["parts"]["Row"],
  "id" | "name" | "part_number" | "sku" | "supplier" | "category" | "shop_id"
>;
type StagingInsertResultRow = Pick<
  Database["public"]["Tables"]["shop_parts_import_staging"]["Row"],
  "id" | "raw_row_id" | "normalized_name" | "normalized_part_number" | "normalized_sku" | "status" | "matched_part_id" | "match_reason" | "quantity_on_hand"
>;

type PartsPipelineArgs = {
  shopId: string;
  intakeId: string;
  partsCsv: string;
  partsFilePath: string | null;
  sourceSystem: string | null;
};

export type PartsPipelineSummary = {
  rawRows: number;
  normalizedRows: number;
  matchedRows: number;
  ambiguousRows: number;
  promotedRows: number;
  rejectedRows: number;
  inventorySeedMode: "snapshot_with_seed_moves";
  inventorySeededLocations: number;
};

type ParsedPart = {
  row: CsvRow;
  rowNumber: number;
  name: string;
  sku: string | null;
  partNumber: string | null;
  brand: string | null;
  vendor: string | null;
  category: string | null;
  quantityOnHand: number | null;
  cost: number | null;
  price: number | null;
  uom: string | null;
  warnings: string[];
  parseClean: boolean;
};

function norm(s: string): string {
  return (s ?? "").trim();
}

function lower(s: string): string {
  return norm(s).toLowerCase();
}

function normalizeToken(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeText(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(csv: string): { header: string[]; rows: CsvRow[] } {
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length);

  if (lines.length < 2) return { header: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }

    out.push(cur);
    return out.map((s) => s.trim());
  };

  const normalizeHeader = (header: string): string =>
    header
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();

  const headerAliases = (header: string): string[] => {
    const normalized = normalizeHeader(header);
    if (!normalized) return [];
    const canonical = normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    const spaced = canonical.replace(/_/g, " ").trim();
    return Array.from(new Set([normalized, canonical, spaced].filter(Boolean)));
  };

  const header = splitLine(lines[0]).map((h) => normalizeHeader(h));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitLine(lines[i]);
    const rec: CsvRow = {};
    for (let c = 0; c < header.length; c += 1) {
      const rawKey = header[c] || `col_${c + 1}`;
      const value = cols[c] ?? "";
      const aliases = headerAliases(rawKey);
      if (aliases.length === 0) {
        rec[`col_${c + 1}`] = value;
      } else {
        for (const alias of aliases) rec[alias] = value;
      }
    }
    rows.push(rec);
  }

  return { header, rows };
}

function pick(row: CsvRow, patterns: RegExp[]): string | null {
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = lower(k);
    if (patterns.some((p) => p.test(nk))) {
      const v = norm(row[k] ?? "");
      if (v) return v;
    }
  }
  return null;
}

function parseMoney(v: string | null): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const cleaned = s.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v: string | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizePartRow(row: CsvRow, rowNumber: number): ParsedPart {
  const partNumber = pick(row, [/part number/, /^pn$/, /p\/n/, /part_no/, /part #/]);
  const sku = pick(row, [/^sku$/, /item sku/, /stock code/]);
  const name =
    pick(row, [/^name$/, /part name/, /description/, /item name/, /product/]) ??
    partNumber ??
    sku ??
    `Part ${rowNumber}`;

  const cost = parseMoney(pick(row, [/^cost$/, /unit cost/, /buy/, /acq/])) ?? null;
  const price = parseMoney(pick(row, [/^price$/, /sell/, /retail/, /list/])) ?? null;
  const quantityOnHand = parseIntSafe(pick(row, [/qty/, /quantity/, /on hand/, /stock/])) ?? null;

  const warnings: string[] = [];
  if (!name) warnings.push("missing_name");
  if (!partNumber && !sku) warnings.push("missing_part_number_and_sku");

  return {
    row,
    rowNumber,
    name,
    sku,
    partNumber,
    brand: pick(row, [/brand/, /manufacturer/]),
    vendor: pick(row, [/vendor/, /supplier/]),
    category: pick(row, [/category/, /class/]),
    quantityOnHand,
    cost,
    price,
    uom: pick(row, [/uom/, /unit/, /pack/, /case/]),
    warnings,
    parseClean: warnings.length === 0,
  };
}

export async function runPartsImportPipeline(args: PartsPipelineArgs): Promise<PartsPipelineSummary> {
  const supabase = createAdminSupabase();
  const { shopId, intakeId, partsCsv, partsFilePath, sourceSystem } = args;
  let inventorySeededLocations = 0;

  const { header, rows } = parseCsv(partsCsv);
  if (rows.length === 0) {
    return {
      rawRows: 0,
      normalizedRows: 0,
      matchedRows: 0,
      ambiguousRows: 0,
      promotedRows: 0,
      rejectedRows: 0,
      inventorySeedMode: "snapshot_with_seed_moves",
      inventorySeededLocations: 0,
    };
  }

  const existingPartsRows: ExistingPartRow[] =
    (
      await supabase
        .from("parts")
        .select("id,name,part_number,sku,supplier,category,shop_id")
        .eq("shop_id", shopId)
        .limit(5000)
    ).data ?? [];

  const partsByPartNo = new Map<string, { id: string; row: ExistingPartRow }>();
  const partsBySku = new Map<string, { id: string; row: ExistingPartRow }>();
  const partsByName = new Map<string, Array<{ id: string; row: ExistingPartRow }>>();

  for (const p of existingPartsRows) {
    const partNo = normalizeToken(p.part_number);
    const sku = normalizeToken(p.sku);
    const name = normalizeText(p.name);
    if (partNo) partsByPartNo.set(partNo, { id: p.id, row: p });
    if (sku) partsBySku.set(sku, { id: p.id, row: p });
    if (name) {
      const prev = partsByName.get(name) ?? [];
      prev.push({ id: p.id, row: p });
      partsByName.set(name, prev);
    }
  }

  const computedFileId = createHash("sha1")
    .update(`${intakeId}|parts|${partsFilePath ?? "none"}`)
    .digest("hex")
    .slice(0, 32);

  const { data: existingFile } = partsFilePath
    ? await supabase
        .from("shop_import_files")
        .select("id")
        .eq("intake_id", intakeId)
        .eq("kind", "parts")
        .eq("storage_path", partsFilePath)
        .maybeSingle()
    : { data: null };

  const effectiveFileId = partsFilePath ? existingFile?.id ?? computedFileId : null;

  if (!existingFile?.id && partsFilePath) {
    await supabase.from("shop_import_files").insert({
      id: effectiveFileId,
      intake_id: intakeId,
      kind: "parts",
      storage_path: partsFilePath,
      original_filename: partsFilePath.split("/").pop() ?? null,
      parsed_row_count: rows.length,
      status: "parsed",
    });
  }

  const rawInsertPayload = rows.map((row, idx) => ({
    intake_id: intakeId,
    file_id: effectiveFileId,
    row_number: idx + 1,
    entity_type: "parts",
    raw: row,
    normalized: {},
    errors: [],
    shop_id: shopId,
    original_headers: header,
    raw_payload: row,
    parse_status: "parsed",
    parse_warnings: [],
  }));

  const { data: rawRowsInserted } = await supabase
    .from("shop_import_rows")
    .insert(rawInsertPayload)
    .select("id,row_number,raw");

  const parsedRows = rows.map((row, idx) => normalizePartRow(row, idx + 1));

  const stagingRowsPayload = parsedRows.map((p, idx) => {
    const rawRowId = rawRowsInserted?.[idx]?.id ?? null;
    const normalizedPartNo = normalizeToken(p.partNumber);
    const normalizedSku = normalizeToken(p.sku);
    const normalizedName = normalizeText(p.name);

    const exactPartMatch = normalizedPartNo ? partsByPartNo.get(normalizedPartNo) : null;
    const exactSkuMatch = normalizedSku ? partsBySku.get(normalizedSku) : null;
    const nameMatches = normalizedName ? partsByName.get(normalizedName) ?? [] : [];

    let status = "pending";
    let matchConfidence = 0;
    let suggestedAction = "review";
    let matchedPartId: string | null = null;
    let matchReason: string | null = null;

    if (exactPartMatch) {
      status = "matched";
      matchConfidence = 0.99;
      suggestedAction = "merge_existing";
      matchedPartId = exactPartMatch.id;
      matchReason = "exact_part_number";
    } else if (exactSkuMatch) {
      status = "ambiguous";
      matchConfidence = 0.85;
      suggestedAction = "review";
      matchedPartId = exactSkuMatch.id;
      matchReason = "exact_sku_without_part_number";
    } else if (nameMatches.length === 1) {
      status = "ambiguous";
      matchConfidence = 0.65;
      suggestedAction = "review";
      matchedPartId = nameMatches[0].id;
      matchReason = "name_similarity_only";
    } else if (nameMatches.length > 1) {
      status = "ambiguous";
      matchConfidence = 0.45;
      suggestedAction = "review";
      matchReason = "multiple_name_candidates";
    } else {
      status = "ambiguous";
      matchConfidence = p.partNumber ? 0.7 : 0.4;
      suggestedAction = p.partNumber ? "create_new_part_review" : "review";
      matchReason = p.partNumber ? "new_part_number_candidate" : "insufficient_identity";
    }

    const autoPromote =
      status === "matched" &&
      matchReason === "exact_part_number" &&
      p.parseClean &&
      !!matchedPartId;

    return {
      intake_id: intakeId,
      raw_row_id: rawRowId,
      shop_id: shopId,
      source_system: sourceSystem,
      normalized_name: p.name,
      normalized_name_key: normalizedName || null,
      normalized_sku: normalizedSku || null,
      normalized_part_number: normalizedPartNo || null,
      normalized_brand: normalizeText(p.brand) || null,
      normalized_vendor: normalizeText(p.vendor) || null,
      mapped_category: normalizeText(p.category) || null,
      quantity_on_hand: p.quantityOnHand,
      cost: p.cost,
      price: p.price,
      unit_of_measure: p.uom,
      pack_info: null,
      source_confidence: matchConfidence,
      status: autoPromote ? "approved" : status,
      warnings: p.warnings,
      raw_echo: {
        partNumber: p.partNumber,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        vendor: p.vendor,
        category: p.category,
      },
      suggested_action: autoPromote ? "auto_promote" : suggestedAction,
      matched_part_id: matchedPartId,
      match_reason: matchReason,
      auto_promote: autoPromote,
    };
  });

  const { data: insertedStagingRows } = await supabase
    .from("shop_parts_import_staging")
    .insert(stagingRowsPayload)
    .select("id,raw_row_id,normalized_name,normalized_part_number,normalized_sku,status,matched_part_id,match_reason,quantity_on_hand");

  let promotedRows = 0;
  let matchedRows = 0;
  let ambiguousRows = 0;

  for (const staged of ((insertedStagingRows ?? []) as StagingInsertResultRow[])) {
    const shouldAutoPromote = staged.status === "approved" && staged.matched_part_id;

    if (staged.status === "matched" || staged.status === "approved") matchedRows += 1;
    if (staged.status === "ambiguous" || staged.status === "pending") ambiguousRows += 1;

    if (!shouldAutoPromote) {
      const candidates: Array<{ candidatePartId: string; confidence: number; reason: string }> = [];
      if (staged.matched_part_id) {
        candidates.push({
          candidatePartId: staged.matched_part_id,
          confidence: staged.match_reason === "exact_sku_without_part_number" ? 0.85 : 0.65,
          reason: staged.match_reason ?? "candidate",
        });
      }

      await supabase.from("shop_parts_import_match_candidates").insert(
        candidates.map((c) => ({
          staging_row_id: staged.id,
          shop_id: shopId,
          candidate_part_id: c.candidatePartId,
          confidence: c.confidence,
          reason: c.reason,
          rank: 1,
        })),
      );

      continue;
    }

    if (!staged.matched_part_id) {
      throw new Error(`Auto-promoted parts staging row ${staged.id} has no matched part.`);
    }
    const matchedPartId = staged.matched_part_id;

    promotedRows += 1;
    const sourceHash = createHash("sha1")
      .update(`${intakeId}|${staged.raw_row_id ?? "none"}|${staged.normalized_part_number ?? ""}|${staged.normalized_sku ?? ""}`)
      .digest("hex")
      .slice(0, 20);

    await supabase
      .from("parts")
      .update({
        source_intake_id: intakeId,
        import_notes: JSON.stringify({
          source: "shop_boost",
          intake_id: intakeId,
          import_mode: "staged_auto_promote_exact_part_number",
        }),
      })
      .eq("id", matchedPartId);

    const { data: defaultLocation } = await supabase
      .from("stock_locations")
      .select("id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (defaultLocation?.id) {
      inventorySeededLocations += 1;
      const seededQty = Number(staged.quantity_on_hand ?? 0);
      await setStockOnHandSnapshot({
        client: supabase,
        shopId,
        partId: matchedPartId,
        locationId: defaultLocation.id,
        targetQty: Math.max(0, seededQty),
        idempotencyKey: `${shopId}:inventory-snapshot:parts-import:${intakeId}:${staged.id}`,
        metadata: {
          intake_id: intakeId,
          staging_row_id: staged.id,
          source: "shop_boost_parts_pipeline",
        },
      });
    }

    await supabase.from("shop_parts_source_aliases").upsert(
      {
        shop_id: shopId,
        intake_id: intakeId,
        raw_row_id: staged.raw_row_id,
        staging_row_id: staged.id,
        part_id: matchedPartId,
        source_system: sourceSystem,
        legacy_sku: staged.normalized_sku,
        legacy_part_number: staged.normalized_part_number,
        legacy_label: staged.normalized_name,
        alias_type: "legacy_import",
        source_hash: sourceHash,
      },
      { onConflict: "shop_id,part_id,source_hash" },
    );

    await supabase
      .from("shop_parts_import_staging")
      .update({ status: "promoted", promoted_at: new Date().toISOString() })
      .eq("id", staged.id);
  }

  const { data: intake } = await supabase
    .from("shop_boost_intakes")
    .select("intake_basics")
    .eq("id", intakeId)
    .eq("shop_id", shopId)
    .maybeSingle();
  const existingBasics = (intake?.intake_basics ?? {}) as Record<string, unknown>;

  await supabase
    .from("shop_boost_intakes")
    .update({
      intake_basics: {
        ...existingBasics,
        partsImportPipeline: {
          rawRows: rows.length,
          normalizedRows: stagingRowsPayload.length,
          matchedRows,
          ambiguousRows,
          promotedRows,
          rejectedRows: 0,
          inventorySeedMode: "snapshot_with_seed_moves",
          inventorySeededLocations,
        },
      },
    })
    .eq("id", intakeId)
    .eq("shop_id", shopId);

  return {
    rawRows: rows.length,
    normalizedRows: stagingRowsPayload.length,
    matchedRows,
    ambiguousRows,
    promotedRows,
    rejectedRows: 0,
    inventorySeedMode: "snapshot_with_seed_moves",
    inventorySeededLocations,
  };
}
