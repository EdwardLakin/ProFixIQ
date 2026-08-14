import { describe, expect, it } from "vitest";

import { validateTechnicianDocumentationExtraction } from "@/features/copilot/technician/server/documentation";
import {
  createDocumentationFingerprint,
  dedupeDocumentationEvents,
} from "@/features/copilot/technician/session/documentationFingerprint";
import { projectTechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

function repairEvent(
  eventSeq: number,
  eventType: string,
  payload: Record<string, unknown>,
): RepairSessionEvent {
  return {
    id: `event-${eventSeq}`,
    repairSessionId: "session-1",
    eventSeq,
    eventType,
    source: "copilot",
    payload,
    occurredAt: `2026-08-14T00:${String(eventSeq).padStart(2, "0")}:00Z`,
  };
}

describe("Technician CoPilot silent documentation", () => {
  it("normalizes explicit repair facts and rejects weak or incomplete events", () => {
    const result = validateTechnicianDocumentationExtraction({
      events: [
        {
          type: "task.changed",
          confidence: 0.95,
          details: { task: "  checking the driveline  " },
        },
        {
          type: "observation.recorded",
          confidence: 0.92,
          details: {
            text: " Rear U-joint has play ",
            assessment: "abnormal",
            component: "rear U-joint",
          },
        },
        {
          type: "dtc.observed",
          confidence: 0.9,
          details: { code: " p0299 ", module: "PCM" },
        },
        {
          type: "measurement.recorded",
          confidence: 0.9,
          details: { label: "signal voltage" },
        },
        {
          type: "diagnostic.finding",
          confidence: 0.4,
          details: {
            text: "Turbo is the cause",
            disposition: "confirmed",
          },
        },
      ],
    });

    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      type: "task.changed",
      details: { task: "checking the driveline", confidence: 0.95 },
    });
    expect(result.events[1]).toMatchObject({
      type: "observation.recorded",
      details: {
        text: "Rear U-joint has play",
        assessment: "abnormal",
      },
    });
    expect(result.events[2]).toMatchObject({
      type: "dtc.observed",
      details: { code: "P0299", module: "PCM" },
    });
  });

  it("deduplicates repeated facts across turns using semantic fingerprints", () => {
    const existing: RepairSessionEvent[] = [
      {
        id: "event-1",
        repairSessionId: "session-1",
        eventSeq: 1,
        eventType: "observation.recorded",
        source: "copilot",
        payload: {
          text: "Rear U-joint has play",
          assessment: "abnormal",
          component: "rear U-joint",
        },
        occurredAt: "2026-08-14T00:00:00Z",
      },
    ];

    const result = dedupeDocumentationEvents(existing, [
      {
        type: "observation.recorded",
        details: {
          text: " rear   u-joint has play ",
          assessment: "abnormal",
          component: "Rear U-Joint",
        },
      },
      {
        type: "diagnostic.finding",
        details: {
          text: "Rear U-joint is the vibration source",
          disposition: "confirmed",
          component: "rear U-joint",
        },
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("diagnostic.finding");
    expect(result[0]?.details.documentationFingerprint).toBe(
      createDocumentationFingerprint(
        "diagnostic.finding",
        result[0]?.details ?? {},
      ),
    );
  });

  it("allows tasks and physical states to repeat after an intervening transition", () => {
    const existing = [
      repairEvent(1, "task.changed", { task: "driveline inspection" }),
      repairEvent(2, "task.changed", { task: "front brake inspection" }),
      repairEvent(3, "component.removed", {
        component: "wheel",
        location: "left front",
      }),
      repairEvent(4, "component.installed", {
        component: "wheel",
        location: "left front",
      }),
      repairEvent(5, "fluid.drained", {
        fluid: "coolant",
        system: "engine cooling",
      }),
      repairEvent(6, "fluid.filled", {
        fluid: "coolant",
        system: "engine cooling",
      }),
    ];

    const result = dedupeDocumentationEvents(existing, [
      {
        type: "task.changed",
        details: {
          task: "driveline inspection",
          sourceTurnId: "turn-next",
        },
      },
      {
        type: "component.removed",
        details: {
          component: "wheel",
          location: "left front",
          sourceTurnId: "turn-next",
        },
      },
      {
        type: "fluid.drained",
        details: {
          fluid: "coolant",
          system: "engine cooling",
          sourceTurnId: "turn-next",
        },
      },
    ]);

    expect(result.map((event) => event.type)).toEqual([
      "task.changed",
      "component.removed",
      "fluid.drained",
    ]);
  });

  it("preserves repeated state transitions inside one compound technician turn", () => {
    const result = dedupeDocumentationEvents([], [
      {
        type: "task.changed",
        details: { task: "driveline inspection", sourceTurnId: "compound" },
      },
      {
        type: "task.changed",
        details: { task: "front brake inspection", sourceTurnId: "compound" },
      },
      {
        type: "task.changed",
        details: { task: "driveline inspection", sourceTurnId: "compound" },
      },
      {
        type: "component.removed",
        details: {
          component: "wheel",
          location: "left front",
          sourceTurnId: "compound",
        },
      },
      {
        type: "component.installed",
        details: {
          component: "wheel",
          location: "left front",
          sourceTurnId: "compound",
        },
      },
      {
        type: "component.removed",
        details: {
          component: "wheel",
          location: "left front",
          sourceTurnId: "compound",
        },
      },
    ]);

    expect(result.map((event) => event.type)).toEqual([
      "task.changed",
      "task.changed",
      "task.changed",
      "component.removed",
      "component.installed",
      "component.removed",
    ]);
  });

  it("keeps repeated measurements and DTC observations from new turns while suppressing a partial-turn replay", () => {
    const existing = [
      repairEvent(1, "measurement.recorded", {
        label: "signal voltage",
        value: "4.8",
        unit: "V",
        sourceTurnId: "turn-1",
      }),
      repairEvent(2, "dtc.observed", {
        code: "P0299",
        module: "PCM",
        status: "current",
        sourceTurnId: "turn-1",
      }),
    ];

    const newTurn = dedupeDocumentationEvents(existing, [
      {
        type: "measurement.recorded",
        details: {
          label: "signal voltage",
          value: "4.8",
          unit: "V",
          sourceTurnId: "turn-2",
        },
      },
      {
        type: "dtc.observed",
        details: {
          code: "P0299",
          module: "PCM",
          status: "current",
          sourceTurnId: "turn-2",
        },
      },
    ]);
    expect(newTurn.map((event) => event.type)).toEqual([
      "measurement.recorded",
      "dtc.observed",
    ]);

    const replay = dedupeDocumentationEvents(existing, [
      {
        type: "measurement.recorded",
        details: {
          label: "signal voltage",
          value: "4.8",
          unit: "V",
          sourceTurnId: "turn-1",
        },
      },
      {
        type: "dtc.observed",
        details: {
          code: "P0299",
          module: "PCM",
          status: "current",
          sourceTurnId: "turn-1",
        },
      },
    ]);
    expect(replay).toEqual([]);
  });

  it("projects a draft repair note and intelligent timeline without canonical writes", () => {
    const events: RepairSessionEvent[] = [
      {
        id: "1",
        repairSessionId: "s",
        eventSeq: 1,
        eventType: "session.started",
        source: "system",
        payload: {},
        occurredAt: "2026-08-14T00:00:00Z",
      },
      {
        id: "2",
        repairSessionId: "s",
        eventSeq: 2,
        eventType: "complaint.recorded",
        source: "system",
        payload: { text: "Vibration at highway speed" },
        occurredAt: "2026-08-14T00:01:00Z",
      },
      {
        id: "3",
        repairSessionId: "s",
        eventSeq: 3,
        eventType: "task.changed",
        source: "copilot",
        payload: { task: "driveline inspection" },
        occurredAt: "2026-08-14T00:02:00Z",
      },
      {
        id: "4",
        repairSessionId: "s",
        eventSeq: 4,
        eventType: "observation.recorded",
        source: "copilot",
        payload: {
          text: "Rear U-joint has play",
          assessment: "abnormal",
          component: "rear U-joint",
          confidence: 0.94,
        },
        occurredAt: "2026-08-14T00:03:00Z",
      },
      {
        id: "5",
        repairSessionId: "s",
        eventSeq: 5,
        eventType: "diagnostic.finding",
        source: "copilot",
        payload: {
          text: "Carrier bearing is acceptable",
          disposition: "normal",
          component: "carrier bearing",
          confidence: 0.9,
        },
        occurredAt: "2026-08-14T00:04:00Z",
      },
      {
        id: "6",
        repairSessionId: "s",
        eventSeq: 6,
        eventType: "component.removed",
        source: "copilot",
        payload: { component: "driveshaft" },
        occurredAt: "2026-08-14T00:05:00Z",
      },
    ];

    const context = projectTechnicianContext({
      repairSessionId: "s",
      mode: "shop",
      status: "active",
      events,
    });

    expect(context.findings[0]?.disposition).toBe("normal");
    expect(context.documentation.timeline.map((entry) => entry.label)).toContain(
      "Rear U-joint has play",
    );
    expect(context.documentation.repairNoteDraft).toContain(
      "Complaint: Vibration at highway speed",
    );
    expect(context.documentation.repairNoteDraft).toContain(
      "Observations: Rear U-joint has play",
    );
    expect(context.documentation.repairNoteDraft).toContain(
      "Physical state: driveshaft removed",
    );
  });
});
