import Papa from "papaparse";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShopBoostPreflightReport,
  type ShopBoostPreflightReport,
} from "@/features/integrations/shopBoost/preflightAnalysis";
import {
  SHOP_BOOST_UPLOAD_DATASET_KEYS,
  type ShopBoostUploadDatasetKey,
} from "@/features/integrations/shopBoost/uploadDatasets";
import {
  buildShopBoostImpactComparison,
  type ImpactComparison,
} from "@/features/integrations/shopBoost/impactModel";
import {
  buildShopBoostROI,
  type ShopBoostROI,
} from "@/features/integrations/shopBoost/roiEngine";
import {
  assessInstantAnalysisHistory,
  calculateInstantAnalysisDomainCoverage,
  type InstantHistoryAssessment,
} from "@/features/integrations/shopBoost/analysisAccuracy";

type CsvRow = Record<string, string>;

type ShadowDomainKey = "customers" | "vehicles" | "history" | "invoices" | "parts" | "staff";
const SHADOW_DATASET_KEYS: ShadowDomainKey[] = ["customers", "vehicles", "history", "invoices", "parts", "staff"];

type ShadowStagedRow = {
  id: string;
  domain: ShadowDomainKey;
  raw: CsvRow;
  normalized: CsvRow;
  confidence: number;
  reviewFlag: boolean;
  blocked: boolean;
};

export type ShadowPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  confidence: number;
  reviewFlag: boolean;
  blocked: boolean;
};

export type ShadowSetupIssue = {
  id: string;
  severity: "review" | "blocker";
  title: string;
  detail: string;
};

export type ShadowOperationalNarrative = {
  historyRowsDetected: number;
  jobsIdentified: number;
  approvalsLikelyNeeded: number;
  partsInventoryConflicts: number;
  unresolvedCustomerVehicleLinks: number;
  suggestedInspections: number;
  suggestedMenuOpportunities: number;
  estimatedOperationalBlockers: number;
  workReadyCount: number;
  blockedCount: number;
  reviewNeededCount: number;
};

export type ShadowWorkflowJob = {
  id: string;
  roNumber: string;
  customer: string;
  vehicle: string;
  concernSummary: string;
  status: "queued" | "in_inspection" | "awaiting_approval" | "ready_to_invoice" | "blocked";
  hasParts: boolean;
  hasLabor: boolean;
  approvalState: "ready" | "blocked" | "not_required";
  inspectionState: "ready" | "needs_review";
  quoteState: "draft_ready" | "needs_review";
  invoiceState: "ready" | "pending";
  confidence: number;
};

export type ShadowApprovalFlowPreview = {
  inspectionReady: number;
  recommendationDrafted: number;
  waitingCustomerApproval: number;
  invoiceReady: number;
};

export type ShadowPartSignal = {
  id: string;
  label: string;
  status: "likely_stocked" | "likely_missing" | "review_needed";
  confidenceNote: string;
  referencedByJobs: number;
};

export type ShadowDashboardSignals = {
  jobsInProgress: number;
  jobsBlockedByDataQuality: number;
  jobsReadyForCustomerCommunication: number;
  goLiveMomentumLabel: string;
};

export type ShadowMigrationStory = {
  autoMatchedCustomersPct: number;
  linkedVehicleProfiles: number;
  preparedWorkflowJobs: number;
  recordsNeedingReview: number;
  recurringPatternsDetected: number;
  highlights: string[];
};

export type ShadowActivationConfidence = {
  previewBasedOnUploadedData: boolean;
  realImportStartsOnActivation: boolean;
  flaggedItemsReviewableAfterActivation: boolean;
  noWritesBeforeActivation: boolean;
  contextCarriesForward: boolean;
  confidenceCopy: string;
};

export type ShadowUrgencySignals = {
  stalledJobs: number;
  customersWaiting: number;
  revenueAtRiskNow: number;
  explainer: string[];
};

export type ShadowProjectionConfidence = {
  score: number;
  label: "HIGH" | "MEDIUM" | "LOW";
  factors: {
    dataCompleteness: number;
    matchingAccuracy: number;
    domainCoverage: number;
    anomalyPenalty: number;
  };
};

export type ShadowPlanAlignment = {
  starterImpactUnlockPct: number;
  proImpactUnlockPct: number;
  summary: string;
};

