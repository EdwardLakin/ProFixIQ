import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { normalizeHeader } from "@/features/onboarding-agent/lib/domains";
import type { OnboardingAgentInputPayload } from "@/features/onboarding-agent/lib/agentPlanTypes";
import { redactOnboardingSample } from "@/features/onboarding-agent/server/redactOnboardingSample";

const DEFAULT_SAMPLES = 25;

function targetSchema() {
  return {
    customer: ["sourceCustomerId", "name", "businessName", "email", "phone"],
    vehicle: ["sourceVehicleId", "sourceCustomerId", "vin", "plate", "year", "make", "model"],
    historical_work_order: ["sourceWorkOrderId", "sourceCustomerId", "sourceVehicleId", "openedDate", "complaint", "correction", "total"],
    historical_invoice: ["invoiceNumber", "sourceWorkOrderId", "sourceCustomerId", "invoiceDate", "total", "paymentStatus"],
    part: ["sku", "partNumber", "description", "vendorName", "cost", "price"],
    vendor: ["name", "email", "phone", "accountNumber"],
    staff_candidate: ["name", "email", "phone", "role"],
    menu_suggestion: ["serviceName", "description", "category", "laborHours", "laborPrice", "opCode"],
    inspection_suggestion: ["name", "description", "category"],
  };
}

function pickSamples(rows: Record<string, unknown>[], max: number) {
  if (rows.length <= max) {
    return rows.map((row, idx) => ({ row, idx }));
  }
  const first = rows.slice(0, Math.ceil(max * 0.7)).map((row, idx) => ({ row, idx }));
  const stride = Math.max(1, Math.floor(rows.length / Math.max(1, max - first.length)));
  const later: Array<{ row: Record<string, unknown>; idx: number }> = [];
  for (let i = Math.ceil(max * 0.7); i < rows.length && first.length + later.length < max; i += stride) {
    later.push({ row: rows[i], idx: i });
  }
  return [...first, ...later];
}

const RELATIONSHIP_HEADER_HINTS = [
  "customer id", "customer", "vehicle id", "vin", "unit", "plate", "work order", "repair order", "ro number", "invoice",
  "vendor id", "vendor", "part number", "sku", "service", "menu", "operation code", "op code",
];

function detectReferenceColumns(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const idReferenceColumns = normalized.filter((header) => header.includes(" id") || header.endsWith("id") || header.includes("number") || header.includes("vin") || header.includes("sku"));
  const relationshipColumns = normalized.filter((header) => RELATIONSHIP_HEADER_HINTS.some((hint) => header.includes(hint)));
  return {
    idReferenceColumns: Array.from(new Set(idReferenceColumns)).slice(0, 40),
    relationshipColumns: Array.from(new Set(relationshipColumns)).slice(0, 40),
  };
}

export async function buildOnboardingAgentInput(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  sampleRowsPerFile?: number;
}): Promise<OnboardingAgentInputPayload> {
  const sb = params.supabase as any;
  const sampleLimit = Math.max(5, Math.min(50, params.sampleRowsPerFile ?? DEFAULT_SAMPLES));

  const { data: files, error } = await sb
    .from("onboarding_files")
    .select("id, original_filename, storage_bucket, storage_path, declared_domain, detected_domain, parse_status, row_count, header_row")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const fileIds = (files ?? []).map((f: any) => f.id);
  const rowsByFile = new Map<string, Record<string, unknown>[]>();
  if (fileIds.length) {
    const { data: rows } = await sb
      .from("onboarding_raw_rows")
      .select("file_id, source_row_index, raw")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .in("file_id", fileIds)
      .order("source_row_index", { ascending: true });

    for (const row of rows ?? []) {
      const list = rowsByFile.get(row.file_id) ?? [];
      list.push((row.raw ?? {}) as Record<string, unknown>);
      rowsByFile.set(row.file_id, list);
    }
  }

  const filesPayload = [];
  for (const file of files ?? []) {
    let rows = rowsByFile.get(file.id) ?? [];
    let headers = Array.isArray(file.header_row) ? file.header_row : [];
    let rowCount = Number(file.row_count ?? rows.length ?? 0);

    if (!rows.length) {
      const dl = await sb.storage.from(file.storage_bucket).download(file.storage_path);
      if (!dl.error && dl.data) {
        const parsed = parseCsvText(await dl.data.text());
        rows = parsed.rows;
        headers = parsed.headers;
        rowCount = parsed.rows.length;
      }
    }

    const sampled = pickSamples(rows, sampleLimit);
    const sampleRows = sampled.map((entry) => redactOnboardingSample(entry.row));
    const sampleRowIndexes = sampled.map((entry) => entry.idx);
    const normalizedHeaders = headers.map(normalizeHeader);
    const deterministicDetectedDomain = detectFileDomain({
      filename: file.original_filename ?? file.storage_path,
      headers,
      declaredDomain: file.declared_domain,
    });
    const { idReferenceColumns, relationshipColumns } = detectReferenceColumns(headers);
    const columnExamples: Record<string, unknown[]> = {};
    for (const row of sampleRows) {
      for (const [key, val] of Object.entries(row)) {
        const arr = columnExamples[key] ?? [];
        if (val && arr.length < 3) arr.push(val);
        columnExamples[key] = arr;
      }
    }

    filesPayload.push({
      fileId: file.id,
      filename: file.original_filename ?? file.storage_path,
      declaredDomain: file.declared_domain,
      deterministicDetectedDomain,
      detectedDomain: file.detected_domain ?? deterministicDetectedDomain,
      parseStatus: file.parse_status,
      rowCount,
      headers,
      normalizedHeaders,
      sampleRowIndexes,
      sampleRows,
      idReferenceColumns,
      relationshipColumns,
      columnExamples,
      deterministic: {
        entityCount: 0,
        linkCount: 0,
        reviewCount: 0,
      },
    });
  }

  return {
    sessionId: params.sessionId,
    shopId: params.shopId,
    files: filesPayload,
    targetSchema: targetSchema(),
  };
}
