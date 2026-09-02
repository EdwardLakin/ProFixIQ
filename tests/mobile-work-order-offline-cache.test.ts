import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOfflineSnapshot: vi.fn(),
  listOfflineSnapshots: vi.fn(),
  removeOfflineSnapshots: vi.fn(async () => undefined),
  saveOfflineSnapshot: vi.fn(async () => undefined),
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: mocks.getOfflineSnapshot,
  listOfflineSnapshots: mocks.listOfflineSnapshots,
  removeOfflineSnapshots: mocks.removeOfflineSnapshots,
  saveOfflineSnapshot: mocks.saveOfflineSnapshot,
}));
vi.mock("@/features/shared/lib/offline/mutations", () => ({
  hydrateOfflineMutationQueue: vi.fn(async () => undefined),
  listPendingMutations: vi.fn(() => []),
}));

import { removeMobileWorkOrderDetailSnapshots } from "@/features/work-orders/mobile/technicianOfflineExecution";
import { reconcileMobileProductScope } from "@/features/work-orders/mobile/mobileProductScopeStorage";

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

  it("purges revoked Field detail aliases after server scope reconciliation", async () => {
    const scope = { userId: "user-1", shopId: "shop-1" };
    mocks.getOfflineSnapshot.mockResolvedValue({
      data: { ...scope, productScope: "field" },
    });
    mocks.listOfflineSnapshots.mockImplementation(
      ({ kind }: { kind: string }) =>
        Promise.resolve(
          kind === "mobile-work-order-detail"
            ? [
                {
                  entityId: "WO-ALLOWED",
                  data: { workOrder: { id: "allowed-id" } },
                },
                {
                  entityId: "WO-REVOKED",
                  data: { workOrder: { id: "revoked-id" } },
                },
                {
                  entityId: "revoked-id",
                  data: { workOrder: { id: "revoked-id" } },
                },
              ]
            : [{ entityId: "active" }],
        ),
    );

    await reconcileMobileProductScope({
      scope,
      productScope: "field",
      authorizedWorkOrderIds: ["allowed-id"],
    });

    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-detail",
      entityIds: ["WO-REVOKED", "revoked-id"],
    });
    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-list",
      entityIds: ["active"],
    });
    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "technician-assigned-work",
      entityIds: ["current"],
    });
  });
});
