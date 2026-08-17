import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({
  phase: "idle" as const,
  active: false,
  heardTranscript: "",
  error: null,
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

import { TechnicianTextCopilot } from "@/features/copilot/technician/components/TechnicianTextCopilot";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function contextWithReply(turnId: string) {
  return {
    currentTask: null,
    complaint: null,
    conversation: [
      {
        eventId: "event-user",
        role: "user",
        text: "Complete this job.",
        turnId,
      },
      {
        eventId: "event-assistant",
        role: "assistant",
        text: "The original turn completed safely.",
        turnId,
      },
    ],
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
  };
}

describe("Technician CoPilot turn timeout recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses the timed-out turn id when the technician retries", async () => {
    const chatBodies: Array<{
      message: string;
      sessionId: string | null;
      turnId: string;
      inputMode: string;
    }> = [];
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.endsWith("/api/copilot/technician/session")) {
          return Promise.resolve(
            jsonResponse({
              session: { id: "session-1" },
              capabilities: { documentation: true, voice: false },
              context: null,
              workOrder: null,
            }),
          );
        }

        const body = JSON.parse(String(init?.body)) as (typeof chatBodies)[number];
        chatBodies.push(body);
        if (chatBodies.length === 1) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        }

        return Promise.resolve(
          jsonResponse({
            session: { id: "session-1" },
            capabilities: { documentation: true, voice: false },
            context: contextWithReply(body.turnId),
            workOrder: null,
            reply: "The original turn completed safely.",
            turnId: body.turnId,
            replayed: true,
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TechnicianTextCopilot embedded active />);
    const input = await screen.findByPlaceholderText("Talk to your CoPilot…");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "Complete this job." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_001);
    });

    expect(
      screen.getByText(/same turn will resume safely/i),
    ).toBeInTheDocument();
    expect(chatBodies).toHaveLength(1);

    vi.useRealTimers();
    fireEvent.change(input, { target: { value: "Complete this job." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("The original turn completed safely."),
    ).toBeVisible();
    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[1]).toMatchObject({
      message: chatBodies[0]?.message,
      sessionId: chatBodies[0]?.sessionId,
      turnId: chatBodies[0]?.turnId,
      inputMode: chatBodies[0]?.inputMode,
    });
  });
});
