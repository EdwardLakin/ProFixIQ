import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];
type OnboardingReviewItemRow = Database["public"]["Tables"]["onboarding_review_items"]["Row"];

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export class ActivationReviewItemWriteError extends Error {
  phase: string;
  issueType: string;
  scopeKey: string;
  causeMessage: string;

  constructor(params: { phase: string; issueType: string; scopeKey: string; causeMessage: string }) {
    super(`Activation review item write failed (${params.phase}:${params.issueType}:${params.scopeKey}) - ${params.causeMessage}`);
    this.name = "ActivationReviewItemWriteError";
    this.phase = params.phase;
    this.issueType = params.issueType;
    this.scopeKey = params.scopeKey;
    this.causeMessage = params.causeMessage;
  }
}

function sortJson(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson) as JsonValue;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, JsonValue> = {};
    for (const [key, child] of entries) out[key] = sortJson(child);
    return out;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value ?? "");
}

function canonicalDetails(details: unknown): Record<string, JsonValue> {
  return sortJson(details ?? {}) as Record<string, JsonValue>;
}

function mergeDetails(existing: Record<string, JsonValue>, incoming: Record<string, JsonValue>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const prev = out[key];
    if (Array.isArray(prev) && Array.isArray(value)) {
      const merged = [...prev, ...value].map((item) => JSON.stringify(sortJson(item)));
      out[key] = Array.from(new Set(merged)).slice(0, 10).map((item) => JSON.parse(item)) as JsonValue;
      continue;
    }
    if (prev && typeof prev === "object" && !Array.isArray(prev) && value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeDetails(prev as Record<string, JsonValue>, value as Record<string, JsonValue>);
      continue;
    }
    out[key] = value as JsonValue;
  }
  return canonicalDetails(out);
}

function scopeKey(item: Pick<OnboardingReviewItemInsert, "shop_id" | "session_id" | "domain" | "issue_type" | "severity" | "details">): string {
  return stableUuidFromParts([
    "onboarding_review_scope",
    item.shop_id,
    item.session_id,
    item.domain ?? "",
    item.issue_type,
    item.severity,
    JSON.stringify(canonicalDetails(item.details ?? {})),
  ]);
}

export async function upsertOnboardingReviewItems(params: {
  supabase: SupabaseClient;
  phase: "parts" | "history" | "vendors";
  shopId: string;
  sessionId: string;
  reviewItems: OnboardingReviewItemInsert[];
}): Promise<{ persisted: number; reused: number }> {
  if (params.reviewItems.length === 0) return { persisted: 0, reused: 0 };
  const sb = params.supabase as any;

  const domains = Array.from(new Set(params.reviewItems.map((item) => String(item.domain ?? ""))));
  let existingQuery = sb
    .from("onboarding_review_items")
    .select("id, shop_id, session_id, domain, issue_type, severity, details, status, summary, entity_id, link_id")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId);
  if (domains.length > 0) existingQuery = existingQuery.in("domain", domains);

  const { data: existingRows, error: existingError } = await existingQuery;
  if (existingError) throw new Error(existingError.message);

  const existingByScope = new Map<string, OnboardingReviewItemRow>();
  for (const row of (existingRows ?? []) as OnboardingReviewItemRow[]) {
    existingByScope.set(scopeKey(row), row);
  }

  const payload: OnboardingReviewItemInsert[] = [];
  let reused = 0;

  for (const item of params.reviewItems) {
    const normalizedDetails = canonicalDetails(item.details ?? {});
    const key = scopeKey({ ...item, details: normalizedDetails });
    const existing = existingByScope.get(key);
    const incomingStatus = String(item.status ?? "pending");
    const existingStatus = String(existing?.status ?? "pending");
    const status = existing
      ? (existingStatus === "resolved" || existingStatus === "ignored" || existingStatus === "accepted" || existingStatus === "rejected"
          ? existingStatus
          : (incomingStatus || "pending"))
      : (incomingStatus || "pending");

    const mergedDetails = existing
      ? mergeDetails(canonicalDetails(existing.details ?? {}), normalizedDetails)
      : normalizedDetails;

    payload.push({
      ...item,
      id: existing?.id ?? item.id,
      shop_id: params.shopId,
      session_id: params.sessionId,
      summary: existing?.summary || item.summary,
      status: status as OnboardingReviewItemInsert["status"],
      severity: (existing?.severity ?? item.severity) as OnboardingReviewItemInsert["severity"],
      domain: (existing?.domain ?? item.domain) as OnboardingReviewItemInsert["domain"],
      issue_type: existing?.issue_type ?? item.issue_type,
      entity_id: existing?.entity_id ?? item.entity_id ?? null,
      link_id: existing?.link_id ?? item.link_id ?? null,
      details: mergedDetails as any,
    });

    if (existing) reused += 1;
  }

  const { error } = await sb.from("onboarding_review_items").upsert(payload, { onConflict: "id" });
  if (error) {
    const failedItem = payload[0];
    throw new ActivationReviewItemWriteError({
      phase: params.phase,
      issueType: String(failedItem?.issue_type ?? "unknown"),
      scopeKey: scopeKey({
        shop_id: params.shopId,
        session_id: params.sessionId,
        domain: failedItem?.domain,
        issue_type: failedItem?.issue_type ?? "unknown",
        severity: failedItem?.severity ?? "medium",
        details: failedItem?.details ?? {},
      }),
      causeMessage: error.message,
    });
  }

  return { persisted: payload.length, reused };
}
