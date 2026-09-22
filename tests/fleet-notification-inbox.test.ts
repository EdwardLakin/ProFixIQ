import { describe, expect, it } from "vitest";

import { coalesceFleetNotificationRows } from "@/features/fleet/server/fleetNotificationInbox";
import type { AssistantNotificationPageRow } from "@/features/agent/server/syncAssistantNotifications";

function row(
  overrides: Partial<AssistantNotificationPageRow>,
): AssistantNotificationPageRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    level: "critical",
    code: "fleet_pretrip_missed",
    title: "Daily pre-trip missed",
    message: "Needs review",
    href: "/fleet?focus=defects",
    entity_type: "fleet_dispatch_assignment",
    entity_id: "10000000-0000-4000-8000-000000000001",
    status: "active",
    metadata: { fleet_id: "20000000-0000-4000-8000-000000000001" },
    last_seen_at: "2026-09-22T16:00:00.000Z",
    ...overrides,
  };
}

describe("Fleet notification inbox projection", () => {
  it("keeps only the newest missed-pretrip alert for each active assignment", () => {
    const assignmentId = "10000000-0000-4000-8000-000000000001";
    const newest = row({
      id: "00000000-0000-4000-8000-000000000010",
      entity_id: assignmentId,
      last_seen_at: "2026-09-22T16:00:00.000Z",
    });
    const older = row({
      id: "00000000-0000-4000-8000-000000000009",
      entity_id: assignmentId,
      last_seen_at: "2026-09-21T16:00:00.000Z",
    });

    expect(
      coalesceFleetNotificationRows({
        rows: [newest, older],
        dismissedIds: new Set(),
        activeAssignmentIds: new Set([assignmentId]),
      }),
    ).toEqual([newest]);
  });

  it("removes dismissed alerts and missed alerts for inactive assignments", () => {
    const activeAssignment = "10000000-0000-4000-8000-000000000001";
    const inactiveAssignment = "10000000-0000-4000-8000-000000000002";
    const dismissed = row({
      id: "00000000-0000-4000-8000-000000000020",
      entity_id: activeAssignment,
    });
    const inactive = row({
      id: "00000000-0000-4000-8000-000000000021",
      entity_id: inactiveAssignment,
    });
    const otherAlert = row({
      id: "00000000-0000-4000-8000-000000000022",
      code: "fleet_pretrip_defect",
      entity_type: "fleet_pretrip_report",
      entity_id: "30000000-0000-4000-8000-000000000001",
    });

    expect(
      coalesceFleetNotificationRows({
        rows: [dismissed, inactive, otherAlert],
        dismissedIds: new Set([dismissed.id]),
        activeAssignmentIds: new Set([activeAssignment]),
      }),
    ).toEqual([otherAlert]);
  });
});
