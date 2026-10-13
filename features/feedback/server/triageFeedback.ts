import "server-only";

import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";
import {
  FEEDBACK_KINDS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SURFACES,
  inferFeedbackSurface,
  type FeedbackKind,
  type FeedbackSeverity,
  type FeedbackSurface,
} from "@/features/feedback/lib/feedback";

const MAX_TRIAGE_DESCRIPTION_LENGTH = 12_000;
const MAX_TRIAGE_PATH_LENGTH = 500;
const MAX_TRIAGE_ROLE_LENGTH = 100;
const MAX_TRIAGE_CANDIDATES = 18;

export type FeedbackCandidate = {
  id: string;
  title: string;
  summary: string;
  kind: FeedbackKind;
  surface: FeedbackSurface;
  submissionCount: number;
};

export type FeedbackTriage = {
  title: string;
  summary: string;
  kind: FeedbackKind;
  surface: FeedbackSurface;
  severity: FeedbackSeverity;
  needsAttention: boolean;
  recommendation: string;
  duplicateOf: string | null;
  duplicateConfidence: number | null;
};

function clampText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function enumValue<T extends readonly string[]>(
  values: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && values.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}

function boundedCandidate(candidate: FeedbackCandidate): FeedbackCandidate {
  return {
    ...candidate,
    id: candidate.id.slice(0, 100),
    title: candidate.title.slice(0, 120),
    summary: candidate.summary.slice(0, 500),
    submissionCount: Math.max(
      0,
      Math.min(candidate.submissionCount, 1_000_000),
    ),
  };
}

function fallbackTriage(input: {
  description: string;
  requestedKind: FeedbackKind;
  pathname: string | null;
}): FeedbackTriage {
  const lower = input.description.toLowerCase();
  const looksUrgent =
    /(cannot|can't|unable|blocked|crash|wrong total|incorrect total|data loss|payment|invoice)/i.test(
      lower,
    );
  const severity: FeedbackSeverity =
    input.requestedKind === "bug" && looksUrgent ? "high" : "normal";
  const title =
    input.description
      .split(/[.!?\n]/)[0]
      ?.trim()
      .slice(0, 88) || "Product feedback";
  return {
    title,
    summary: input.description.slice(0, 320),
    kind: input.requestedKind,
    surface: inferFeedbackSurface(input.pathname),
    severity,
    needsAttention: input.requestedKind === "bug" && looksUrgent,
    recommendation:
      severity === "high"
        ? "Review promptly and confirm whether the workflow is blocked."
        : "Review alongside similar feedback and prioritize by frequency and workflow impact.",
    duplicateOf: null,
    duplicateConfidence: null,
  };
}

export async function triageFeedback(input: {
  description: string;
  requestedKind: FeedbackKind;
  pathname: string | null;
  role: string | null;
  candidates: FeedbackCandidate[];
  shopId: string | null;
  userId: string;
}) {
  // Keep the helper safe even if a future caller bypasses the HTTP route's
  // validation. AI budget reservations assume prompt input is bounded.
  let description = input.description.slice(0, MAX_TRIAGE_DESCRIPTION_LENGTH);
  const pathname = input.pathname?.slice(0, MAX_TRIAGE_PATH_LENGTH) ?? null;
  const role = input.role?.slice(0, MAX_TRIAGE_ROLE_LENGTH) ?? null;
  let candidates = input.candidates
    .slice(0, MAX_TRIAGE_CANDIDATES)
    .map(boundedCandidate);
  const system = [
    "You triage product feedback for ProFixIQ, repair-shop management software.",
    "Do not propose code, branches, pull requests, or autonomous engineering work.",
    "Classify the report, make a concise neutral title and summary, identify the product surface, assess bug severity, and recommend a product-management action.",
    "Only mark needsAttention when the report is plausibly blocking, safety/financial/data-integrity related, or unusually important.",
    "Use duplicateOf only when an existing candidate describes substantially the same user need or defect. Prefer null over a weak match.",
    "Return JSON with title, summary, kind, surface, severity, needsAttention, recommendation, duplicateOf, duplicateConfidence.",
  ].join(" ");
  const userPayload = () => ({
    description,
    requestedKind: input.requestedKind,
    currentPath: pathname,
    reporterRole: role,
    existingCandidates: candidates,
  });
  // UTF-8 bytes conservatively bound byte-level BPE tokens. Reserve 1,000
  // additional tokens for provider framing under the shared 8,000-token hold.
  const promptBytes = () =>
    new TextEncoder().encode(system + JSON.stringify(userPayload())).length;
  while (promptBytes() > 7_000 && candidates.length > 0)
    candidates = candidates.slice(0, -1);
  while (promptBytes() > 7_000)
    description = description.slice(0, Math.max(0, description.length - 250));
  const fallback = fallbackTriage({
    description,
    requestedKind: input.requestedKind,
    pathname,
  });
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return runOpenAIStructuredJson<FeedbackTriage>({
    purpose: "fast",
    feature: "feedback_triage",
    schemaName: "profixiq_feedback_triage",
    maxOutputTokens: 350,
    timeoutMs: 10_000,
    telemetry: {
      endpoint: "/api/feedback",
      shopId: input.shopId,
      userId: input.userId,
    },
    system,
    user: userPayload(),
    fallback: () => fallback,
    validate: (candidate) => {
      const record =
        candidate && typeof candidate === "object" && !Array.isArray(candidate)
          ? (candidate as Record<string, unknown>)
          : {};
      const duplicateOf =
        typeof record.duplicateOf === "string" &&
        candidateIds.has(record.duplicateOf)
          ? record.duplicateOf
          : null;
      const rawConfidence =
        typeof record.duplicateConfidence === "number" &&
        Number.isFinite(record.duplicateConfidence)
          ? Math.max(0, Math.min(1, record.duplicateConfidence))
          : null;
      return {
        title: clampText(record.title, fallback.title, 100),
        summary: clampText(record.summary, fallback.summary, 500),
        kind: enumValue(FEEDBACK_KINDS, record.kind, fallback.kind),
        surface: enumValue(FEEDBACK_SURFACES, record.surface, fallback.surface),
        severity: enumValue(
          FEEDBACK_SEVERITIES,
          record.severity,
          fallback.severity,
        ),
        needsAttention: record.needsAttention === true,
        recommendation: clampText(
          record.recommendation,
          fallback.recommendation,
          500,
        ),
        duplicateOf:
          rawConfidence !== null && rawConfidence >= 0.72 ? duplicateOf : null,
        duplicateConfidence: duplicateOf ? rawConfidence : null,
      };
    },
  });
}
