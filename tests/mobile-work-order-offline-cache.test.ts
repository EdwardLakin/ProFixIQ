import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOfflineSnapshot: vi.fn(),
  removeOfflineSnapshots: vi.fn(async () => undefined),
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: mocks.getOfflineSnapshot,
  listOfflineSnapshots: vi.fn(),
  removeOfflineSnapshots: mocks.removeOfflineSnapshots,
  saveOfflineSnapshot: vi.fn(),
}));
vi.mock("@/features/shared/lib/offline/mutations", () => ({
  hydrateOfflineMutationQueue: vi.fn(async () => undefined),
  listPendingMutations: vi.fn(() => []),
}));

import { removeMobileWorkOrderDetailSnapshots } from "@/features/work-orders/mobile/technicianOfflineExecution";

describe("mobile work-order rejected snapshot cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes both the route alias and canonical work-order copy", async () => {
    mocks.getOfflineSnapshot.mockResolvedValue({
      data: { workOrder: { id: "work-order-uuid" } },
    });

    await removeMobileWorkOrderDetailSnapshots({
      scope: { userId: "user-1", shopId: "shop-1" },
      entityId: "WO-000014",
    });

    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope: { userId: "user-1", shopId: "shop-1" },
      kind: "mobile-work-order-detail",
      entityIds: ["WO-000014", "work-order-uuid"],
    });
  });

  it("deduplicates a canonical route id", async () => {
    mocks.getOfflineSnapshot.mockResolvedValue({
      data: { workOrder: { id: "work-order-uuid" } },
    });

    await removeMobileWorkOrderDetailSnapshots({
      scope: { userId: "user-1", shopId: "shop-1" },
      entityId: "work-order-uuid",
    });

    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ entityIds: ["work-order-uuid"] }),
    );
  });
});
