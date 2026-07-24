export type OwnerReportRange = "weekly" | "monthly" | "quarterly" | "yearly";

export type OwnerReportComparison = {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type OwnerReportTrendPoint = {
  key: string;
  label: string;
  revenue: number;
  issuedInvoices: number;
  knownContribution: number;
};

export type OwnerReportTechnician = {
  technicianId: string;
  name: string;
  role: string | null;
  completedLines: number;
  billedHours: number;
  jobClockHours: number;
  attendanceHours: number;
  efficiencyPct: number | null;
  productivityPct: number | null;
  proficiencyPct: number | null;
};

export type OwnerReportFocusItem = {
  id: string;
  title: string;
  detail: string;
  severity: "positive" | "watch" | "critical" | "info";
  href: string;
};

export type OwnerIntelligenceReport = {
  metricVersion: "owner_intelligence_v1";
  snapshotHash: string;
  generatedAt: string;
  shop: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  period: {
    range: OwnerReportRange;
    label: string;
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
    comparisonLabel: string;
  };
  financial: {
    issuedRevenue: OwnerReportComparison;
    issuedInvoices: OwnerReportComparison;
    averageRepairOrder: OwnerReportComparison;
    collectedRevenue: OwnerReportComparison;
    knownContribution: OwnerReportComparison;
    knownMarginPct: number | null;
    knownCosts: number;
    costCoveragePct: number;
    costCoveredInvoices: number;
  };
  workflow: {
    averageApprovalHours: number | null;
    approvalSamples: number;
    awaitingApprovalCount: number;
    awaitingApprovalHours: number;
    waitingForPartsCount: number;
    waitingForPartsHours: number;
    onHoldWorkOrders: number;
    onHoldHours: number;
    readyToInvoiceCount: number;
    readyToInvoiceHours: number;
  };
  workforce: {
    billedHours: number;
    jobClockHours: number;
    attendanceHours: number;
    efficiencyPct: number | null;
    productivityPct: number | null;
    proficiencyPct: number | null;
    completedLines: number;
    technicians: OwnerReportTechnician[];
  };
  quality: {
    approvalRatePct: number | null;
    decidedQuoteLines: number;
    sentQuoteLines: number;
    declinedDeferredValue: number;
    confirmedComebacks: number | null;
  };
  trend: OwnerReportTrendPoint[];
  focus: OwnerReportFocusItem[];
  confidence: {
    level: "high" | "medium" | "low";
    score: number;
    warnings: string[];
    definitions: string[];
  };
  executiveSummary: {
    text: string | null;
    source: "cached_ai" | "cached_deterministic" | null;
    generatedAt: string | null;
  };
};

export type OwnerReportSummaryResponse = {
  summary: string;
  source: "ai" | "deterministic" | "cached_ai" | "cached_deterministic";
  generatedAt: string;
  snapshotHash: string;
};
