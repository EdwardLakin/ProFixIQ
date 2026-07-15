export const AI_AUTOMATION_CAPABILITIES = [
  "appointment_intake",
  "customer_status_updates",
  "work_order_line_creation",
  "quote_preparation",
  "approval_request_delivery",
  "parts_ordering",
  "appointment_reminders",
  "advisor_follow_up",
  "invoice_preparation",
  "payment_collection",
] as const;

export type AiAutomationCapability =
  (typeof AI_AUTOMATION_CAPABILITIES)[number];

export const AI_AUTOMATION_EVIDENCE_OUTCOMES = [
  "observed",
  "matched",
  "corrected",
  "exception",
  "critical_failure",
] as const;
export type AiAutomationEvidenceOutcome =
  (typeof AI_AUTOMATION_EVIDENCE_OUTCOMES)[number];

export type AiAutomationReadinessStatus =
  | "learning"
  | "ready"
  | "suspended";

export type AiAutomationReadiness = {
  capability: AiAutomationCapability;
  status: AiAutomationReadinessStatus;
  observationCount: number;
  comparisonCount: number;
  matchCount: number;
  correctionCount: number;
  exceptionCount: number;
  criticalFailureCount: number;
  minimumObservationCount: number;
  minimumComparisonCount: number;
  agreementRate: number | null;
  exceptionRate: number | null;
  readinessPercent: number;
  evaluatedAt: string;
};

export type AiAutomationPolicy = {
  automationPaused: boolean;
  ownerEnabled: Record<AiAutomationCapability, boolean>;
  readiness: Record<AiAutomationCapability, AiAutomationReadiness>;
  executionAvailable: Record<AiAutomationCapability, boolean>;
  effectiveEnabled: Record<AiAutomationCapability, boolean>;
};

export const AI_AUTOMATION_CAPABILITY_DETAILS: Record<
  AiAutomationCapability,
  { label: string; description: string }
> = {
  appointment_intake: {
    label: "Appointment intake",
    description: "Confirm and manage appointment requests using availability, duration, and customer context.",
  },
  customer_status_updates: {
    label: "Customer status updates",
    description: "Send meaningful vehicle progress updates when verified workflow events occur.",
  },
  work_order_line_creation: {
    label: "Work-order line creation",
    description: "Create repair lines from verified inspections, history, and customer concerns.",
  },
  quote_preparation: {
    label: "Quote preparation",
    description: "Prepare customer quotes using shop pricing, labor rules, and verified parts data.",
  },
  approval_request_delivery: {
    label: "Approval requests",
    description: "Deliver quote and approval requests through the customer's permitted channels.",
  },
  parts_ordering: {
    label: "Parts ordering",
    description: "Place authorized parts orders after fitment, availability, and customer approval checks.",
  },
  appointment_reminders: {
    label: "Appointment reminders",
    description: "Send reminders for confirmed appointments while respecting delivery and suppression history.",
  },
  advisor_follow_up: {
    label: "Advisor follow-up",
    description: "Handle routine follow-up for approvals, deferred service, and stalled jobs.",
  },
  invoice_preparation: {
    label: "Invoice preparation",
    description: "Prepare final invoices from completed, authorized work and verified financial totals.",
  },
  payment_collection: {
    label: "Payment collection",
    description: "Open secure portal or pickup payment sessions for finalized invoices.",
  },
};

export function isAiAutomationCapability(
  value: unknown,
): value is AiAutomationCapability {
  return AI_AUTOMATION_CAPABILITIES.includes(value as AiAutomationCapability);
}

export function isAiAutomationEvidenceOutcome(
  value: unknown,
): value is AiAutomationEvidenceOutcome {
  return AI_AUTOMATION_EVIDENCE_OUTCOMES.includes(
    value as AiAutomationEvidenceOutcome,
  );
}
