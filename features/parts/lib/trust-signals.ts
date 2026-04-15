export type PartTrustLevel = "high" | "review" | "low";

export type PartTrustMeta = {
  level: PartTrustLevel;
  reasons: string[];
};

const TRUST_REASON = {
  missingSku: "Missing SKU",
  missingPartNumber: "Missing part number",
  weakIdentity: "Weak identity key",
  aliasBackedImport: "Alias-backed import",
  stagingNotFinalized: "Staging not finalized",
  ambiguousLineage: "Ambiguous import lineage",
  lowImportConfidence: "Low import confidence",
  importedRecord: "Imported record",
} as const;

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

  if (!input.sku?.trim()) reasons.push(TRUST_REASON.missingSku);
  if (!input.partNumber?.trim()) reasons.push(TRUST_REASON.missingPartNumber);
  if (!input.normalizedPartKey?.trim()) reasons.push(TRUST_REASON.weakIdentity);
  if ((input.aliasCount ?? 0) > 0) reasons.push(TRUST_REASON.aliasBackedImport);
  if ((input.pendingStagingCount ?? 0) > 0) reasons.push(TRUST_REASON.stagingNotFinalized);
  if ((input.ambiguousCandidateCount ?? 0) > 0) reasons.push(TRUST_REASON.ambiguousLineage);
  if (typeof input.importConfidence === "number" && input.importConfidence < 0.75) {
    reasons.push(TRUST_REASON.lowImportConfidence);
  }
  if (input.sourceIntakeId?.trim() && reasons.length === 0) reasons.push(TRUST_REASON.importedRecord);

  const low = reasons.some(
    (r) =>
      r === TRUST_REASON.weakIdentity ||
      r === TRUST_REASON.ambiguousLineage ||
      r === TRUST_REASON.lowImportConfidence,
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
