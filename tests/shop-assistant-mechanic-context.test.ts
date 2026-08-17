import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveTrustedAssistantContextMock = vi.hoisted(() => vi.fn());
const loadTechnicianWorkCandidateForWorkOrderMock = vi.hoisted(() => vi.fn());
const listTechnicianWorkCandidatesMock = vi.hoisted(() => vi.fn());
const createAdminSupabaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/agent/assistant/server/trustedContext", () => ({
  AssistantContextValidationError: class AssistantContextValidationError extends Error {},
  resolveTrustedAssistantContext: resolveTrustedAssistantContextMock,
}));

vi.mock("@/features/copilot/technician/server/assignedWork", () => ({
  listTechnicianWorkCandidates: listTechnicianWorkCandidatesMock,
  loadTechnicianWorkCandidateForWorkOrder:
    loadTechnicianWorkCandidateForWorkOrderMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

import { resolveTrustedShopAssistantContext } from "@/features/shop-assistant/server/trustedContext";

const SHOP_ID = "10000000-0000-4000-8000-000000000001";
const AUTH_USER_ID = "20000000-0000-4000-8000-000000000001";
const PROFILE_ID = "30000000-0000-4000-8000-000000000001";
const WORK_ORDER_ID = "40000000-0000-4000-8000-000000000001";

function mechanicActor() {
  return {
    shopId: SHOP_ID,
    userId: AUTH_USER_ID,
    profileId: PROFILE_ID,
    canonicalRole: "mechanic",
    capabilities: {
      canViewFleetOnlyData: false,
      canViewShopWideData: false,
    },
  } as never;
}

describe("shop assistant mechanic context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminSupabaseMock.mockReturnValue({ client: "admin" });
    resolveTrustedAssistantContextMock.mockResolvedValue({
      context: { workOrderId: WORK_ORDER_ID },
    });
  });

  it("checks the requested assigned work order without a capped candidate list", async () => {
    loadTechnicianWorkCandidateForWorkOrderMock.mockResolvedValue({
      id: WORK_ORDER_ID,
      lineIds: ["50000000-0000-4000-8000-000000000001"],
    });

    const result = await resolveTrustedShopAssistantContext({
      actor: mechanicActor(),
      requested: { workOrderId: WORK_ORDER_ID },
      stored: {},
    });

    expect(loadTechnicianWorkCandidateForWorkOrderMock).toHaveBeenCalledWith({
      supabase: { client: "admin" },
      shopId: SHOP_ID,
      technicianIds: [AUTH_USER_ID, PROFILE_ID],
      workOrderId: WORK_ORDER_ID,
    });
    expect(listTechnicianWorkCandidatesMock).not.toHaveBeenCalled();
    expect(result.pageContext.workOrderId).toBe(WORK_ORDER_ID);
  });

  it("still rejects a work order that is not assigned to the mechanic", async () => {
    loadTechnicianWorkCandidateForWorkOrderMock.mockResolvedValue(null);

    await expect(
      resolveTrustedShopAssistantContext({
        actor: mechanicActor(),
        requested: { workOrderId: WORK_ORDER_ID },
        stored: {},
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
