export type PortalWorkOrderStatusKey =
  | "appointment_confirmed"
  | "vehicle_received"
  | "inspection_underway"
  | "approval_needed"
  | "work_underway"
  | "waiting_for_parts"
  | "final_checks"
  | "ready_for_pickup"
  | "completed";

export type PortalWorkOrderStatus = {
  key: PortalWorkOrderStatusKey;
  label: string;
  nextStep: string;
  actionRequired: boolean;
  complete: boolean;
};

type PortalWorkOrderStatusInput = {
  status: string | null | undefined;
  approvalState?: string | null;
  scheduledAt?: string | null;
  invoiceSentAt?: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const CUSTOMER_APPROVAL_STATES = new Set([
  "awaiting_approval",
  "awaiting_customer",
  "customer_review",
  "pending",
  "pending_approval",
  "requested",
  "sent",
]);

const WAITING_PARTS_STATES = new Set([
  "parts_on_order",
  "parts_waiting",
  "pending_parts",
  "waiting_for_parts",
  "waiting_parts",
]);

const INSPECTION_STATES = new Set([
  "diagnosing",
  "inspection",
  "inspection_in_progress",
  "inspecting",
]);

const WORK_STATES = new Set([
  "active",
  "in_progress",
  "repair_in_progress",
  "working",
]);

const FINAL_CHECK_STATES = new Set([
  "final_check",
  "final_checks",
  "quality_check",
  "quality_control",
]);

const READY_STATES = new Set([
  "completed",
  "invoiced",
  "ready_for_pickup",
  "ready_to_invoice",
]);

const COMPLETE_STATES = new Set(["archived", "cancelled", "closed", "paid"]);

export function toPortalWorkOrderStatus(
  input: PortalWorkOrderStatusInput,
): PortalWorkOrderStatus {
  const status = normalize(input.status);
  const approvalState = normalize(input.approvalState);

  if (
    status === "awaiting_approval" ||
    CUSTOMER_APPROVAL_STATES.has(approvalState)
  ) {
    return {
      key: "approval_needed",
      label: "Your approval is needed",
      nextStep:
        "Review the estimate and choose how you would like the shop to proceed.",
      actionRequired: true,
      complete: false,
    };
  }

  if (WAITING_PARTS_STATES.has(status)) {
    return {
      key: "waiting_for_parts",
      label: "Waiting for parts",
      nextStep:
        "The shop is tracking the required parts and will update you when work can continue.",
      actionRequired: false,
      complete: false,
    };
  }

  if (INSPECTION_STATES.has(status)) {
    return {
      key: "inspection_underway",
      label: "Inspection underway",
      nextStep:
        "The shop is checking your vehicle and will share any recommendations with you.",
      actionRequired: false,
      complete: false,
    };
  }

  if (WORK_STATES.has(status) || status === "on_hold") {
    return {
      key: "work_underway",
      label: "Approved work underway",
      nextStep:
        "Your service team is working on the vehicle. They will contact you if anything changes.",
      actionRequired: false,
      complete: false,
    };
  }

  if (FINAL_CHECK_STATES.has(status)) {
    return {
      key: "final_checks",
      label: "Final checks",
      nextStep:
        "The work is nearly complete and the shop is completing its final review.",
      actionRequired: false,
      complete: false,
    };
  }

  if (READY_STATES.has(status)) {
    return {
      key: "ready_for_pickup",
      label: "Ready for pickup",
      nextStep: input.invoiceSentAt
        ? "Your invoice is available. Contact the shop if you need to arrange pickup."
        : "The shop will confirm pickup details with you.",
      actionRequired: Boolean(input.invoiceSentAt),
      complete: false,
    };
  }

  if (COMPLETE_STATES.has(status)) {
    return {
      key: "completed",
      label: "Completed",
      nextStep:
        "This service visit is complete and remains available in your history.",
      actionRequired: false,
      complete: true,
    };
  }

  const scheduledTime = input.scheduledAt
    ? new Date(input.scheduledAt).getTime()
    : Number.NaN;
  if (Number.isFinite(scheduledTime) && scheduledTime > Date.now()) {
    return {
      key: "appointment_confirmed",
      label: "Appointment confirmed",
      nextStep:
        "Your appointment is booked. The shop will update this card after the vehicle arrives.",
      actionRequired: false,
      complete: false,
    };
  }

  if (["draft", "new", "planned", "queued", "scheduled"].includes(status)) {
    return {
      key: "appointment_confirmed",
      label: "Appointment confirmed",
      nextStep:
        "The shop has your service request and will keep this card updated.",
      actionRequired: false,
      complete: false,
    };
  }

  return {
    key: "vehicle_received",
    label: "Vehicle received",
    nextStep:
      "Your vehicle is with the shop. The next customer-visible update will appear here.",
    actionRequired: false,
    complete: false,
  };
}
