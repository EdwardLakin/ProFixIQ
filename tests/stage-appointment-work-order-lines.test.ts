import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAutomationEvidenceMock = vi.fn();
const isAiAutomaticExecutionEnabledMock = vi.fn();

vi.mock("@/features/ai/server/automationEvidence", () => ({
  recordAutomationEvidence: recordAutomationEvidenceMock,
}));
vi.mock("@/features/ai/server/automationPolicy", () => ({
  isAiAutomaticExecutionEnabled: isAiAutomaticExecutionEnabledMock,
}));

const MODULE_PATH =
  "@/features/operations/server/appointmentWorkOrderStaging/stageAppointmentWorkOrderLines";

const SHOP_ID = "shop-1";
const BOOKING_ID = "booking-1";

type PartsReadinessLine = {
  partName: string;
  partNumber: string | null;
  qtyRequired: number;
  isRequired: boolean;
  matchedPartId: string | null;
  qtyAvailable: number | null;
  status: "ready" | "short" | "unmatched";
};

type MatchedMenuItem = {
  menuRepairItemId: string;
  name: string;
  laborHours: number | null;
  priceEstimate: number | null;
  isActive: boolean;
  sourceRootLineId: string;
  partsReadiness: PartsReadinessLine[];
};

function readyRequiredPart(): PartsReadinessLine {
  return {
    partName: "Brake pad set",
    partNumber: "BP-100",
    qtyRequired: 1,
    isRequired: true,
    matchedPartId: "part-1",
    qtyAvailable: 4,
    status: "ready",
  };
}

function matchedItem(overrides: Partial<MatchedMenuItem> = {}): MatchedMenuItem {
  return {
    menuRepairItemId: "menu-1",
    name: "Front brake pads",
    laborHours: 1.5,
    priceEstimate: 200,
    isActive: true,
    sourceRootLineId: "root-line-1",
    partsReadiness: [readyRequiredPart()],
    ...overrides,
  };
}

describe("resolveAppointmentWorkOrderStagingCandidate", () => {
  it("is ineligible when the booking's preparation is not active", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);
    const result = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "resolved",
      matchedMenuItems: [matchedItem()],
    });
    expect(result.eligible).toBe(false);
  });

  it("stages a matched item whose required parts are all ready", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);
    const result = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [matchedItem()],
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.candidate.eligibleLines).toHaveLength(1);
    expect(result.candidate.eligibleLines[0]).toMatchObject({
      menuRepairItemId: "menu-1",
      name: "Front brake pads",
      laborHours: 1.5,
    });
    expect(result.candidate.eligibleLines[0].parts).toEqual([
      { partName: "Brake pad set", partNumber: "BP-100", qtyRequired: 1, matchedPartId: "part-1" },
    ]);
  });

  it("stages every independently exact-matched, parts-ready item — not just when there is exactly one", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);
    const result = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [
        matchedItem({ menuRepairItemId: "menu-1" }),
        matchedItem({ menuRepairItemId: "menu-2", sourceRootLineId: "root-line-2" }),
      ],
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(
      result.candidate.eligibleLines.map((line: { menuRepairItemId: string }) => line.menuRepairItemId),
    ).toEqual(["menu-1", "menu-2"]);
  });

  it("skips an inactive matched menu item", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);
    const result = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [matchedItem({ isActive: false })],
    });
    expect(result.eligible).toBe(false);
  });

  it("skips an item with no required parts defined — not an exact, actionable mapping", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);
    const result = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [
        matchedItem({
          partsReadiness: [
            {
              partName: "Optional trim clip",
              partNumber: null,
              qtyRequired: 1,
              isRequired: false,
              matchedPartId: "part-2",
              qtyAvailable: 0,
              status: "unmatched",
            },
          ],
        }),
      ],
    });
    expect(result.eligible).toBe(false);
  });

  it("skips an item whose required part is short or unmatched, but an optional part being short doesn't block it", async () => {
    const { resolveAppointmentWorkOrderStagingCandidate } = await import(MODULE_PATH);

    const shortRequired = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [
        matchedItem({
          partsReadiness: [{ ...readyRequiredPart(), status: "short", qtyAvailable: 0 }],
        }),
      ],
    });
    expect(shortRequired.eligible).toBe(false);

    const shortOptionalOnly = resolveAppointmentWorkOrderStagingCandidate({
      bookingId: BOOKING_ID,
      shopId: SHOP_ID,
      preparationStatus: "active",
      matchedMenuItems: [
        matchedItem({
          partsReadiness: [
            readyRequiredPart(),
            {
              partName: "Optional trim clip",
              partNumber: null,
              qtyRequired: 1,
              isRequired: false,
              matchedPartId: null,
              qtyAvailable: null,
              status: "unmatched",
            },
          ],
        }),
      ],
    });
    expect(shortOptionalOnly.eligible).toBe(true);
  });
});

describe("finalizeAppointmentWorkOrderStaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const candidate = {
    bookingId: BOOKING_ID,
    shopId: SHOP_ID,
    eligibleLines: [
      {
        menuRepairItemId: "menu-1",
        name: "Front brake pads",
        laborHours: 1.5,
        parts: [
          { partName: "Brake pad set", partNumber: "BP-100", qtyRequired: 1, matchedPartId: "part-1" },
        ],
      },
    ],
  };

  it("reuses the work_order_line_creation capability slot rather than inventing a new one", async () => {
    const { AUTOMATION_CAPABILITY } = await import(MODULE_PATH);
    expect(AUTOMATION_CAPABILITY).toBe("work_order_line_creation");
  });

  it("always records shadow evidence, even when the shop is not enabled for execution", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(false);
    recordAutomationEvidenceMock.mockResolvedValue(undefined);
    const admin = { from: vi.fn() };
    const { finalizeAppointmentWorkOrderStaging, AUTOMATION_CAPABILITY } =
      await import(MODULE_PATH);

    const result = await finalizeAppointmentWorkOrderStaging({
      admin: admin as never,
      candidate,
    });

    expect(recordAutomationEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        capability: AUTOMATION_CAPABILITY,
        evidenceKey: `booking:${BOOKING_ID}`,
        outcome: "observed",
        source: "stage_appointment_work_order_lines",
      }),
    );
    expect(result.executed).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("upserts the staged proposal only when the shop is enabled for execution", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    recordAutomationEvidenceMock.mockResolvedValue(undefined);
    const upsertMock = vi.fn(() => Promise.resolve({ error: null }));
    const admin = {
      from: vi.fn((table: string) => {
        expect(table).toBe("appointment_work_order_staging");
        return { upsert: upsertMock };
      }),
    };
    const { finalizeAppointmentWorkOrderStaging } = await import(MODULE_PATH);

    const result = await finalizeAppointmentWorkOrderStaging({
      admin: admin as never,
      candidate,
    });

    expect(result.executed).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shop_id: SHOP_ID,
        booking_id: BOOKING_ID,
        staged_lines: candidate.eligibleLines,
      }),
      { onConflict: "booking_id" },
    );
  });

  it("throws on an upsert failure rather than silently swallowing it", async () => {
    isAiAutomaticExecutionEnabledMock.mockResolvedValue(true);
    recordAutomationEvidenceMock.mockResolvedValue(undefined);
    const admin = {
      from: vi.fn(() => ({
        upsert: vi.fn(() => Promise.resolve({ error: { message: "boom" } })),
      })),
    };
    const { finalizeAppointmentWorkOrderStaging } = await import(MODULE_PATH);

    await expect(
      finalizeAppointmentWorkOrderStaging({ admin: admin as never, candidate }),
    ).rejects.toThrow("boom");
  });
});

describe("clearAppointmentWorkOrderStaging", () => {
  it("does nothing when there are no stale booking ids", async () => {
    const admin = { from: vi.fn() };
    const { clearAppointmentWorkOrderStaging } = await import(MODULE_PATH);

    await clearAppointmentWorkOrderStaging({
      admin: admin as never,
      shopId: SHOP_ID,
      bookingIds: [],
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("deletes only the given shop's stale staged rows", async () => {
    const inMock = vi.fn(() => Promise.resolve({ error: null }));
    const eqMock = vi.fn(() => ({ in: inMock }));
    const deleteMock = vi.fn(() => ({ eq: eqMock }));
    const admin = {
      from: vi.fn((table: string) => {
        expect(table).toBe("appointment_work_order_staging");
        return { delete: deleteMock };
      }),
    };
    const { clearAppointmentWorkOrderStaging } = await import(MODULE_PATH);

    await clearAppointmentWorkOrderStaging({
      admin: admin as never,
      shopId: SHOP_ID,
      bookingIds: ["stale-1", "stale-2"],
    });

    expect(eqMock).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(inMock).toHaveBeenCalledWith("booking_id", ["stale-1", "stale-2"]);
  });
});
