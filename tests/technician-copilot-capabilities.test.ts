import { describe, expect, it } from "vitest";

import { resolveTechnicianCopilotCapabilities } from "@/features/copilot/technician/server/capability";

describe("Technician CoPilot capability resolution", () => {
  it("inherits silent documentation from the enabled text pilot", () => {
    expect(
      resolveTechnicianCopilotCapabilities(
        [{ capability: "technician_copilot_text", enabled: true }],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: true });
  });

  it("supports a shop documentation kill switch without disabling text", () => {
    expect(
      resolveTechnicianCopilotCapabilities(
        [
          { capability: "technician_copilot_text", enabled: true },
          { capability: "technician_copilot_documentation", enabled: false },
        ],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: false });
  });

  it("gives a technician-specific setting precedence over the shop setting", () => {
    expect(
      resolveTechnicianCopilotCapabilities(
        [
          { capability: "technician_copilot_text", enabled: true },
          { capability: "technician_copilot_documentation", enabled: true },
          {
            capability: "technician_copilot_documentation:tech-1",
            enabled: false,
          },
        ],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: false });
  });
});
