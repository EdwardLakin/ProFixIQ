import { z } from "zod";

export const REQUIRED_DOC_TYPES = ["drivers_license", "certification", "tax_form", "other"] as const;
const ACCEPT_STATUSES = ["active", "approved", "accepted"] as const;
const REVIEW_STATUSES = ["received", "pending", "review", "needs_review"] as const;

type Mode = "create" | "patch";

const allowedFields = new Set([
  "workforce_role",
  "workforce_category",
  "doc_type",
  "label",
  "is_required",
  "expires_required",
  "expires_warning_days",
  "accept_statuses",
  "review_statuses",
  "priority",
  "is_active",
]);

const normalizeNullableString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeStatuses = (value: unknown, allowed: readonly string[], field: string) => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array`);
  const normalized = Array.from(new Set(value.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)));
  if (!normalized.length) throw new Error(`${field} must be a non-empty array`);
  for (const status of normalized) {
    if (!allowed.includes(status)) throw new Error(`${field} contains invalid value: ${status}`);
  }
  return normalized;
};

const parseBooleanField = (value: unknown, field: string) => {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
};

export function validateDocumentRequirementPayload(payload: unknown, mode: Mode) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body must be a JSON object");
  }

  const input = payload as Record<string, unknown>;

  if ("shop_id" in input) throw new Error("shop_id is not allowed");

  const unknownFields = Object.keys(input).filter((key) => !allowedFields.has(key));
  if (unknownFields.length) throw new Error(`Unknown fields: ${unknownFields.join(", ")}`);

  if (mode === "patch" && Object.keys(input).length === 0) throw new Error("At least one field is required");

  const output: Record<string, unknown> = {};

  if ("workforce_role" in input) output.workforce_role = normalizeNullableString(input.workforce_role);
  if ("workforce_category" in input) output.workforce_category = normalizeNullableString(input.workforce_category);

  if (mode === "create" || "doc_type" in input) {
    const result = z.enum(REQUIRED_DOC_TYPES).safeParse(String(input.doc_type ?? "").trim().toLowerCase());
    if (!result.success) throw new Error("doc_type is invalid");
    output.doc_type = result.data;
  }

  if (mode === "create" || "label" in input) {
    const label = String(input.label ?? "").trim();
    if (!label) throw new Error("label is required");
    output.label = label;
  }

  if ("is_required" in input) output.is_required = parseBooleanField(input.is_required, "is_required");
  if ("expires_required" in input) output.expires_required = parseBooleanField(input.expires_required, "expires_required");

  if ("expires_warning_days" in input) {
    const n = Number(input.expires_warning_days);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error("expires_warning_days must be an integer between 0 and 365");
    output.expires_warning_days = n;
  }

  if ("priority" in input) {
    const n = Number(input.priority);
    if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error("priority must be an integer between 0 and 1000");
    output.priority = n;
  }

  if ("is_active" in input) output.is_active = parseBooleanField(input.is_active, "is_active");
  if ("accept_statuses" in input) output.accept_statuses = normalizeStatuses(input.accept_statuses, ACCEPT_STATUSES, "accept_statuses");
  if ("review_statuses" in input) output.review_statuses = normalizeStatuses(input.review_statuses, REVIEW_STATUSES, "review_statuses");

  if (mode === "create") {
    if (!("is_required" in output)) output.is_required = true;
    if (!("expires_required" in output)) output.expires_required = false;
    if (!("expires_warning_days" in output)) output.expires_warning_days = 30;
    if (!("priority" in output)) output.priority = 0;
    if (!("is_active" in output)) output.is_active = true;
    if (!("accept_statuses" in output)) output.accept_statuses = ["active", "approved", "accepted"];
    if (!("review_statuses" in output)) output.review_statuses = ["received", "pending", "review", "needs_review"];
  }

  return output;
}

export function isActiveOverrideConflict(error: { code?: string; message?: string } | null | undefined) {
  const msg = String(error?.message ?? "").toLowerCase();
  return error?.code === "23505" && msg.includes("workforce_document_requirements") && msg.includes("active");
}
