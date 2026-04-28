import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];
type OnboardingReviewItemRow = Database["public"]["Tables"]["onboarding_review_items"]["Row"];

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export class ActivationReviewItemWriteError extends Error {
  phase: string;
  domain: string;
  issueType: string;
  severity: string;
  scope: { shopId: string; sessionId: string; domain: string; issueType: string; severity: string };
  scopeKey: string;
  causeCode: string | null;
  causeMessage: string;

  constructor(params: {
    phase: string;
    domain: string;
    issueType: string;
    severity: string;
    scope: { shopId: string; sessionId: string; domain: string; issueType: string; severity: string };
    scopeKey: string;
    causeCode?: string | null;
    causeMessage: string;
  }) {
    super(`Activation review item write failed (${params.phase}:${params.domain}:${params.issueType}:${params.severity}:${params.scopeKey}) - ${params.causeMessage}`);
    this.name = "ActivationReviewItemWriteError";
    this.phase = params.phase;
    this.domain = params.domain;
    this.issueType = params.issueType;
    this.severity = params.severity;
    this.scope = params.scope;
    this.scopeKey = params.scopeKey;
    this.causeCode = params.causeCode ?? null;
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

    const normalizedItem: OnboardingReviewItemInsert = {
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
    };
    payload.push(normalizedItem);

    if (existing) reused += 1;
  }

  const writtenKeys = new Set<string>();
  let persisted = 0;

  for (const item of payload) {
    const key = scopeKey({
      shop_id: params.shopId,
      session_id: params.sessionId,
      domain: item.domain,
      issue_type: item.issue_type,
      severity: item.severity,
      details: item.details ?? {},
    });
    if (writtenKeys.has(key)) continue;
    writtenKeys.add(key);

    const current = existingByScope.get(key);
    if (current) {
      const updatePayload = {
        summary: current.summary || item.summary,
        details: mergeDetails(canonicalDetails(current.details ?? {}), canonicalDetails(item.details ?? {})) as any,
        entity_id: current.entity_id ?? item.entity_id ?? null,
        link_id: current.link_id ?? item.link_id ?? null,
      };
      const { error: updateError } = await sb.from("onboarding_review_items").update(updatePayload).eq("id", current.id);
      if (updateError) {
        throw new ActivationReviewItemWriteError({
          phase: params.phase,
          domain: String(item.domain ?? "unknown"),
          issueType: String(item.issue_type ?? "unknown"),
          severity: String(item.severity ?? "medium"),
          scope: {
            shopId: params.shopId,
            sessionId: params.sessionId,
            domain: String(item.domain ?? ""),
            issueType: String(item.issue_type ?? "unknown"),
            severity: String(item.severity ?? "medium"),
          },
          scopeKey: key,
          causeCode: String((updateError as { code?: string } | null)?.code ?? ""),
          causeMessage: updateError.message,
        });
      }
      persisted += 1;
      continue;
    }

    const { error: insertError } = await sb.from("onboarding_review_items").insert(item);
    if (!insertError) {
      persisted += 1;
      continue;
    }

    const conflict = String((insertError as { code?: string } | null)?.code ?? "") === "23505"
      || String(insertError.message ?? "").includes("onboarding_review_items_shop_session_issue_scope_uidx");
    if (!conflict) {
      throw new ActivationReviewItemWriteError({
        phase: params.phase,
        domain: String(item.domain ?? "unknown"),
        issueType: String(item.issue_type ?? "unknown"),
        severity: String(item.severity ?? "medium"),
        scope: {
          shopId: params.shopId,
          sessionId: params.sessionId,
          domain: String(item.domain ?? ""),
          issueType: String(item.issue_type ?? "unknown"),
          severity: String(item.severity ?? "medium"),
        },
        scopeKey: key,
        causeCode: String((insertError as { code?: string } | null)?.code ?? ""),
        causeMessage: insertError.message,
      });
    }

    const { data: conflictRows, error: conflictLookupError } = await sb
      .from("onboarding_review_items")
      .select("id, shop_id, session_id, domain, issue_type, severity, details, status, summary, entity_id, link_id")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("domain", item.domain ?? "")
      .eq("issue_type", item.issue_type)
      .eq("severity", item.severity);
    if (conflictLookupError) {
      throw new ActivationReviewItemWriteError({
        phase: params.phase,
        domain: String(item.domain ?? "unknown"),
        issueType: String(item.issue_type ?? "unknown"),
        severity: String(item.severity ?? "medium"),
        scope: {
          shopId: params.shopId,
          sessionId: params.sessionId,
          domain: String(item.domain ?? ""),
          issueType: String(item.issue_type ?? "unknown"),
          severity: String(item.severity ?? "medium"),
        },
        scopeKey: key,
        causeCode: String((conflictLookupError as { code?: string } | null)?.code ?? ""),
        causeMessage: conflictLookupError.message,
      });
    }

    const resolved = ((conflictRows ?? []) as OnboardingReviewItemRow[]).find((row) => scopeKey(row) === key);
    if (!resolved) {
      throw new ActivationReviewItemWriteError({
        phase: params.phase,
        domain: String(item.domain ?? "unknown"),
        issueType: String(item.issue_type ?? "unknown"),
        severity: String(item.severity ?? "medium"),
        scope: {
          shopId: params.shopId,
          sessionId: params.sessionId,
          domain: String(item.domain ?? ""),
          issueType: String(item.issue_type ?? "unknown"),
          severity: String(item.severity ?? "medium"),
        },
        scopeKey: key,
        causeCode: String((insertError as { code?: string } | null)?.code ?? ""),
        causeMessage: "Conflict detected but scoped row was not found after retry",
      });
    }
    existingByScope.set(key, resolved);
    reused += 1;
  }

  return { persisted, reused };
}
