import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOfflineSnapshot: vi.fn(),
  listOfflineSnapshots: vi.fn(),
  removeOfflineSnapshots: vi.fn(),
  saveOfflineSnapshot: vi.fn(),
  hydrateOfflineMutationQueue: vi.fn(),
  listPendingMutations: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: mocks.getOfflineSnapshot,
  listOfflineSnapshots: mocks.listOfflineSnapshots,
  removeOfflineSnapshots: mocks.removeOfflineSnapshots,
  saveOfflineSnapshot: mocks.saveOfflineSnapshot,
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  hydrateOfflineMutationQueue: mocks.hydrateOfflineMutationQueue,
  listPendingMutations: mocks.listPendingMutations,
}));

const scope = { userId: "user-1", shopId: "shop-1" };

function stored(
  data: unknown,
  kind = "technician-assigned-work",
  entityId = "current",
) {
  return {
    key: `${scope.userId}:${scope.shopId}:${kind}:${entityId}`,
    kind,
    entityId,
    userId: scope.userId,
    shopId: scope.shopId,
    updatedAt: "2026-08-26T12:00:00.000Z",
    expiresAt: "2026-08-27T12:00:00.000Z",
    data,
  };
}

function bundle(productScope: "shop" | "field") {
  return {
    scope,
    productScope,
    downloadedAt: "2026-08-26T12:00:00.000Z",
    workOrders: [
      {
        workOrder: {
          id: "wo-field",
          custom_id: "WO-FIELD",
          shop_id: scope.shopId,
          vehicle_id: null,
          customer_id: null,
        },
        lines: [],
        quoteLines: [],
        vehicle: null,
        customer: null,
        techNamesById: {},
        lineContext: {
          allocationsByLine: {},
          canonicalPartsByLine: {},
          technicianIdsByLine: {},
          activeTechnicianIdsByLine: {},
          partRequestsByLine: {},
          partRequestsByQuoteLine: {},
        },
        shopLaborRate: null,
        financialAccess: { canViewSellPricing: false },
        assignedLineIds: [],
      },
    ],
  };
}

function authority(productScope: "shop" | "field") {
  return stored(
    { ...scope, productScope },
    "mobile-product-authority",
    "current",
  );
}

function detailSnapshot(productScope: "shop" | "field") {
  const detail = bundle(productScope).workOrders[0];
  return {
    workOrder: detail.workOrder,
    lines: detail.lines,
    quoteLines: detail.quoteLines,
    vehicle: detail.vehicle,
    customer: detail.customer,
    techNamesById: detail.techNamesById,
    lineContext: detail.lineContext,
    shopLaborRate: detail.shopLaborRate,
    financialAccess: detail.financialAccess,
    latestInvoiceReview: null,
    productScope,
  };
}