export type ShadowImportReadiness = {
  detectedRecords: number;
  readyRecords: number;
  reviewRecords: number;
  blockedRecords: number;
  historyRows: number;
  uniqueHistoryJobs: number;
  readyHistoryJobs: number;
  reviewHistoryJobs: number;
  blockedHistoryJobs: number;
  linkageAccuracy: number;
  domainCoverage: number;
};

export type ShadowShopSnapshot = {
  intakeId: string;
  generatedAt: string;
  questionnaire?: Record<string, unknown>;
  uploadSummary: Record<ShadowDomainKey, { count: number; fileName: string | null }>;
  preflightReport: ShopBoostPreflightReport;
  importReadiness: ShadowImportReadiness;
  dashboard: {
    estimatedImportedRecords: number;
    reviewQueueCount: number;
    blockerCount: number;
    readinessLabel: string;
    trustScore: number;
  };
  operationalNarrative: ShadowOperationalNarrative;
  workflowJobs: ShadowWorkflowJob[];
  approvalFlow: ShadowApprovalFlowPreview;
  partsSignals: ShadowPartSignal[];
  operationalSignals: ShadowDashboardSignals;
  migrationStory: ShadowMigrationStory;
  roi: ShopBoostROI;
  impactComparison: ImpactComparison;
  urgencySignals: ShadowUrgencySignals;
  projectionConfidence: ShadowProjectionConfidence;
  planAlignment: ShadowPlanAlignment;
  activationConfidence: ShadowActivationConfidence;
  customers: ShadowPreviewItem[];
  vehicles: ShadowPreviewItem[];
  workOrders: ShadowPreviewItem[];
  parts: ShadowPreviewItem[];
  setupIssues: ShadowSetupIssue[];
};

export type ShadowPreviewContext = {
  demoId: string;
  intakeId: string;
  shopName: string;
  country: string;
  snapshot: ShadowShopSnapshot;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseCsv(text: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (result.errors.length > 0) {
    return [];
  }

  return result.data.map((row) => {
    const cleaned: CsvRow = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key] = String(value ?? "").trim();
    }
    return cleaned;
  });
}

