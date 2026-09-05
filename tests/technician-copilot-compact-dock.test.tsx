import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({
  phase: "speaking" as const,
  active: true,
  wakeLockActive: true,
  wakeLockSupported: true,
  heardTranscript: "What's my next job?",
  error: null as string | null,
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  interrupt: vi.fn(),
}));

vi.mock(
  "@/features/copilot/technician/voice/useTechnicianInteractionGateway",
  () => ({
    useTechnicianInteractionGateway: () => voice,
  }),
);

// TechnicianTextCopilot navigates to a resolved inspection.start clientAction
// via useRouter(), which throws outside an App Router tree unless mocked.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { TechnicianTextCopilot } from "@/features/copilot/technician/components/TechnicianTextCopilot";

describe("compact Technician CoPilot dock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          session: { id: "session-1" },
          capabilities: { documentation: true, voice: true },
          reply: "Your next assigned job is EL000008, the Ford.",
          workOrder: {
            customId: "EL000008",
            vehicleYear: 2018,
            vehicleMake: "Ford",
            vehicleModel: "F-550",
            vehicleUnitNumber: "41",
          },
          context: {
            currentTask: null,
            complaint: null,
            conversation: [],
            observations: [],
            findings: [],
            measurements: [],
            dtcs: [],
            documentation: {
              capturedEventCount: 0,
              lastCapturedAt: null,
              repairNoteDraft: "",
              timeline: [],
            },
          },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows both the heard request and persisted reply without the full page", async () => {
    render(<TechnicianTextCopilot embedded active compact />);

    expect(
      await screen.findByText("Your next assigned job is EL000008, the Ford."),
    ).toBeVisible();
    expect(screen.getByText("What's my next job?")).toBeVisible();
    expect(screen.getByText("CoPilot is replying…")).toBeVisible();
    expect(
      screen.getByText(
        "AI-generated voice · Screen stays awake while voice is active.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Interrupt reply" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Persistent repair collaborator"),
    ).not.toBeInTheDocument();
  });
});
