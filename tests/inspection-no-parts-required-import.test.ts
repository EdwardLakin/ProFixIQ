import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { insertPrioritizedJobsFromInspection } from "@/features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

type Finding = {
  item: string;
  status: string;
  notes: string;
  laborHours?: number;
  parts?: Array<{ description: string; qty: number }>;
  noPartsRequired?: boolean;
};

async function importFinding(finding: Finding) {
  const inspectionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  inspectionQuery.select.mockReturnValue(inspectionQuery);
  inspectionQuery.eq.mockReturnValue(inspectionQuery);
  inspectionQuery.maybeSingle.mockResolvedValue({
    data: {
      id: "inspection-1",
      shop_id: "shop-1",
      work_order_line_id: "line-1",
      summary: {
        sections: [{ title: "Brakes", items: [finding] }],
      },
    },
    error: null,
  });

  const rpc = vi.fn().mockResolvedValue({
    data: {
      ids: ["quote-line-1"],
      items: [{ id: "quote-line-1", created: true }],
      createdCount: 1,
      createdPartRequestIds: [],
    },
    error: null,
  });
  const supabase = {
    from: vi.fn(() => inspectionQuery),
    rpc,
  };

  const result = await insertPrioritizedJobsFromInspection({
    supabase: supabase as never,
    inspectionId: "inspection-1",
    workOrderId: "work-order-1",
    userId: "user-1",
    operationKey: "technician-truth-test",
  });
  const [, args] = rpc.mock.calls[0] as [
    string,
    { p_items: Array<Record<string, unknown>> },
  ];

  return { result, item: args.p_items[0] };
}

describe("inspection technician-authored quote import", () => {
  it("does not create a brake part requirement when no parts are required", async () => {
    const { result, item } = await importFinding({
      item: "Brake pedal travel",
      status: "fail",
      notes: "Brake pedal is soft.",
      laborHours: 1,
      parts: [],
      noPartsRequired: true,
    });

    expect(result).toMatchObject({
      ok: true,
      partsRequestsCount: 0,
      createdPartRequestIds: [],
    });
    expect(item).toMatchObject({
      title: "Brake pedal travel",
      laborHours: 1,
      parts: [],
      status: "advisor_pending",
    });
  });

  it("does not infer parts or labor when the technician left them blank", async () => {
    const { item } = await importFinding({
      item: "Brake fluid condition",
      status: "recommend",
      notes: "Fluid is discolored.",
    });

    expect(item).toMatchObject({
      title: "Brake fluid condition",
      laborHours: 0,
      parts: [],
      status: "advisor_pending",
    });
  });

  it("carries only the technician-entered parts and labor", async () => {
    const { item } = await importFinding({
      item: "Front brake pads",
      status: "fail",
      notes: "Pads measure 2 mm.",
      laborHours: 1.5,
      parts: [{ description: "Front brake pad set", qty: 1 }],
    });

    expect(item).toMatchObject({
      laborHours: 1.5,
      parts: [{ description: "Front brake pad set", qty: 1 }],
      status: "pending_parts",
    });
  });
});
