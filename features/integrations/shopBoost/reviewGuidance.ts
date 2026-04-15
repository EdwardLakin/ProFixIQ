export type RecommendedAction = "link_existing" | "create_new" | "merge_candidate" | "ignore";

export type RecommendationTarget = {
  id: string;
  label: string;
  score: number;
};

export type ReviewRecommendation = {
  recommendedAction: RecommendedAction;
  recommendationReason: string;
  recommendationConfidence: number;
  candidateTargets: RecommendationTarget[];
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  requiresManualReview: boolean;
  blockedAutoApply: boolean;
};

type ReviewCandidate = {
  domain: string;
  issueType: string;
  rawPayload?: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  suggestedMatches?: unknown;
  clusterConfidence?: number | null;
};

function norm(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return norm(value).toLowerCase();
}

function normalizePhone(value: unknown): string {
  return norm(value).replace(/\D+/g, "");
}

function pick(payload: Record<string, unknown>, patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(payload ?? {})) {
    const normalizedKey = lower(key);
    if (patterns.some((pattern) => pattern.test(normalizedKey))) {
      const n = norm(value);
      if (n) return n;
    }
  }
  return "";
}

function clampConfidence(value: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(0.99, Number(n.toFixed(2))));
}

export function confidenceLabelFromScore(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.85) return "HIGH";
  if (score >= 0.6) return "MEDIUM";
  return "LOW";
}

function buildRecommendation(
  recommendation: Omit<ReviewRecommendation, "confidenceLabel" | "requiresManualReview" | "blockedAutoApply">,
): ReviewRecommendation {
  const label = confidenceLabelFromScore(recommendation.recommendationConfidence);
  const blockedAutoApply = label !== "HIGH" || recommendation.recommendedAction === "merge_candidate";
  return {
    ...recommendation,
    confidenceLabel: label,
    requiresManualReview: blockedAutoApply,
    blockedAutoApply,
  };
}

function parseTargets(input: unknown): RecommendationTarget[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = norm(row.id ?? row.customerId ?? row.vehicleId ?? row.partId);
      const label = norm(row.label ?? row.name ?? row.display_name ?? row.email ?? row.part_number);
      const score = Number(row.score ?? row.confidence ?? 0);
      if (!id && !label) return null;
      return { id: id || label, label: label || id, score: Number.isFinite(score) ? score : 0 };
    })
    .filter((entry): entry is RecommendationTarget => !!entry)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function deriveReviewRecommendation(args: ReviewCandidate): ReviewRecommendation {
  const raw = args.rawPayload ?? {};
  const normalized = args.normalizedPayload ?? {};
  const merged = { ...raw, ...normalized };
  const targets = parseTargets(args.suggestedMatches);

  const clusterConfidence = clampConfidence(Number(args.clusterConfidence ?? 0));
  const email = lower(pick(merged, [/email/, /customer email/]));
  const phone = normalizePhone(pick(merged, [/phone/, /mobile/]));
  const vin = lower(pick(merged, [/^vin$/, /vehicle vin/]));
  const plate = lower(pick(merged, [/plate/, /license/]));
  const partNumber = lower(pick(merged, [/part number/, /part #/, /^pn$/]));
  const sku = lower(pick(merged, [/^sku$/, /stock code/]));

  const strongIdentityCount = [email, phone, vin, plate, partNumber, sku].filter(Boolean).length;
  const topTargetScore = clampConfidence(targets[0]?.score ?? 0);
  const nextTargetScore = clampConfidence(targets[1]?.score ?? 0);
  const conflictingCandidates = targets.length >= 2 && Math.abs(topTargetScore - nextTargetScore) <= 0.03;
  const issueType = args.issueType;

  if (conflictingCandidates) {
    return buildRecommendation({
      recommendedAction: "ignore",
      recommendationReason: "Conflicting candidates were detected with near-identical scores. Manual review is required before any link/merge action.",
      recommendationConfidence: clampConfidence(0.2),
      candidateTargets: targets,
    });
  }

  if (issueType === "invalid") {
    return buildRecommendation({
      recommendedAction: "ignore",
      recommendationReason: "Record is missing required identity fields and should be skipped until corrected.",
      recommendationConfidence: clampConfidence(Math.max(0.85, clusterConfidence || 0.85)),
      candidateTargets: [],
    });
  }

  if (issueType === "missing_dependency") {
    return buildRecommendation({
      recommendedAction: "create_new",
      recommendationReason: "A required dependency is missing; creating a new record will unblock dependent records.",
      recommendationConfidence: clampConfidence(Math.max(0.7, clusterConfidence + 0.2)),
      candidateTargets: targets,
    });
  }

  if (issueType === "duplicate_candidate" || issueType === "conflict") {
    return buildRecommendation({
      recommendedAction: "merge_candidate",
      recommendationReason: "Potential duplicate detected from clustering and matching signals.",
      recommendationConfidence: clampConfidence(Math.max(0.72, topTargetScore || clusterConfidence)),
      candidateTargets: targets,
    });
  }

  if (targets.length > 0 && (topTargetScore >= 0.86 || (strongIdentityCount >= 2 && topTargetScore >= 0.75))) {
    const reasonBits: string[] = [];
    if (email) reasonBits.push("email");
    if (phone) reasonBits.push("phone");
    if (vin) reasonBits.push("VIN");
    if (plate) reasonBits.push("plate");
    if (partNumber) reasonBits.push("part number");
    const reason = reasonBits.length > 0
      ? `Strong identifier match (${reasonBits.slice(0, 2).join(" + ")}) against an existing record.`
      : "High match score against an existing record.";
    return buildRecommendation({
      recommendedAction: "link_existing",
      recommendationReason: reason,
      recommendationConfidence: clampConfidence(Math.max(topTargetScore, clusterConfidence)),
      candidateTargets: targets,
    });
  }

  if (strongIdentityCount === 0 && issueType === "ambiguous_match") {
    return buildRecommendation({
      recommendedAction: "create_new",
      recommendationReason: "No strong identifier match found in existing records.",
      recommendationConfidence: clampConfidence(Math.max(0.6, clusterConfidence)),
      candidateTargets: targets,
    });
  }

  return buildRecommendation({
    recommendedAction: "create_new",
    recommendationReason: "No reliable existing match was found, so creating a new record is safest.",
    recommendationConfidence: clampConfidence(Math.max(0.55, clusterConfidence)),
    candidateTargets: targets,
  });
}

export function toResolutionAction(recommendedAction: RecommendedAction): "linked_to_existing" | "created_new" | "ignored" {
  if (recommendedAction === "link_existing" || recommendedAction === "merge_candidate") return "linked_to_existing";
  if (recommendedAction === "ignore") return "ignored";
  return "created_new";
}
