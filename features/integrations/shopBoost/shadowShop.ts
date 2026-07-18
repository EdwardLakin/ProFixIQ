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

function reconcilePreflightReport(
  report: ShopBoostPreflightReport,
  history: InstantHistoryAssessment,
): ShopBoostPreflightReport {
  const relationshipReview = history.reviewJobCount;
  const relationshipBlockers = history.blockedJobCount;
  const reviewCount = Math.max(report.totals.likelyReviewNeededCount, relationshipReview);
  const blockerCount = Math.max(report.totals.likelyBlockerCount, relationshipBlockers);
  const detected = report.totals.detectedRecords;
  const autoCount = Math.max(0, detected - reviewCount - blockerCount);
  const coverage = detected > 0 ? Math.round((autoCount / detected) * 100) : 0;
  let score = Math.round(report.confidence.score * 0.55 + history.linkageAccuracy * 0.45);
  if (blockerCount > 0) score = Math.min(score, 69);
  else if (reviewCount > 0) score = Math.min(score, 89);
  score = Math.max(1, Math.min(99, score));

  const readiness: ShopBoostPreflightReport["confidence"]["readiness"] =
    blockerCount > 0
      ? "NOT_READY"
      : reviewCount > 0
        ? "COMPLETED_WITH_REVIEW"
        : "READY_FOR_GO_LIVE";
  const integrityStatus: ShopBoostPreflightReport["confidence"]["integrityStatus"] =
    blockerCount > 0 ? "not_ready" : reviewCount > 0 ? "ready_with_warnings" : "ready";

  return {
    ...report,
    totals: {
      detectedRecords: detected,
      estimatedAutoImportCoverage: coverage,
      likelyAutoImportCount: autoCount,
      likelyReviewNeededCount: reviewCount,
      likelyBlockerCount: blockerCount,
    },
    confidence: {
      score,
      label: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
      readiness,
      integrityStatus,
    },
    reviewNotes: [
      ...report.reviewNotes,
      `History relationship check grouped ${history.rowCount} rows into ${history.uniqueJobCount} repair orders; ${relationshipReview} need link review and ${relationshipBlockers} lack a stable repair-order identifier.`,
    ],
  };
}

