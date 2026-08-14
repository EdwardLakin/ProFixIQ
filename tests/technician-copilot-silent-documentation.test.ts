import { describe, expect, it } from "vitest";

import { validateTechnicianDocumentationExtraction } from "@/features/copilot/technician/server/documentation";
import {
  createDocumentationFingerprint,
  dedupeDocumentationEvents,
} from "@/features/copilot/technician/session/documentationFingerprint";
import { projectTechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

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
