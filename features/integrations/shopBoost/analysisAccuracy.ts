export type InstantAnalysisRow = Record<string, string>;

export type InstantHistoryOutcome = "ready" | "review" | "blocked";
export type InstantHistoryOperationalStatus =
  | "awaiting_approval"
  | "blocked"
  | "ready_to_invoice"
  | null;

export type InstantHistoryJobAssessment = {
  key: string;
  roNumber: string;
  customer: string;
  vehicle: string;
  concern: string;
  hasParts: boolean;
  hasLabor: boolean;
  confidence: number;
  outcome: InstantHistoryOutcome;
  missingCustomerLink: boolean;
  missingVehicleLink: boolean;
  operationalStatus: InstantHistoryOperationalStatus;
};

export type InstantHistoryAssessment = {
  rowCount: number;
  uniqueJobCount: number;
  readyJobCount: number;
  reviewJobCount: number;
  blockedJobCount: number;
  unresolvedLinkCount: number;
  linkageAccuracy: number;
  explicitStalledCount: number;
  explicitAwaitingApprovalCount: number;
  jobs: InstantHistoryJobAssessment[];
};

const JOB_ID_ALIASES = [
  "work_order",
  "work_order_number",
  "workorder",
  "workorder_number",
  "repair_order",
  "repair_order_number",
  "ro",
  "ro_number",
  "invoice",
  "invoice_number",
  "order_number",
  "job_number",
];

const CUSTOMER_ALIASES = [
  "customer",
  "customer_name",
  "customer_id",
  "customer_number",
  "customer_email",
  "customer_phone",
  "client",
  "client_name",
  "account_number",
];

const VEHICLE_ALIASES = [
  "vehicle",
  "vehicle_id",
  "vehicle_description",
  "vin",
  "vehicle_vin",
  "license_plate",
  "plate",
  "unit",
  "unit_number",
  "fleet_unit",
];

const CONCERN_ALIASES = [
  "description",
  "concern",
  "service",
  "job",
  "operation",
  "correction",
  "work_performed",
];

const STATUS_ALIASES = [
  "status",
  "work_order_status",
  "ro_status",
  "job_status",
  "invoice_status",
  "approval_status",
];

const PART_ALIASES = [
  "part_number",
  "part",
  "parts",
  "sku",
  "parts_total",
  "part_description",
];

const LABOR_ALIASES = [
  "labor",
  "labor_hours",
  "hours",
  "technician",
  "tech",
  "labor_total",
];

function normalizedKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedValue(value: unknown): string {
  return String(value ?? "").trim();
}

function pickAlias(row: InstantAnalysisRow, aliases: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (!aliases.includes(normalizedKey(key))) continue;
    const candidate = normalizedValue(value);
    if (candidate) return candidate;
  }
  return "";
}

function normalizeStatus(value: string): InstantHistoryOperationalStatus {
  const status = normalizedKey(value);
  if (
    status === "awaiting_approval" ||
    status === "approval_pending" ||
    status === "pending_approval" ||
    status === "waiting_for_approval"
  ) {
    return "awaiting_approval";
  }
  if (
    status === "blocked" ||
    status === "stalled" ||
    status === "on_hold" ||
    status === "hold"
  ) {
    return "blocked";
  }
  if (
    status === "ready_to_invoice" ||
    status === "completed" ||
    status === "complete" ||
    status === "invoiced"
  ) {
    return "ready_to_invoice";
  }
  return null;
}

export function assessInstantAnalysisHistory(
  rows: InstantAnalysisRow[],
): InstantHistoryAssessment {
  const groups = new Map<
    string,
    {
      key: string;
      stableIdentifier: boolean;
      roNumber: string;
      customer: string;
      vehicle: string;
      concern: string;
      hasParts: boolean;
      hasLabor: boolean;
      operationalStatus: InstantHistoryOperationalStatus;
    }
  >();

  rows.forEach((row, index) => {
    const roNumber = pickAlias(row, JOB_ID_ALIASES);
    const key = roNumber
      ? `job:${normalizedKey(roNumber)}`
      : `unidentified-row:${index}`;
    const current = groups.get(key) ?? {
      key,
      stableIdentifier: Boolean(roNumber),
      roNumber: roNumber || `Unidentified history row ${index + 1}`,
      customer: "",
      vehicle: "",
      concern: "",
      hasParts: false,
      hasLabor: false,
      operationalStatus: null,
    };

    current.customer ||= pickAlias(row, CUSTOMER_ALIASES);
    current.vehicle ||= pickAlias(row, VEHICLE_ALIASES);
    current.concern ||= pickAlias(row, CONCERN_ALIASES);
    current.hasParts ||= Boolean(pickAlias(row, PART_ALIASES));
    current.hasLabor ||= Boolean(pickAlias(row, LABOR_ALIASES));
    current.operationalStatus ||=
      normalizeStatus(pickAlias(row, STATUS_ALIASES));
    groups.set(key, current);
  });

  const jobs: InstantHistoryJobAssessment[] = Array.from(groups.values()).map(
    (group) => {
      const missingCustomerLink = !group.customer;
      const missingVehicleLink = !group.vehicle;
      const confidence =
        30 +
        (group.stableIdentifier ? 30 : 0) +
        (missingCustomerLink ? 0 : 20) +
        (missingVehicleLink ? 0 : 20);
      const outcome: InstantHistoryOutcome = !group.stableIdentifier
        ? "blocked"
        : missingCustomerLink || missingVehicleLink
          ? "review"
          : "ready";

      return {
        key: group.key,
        roNumber: group.roNumber,
        customer: group.customer || "Customer link needs review",
        vehicle: group.vehicle || "Vehicle link needs review",
        concern: group.concern || "Historical service record",
        hasParts: group.hasParts,
        hasLabor: group.hasLabor,
        confidence,
        outcome,
        missingCustomerLink,
        missingVehicleLink,
        operationalStatus: group.operationalStatus,
      };
    },
  );

  const readyJobCount = jobs.filter((job) => job.outcome === "ready").length;
  const reviewJobCount = jobs.filter((job) => job.outcome === "review").length;
  const blockedJobCount = jobs.filter((job) => job.outcome === "blocked").length;
  const unresolvedLinkCount = jobs.filter(
    (job) => job.missingCustomerLink || job.missingVehicleLink,
  ).length;
  const availableLinks = jobs.reduce(
    (count, job) =>
      count +
      (job.missingCustomerLink ? 0 : 1) +
      (job.missingVehicleLink ? 0 : 1),
    0,
  );
  const linkageAccuracy =
    jobs.length > 0 ? Math.round((availableLinks / (jobs.length * 2)) * 100) : 100;

  return {
    rowCount: rows.length,
    uniqueJobCount: jobs.length,
    readyJobCount,
    reviewJobCount,
    blockedJobCount,
    unresolvedLinkCount,
    linkageAccuracy,
    explicitStalledCount: jobs.filter(
      (job) => job.operationalStatus === "blocked",
    ).length,
    explicitAwaitingApprovalCount: jobs.filter(
      (job) => job.operationalStatus === "awaiting_approval",
    ).length,
    jobs,
  };
}

export function calculateInstantAnalysisDomainCoverage(
  counts: Record<"customers" | "vehicles" | "history" | "invoices" | "parts", number>,
): number {
  const populated = Object.values(counts).filter((count) => count > 0).length;
  return Math.round((populated / 5) * 100);
}
