import type {
  EstimateStatus,
  EstimateWorkspaceMode,
} from "@/features/estimates/types";

export type EstimateOwner = "Advisor" | "Parts" | "Customer" | "Operations";

export function estimateStatusLabel(status: EstimateStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "waiting_for_parts":
      return "Waiting for Parts";
    case "ready_for_advisor":
      return "Ready for Advisor";
    case "sent":
      return "Sent to Customer";
    case "partially_approved":
      return "Partially Approved";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "deferred":
      return "Deferred";
    case "expired":
      return "Expired";
  }
}

export function estimateNextOwner(status: EstimateStatus): EstimateOwner {
  switch (status) {
    case "waiting_for_parts":
      return "Parts";
    case "sent":
      return "Customer";
    case "approved":
    case "partially_approved":
      return "Operations";
    case "draft":
    case "ready_for_advisor":
    case "declined":
    case "deferred":
    case "expired":
      return "Advisor";
  }
}

export function estimatePrimaryAction(
  status: EstimateStatus,
  mode: EstimateWorkspaceMode,
): string {
  if (mode === "parts") {
    return status === "waiting_for_parts"
      ? "Complete Parts Quote"
      : "View Estimate";
  }

  switch (status) {
    case "draft":
      return "Submit to Parts";
    case "ready_for_advisor":
      return "Send Estimate";
    case "sent":
      return "Review Sent Estimate";
    case "waiting_for_parts":
      return "Waiting for Parts";
    case "partially_approved":
    case "approved":
      return "Open Work Order";
    case "declined":
    case "deferred":
    case "expired":
      return "View Estimate";
  }
}

export function isEstimateStatus(value: unknown): value is EstimateStatus {
  return (
    typeof value === "string" &&
    [
      "draft",
      "waiting_for_parts",
      "ready_for_advisor",
      "sent",
      "partially_approved",
      "approved",
      "declined",
      "deferred",
      "expired",
    ].includes(value)
  );
}
