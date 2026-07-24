export type RequiredDocType = "drivers_license" | "certification" | "tax_form" | "other";

export type RequirementRule = {
  key: string;
  workforceRole: string | null;
  workforceCategory: string | null;
  docType: RequiredDocType;
  label: string;
  required: boolean;
  expiresRequired: boolean;
  warningDays: number;
};

export type WorkforceDocumentRequirementOverrideRow = {
  id: string;
  workforce_role: string | null;
  workforce_category: string | null;
  doc_type: string;
  label: string | null;
  is_required: boolean;
  expires_required: boolean;
  expires_warning_days: number | null;
  priority: number | null;
  is_active: boolean;
};

const DEFAULT_WARNING_DAYS = 30;

export const DEFAULT_DOCUMENT_REQUIREMENTS: RequirementRule[] = [
  {
    key: "role:technician:drivers_license",
    workforceRole: "technician",
    workforceCategory: null,
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "role:technician:certification",
    workforceRole: "technician",
    workforceCategory: null,
    docType: "certification",
    label: "Certification",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:mechanic:drivers_license",
    workforceRole: null,
    workforceCategory: "mechanic",
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:mechanic:certification",
    workforceRole: null,
    workforceCategory: "mechanic",
    docType: "certification",
    label: "Certification",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:driver:drivers_license",
    workforceRole: null,
    workforceCategory: "driver",
    docType: "drivers_license",
    label: "Driver's License",
    required: true,
    expiresRequired: true,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:admin:tax_form",
    workforceRole: null,
    workforceCategory: "admin",
    docType: "tax_form",
    label: "Tax Form",
    required: true,
    expiresRequired: false,
    warningDays: DEFAULT_WARNING_DAYS,
  },
  {
    key: "category:office:tax_form",
    workforceRole: null,
    workforceCategory: "office",
    docType: "tax_form",
    label: "Tax Form",
    required: true,
    expiresRequired: false,
    warningDays: DEFAULT_WARNING_DAYS,
  },
];

const REQUIRED_DOC_TYPES = new Set<RequiredDocType>(["drivers_license", "certification", "tax_form", "other"]);

const normalize = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export function buildEffectiveDocumentRequirements(
  defaults: RequirementRule[],
  overrides: WorkforceDocumentRequirementOverrideRow[]
): RequirementRule[] {
  const defaultCandidates = defaults.map((rule, index) => ({
    source: "default" as const,
    rule,
    precedenceRank: rule.workforceRole ? 4 : rule.workforceCategory ? 3 : 2,
    priority: 0,
    index,
    tieKey: rule.key,
  }));

  // B2.2 behavior: inactive rows are ignored, so defaults continue to apply.
  const overrideCandidates = overrides
    .filter((row) => row.is_active)
    .map((row, index) => {
      const docType = normalize(row.doc_type) as RequiredDocType;
      if (!REQUIRED_DOC_TYPES.has(docType)) return null;

      const workforceRole = row.workforce_role ? normalize(row.workforce_role) : null;
      const workforceCategory = row.workforce_category ? normalize(row.workforce_category) : null;
      const label =
        (row.label && row.label.trim()) ||
        defaults.find((rule) => rule.docType === docType)?.label ||
        docType;

      return {
        source: "override" as const,
        rule: {
          key: `override:${row.id}`,
          workforceRole,
          workforceCategory,
          docType,
          label,
          required: row.is_required,
          expiresRequired: row.expires_required,
          warningDays: row.expires_warning_days ?? DEFAULT_WARNING_DAYS,
        },
        precedenceRank: workforceRole ? 4 : workforceCategory ? 3 : 2,
        priority: row.priority ?? 0,
        index,
        tieKey: row.id,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const candidates = [...defaultCandidates, ...overrideCandidates];
  const winningByScopeAndType = new Map<string, (typeof candidates)[number]>();

  const scopedKey = (rule: RequirementRule) =>
    `${normalize(rule.workforceRole) || "*"}|${normalize(rule.workforceCategory) || "*"}|${rule.docType}`;

  for (const candidate of candidates) {
    const key = scopedKey(candidate.rule);
    const existing = winningByScopeAndType.get(key);
    if (!existing) {
      winningByScopeAndType.set(key, candidate);
      continue;
    }

    if (candidate.precedenceRank !== existing.precedenceRank) {
      if (candidate.precedenceRank > existing.precedenceRank) winningByScopeAndType.set(key, candidate);
      continue;
    }

    if (candidate.priority !== existing.priority) {
      if (candidate.priority > existing.priority) winningByScopeAndType.set(key, candidate);
      continue;
    }

    if (candidate.rule.docType !== existing.rule.docType) {
      if (candidate.rule.docType < existing.rule.docType) winningByScopeAndType.set(key, candidate);
      continue;
    }

    if (candidate.tieKey < existing.tieKey) {
      winningByScopeAndType.set(key, candidate);
      continue;
    }

    if (candidate.tieKey === existing.tieKey && candidate.index < existing.index) {
      winningByScopeAndType.set(key, candidate);
    }
  }

  return Array.from(winningByScopeAndType.values())
    .sort((a, b) => {
      if (a.precedenceRank !== b.precedenceRank) return b.precedenceRank - a.precedenceRank;
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.rule.docType !== b.rule.docType) return a.rule.docType.localeCompare(b.rule.docType);
      return a.tieKey.localeCompare(b.tieKey);
    })
    .map((candidate) => candidate.rule);
}
