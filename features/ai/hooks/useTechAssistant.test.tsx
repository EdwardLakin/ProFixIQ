import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAssistantAnswer,
  hasConversationTranscript,
  useTechAssistant,
} from "./useTechAssistant";

vi.mock("next/navigation", () => ({
  usePathname: () => "/test-assistant",
}));

vi.mock("@supabase/auth-helpers-react", () => ({
  useSession: () => ({ user: { id: "user_1" } }),
}));

describe("useTechAssistant", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sendChat sends the actual question with vehicle context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          answer: {
            intent: "unknown",
            summary: "Check the downstream O2 heater circuit first.",
            bullets: ["Verify fuse power and ground.", "Measure heater resistance."],
            links: [],
            entities: [],
            actions: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useTechAssistant({
        defaultVehicle: { year: "2014", make: "Toyota", model: "Camry" },
        defaultContext: "MIL on after cold start",
      }),
    );

    await act(async () => {
      await result.current.sendChat("P0141 code");
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      question: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.question).toContain("Vehicle: 2014 Toyota Camry");
    expect(body.question).toContain("Shop notes / complaint: MIL on after cold start");
    expect(body.question).toContain("Question: P0141 code");
    expect(body.messages).toEqual([{ role: "user", content: "P0141 code" }]);

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.content).toContain(
        "Check the downstream O2 heater circuit first.",
      );
    });
  });

  it("renders structured answer responses into a useful markdown message", () => {
    const text = formatAssistantAnswer({
      intent: "parts_inventory",
      summary: "Likely heater circuit fault.",
      bullets: ["Check B+ at the sensor heater.", "Load-test ground control."],
      links: [{ label: "Open WO", href: "/work-orders/wo_1" }],
      entities: [{ type: "work_order", id: "wo_1", label: "WO 1001", href: "/work-orders/wo_1" }],
      actions: [],
      partSuggestions: [
        {
          candidateId: "p1",
          sku: "O2-123",
          title: "Downstream oxygen sensor",
          quantitySuggestion: 1,
          unit: "each",
          sourceTypes: ["ai_inference_only"],
          fitmentConfidence: "needs_review",
          historySignal: {
            sameVehicleCount: 0,
            sameYmmCount: 0,
            similarComplaintCount: 0,
            summary: "no_prior_usage_found",
          },
          inventorySignal: { inStockQty: null, lowStock: false, reorderPoint: null },
          receivingSignal: { openRequestQty: 0, pendingReceiveQty: 0, openPoCount: 0 },
          warnings: [],
          linkedEvidence: [],
          reviewRecommendation: "Confirm fitment before ordering.",
          addable: false,
          requestable: true,
          rankScore: 0.5,
        },
      ],
    });

    expect(text).toContain("Likely heater circuit fault.");
    expect(text).toContain("- Check B+ at the sensor heater.");
    expect(text).toContain("### Part suggestions");
    expect(text).toContain("Downstream oxygen sensor");
    expect(text).toContain("### Related records");
    expect(text).toContain("[WO 1001](/work-orders/wo_1)");
    expect(text).toContain("### Links");
  });

  it("export refuses an empty transcript before calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useTechAssistant({
        defaultVehicle: { year: "2014", make: "Toyota", model: "Camry" },
      }),
    );

    await expect(result.current.exportToWorkOrder("line_1")).rejects.toThrow(
      "Ask the assistant a question before exporting.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasConversationTranscript([])).toBe(false);
  });

  it("export uses the transcript endpoint and does not call answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ cause: "Failed heater circuit.", correction: "Replace sensor.", estimatedLaborTime: 0.5 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useTechAssistant({
        defaultVehicle: { year: "2014", make: "Toyota", model: "Camry" },
        defaultContext: "MIL on",
      }),
    );

    act(() => {
      result.current.setMessages([
        { role: "user", content: "P0141 code" },
        { role: "assistant", content: "Test O2 heater power and ground." },
      ]);
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    await result.current.exportToWorkOrder("line_1");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/assistant/export");
    expect(fetchMock.mock.calls[0][0]).not.toBe("/api/assistant/answer");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.context).toBe("MIL on");
  });
});
