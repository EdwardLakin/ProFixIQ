export type DecisionStatus =
  | "needs_review"
  | "evidence_added"
  | "recommended"
  | "awaiting_approval"
  | "approved"
  | "declined"
  | "in_progress"
  | "completed";

export type DecisionStatusView = {
  key: DecisionStatus;
  label: string;
  variant: "neutral" | "info" | "active" | "warning" | "success" | "danger";
};

const STATUS_VIEW: Record<DecisionStatus, DecisionStatusView> = {
  needs_review: { key: "needs_review", label: "Needs review", variant: "warning" },
  evidence_added: { key: "evidence_added", label: "Evidence added", variant: "info" },
  recommended: { key: "recommended", label: "Recommended", variant: "active" },
  awaiting_approval: { key: "awaiting_approval", label: "Awaiting approval", variant: "info" },
  approved: { key: "approved", label: "Approved", variant: "success" },
  declined: { key: "declined", label: "Declined", variant: "danger" },
  in_progress: { key: "in_progress", label: "In progress", variant: "active" },
  completed: { key: "completed", label: "Completed", variant: "success" },
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

export function getDecisionStatusView(status: DecisionStatus): DecisionStatusView {
  return STATUS_VIEW[status];
}

export function resolveDecisionStatus(input: {
  approvalState?: string | null;
  workStatus?: string | null;
  findingStatus?: string | null;
  hasEvidence?: boolean;
  isReviewed?: boolean;
}): DecisionStatus {
  const approval = norm(input.approvalState);
  const workStatus = norm(input.workStatus);
  const findingStatus = norm(input.findingStatus);

  if (approval === "declined" || workStatus === "declined") return "declined";
  if (workStatus === "completed" || workStatus === "ready_to_invoice" || workStatus === "invoiced") {
    return "completed";
  }
  if (workStatus === "in_progress" || workStatus === "queued") return "in_progress";
  if (approval === "approved") return "approved";
  if (approval === "pending" || workStatus === "awaiting_approval" || workStatus === "waiting_for_approval") {
    return "awaiting_approval";
  }

  if (findingStatus === "fail" || findingStatus === "recommend") {
    if (input.hasEvidence) return "evidence_added";
    if (input.isReviewed) return "recommended";
    return "needs_review";
  }

  if (input.hasEvidence) return "evidence_added";
  return "recommended";
}

export function formatDecisionStatus(input: Parameters<typeof resolveDecisionStatus>[0]): DecisionStatusView {
  return STATUS_VIEW[resolveDecisionStatus(input)];
}
