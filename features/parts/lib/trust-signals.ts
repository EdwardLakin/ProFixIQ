export type PartTrustLevel = "high" | "review" | "low";

export type PartTrustMeta = {
  level: PartTrustLevel;
  reasons: string[];
};

export function countAmbiguousStagingRowsByPart(
  rows: ReadonlyArray<{
    stagingRowId: string | null | undefined;
    candidatePartId: string | null | undefined;
  }>,
): Record<string, number> {
  const candidatesByStagingRow = new Map<string, Set<string>>();
  for (const row of rows) {
    const stagingRowId = String(row.stagingRowId ?? "");
    const candidatePartId = String(row.candidatePartId ?? "");
    if (!stagingRowId || !candidatePartId) continue;
    const candidates =
      candidatesByStagingRow.get(stagingRowId) ?? new Set<string>();
    candidates.add(candidatePartId);
    candidatesByStagingRow.set(stagingRowId, candidates);
  }

  const ambiguousCountByPartId: Record<string, number> = {};
  for (const candidates of candidatesByStagingRow.values()) {
    if (candidates.size <= 1) continue;
    for (const candidatePartId of candidates) {
      ambiguousCountByPartId[candidatePartId] =
        (ambiguousCountByPartId[candidatePartId] ?? 0) + 1;
    }
  }
  return ambiguousCountByPartId;
}

const TRUST_REASON = {
  missingSku: "Missing SKU",
  missingPartNumber: "Missing part number",
  missingAuthoritativeIdentity: "Missing authoritative identity",
  weakIdentity: "Weak identity key",
  aliasBackedImport: "Alias-backed import",
  stagingNotFinalized: "Staging not finalized",
  ambiguousLineage: "Ambiguous import lineage",
  lowImportConfidence: "Low import confidence",
  importedRecord: "Imported record",
} as const;

export function buildPartTrustMeta(input: {
  externalId?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  barcode?: string | null;
  name?: string | null;
  vendor?: string | null;
  category?: string | null;
  price?: number | null;
  cost?: number | null;
  normalizedPartKey?: string | null;
  sourceIntakeId?: string | null;
  aliasCount?: number;
  ambiguousCandidateCount?: number;
  pendingStagingCount?: number;
  importConfidence?: number | null;
}): PartTrustMeta {
  const reasons: string[] = [];

  const hasExternalId = Boolean(input.externalId?.trim());
  const hasSku = Boolean(input.sku?.trim());
  const hasPartNumber = Boolean(input.partNumber?.trim());
  const hasBarcode = Boolean(input.barcode?.trim());
  const hasAuthoritativeIdentity = hasExternalId || hasSku || hasPartNumber || hasBarcode;
  const hasDescriptiveSupport = Boolean(input.name?.trim()) && (Boolean(input.vendor?.trim()) || Boolean(input.category?.trim()) || typeof input.price === "number" || typeof input.cost === "number");

  // SKU is optional. A supplier/manufacturer part number, barcode, or external
  // identity is authoritative on its own and must never be reported as an
  // identity failure merely because the shop does not use an internal SKU.
  if (!hasSku && !hasExternalId && !hasPartNumber && !hasBarcode) {
    reasons.push(TRUST_REASON.missingSku);
  }
  if (!hasPartNumber && !hasExternalId && !hasSku && !hasBarcode) {
    reasons.push(TRUST_REASON.missingPartNumber);
  }
  if (!hasAuthoritativeIdentity) reasons.push(TRUST_REASON.missingAuthoritativeIdentity);
  if (!hasAuthoritativeIdentity && !input.normalizedPartKey?.trim()) reasons.push(TRUST_REASON.weakIdentity);
  if ((input.aliasCount ?? 0) > 0) reasons.push(TRUST_REASON.aliasBackedImport);
  if ((input.pendingStagingCount ?? 0) > 0) reasons.push(TRUST_REASON.stagingNotFinalized);
  if ((input.ambiguousCandidateCount ?? 0) > 0) reasons.push(TRUST_REASON.ambiguousLineage);
  if (typeof input.importConfidence === "number" && input.importConfidence < 0.75) {
    reasons.push(TRUST_REASON.lowImportConfidence);
  }
  if (input.sourceIntakeId?.trim() && reasons.length === 0) reasons.push(TRUST_REASON.importedRecord);

  const hasBlockingLineageIssue = reasons.some(
    (r) => r === TRUST_REASON.ambiguousLineage || r === TRUST_REASON.lowImportConfidence,
  );
  const low = !hasAuthoritativeIdentity || hasBlockingLineageIssue;
  const trustedImport = hasExternalId || ((hasSku || hasPartNumber) && hasDescriptiveSupport);

  return {
    level: low ? "low" : trustedImport ? "high" : reasons.length > 0 ? "review" : "high",
    reasons: trustedImport ? reasons.filter((r) => r !== TRUST_REASON.importedRecord) : reasons,
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
  return "text-[color:var(--theme-text-secondary)]";
}
