export type PartTrustLevel = "high" | "review" | "low";

export type PartTrustMeta = {
  level: PartTrustLevel;
  reasons: string[];
};

export function buildPartTrustMeta(input: {
  sku?: string | null;
  partNumber?: string | null;
  normalizedPartKey?: string | null;
  sourceIntakeId?: string | null;
  aliasCount?: number;
  ambiguousCandidateCount?: number;
  pendingStagingCount?: number;
  importConfidence?: number | null;
}): PartTrustMeta {
  const reasons: string[] = [];

  if (!input.sku?.trim()) reasons.push("Missing SKU");
  if (!input.partNumber?.trim()) reasons.push("Missing part number");
  if (!input.normalizedPartKey?.trim()) reasons.push("Weak identity");
  if ((input.aliasCount ?? 0) > 0) reasons.push("Alias-backed import");
  if ((input.pendingStagingCount ?? 0) > 0) reasons.push("Staging not finalized");
  if ((input.ambiguousCandidateCount ?? 0) > 0) reasons.push("Ambiguous import lineage");
  if (typeof input.importConfidence === "number" && input.importConfidence < 0.75) {
    reasons.push("Low import confidence");
  }
  if (input.sourceIntakeId?.trim() && reasons.length === 0) reasons.push("Imported record");

  const low = reasons.some((r) =>
    ["Weak identity", "Ambiguous import lineage", "Low import confidence"].includes(r),
  );

  return {
    level: low ? "low" : reasons.length > 0 ? "review" : "high",
    reasons,
  };
}

export function trustBadgeTone(level: PartTrustLevel): string {
  if (level === "low") return "border-rose-500/30 bg-rose-950/25 text-rose-200";
  if (level === "review") return "border-sky-500/30 bg-sky-950/20 text-sky-200";
  return "border-emerald-500/30 bg-emerald-950/20 text-emerald-200";
}

export function trustLevelLabel(level: PartTrustLevel): string {
  if (level === "low") return "Low trust";
  if (level === "review") return "Needs review";
  return "High trust";
}

export function trustReasonTone(level: PartTrustLevel): string {
  if (level === "low") return "text-rose-200";
  if (level === "review") return "text-sky-200";
  return "text-neutral-300";
}