describe("technician offline product authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOfflineSnapshot.mockResolvedValue(null);
    mocks.listOfflineSnapshots.mockResolvedValue([]);
    mocks.removeOfflineSnapshots.mockResolvedValue(undefined);
    mocks.saveOfflineSnapshot.mockResolvedValue(undefined);
    mocks.hydrateOfflineMutationQueue.mockResolvedValue(undefined);
    mocks.listPendingMutations.mockReturnValue([]);
  });

  it("purges every product-scoped projection before recording a Field authority transition", async () => {
    mocks.getOfflineSnapshot.mockImplementation(async (args) =>
      args.kind === "mobile-product-authority" ? authority("shop") : null,
    );
    mocks.listOfflineSnapshots.mockImplementation(async (args) =>
      args.kind === "mobile-work-order-detail"
        ? [
            stored({}, "mobile-work-order-detail", "wo-shop"),
            stored({}, "mobile-work-order-detail", "WO-SHOP"),
          ]
        : [stored({}, "mobile-work-order-list", "active")],
    );
    const { reconcileMobileProductScope } =
      await import("@/features/work-orders/mobile/mobileProductScopeStorage");

    await reconcileMobileProductScope({ scope, productScope: "field" });

    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-detail",
      entityIds: ["wo-shop", "WO-SHOP"],
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
    expect(mocks.saveOfflineSnapshot).toHaveBeenCalledWith({
      scope,
      kind: "mobile-product-authority",
      entityId: "current",
      data: { ...scope, productScope: "field" },
    });
    const lastRemoval = Math.max(
      ...mocks.removeOfflineSnapshots.mock.invocationCallOrder,
    );
    const firstWrite = Math.min(
      ...mocks.saveOfflineSnapshot.mock.invocationCallOrder,
    );
    expect(lastRemoval).toBeLessThan(firstWrite);
  });

  it("writes detail and bundle snapshots under the current authority", async () => {
    mocks.getOfflineSnapshot.mockImplementation(async (args) =>
      args.kind === "mobile-product-authority" ? authority("field") : null,
    );
    const { cacheTechnicianOfflineBundle } =
      await import("@/features/work-orders/mobile/technicianOfflineDownload");

    await cacheTechnicianOfflineBundle(bundle("field") as never);

    expect(mocks.saveOfflineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mobile-work-order-detail",
        entityId: "wo-field",
        data: expect.objectContaining({
          productScope: "field",
          financialAccess: { canViewSellPricing: false },
        }),
      }),
    );
    expect(mocks.saveOfflineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "technician-assigned-work",
        entityId: "current",
        data: expect.objectContaining({ productScope: "field" }),
      }),
    );
  });

  it("reconciles the authorized online response into offline storage", async () => {
    const fieldBundle = bundle("field");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(fieldBundle)),
    );
    const { refreshAssignedTechnicianWork } =
      await import("@/features/work-orders/mobile/technicianOfflineDownload");

    await expect(
      refreshAssignedTechnicianWork({ scope }),
    ).resolves.toMatchObject({ productScope: "field" });
    expect(mocks.saveOfflineSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "technician-assigned-work",
        entityId: "current",
        data: fieldBundle,
      }),
    );
    vi.unstubAllGlobals();
  });

  it("deletes a legacy bundle that has no product authority", async () => {
    const legacy = bundle("shop") as Record<string, unknown>;
    delete legacy.productScope;
    mocks.getOfflineSnapshot.mockImplementation(async (args) =>
      args.kind === "technician-assigned-work" ? stored(legacy) : null,
    );
    mocks.listOfflineSnapshots.mockImplementation(async (args) =>
      args.kind === "mobile-work-order-detail"
        ? [stored({}, "mobile-work-order-detail", "wo-legacy")]
        : [],
    );
    const { getCachedTechnicianWork } =
      await import("@/features/work-orders/mobile/technicianOfflineDownload");

    await expect(getCachedTechnicianWork({ scope })).resolves.toBeNull();
    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-detail",
      entityIds: ["wo-legacy"],
    });
  });

  it("fails closed for a legacy detail snapshot without productScope", async () => {
    const legacyDetail = detailSnapshot("shop") as Record<string, unknown>;
    delete legacyDetail.productScope;
    mocks.getOfflineSnapshot.mockImplementation(async (args) => {
      if (args.kind === "mobile-product-authority") return authority("shop");
      if (args.kind === "mobile-work-order-detail") {
        return stored(legacyDetail, "mobile-work-order-detail", "wo-field");
      }
      return null;
    });
    const { loadProjectedWorkOrderSnapshot } =
      await import("@/features/work-orders/mobile/technicianOfflineExecution");

    await expect(
      loadProjectedWorkOrderSnapshot({ scope, entityId: "wo-field" }),
    ).resolves.toBeNull();
    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-detail",
      entityIds: ["wo-field"],
    });
  });

  it("rejects a Shop detail after the current authority becomes Field", async () => {
    mocks.getOfflineSnapshot.mockImplementation(async (args) => {
      if (args.kind === "mobile-product-authority") return authority("field");
      if (args.kind === "mobile-work-order-detail") {
        return stored(
          detailSnapshot("shop"),
          "mobile-work-order-detail",
          "wo-field",
        );
      }
      return null;
    });
    const { loadProjectedWorkOrderSnapshot } =
      await import("@/features/work-orders/mobile/technicianOfflineExecution");

    await expect(
      loadProjectedWorkOrderSnapshot({ scope, entityId: "wo-field" }),
    ).resolves.toBeNull();
    expect(mocks.removeOfflineSnapshots).toHaveBeenCalledWith({
      scope,
      kind: "mobile-work-order-detail",
      entityIds: ["wo-field"],
    });
  });

  it("rejects an otherwise valid detail when no authority envelope exists", async () => {
    mocks.getOfflineSnapshot.mockImplementation(async (args) =>
      args.kind === "mobile-work-order-detail"
        ? stored(detailSnapshot("shop"), "mobile-work-order-detail", "wo-field")
        : null,
    );
    const { loadProjectedWorkOrderSnapshot } =
      await import("@/features/work-orders/mobile/technicianOfflineExecution");

    await expect(
      loadProjectedWorkOrderSnapshot({ scope, entityId: "wo-field" }),
    ).resolves.toBeNull();
  });
});
