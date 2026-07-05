import Papa from "papaparse";

export type CsvParseResult<T extends Record<string, unknown>> = {
  rows: T[];
  fields: string[];
};

export function normalizeCsvHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export type CompactImportCounts = {
  imported?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  duplicates?: number;
  [key: string]: number | undefined;
};

export function compactImportSummary<Skipped, Failed>({
  counts,
  totalRows,
  skippedRows,
  failedRows,
  sampleLimit = 25,
}: {
  counts: CompactImportCounts;
  totalRows: number;
  skippedRows: Skipped[];
  failedRows: Failed[];
  sampleLimit?: number;
}) {
  return {
    ok: true,
    counts,
    totalRows,
    skippedRows: skippedRows.slice(0, sampleLimit),
    failedRows: failedRows.slice(0, sampleLimit),
    sampleLimit,
    truncated: {
      skippedRows: Math.max(0, skippedRows.length - sampleLimit),
      failedRows: Math.max(0, failedRows.length - sampleLimit),
    },
  };
}

export async function parseCsvFileFromFormData<T extends Record<string, unknown>>({
  formData,
  fieldName = "file",
  maxBytes = 4_500_000,
  maxRows,
}: {
  formData: FormData;
  fieldName?: string;
  maxBytes?: number;
  maxRows?: number;
}): Promise<CsvParseResult<T>> {
  const value = formData.get(fieldName);
  if (!(value instanceof File)) {
    throw new Error("Missing CSV file. Attach a .csv file using the file field.");
  }
  const name = value.name.toLowerCase();
  const type = value.type.toLowerCase();
  if (!name.endsWith(".csv") && !type.includes("csv")) {
    throw new Error("Unsupported file type. Please upload a .csv file.");
  }
  if (value.size > maxBytes) {
    throw new Error(
      `CSV file is too large (${Math.ceil(value.size / 1_000_000)} MB). Please upload a file under ${Math.floor(maxBytes / 1_000_000)} MB or split the import.`,
    );
  }
  const csv = await value.text();
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeCsvHeader,
  });
  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new Error(
      `Malformed CSV near row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }
  const rows = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0) as T[];
  if (!rows.length) throw new Error("No rows were found in the CSV file.");
  if (maxRows && rows.length > maxRows) {
    throw new Error(
      `CSV contains ${rows.length} rows. Please split the file into imports of ${maxRows} rows or fewer.`,
    );
  }
  return { rows, fields: parsed.meta.fields ?? [] };
}
