export type FleetPretripFieldType = "pass_fail" | "number" | "photo" | "voice";

export type FleetPretripFailureActions = {
  notifyDispatcher: boolean;
  flagForReview: boolean;
  requirePhoto: boolean;
  markVehicleAttention: boolean;
};

export type FleetPretripTemplateItem = {
  id: string;
  item: string;
  label: string;
  type: FleetPretripFieldType;
  required: boolean;
  unit: string | null;
  severity: "safety" | "compliance" | "maintenance" | "recommend";
  failureActions: FleetPretripFailureActions;
};

export type FleetPretripTemplateSection = {
  id: string;
  title: string;
  items: FleetPretripTemplateItem[];
};

export type FleetPretripTemplate = {
  assignmentId: string | null;
  templateId: string | null;
  name: string;
  vehicleType: string;
  version: number;
  sections: FleetPretripTemplateSection[];
};

export type FleetDriverAssignment = {
  id: string;
  fleetId: string;
  vehicleId: string;
  unitLabel: string;
  routeLabel: string | null;
  state: "pretrip_due" | "en_route" | "in_shop";
  nextPretripDue: string | null;
  vehicleType: string;
  template: FleetPretripTemplate;
};

export type FleetDriverClarification = {
  id: string;
  defectId: string;
  prompt: string;
  responseType: "answer" | "photo" | "voice";
  status: "requested" | "responded" | "closed";
  requestedAt: string;
  responseText: string | null;
  respondedAt: string | null;
};

export type FleetDriverIssueStatus =
  | "submitted"
  | "under_review"
  | "scheduled"
  | "in_shop"
  | "completed"
  | "closed";

export type FleetDriverIssue = {
  id: string;
  vehicleId: string;
  unitLabel: string;
  label: string;
  description: string | null;
  severity: "safety" | "compliance" | "maintenance" | "recommend";
  status: FleetDriverIssueStatus;
  reportedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  serviceRequestId: string | null;
  workOrderId: string | null;
  clarification: FleetDriverClarification | null;
};

export type FleetTrailerOption = {
  id: string;
  label: string;
};

export type FleetDriverDashboardPayload = {
  fleetId: string;
  fleetName: string;
  driverName: string;
  assignments: FleetDriverAssignment[];
  issues: FleetDriverIssue[];
  trailers: FleetTrailerOption[];
};

const FLEET_PRETRIP_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FLEET_PRETRIP_FIELD_TYPES = new Set<FleetPretripFieldType>([
  "pass_fail",
  "number",
  "photo",
  "voice",
]);
const FLEET_PRETRIP_SEVERITIES = new Set<FleetPretripTemplateItem["severity"]>([
  "safety",
  "compliance",
  "maintenance",
  "recommend",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeFleetPretripTemplateSections(
  value: unknown,
): FleetPretripTemplateSection[] {
  if (!Array.isArray(value)) return [];

  const seenItemIds = new Set<string>();
  let itemCount = 0;
  const sections: FleetPretripTemplateSection[] = [];

  for (const rawSection of value.slice(0, 30)) {
    const section = objectValue(rawSection);
    const id = typeof section?.id === "string" ? section.id.trim() : "";
    const title =
      typeof section?.title === "string"
        ? section.title.trim().slice(0, 120)
        : "";
    if (!id || !title || !Array.isArray(section?.items)) continue;

    const items: FleetPretripTemplateItem[] = [];
    for (const rawItem of section.items) {
      if (itemCount >= 200) break;
      const item = objectValue(rawItem);
      if (!item) continue;
      const itemId = typeof item?.id === "string" ? item.id.trim() : "";
      const label =
        typeof item?.label === "string"
          ? item.label.trim().slice(0, 240)
          : typeof item?.item === "string"
            ? item.item.trim().slice(0, 240)
            : "";
      const type = item?.type as FleetPretripFieldType;
      if (
        !FLEET_PRETRIP_ITEM_ID.test(itemId) ||
        !label ||
        !FLEET_PRETRIP_FIELD_TYPES.has(type) ||
        seenItemIds.has(itemId)
      ) {
        continue;
      }

      const failureActions = objectValue(item.failureActions);
      const severity = item.severity as FleetPretripTemplateItem["severity"];
      seenItemIds.add(itemId);
      itemCount += 1;
      items.push({
        id: itemId,
        item: label,
        label,
        type,
        required: item.required !== false,
        unit:
          typeof item.unit === "string" && item.unit.trim()
            ? item.unit.trim().slice(0, 24)
            : null,
        severity: FLEET_PRETRIP_SEVERITIES.has(severity)
          ? severity
          : "recommend",
        failureActions: {
          notifyDispatcher: failureActions?.notifyDispatcher !== false,
          flagForReview: failureActions?.flagForReview !== false,
          requirePhoto: failureActions?.requirePhoto === true,
          markVehicleAttention: failureActions?.markVehicleAttention === true,
        },
      });
    }

    if (items.length) sections.push({ id, title, items });
  }

  return sections;
}

export const DEFAULT_FLEET_PRETRIP_TEMPLATE: FleetPretripTemplate = {
  assignmentId: null,
  templateId: null,
  name: "Standard daily pre-trip",
  vehicleType: "All fleet assets",
  version: 1,
  sections: [
    {
      id: "walkaround",
      title: "Walk-around",
      items: [
        ["brakes", "Brakes / air system", "safety"],
        ["tires", "Tires, wheels & rims", "compliance"],
        ["lights", "Lights & signals", "compliance"],
        ["steering", "Steering", "safety"],
        ["suspension", "Suspension", "maintenance"],
        ["fluids", "Leaks (oil, coolant, fuel)", "maintenance"],
        ["body", "Body, mirrors, glass", "recommend"],
        ["safetyEquipment", "Safety equipment", "safety"],
      ].map(([id, label, severity]) => ({
        id,
        item: label,
        label,
        type: "pass_fail" as const,
        required: true,
        unit: null,
        severity: severity as FleetPretripTemplateItem["severity"],
        failureActions: {
          notifyDispatcher: true,
          flagForReview: true,
          requirePhoto: false,
          markVehicleAttention: severity === "safety",
        },
      })),
    },
  ],
};
