import { describe, expect, it } from "vitest";

import {
  TECHNICIAN_DOCUMENTATION_PROMPT_VERSION,
  validateTechnicianDocumentationExtraction,
} from "@/features/copilot/technician/server/documentation";
import { REPAIR_EVENT_TYPES } from "@/features/copilot/technician/session/types";

describe("Technician CoPilot documentation normalization", () => {
  it("accepts explicit numeric measurement values without weakening required fields", () => {
    const result = validateTechnicianDocumentationExtraction({
      events: [
        {
          type: "measurement.recorded",
          confidence: 0.94,
          details: {
            label: "signal voltage",
            value: 4.8,
            unit: "V",
            condition: "key on engine off",
          },
        },
        {
          type: "measurement.recorded",
          confidence: 0.94,
          details: { value: 12.4, unit: "V" },
        },
      ],
    });

    expect(result.events).toEqual([
      {
        type: "measurement.recorded",
        details: {
          label: "signal voltage",
          value: "4.8",
          unit: "V",
          condition: "key on engine off",
          confidence: 0.94,
        },
      },
    ]);
  });

  it("keeps conversation events in the canonical repair-session vocabulary", () => {
    expect(REPAIR_EVENT_TYPES).toContain("conversation.user");
    expect(REPAIR_EVENT_TYPES).toContain("conversation.assistant");
    expect(REPAIR_EVENT_TYPES).toContain("diagnostic.finding");
  });

  it("uses an explicit prompt version for documentation audit provenance", () => {
    expect(TECHNICIAN_DOCUMENTATION_PROMPT_VERSION).toBe(
      "technician_copilot_documentation_v1",
    );
  });
});