function pick(row: CsvRow, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

function confidenceFromCompleteness(row: CsvRow, keys: string[]): number {
  if (keys.length === 0) return 70;
  const populated = keys.reduce((count, key) => (row[key]?.trim() ? count + 1 : count), 0);
  const ratio = populated / keys.length;
  return Math.max(35, Math.min(98, Math.round(45 + ratio * 53)));
}

function buildItems(rows: ShadowStagedRow[], domain: ShadowDomainKey): ShadowPreviewItem[] {
  return rows.slice(0, 8).map((row, index) => {
    const source = row.normalized;

    if (domain === "customers") {
      const name = pick(source, ["name", "customer_name", "full_name", "company"], `Customer ${index + 1}`);
      const contact = pick(source, ["email", "phone", "phone_number", "mobile"], "No contact provided");
      return {
        id: row.id,
        title: name,
        subtitle: contact,
        confidence: row.confidence,
        reviewFlag: row.reviewFlag,
        blocked: row.blocked,
      };
    }

    if (domain === "vehicles") {
      const unit = pick(source, ["vin", "license_plate", "plate", "unit_number"], `Vehicle ${index + 1}`);
      const descriptor =
        [source.year, source.make, source.model].filter(Boolean).join(" ") || "Vehicle profile";
      return {
        id: row.id,
        title: unit,
        subtitle: descriptor,
        confidence: row.confidence,
        reviewFlag: row.reviewFlag,
        blocked: row.blocked,
      };
    }

    if (domain === "history") {
      const roNumber = pick(source, ["work_order", "ro", "invoice_number", "order_number"], `RO-${index + 1}`);
      const descriptor = pick(source, ["description", "concern", "job", "service"], "Historical repair order");
      return {
        id: row.id,
        title: roNumber,
        subtitle: descriptor,
        confidence: row.confidence,
        reviewFlag: row.reviewFlag,
        blocked: row.blocked,
      };
    }

    const partId = pick(source, ["part_number", "sku", "item", "name"], `Part ${index + 1}`);
    const descriptor = pick(source, ["description", "name", "category"], "Catalog item");
    return {
      id: row.id,
      title: partId,
      subtitle: descriptor,
      confidence: row.confidence,
      reviewFlag: row.reviewFlag,
      blocked: row.blocked,
    };
  });
}

function mapEntityType(key: ShadowDomainKey): string {
  if (key === "history") return "history";
  if (key === "invoices") return "invoices";
  return key;
}

function stageRowsByDomain(rows: CsvRow[], domain: ShadowDomainKey): ShadowStagedRow[] {
  return rows.map((row, index) => {
    if (domain === "customers") {
      const confidence = confidenceFromCompleteness(row, ["name", "email", "phone"]);
      return {
        id: `customer-${index}`,
        domain,
        raw: row,
        normalized: row,
        confidence,
        reviewFlag: confidence < 78,
        blocked: false,
      };
    }

    if (domain === "vehicles") {
      const confidence = confidenceFromCompleteness(row, ["vin", "license_plate", "make", "model"]);
      return {
        id: `vehicle-${index}`,
        domain,
        raw: row,
        normalized: row,
        confidence,
        reviewFlag: confidence < 76,
        blocked: !row.vin && !row.license_plate,
      };
    }

    if (domain === "history") {
      const confidence = confidenceFromCompleteness(row, ["work_order", "invoice_number", "customer", "vehicle"]);
      return {
        id: `history-${index}`,
        domain,
        raw: row,
        normalized: row,
        confidence,
        reviewFlag: confidence < 75,
        blocked: !row.work_order && !row.invoice_number,
      };
    }

    if (domain === "invoices") {
      const confidence = confidenceFromCompleteness(row, [
        "invoice_number",
        "customer",
        "total",
        "date",
      ]);
      return {
        id: `invoice-${index}`,
        domain,
        raw: row,
        normalized: row,
        confidence,
        reviewFlag: confidence < 75,
        blocked: !row.invoice_number && !row.invoice && !row.order_number,
      };
    }

    if (domain === "parts") {
      const confidence = confidenceFromCompleteness(row, ["part_number", "sku", "name"]);
      return {
        id: `part-${index}`,
        domain,
        raw: row,
        normalized: row,
        confidence,
        reviewFlag: confidence < 74,
        blocked: !row.part_number && !row.sku,
      };
    }

    const confidence = confidenceFromCompleteness(row, ["name", "email", "role"]);
    return {
      id: `staff-${index}`,
      domain,
      raw: row,
      normalized: row,
      confidence,
      reviewFlag: confidence < 70,
      blocked: false,
    };
  });
}

function collectRecurringServicePatterns(historyRows: ShadowStagedRow[]): number {
  const patternCounts = new Map<string, number>();

  for (const row of historyRows) {
    const service = pick(
      row.normalized,
      ["service", "description", "concern", "job", "category"],
      "",
    )
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (service.length < 5) continue;

    const key = service.split(" ").slice(0, 4).join(" ");
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  return Array.from(patternCounts.values()).filter((count) => count >= 2).length;
}

function inferWorkflowJobs(historyRows: ShadowStagedRow[]): ShadowWorkflowJob[] {
  return historyRows.slice(0, 12).map((row, index) => {
    const confidence = row.confidence;
    const hasParts = Boolean(
      row.normalized.part_number || row.normalized.part || row.normalized.parts || row.normalized.sku,
    );
    const hasLabor = Boolean(
      row.normalized.labor || row.normalized.labor_hours || row.normalized.hours || row.normalized.technician,
    );

    const needsReview = row.reviewFlag;
    const blocked = row.blocked;
    const status: ShadowWorkflowJob["status"] = blocked
      ? "blocked"
      : confidence >= 87
      ? "ready_to_invoice"
      : confidence >= 78
      ? "awaiting_approval"
      : needsReview
      ? "in_inspection"
      : "queued";

    const approvalState: ShadowWorkflowJob["approvalState"] =
      status === "awaiting_approval" ? "ready" : blocked ? "blocked" : "not_required";

    const invoiceState: ShadowWorkflowJob["invoiceState"] = status === "ready_to_invoice" ? "ready" : "pending";

    return {
      id: row.id,
      roNumber: pick(row.normalized, ["work_order", "ro", "invoice_number", "order_number"], `RO-${index + 1}`),
      customer: pick(row.normalized, ["customer", "customer_name", "name"], "Customer match pending"),
      vehicle: pick(row.normalized, ["vehicle", "vin", "license_plate", "unit_number"], "Vehicle match pending"),
      concernSummary: pick(row.normalized, ["description", "concern", "service", "job"], "General service workflow"),
      status,
      hasParts,
      hasLabor,
      approvalState,
      inspectionState: needsReview ? "needs_review" : "ready",
      quoteState: needsReview ? "needs_review" : "draft_ready",
      invoiceState,
      confidence,
    };
  });
}

function inferPartsSignals(partsRows: ShadowStagedRow[], workflowJobs: ShadowWorkflowJob[]): ShadowPartSignal[] {
  const fromCatalog = partsRows.slice(0, 8).map((row, index) => {
    const label = pick(row.normalized, ["part_number", "sku", "name", "item"], `Part ${index + 1}`);
    const referencedByJobs = workflowJobs.filter((job) => job.hasParts).length;
    const status: ShadowPartSignal["status"] = row.blocked
      ? "review_needed"
      : row.reviewFlag
      ? "likely_missing"
      : "likely_stocked";

    const confidenceNote =
      status === "likely_stocked"
        ? "Part mapping has stable identifiers"
        : status === "likely_missing"
        ? "Part is referenced but inventory certainty is limited"
        : "Part identifiers need reconciliation before import";

    return {
      id: row.id,
      label,
      status,
      confidenceNote,
      referencedByJobs,
    };
  });

  if (fromCatalog.length > 0) return fromCatalog;

  const fallback = workflowJobs.filter((job) => job.hasParts).slice(0, 6);
  return fallback.map((job, index) => ({
    id: `job-part-${index}`,
    label: `${job.roNumber} parts cluster`,
    status: "review_needed",
    confidenceNote: "No parts catalog uploaded. Parts references will be reviewed during activation.",
    referencedByJobs: 1,
  }));
}

function deriveOperationalPayload(args: {
  rowsByDomain: Record<ShadowDomainKey, ShadowStagedRow[]>;
  preflightReport: ShopBoostPreflightReport;
}): Pick<
  ShadowShopSnapshot,
  | "operationalNarrative"
  | "workflowJobs"
  | "approvalFlow"
  | "partsSignals"
  | "operationalSignals"
  | "migrationStory"
  | "roi"
  | "impactComparison"
  | "urgencySignals"
  | "projectionConfidence"
  | "planAlignment"
  | "activationConfidence"
> {
  const historyRows = args.rowsByDomain.history;
  const vehiclesRows = args.rowsByDomain.vehicles;
  const customersRows = args.rowsByDomain.customers;
  const partsRows = args.rowsByDomain.parts;

  const workflowJobs = inferWorkflowJobs(historyRows);
  const recurringPatterns = collectRecurringServicePatterns(historyRows);
  const unresolvedLinks = historyRows.filter(
    (row) =>
      !pick(row.normalized, ["customer", "customer_name"], "") ||
      !pick(row.normalized, ["vehicle", "vin", "license_plate"], ""),
  ).length;

  const partsSignals = inferPartsSignals(partsRows, workflowJobs);
  const partsConflicts = partsSignals.filter((signal) => signal.status !== "likely_stocked").length;

  const approvalsLikelyNeeded = workflowJobs.filter((job) => job.status === "awaiting_approval").length;
  const jobsReady = workflowJobs.filter((job) => job.status === "ready_to_invoice").length;
  const jobsBlocked = workflowJobs.filter((job) => job.status === "blocked").length;
  const jobsReview = workflowJobs.filter((job) => job.inspectionState === "needs_review").length;

  const approvalFlow: ShadowApprovalFlowPreview = {
    inspectionReady: workflowJobs.filter((job) => job.inspectionState === "ready").length,
    recommendationDrafted: workflowJobs.filter((job) => job.quoteState === "draft_ready").length,
    waitingCustomerApproval: approvalsLikelyNeeded,
    invoiceReady: workflowJobs.filter((job) => job.invoiceState === "ready").length,
  };

  const operationalNarrative: ShadowOperationalNarrative = {
    jobsIdentified: historyRows.length,
    approvalsLikelyNeeded,
    partsInventoryConflicts: partsConflicts,
    unresolvedCustomerVehicleLinks: unresolvedLinks,
    suggestedInspections: Math.max(2, Math.min(historyRows.length, Math.round(historyRows.length * 0.28))),
    suggestedMenuOpportunities: Math.max(recurringPatterns, Math.round(historyRows.length * 0.2)),
    estimatedOperationalBlockers: args.preflightReport.totals.likelyBlockerCount,
    workReadyCount: jobsReady,
    blockedCount: jobsBlocked,
    reviewNeededCount: jobsReview,
  };

  const goLiveMomentumLabel =
    args.preflightReport.confidence.readiness === "READY_FOR_GO_LIVE" ||
    args.preflightReport.confidence.readiness === "COMPLETED_CLEAN"
      ? "Most of your data looks go-live ready after activation."
      : args.preflightReport.totals.likelyBlockerCount > 0
      ? "You are close to go-live once flagged blockers are reviewed."
      : "You are close to go-live with a short review queue.";

  const operationalSignals: ShadowDashboardSignals = {
    jobsInProgress: workflowJobs.filter((job) => job.status === "in_inspection" || job.status === "awaiting_approval").length,
    jobsBlockedByDataQuality: jobsBlocked,
    jobsReadyForCustomerCommunication: approvalsLikelyNeeded,
    goLiveMomentumLabel,
  };

  const autoMatchedCustomersPct =
    customersRows.length > 0
      ? Math.max(
          0,
          Math.min(
            99,
            Math.round(((customersRows.length - customersRows.filter((row) => row.reviewFlag).length) / customersRows.length) * 100),
          ),
        )
      : 0;

  const impactComparison = buildShopBoostImpactComparison({
    preflightReport: args.preflightReport,
    migrationStory: {
      autoMatchedCustomersPct,
      linkedVehicleProfiles: vehiclesRows.length - vehiclesRows.filter((row) => row.blocked).length,
      preparedWorkflowJobs: workflowJobs.length,
      recordsNeedingReview: args.preflightReport.totals.likelyReviewNeededCount,
      recurringPatternsDetected: recurringPatterns,
      highlights: [],
    },
    workflowJobs,
    approvalFlow,
    partsSignals,
    domainSummaries: args.preflightReport.domains.map((domain) => ({
      domain: domain.domain,
      total: domain.detected,
      reviewRequired: domain.likelyNeedsReview,
      failed: domain.potentialBlockers,
    })),
  });

  const roi = buildShopBoostROI({
    snapshotLike: {
      preflightReport: args.preflightReport,
      migrationStory: {
        autoMatchedCustomersPct,
        linkedVehicleProfiles: vehiclesRows.length - vehiclesRows.filter((row) => row.blocked).length,
        preparedWorkflowJobs: workflowJobs.length,
        recordsNeedingReview: args.preflightReport.totals.likelyReviewNeededCount,
        recurringPatternsDetected: recurringPatterns,
        highlights: [],
      },
      workflowJobs,
      approvalFlow,
      partsSignals,
      operationalNarrative,
    },
    domainSummaries: args.preflightReport.domains.map((domain) => ({
      domain: domain.domain,
      total: domain.detected,
      reviewRequired: domain.likelyNeedsReview,
      failed: domain.potentialBlockers,
    })),
  });

  const stalledJobs = workflowJobs.filter((job) => job.status === "blocked" || job.status === "awaiting_approval").length;
  const customersWaiting = workflowJobs.filter((job) => job.status === "awaiting_approval").length;
  const urgencySignals: ShadowUrgencySignals = {
    stalledJobs,
    customersWaiting,
    revenueAtRiskNow: Math.round(roi.revenue_opportunity * 0.75),
    explainer: [
      `Based on your data, ${customersWaiting} jobs are waiting for approval routing right now.`,
      `We detected ${partsConflicts} parts linkage issues, which creates downstream estimate and invoice delays.`,
      `${stalledJobs} jobs are currently stalled by blockers or approval lag, putting near-term revenue at risk.`,
    ],
  };

  const migrationStory: ShadowMigrationStory = {
    autoMatchedCustomersPct,
    linkedVehicleProfiles: vehiclesRows.length - vehiclesRows.filter((row) => row.blocked).length,
    preparedWorkflowJobs: workflowJobs.length,
    recordsNeedingReview: args.preflightReport.totals.likelyReviewNeededCount,
    recurringPatternsDetected: recurringPatterns,
    highlights: [
      `${autoMatchedCustomersPct}% of customers look auto-matchable from uploaded identifiers.`,
      `Prepared ${workflowJobs.length} workflow-ready jobs from your uploaded history.`,
      `${args.preflightReport.totals.likelyReviewNeededCount} records are flagged for guided review before full cutover.`,
      `${Math.max(recurringPatterns, 1)} recurring service patterns can seed menu and inspection setup.`,
    ],
  };

  const domainCoverageScore = Math.round(
    (([customersRows, vehiclesRows, historyRows, partsRows].filter((rows) => rows.length > 0).length + (args.rowsByDomain.staff.length > 0 ? 1 : 0)) / 5) *
      100,
  );
  const anomalyPenalty = Math.min(35, Math.round((jobsBlocked + partsConflicts + unresolvedLinks) * 1.8));
  const projectionScore = Math.max(
    35,
    Math.min(
      98,
      Math.round(
        autoMatchedCustomersPct * 0.35 +
          Math.max(0, 100 - args.preflightReport.totals.likelyReviewNeededCount * 1.4) * 0.25 +
          domainCoverageScore * 0.25 +
          Math.max(0, 100 - anomalyPenalty) * 0.15,
      ),
    ),
  );

  const projectionConfidence: ShadowProjectionConfidence = {
    score: projectionScore,
    label: projectionScore >= 78 ? "HIGH" : projectionScore >= 58 ? "MEDIUM" : "LOW",
    factors: {
      dataCompleteness: Math.max(0, Math.round(100 - args.preflightReport.totals.likelyReviewNeededCount * 1.3)),
      matchingAccuracy: autoMatchedCustomersPct,
      domainCoverage: domainCoverageScore,
      anomalyPenalty,
    },
  };

  const planAlignment: ShadowPlanAlignment = {
    starterImpactUnlockPct: 42,
    proImpactUnlockPct: 100,
    summary: `Starter unlocks core import + baseline cleanup. Pro unlocks approvals, workflow automation, and parts sync to capture up to ${Math.round((roi.estimated_monthly_impact * 12) / 1000)}k/year impact potential.`,
  };

  const activationConfidence: ShadowActivationConfidence = {
    previewBasedOnUploadedData: true,
    realImportStartsOnActivation: true,
    flaggedItemsReviewableAfterActivation: true,
    noWritesBeforeActivation: true,
    contextCarriesForward: true,
    confidenceCopy:
      "This preview is generated from your uploaded files using the same preflight logic used for migration readiness. Activating starts your real import and carries this context into setup.",
  };

  return {
    operationalNarrative,
    workflowJobs,
    approvalFlow,
    partsSignals,
    operationalSignals,
    migrationStory,
    roi,
    impactComparison,
    urgencySignals,
    projectionConfidence,
    planAlignment,
    activationConfidence,
  };
}

export type ShadowShopCsvUpload = {
  fileName: string;
  text: string;
};

export async function buildShadowShopSnapshot(args: {
  intakeId: string;
  uploadedFiles?: Partial<Record<ShopBoostUploadDatasetKey, File>>;
  uploadedCsvs?: Partial<Record<ShopBoostUploadDatasetKey, ShadowShopCsvUpload>>;
}): Promise<ShadowShopSnapshot> {
  const parsedRowsByDomain: Record<ShadowDomainKey, CsvRow[]> = {
    customers: [],
    vehicles: [],
    history: [],
    invoices: [],
    parts: [],
    staff: [],
  };

  const uploadSummary: Record<ShadowDomainKey, { count: number; fileName: string | null }> = {
    customers: { count: 0, fileName: null },
    vehicles: { count: 0, fileName: null },
    history: { count: 0, fileName: null },
    invoices: { count: 0, fileName: null },
    parts: { count: 0, fileName: null },
    staff: { count: 0, fileName: null },
  };

  for (const key of SHOP_BOOST_UPLOAD_DATASET_KEYS) {
    if (!SHADOW_DATASET_KEYS.includes(key as ShadowDomainKey)) continue;
    const shadowKey = key as ShadowDomainKey;
    const file = args.uploadedFiles?.[key];
    const stagedCsv = args.uploadedCsvs?.[key];
    if (!file && !stagedCsv) continue;
    const text = stagedCsv?.text ?? (await file!.text());
    const rows = parseCsv(text);
    parsedRowsByDomain[shadowKey] = rows;
    uploadSummary[shadowKey] = {
      count: rows.length,
      fileName: stagedCsv?.fileName ?? file?.name ?? null,
    };
  }

  const stagedRowsByDomain: Record<ShadowDomainKey, ShadowStagedRow[]> = {
    customers: stageRowsByDomain(parsedRowsByDomain.customers, "customers"),
    vehicles: stageRowsByDomain(parsedRowsByDomain.vehicles, "vehicles"),
    history: stageRowsByDomain(parsedRowsByDomain.history, "history"),
    invoices: stageRowsByDomain(parsedRowsByDomain.invoices, "invoices"),
    parts: stageRowsByDomain(parsedRowsByDomain.parts, "parts"),
    staff: stageRowsByDomain(parsedRowsByDomain.staff, "staff"),
  };

  const preflightRows = (Object.keys(stagedRowsByDomain) as ShadowDomainKey[]).flatMap((domain) =>
    stagedRowsByDomain[domain].map((row) => ({
      entity_type: mapEntityType(domain),
      raw: row.raw,
      normalized: row.normalized,
    })),
  );

  const menuSuggestionCount = collectRecurringServicePatterns(stagedRowsByDomain.history);
  const inspectionSuggestionCount = Math.max(0, Math.round(stagedRowsByDomain.history.length * 0.28));

  const preflightReport = buildShopBoostPreflightReport({
    rows: preflightRows,
    hasHistoryData: stagedRowsByDomain.history.length > 0,
    hasVehicleData: stagedRowsByDomain.vehicles.length > 0,
    hasCustomerData: stagedRowsByDomain.customers.length > 0,
    menuSuggestionCount,
    inspectionSuggestionCount,
  });

  const setupIssues: ShadowSetupIssue[] = [
    ...preflightReport.blockers.map((blocker, index) => ({
      id: `blocker-${index}`,
      severity: "blocker" as const,
      title: blocker.code.replace(/_/g, " "),
      detail: blocker.guidance,
    })),
    ...preflightReport.reviewNotes.slice(0, 3).map((note, index) => ({
      id: `review-${index}`,
      severity: "review" as const,
      title: "Manual review recommendation",
      detail: note,
    })),
  ];

  const operationalPayload = deriveOperationalPayload({
    rowsByDomain: stagedRowsByDomain,
    preflightReport,
  });

  return {
    intakeId: args.intakeId,
    generatedAt: new Date().toISOString(),
    uploadSummary,
    preflightReport,
    dashboard: {
      estimatedImportedRecords: preflightReport.totals.likelyAutoImportCount,
      reviewQueueCount: preflightReport.totals.likelyReviewNeededCount,
      blockerCount: preflightReport.totals.likelyBlockerCount,
      readinessLabel: preflightReport.confidence.readiness,
      trustScore: preflightReport.confidence.score,
    },
    operationalNarrative: operationalPayload.operationalNarrative,
    workflowJobs: operationalPayload.workflowJobs,
    approvalFlow: operationalPayload.approvalFlow,
    partsSignals: operationalPayload.partsSignals,
    operationalSignals: operationalPayload.operationalSignals,
    migrationStory: operationalPayload.migrationStory,
    roi: operationalPayload.roi,
    impactComparison: operationalPayload.impactComparison,
    urgencySignals: operationalPayload.urgencySignals,
    projectionConfidence: operationalPayload.projectionConfidence,
    planAlignment: operationalPayload.planAlignment,
    activationConfidence: operationalPayload.activationConfidence,
    customers: buildItems(stagedRowsByDomain.customers, "customers"),
    vehicles: buildItems(stagedRowsByDomain.vehicles, "vehicles"),
    workOrders: buildItems(stagedRowsByDomain.history, "history"),
    parts: buildItems(stagedRowsByDomain.parts, "parts"),
    setupIssues,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseSnapshot(value: unknown): ShadowShopSnapshot | null {
  const record = asRecord(value);
  const intakeId = asString(record.intakeId);
  if (!isUuid(intakeId)) return null;
  const report = asRecord(record.preflightReport);
  if (!report.totals || !report.confidence) return null;
  return record as unknown as ShadowShopSnapshot;
}

export async function loadShadowPreviewContext(args: {
  demoId: string;
  intakeId: string;
}): Promise<ShadowPreviewContext | null> {
  if (!isUuid(args.demoId) || !isUuid(args.intakeId)) return null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("demo_shop_boosts")
    .select("id, shop_name, country, snapshot")
    .eq("id", args.demoId)
    .maybeSingle();

  if (error || !data) return null;

  const snapshot = parseSnapshot(data.snapshot);
  if (!snapshot || snapshot.intakeId !== args.intakeId) return null;

  return {
    demoId: data.id,
    intakeId: snapshot.intakeId,
    shopName: data.shop_name,
    country: data.country,
    snapshot,
  };
}
