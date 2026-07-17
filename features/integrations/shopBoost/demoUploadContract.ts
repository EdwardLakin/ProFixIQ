import {
  INSTANT_SHOP_ANALYSIS_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";

export const DEMO_UPLOAD_BUCKET = "shop-imports";
export const DEMO_UPLOAD_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DEMO_UPLOAD_MAX_TOTAL_BYTES = 60 * 1024 * 1024;

export type DemoUploadFileDescriptor = {
  dataset: ShopBoostUploadDatasetKey;
  fileName: string;
  sizeBytes: number;
  contentType: string;
};

export type DemoStagedUploadManifestEntry = DemoUploadFileDescriptor & {
  path: string;
};

export type DemoSignedUploadTarget = DemoStagedUploadManifestEntry & {
  token: string;
};

export type DemoUploadValidationResult =
  | { ok: true; files: DemoUploadFileDescriptor[] }
  | { ok: false; error: string };

const allowedDatasetKeys = new Set<string>(INSTANT_SHOP_ANALYSIS_DATASET_KEYS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isInstantAnalysisDataset(
  value: unknown,
): value is ShopBoostUploadDatasetKey {
  return typeof value === "string" && allowedDatasetKeys.has(value);
}

export function normalizeDemoUploadContentType(value: unknown): string {
  const contentType = typeof value === "string" ? value.trim().toLowerCase() : "";
  return contentType === "text/csv" ||
    contentType === "application/csv" ||
    contentType === "application/vnd.ms-excel" ||
    contentType === "text/plain"
    ? contentType
    : "text/csv";
}

export function validateDemoUploadFileDescriptors(
  value: unknown,
): DemoUploadValidationResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Upload at least one CSV so we can run an import analysis." };
  }

  if (value.length > INSTANT_SHOP_ANALYSIS_DATASET_KEYS.length) {
    return { ok: false, error: "Too many files were included in this analysis." };
  }

  const seen = new Set<ShopBoostUploadDatasetKey>();
  const files: DemoUploadFileDescriptor[] = [];
  let totalBytes = 0;

  for (const raw of value) {
    const entry = asRecord(raw);
    if (!isInstantAnalysisDataset(entry.dataset)) {
      return { ok: false, error: "One of the uploaded datasets is not supported." };
    }
    if (seen.has(entry.dataset)) {
      return { ok: false, error: `Only one ${entry.dataset} CSV can be analyzed at a time.` };
    }

    const fileName = typeof entry.fileName === "string" ? entry.fileName.trim() : "";
    if (!fileName || !fileName.toLowerCase().endsWith(".csv")) {
      return { ok: false, error: `${entry.dataset} must be provided as a CSV file.` };
    }

    const sizeBytes = Number(entry.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, error: `${fileName} is empty or has an invalid size.` };
    }
    if (sizeBytes > DEMO_UPLOAD_MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `${fileName} is larger than the 20 MB analysis limit. Split the export and try again.`,
      };
    }

    seen.add(entry.dataset);
    totalBytes += sizeBytes;
    files.push({
      dataset: entry.dataset,
      fileName: fileName.slice(0, 180),
      sizeBytes,
      contentType: normalizeDemoUploadContentType(entry.contentType),
    });
  }

  if (totalBytes > DEMO_UPLOAD_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: "The selected exports exceed the 60 MB analysis limit. Split the largest export and retry.",
    };
  }

  return { ok: true, files };
}
