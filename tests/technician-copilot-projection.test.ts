import { expect, it } from "vitest";
import { projectTechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

it("projects persisted technician context", () => {
  const events: RepairSessionEvent[] = [
    { id: "1", repairSessionId: "s", eventSeq: 1, eventType: "session.started", source: "system", payload: {}, occurredAt: "2026-08-13T00:00:00Z" },
    { id: "2", repairSessionId: "s", eventSeq: 2, eventType: "task.changed", source: "copilot", payload: { task: "driveline" }, occurredAt: "2026-08-13T00:01:00Z" },
    { id: "3", repairSessionId: "s", eventSeq: 3, eventType: "observation.recorded", source: "copilot", payload: { text: "joint has play" }, occurredAt: "2026-08-13T00:02:00Z" },
  ];
  const context = projectTechnicianContext({ repairSessionId: "s", mode: "shop", status: "active", events });
  expect(context.currentTask).toBe("driveline");
  expect(context.observations[0]?.text).toBe("joint has play");
  expect(context.lastEventSeq).toBe(3);
});
