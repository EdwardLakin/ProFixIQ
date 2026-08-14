import { describe, expect, it } from "vitest";

import { resolveTechnicianCopilotCapabilities } from "@/features/copilot/technician/server/capability";

describe("Technician CoPilot capability resolution", () => {
  it("inherits silent documentation from the enabled text pilot while voice stays closed", () => {
    expect(
      resolveTechnicianCopilotCapabilities(
        [{ capability: "technician_copilot_text", enabled: true }],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: true, voice: false });
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
    ).toEqual({ text: true, documentation: false, voice: false });
  });

  it("gives a technician-specific documentation setting precedence over the shop setting", () => {
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
    ).toEqual({ text: true, documentation: false, voice: false });
  });

  it("requires an explicit voice rollout and supports a technician override", () => {
    expect(
      resolveTechnicianCopilotCapabilities(
        [
          { capability: "technician_copilot_text", enabled: true },
          { capability: "technician_copilot_voice", enabled: true },
          { capability: "technician_copilot_voice:tech-1", enabled: false },
        ],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: true, voice: false });

    expect(
      resolveTechnicianCopilotCapabilities(
        [
          { capability: "technician_copilot_text", enabled: true },
          { capability: "technician_copilot_voice", enabled: false },
          { capability: "technician_copilot_voice:tech-1", enabled: true },
        ],
        "tech-1",
      ),
    ).toEqual({ text: true, documentation: true, voice: true });
  });
});
