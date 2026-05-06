export const MAX_BYTES = 10 * 1024 * 1024;

const SUPPORTED_MIME = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);

export function parseApproxBase64Bytes(contentBase64: string): number {
  return Math.floor((contentBase64.length * 3) / 4);
}

function isCsvLikeExcel(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".csv");
}

export function isAllowedUploadType(mimeType: string, fileName: string): { ok: boolean; message?: string } {
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return { ok: false, message: "xlsx_not_supported_by_agent" };
  }
  if (SUPPORTED_MIME.has(mimeType)) {
    if (mimeType === "application/vnd.ms-excel" && !isCsvLikeExcel(fileName)) {
      return { ok: false, message: "excel_mime_requires_csv_extension" };
    }
    return { ok: true };
  }
  return { ok: false, message: "unsupported_file_type" };
}