function inferWorkflowJobs(history: InstantHistoryAssessment): ShadowWorkflowJob[] {
  return history.jobs.slice(0, 12).map((job) => {
    const status: ShadowWorkflowJob["status"] =
      job.operationalStatus === "awaiting_approval"
        ? "awaiting_approval"
        : job.operationalStatus === "blocked" || job.outcome === "blocked"
          ? "blocked"
          : job.operationalStatus === "ready_to_invoice"
            ? "ready_to_invoice"
            : job.outcome === "review"
              ? "in_inspection"
              : "queued";
    const needsReview = job.outcome !== "ready";

    return {
      id: job.key,
      roNumber: job.roNumber,
      customer: job.customer,
      vehicle: job.vehicle,
      concernSummary: job.concern,
      status,
      hasParts: job.hasParts,
      hasLabor: job.hasLabor,
      approvalState:
        status === "awaiting_approval"
          ? "ready"
          : status === "blocked"
            ? "blocked"
            : "not_required",
      inspectionState: needsReview ? "needs_review" : "ready",
      quoteState: needsReview ? "needs_review" : "draft_ready",
      invoiceState: status === "ready_to_invoice" ? "ready" : "pending",
      confidence: job.confidence,
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

    return {
      id: row.id,
      label,
      status,
      confidenceNote:
        status === "likely_stocked"
          ? "Part mapping has stable identifiers"
          : status === "likely_missing"
            ? "Part mapping needs confirmation before live inventory use"
            : "Part identifiers need reconciliation before import",
      referencedByJobs,
    };
  });

  if (fromCatalog.length > 0) return fromCatalog;
  return workflowJobs
    .filter((job) => job.hasParts)
    .slice(0, 6)
    .map((job, index) => ({
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
  historyAssessment: InstantHistoryAssessment;
  domainCoverage: number;
  questionnaire?: Record<string, unknown>;
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
  const history = args.historyAssessment;

  const workflowJobs = inferWorkflowJobs(history);
  const recurringPatterns = collectRecurringServicePatterns(historyRows);
  const unresolvedLinks = history.unresolvedLinkCount;
  const partsSignals = inferPartsSignals(partsRows, workflowJobs);
  const partsConflicts = partsRows.filter((row) => row.blocked || row.reviewFlag).length;
  const approvalsLikelyNeeded = history.explicitAwaitingApprovalCount;
  const jobsReady = history.readyJobCount;
  const jobsBlocked = history.blockedJobCount;
  const jobsReview = history.reviewJobCount + history.blockedJobCount;

  const approvalFlow: ShadowApprovalFlowPreview = {
    inspectionReady: history.readyJobCount,
    recommendationDrafted: history.readyJobCount,
    waitingCustomerApproval: approvalsLikelyNeeded,
    invoiceReady: history.jobs.filter((job) => job.operationalStatus === "ready_to_invoice").length,
  };

  const operationalNarrative: ShadowOperationalNarrative = {
    historyRowsDetected: history.rowCount,
    jobsIdentified: history.uniqueJobCount,
    approvalsLikelyNeeded,
    partsInventoryConflicts: partsConflicts,
    unresolvedCustomerVehicleLinks: unresolvedLinks,
    suggestedInspections: Math.min(history.uniqueJobCount, Math.max(0, recurringPatterns)),
    suggestedMenuOpportunities: recurringPatterns,
    estimatedOperationalBlockers: jobsBlocked,
    workReadyCount: jobsReady,
    blockedCount: history.explicitStalledCount,
    reviewNeededCount: jobsReview,
  };

  const goLiveMomentumLabel =
    jobsBlocked > 0
      ? `${jobsBlocked} repair order${jobsBlocked === 1 ? "" : "s"} need an identifier before import can complete.`
      : jobsReview > 0
        ? `${jobsReview} repair order${jobsReview === 1 ? "" : "s"} will be held for guided review; the rest can continue through activation.`
        : "The detected repair orders are ready for controlled activation.";

  const operationalSignals: ShadowDashboardSignals = {
    jobsInProgress: approvalsLikelyNeeded,
    jobsBlockedByDataQuality: jobsBlocked,
    jobsReadyForCustomerCommunication: approvalsLikelyNeeded,
    goLiveMomentumLabel,
  };

  const autoMatchedCustomersPct =
    customersRows.length > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((customersRows.length - customersRows.filter((row) => row.reviewFlag || row.blocked).length) /
                customersRows.length) *
                100,
            ),
          ),
        )
      : 0;

  const migrationStory: ShadowMigrationStory = {
    autoMatchedCustomersPct,
    linkedVehicleProfiles: Math.max(
      0,
      vehiclesRows.length - vehiclesRows.filter((row) => row.blocked || row.reviewFlag).length,
    ),
    preparedWorkflowJobs: history.readyJobCount,
    recordsNeedingReview: jobsReview,
    recurringPatternsDetected: recurringPatterns,
    highlights: [
      `${history.rowCount} history rows were grouped into ${history.uniqueJobCount} unique repair orders.`,
      `${history.readyJobCount} repair orders have the identifiers and customer/vehicle links needed for import.`,
      `${jobsReview} repair orders will enter the same guided review path used by onboarding.`,
      `${partsRows.length} parts rows and ${args.rowsByDomain.invoices.length} invoice rows are staged for activation.`,
    ],
  };

  const impactComparison = buildShopBoostImpactComparison({
    preflightReport: args.preflightReport,
    migrationStory,
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
      migrationStory,
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
    questionnaire: args.questionnaire,
  });

  const stalledJobs = history.explicitStalledCount;
  const customersWaiting = history.explicitAwaitingApprovalCount;
  const urgencySignals: ShadowUrgencySignals = {
    stalledJobs,
    customersWaiting,
    revenueAtRiskNow:
      roi.evidence_level === "observed" ? Math.round(roi.revenue_opportunity * 0.75) : 0,
    explainer: [
      customersWaiting > 0
        ? `The CSV status fields explicitly mark ${customersWaiting} repair orders as awaiting approval.`
        : "No uploaded status field explicitly marks a repair order as awaiting approval.",
      stalledJobs > 0
        ? `The CSV status fields explicitly mark ${stalledJobs} repair orders as stalled or blocked.`
        : "No uploaded status field explicitly marks a repair order as stalled.",
      partsConflicts > 0
        ? `${partsConflicts} parts rows need identifier or mapping review before inventory use.`
        : "No parts identifier conflicts were detected in this preflight pass.",
    ],
  };

  const anomalyRate =
    history.uniqueJobCount > 0
      ? (history.reviewJobCount + history.blockedJobCount) / history.uniqueJobCount
      : 0;
  const anomalyPenalty = Math.min(40, Math.round(anomalyRate * 40));
  const projectionScore = Math.max(
    1,
    Math.min(
      99,
      Math.round(
        args.preflightReport.confidence.score * 0.45 +
          history.linkageAccuracy * 0.35 +
          args.domainCoverage * 0.2 -
          anomalyPenalty * 0.25,
      ),
    ),
  );

  const projectionConfidence: ShadowProjectionConfidence = {
    score: projectionScore,
    label: projectionScore >= 78 ? "HIGH" : projectionScore >= 58 ? "MEDIUM" : "LOW",
    factors: {
      dataCompleteness: args.preflightReport.totals.estimatedAutoImportCoverage,
      matchingAccuracy: history.linkageAccuracy,
      domainCoverage: args.domainCoverage,
      anomalyPenalty,
    },
  };

  const planAlignment: ShadowPlanAlignment = {
    starterImpactUnlockPct: 42,
    proImpactUnlockPct: 100,
    summary:
      roi.estimated_monthly_impact > 0
        ? `Starter supports the controlled import. Pro adds approvals, workflow automation, and parts operations for the modeled ${roi.estimated_monthly_impact_low}-${roi.estimated_monthly_impact_high} monthly capacity range.`
        : "Starter supports the controlled import. Pro adds approvals, workflow automation, and parts operations after activation establishes a measurable baseline.",
  };

  const activationConfidence: ShadowActivationConfidence = {
    previewBasedOnUploadedData: true,
    realImportStartsOnActivation: true,
    flaggedItemsReviewableAfterActivation: true,
    noWritesBeforeActivation: true,
    contextCarriesForward: true,
    confidenceCopy:
      "This preview uses the same five datasets and review-first handoff as guided onboarding. Activation carries the staged files and review context into the real import.",
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
