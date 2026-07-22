import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InspectionSession } from "../features/inspections/lib/inspection/types";

const mocks = vi.hoisted(() => ({
  getOfflineSnapshot: vi.fn(),
  hydrateOfflineMutationQueue: vi.fn(),
  listOfflineMutations: vi.fn(),
  resolveOfflineMutationScope: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/database", () => ({
  getOfflineSnapshot: mocks.getOfflineSnapshot,
  removeOfflineSnapshots: vi.fn(),
  saveOfflineSnapshot: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  hydrateOfflineMutationQueue: mocks.hydrateOfflineMutationQueue,
  listOfflineMutations: mocks.listOfflineMutations,
  resolveOfflineMutationScope: mocks.resolveOfflineMutationScope,
}));

import { getInspectionOfflineDraft } from "../features/inspections/lib/inspection/offlineDrafts";

function session(value: string, lastUpdated: string): InspectionSession {
  return {
    id: "inspection-1",
    workOrderId: "work-order-1",
    workOrderLineId: "line-1",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    isListening: false,
    status: "in_progress",
    started: true,
    completed: false,
    isPaused: false,
    lastUpdated,
    sections: [
      {
        title: "Brakes",
        items: [
          {
            item: "Left front pad",
            status: value ? "fail" : undefined,
            value,
            unit: "mm",
          },
        ],
      },
    ],
  };
}

describe("inspection conflict containment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveOfflineMutationScope.mockResolvedValue({
      userId: "user-1",
      shopId: "shop-1",
    });
    mocks.hydrateOfflineMutationQueue.mockResolvedValue(undefined);
  });

  it("restores the exact rejected mobile payload instead of a later blank screen copy", async () => {
    const rejectedMobile = session("2", "2026-07-22T17:00:00.000Z");
    const laterBlankScreen = session("", "2026-07-22T18:00:00.000Z");

    mocks.getOfflineSnapshot.mockResolvedValue({
      data: {
        draftKey: "inspection-draft:line:line-1",
        session: laterBlankScreen,
        savedAt: "2026-07-22T18:00:00.000Z",
        state: "conflicted",
        operationKey: "operation-1",
      },
    });
    mocks.listOfflineMutations.mockReturnValue([
      {
        clientMutationId: "operation-1",
        status: "conflicted",
        payload: { session: rejectedMobile },
      },
    ]);

    const recovered = await getInspectionOfflineDraft({
      draftKey: "inspection-draft:line:line-1",
      sessionHint: laterBlankScreen,
    });

    expect(recovered?.state).toBe("conflicted");
    expect(recovered?.operationKey).toBe("operation-1");
    expect(recovered?.session).toEqual(rejectedMobile);
    expect(recovered?.session.sections[0].items[0].value).toBe("2");
  });
});
