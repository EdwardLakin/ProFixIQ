import crypto from "crypto";

export const ONBOARDING_UPLOAD_BUCKET = "shop-imports";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CSV_EXTENSIONS = new Set(["csv"]);

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function sanitizeOnboardingFilename(filename: string) {
  const nameOnly = filename.split(/[\\/]/).pop() ?? "file.csv";
  const trimmed = nameOnly.trim();
  const safe = safePathSegment(trimmed || "file.csv");
  return safe || "file.csv";
}

export function assertOnboardingUploadFile(file: File) {
  if (file.size <= 0) throw new Error("Empty files are not allowed");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File exceeds 10MB limit");

  const safeName = sanitizeOnboardingFilename(file.name || "file.csv");
  const extension = safeName.includes(".") ? safeName.split(".").pop()?.toLowerCase() ?? "" : "";

  if (!CSV_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported file format. CSV is supported in this phase.");
  }

  return { safeName };
}

export function buildOnboardingStoragePath(params: {
  shopId: string;
  sessionId: string;
  filename: string;
  index: number;
}) {
  const safeShopId = safePathSegment(params.shopId) || "shop";
  const safeSessionId = safePathSegment(params.sessionId) || "session";
  const safeName = sanitizeOnboardingFilename(params.filename);
  const stamp = Date.now();
  const digest = crypto
    .createHash("sha1")
    .update(`${stamp}:${params.index}:${params.filename}`)
    .digest("hex")
    .slice(0, 8);

  return `onboarding-agent/${safeShopId}/${safeSessionId}/${stamp}-${params.index}-${digest}-${safeName}`;
}
