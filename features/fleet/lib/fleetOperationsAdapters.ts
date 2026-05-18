import type {
  OperationsAsset,
  OperationsAssignment,
  OperationsIssue,
} from "@/features/operations";
import type {
  DispatchAssignment,
  FleetIssue,
  FleetUnit,
} from "../components/FleetControlTower";

export function mapFleetUnitToOperationsAsset(unit: FleetUnit): OperationsAsset {
  return {
    id: unit.id,
    label: unit.label,
    identifier: unit.plate,
    secondaryIdentifier: unit.vin,
    class: unit.class,
    location: unit.location,
    status:
      unit.status === "in_service"
        ? "active"
        : unit.status === "limited"
          ? "limited"
          : "offline",
    nextInspectionDate: unit.nextInspectionDate,
  };
}

export function mapFleetIssueToOperationsIssue(issue: FleetIssue): OperationsIssue {
  return {
    id: issue.id,
    assetId: issue.unitId,
    assetLabel: issue.unitLabel,
    severity: issue.severity,
    summary: issue.summary,
    createdAt: issue.createdAt,
    status: issue.status,
  };
}

export function mapDispatchAssignmentToOperationsAssignment(
  assignment: DispatchAssignment,
): OperationsAssignment {
  return {
    id: assignment.id,
    requesterName: assignment.driverName,
    requesterId: assignment.driverId,
    assetLabel: assignment.unitLabel,
    assetId: assignment.unitId,
    routeLabel: assignment.routeLabel,
    nextInspectionDue: assignment.nextPreTripDue,
    state:
      assignment.state === "pretrip_due"
        ? "inspection_due"
        : assignment.state === "en_route"
          ? "active"
          : "in_progress",
  };
}
