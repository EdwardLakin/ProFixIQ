import { describe, expect, it } from "vitest";

import {
  inspectionFingerprint,
  remoteInspectionShouldReplace,
  shouldForceCanonicalBootstrap,
} from "../features/inspections/lib/inspection/reconciliation";
import { mergeInspectionRuntimeParams } from "../features/inspections/lib/inspection/runtimeParams";
import type { InspectionSession } from "../features/inspections/lib/inspection/types";

function session(args: {
  id: string;
  revision: number;
  updatedAt: string;
  status?: string;
}): InspectionSession {
  return {
    id: args.id,
    syncRevision: args.revision,
    lastUpdated: args.updatedAt,
    sections: [
      {
        title: "General",
        items: [
          {
            item: "Visual walkaround",
            status: args.status ?? "na",
          },
        ],
      },
    ],
    transcript: "",
    quote: [],
  } as unknown as InspectionSession;
}

describe("inspection canonical reconciliation", () => {
  it("uses a newer canonical phone revision over a fresh desktop template", () => {
    const remote = session({
      id: "canonical",
      revision: 7,
      updatedAt: "2026-07-26T15:00:00.000Z",
      status: "ok",
    });
    const freshDesktop = session({
      id: "temporary-desktop-id",
      revision: 0,
      updatedAt: "2026-07-26T15:01:00.000Z",
    });

    expect(
      shouldForceCanonicalBootstrap({
        remote,
        local: freshDesktop,
        preferCanonicalServer: true,
        hasPendingLocalSave: false,
        hasRecoveredLocalDraft: false,
      }),
    ).toBe(true);
  });

  it("uses a legacy canonical revision zero over a fresh desktop template", () => {
    const legacyCanonical = session({
      id: "legacy-canonical",
      revision: 0,
      updatedAt: "2026-07-20T15:00:00.000Z",
      status: "fail",
    });
    const freshDesktop = session({
      id: "temporary-desktop-id",
      revision: 0,
      updatedAt: "2026-07-26T15:01:00.000Z",
    });

    expect(
      shouldForceCanonicalBootstrap({
        remote: legacyCanonical,
        local: freshDesktop,
        preferCanonicalServer: true,
        hasPendingLocalSave: false,
        hasRecoveredLocalDraft: false,
      }),
    ).toBe(true);
  });

  it("does not erase a real unversioned device recovery draft", () => {
    const remote = session({
      id: "canonical",
      revision: 7,
      updatedAt: "2026-07-26T15:00:00.000Z",
      status: "ok",
    });
    const recovered = session({
      id: "device-copy",
      revision: 0,
      updatedAt: "2026-07-26T15:01:00.000Z",
      status: "fail",
    });

    expect(
      shouldForceCanonicalBootstrap({
        remote,
        local: recovered,
        preferCanonicalServer: true,
        hasPendingLocalSave: false,
        hasRecoveredLocalDraft: true,
      }),
    ).toBe(false);
  });

  it("accepts a later server revision once the local snapshot is clean", () => {
    const local = session({
      id: "canonical",
      revision: 7,
      updatedAt: "2026-07-26T15:00:00.000Z",
      status: "ok",
    });
    const remote = session({
      id: "canonical",
      revision: 8,
      updatedAt: "2026-07-26T15:02:00.000Z",
      status: "fail",
    });

    expect(
      remoteInspectionShouldReplace({
        remote,
        local,
        lastPersistedFingerprint: inspectionFingerprint(local),
      }),
    ).toBe(true);
  });

  it("lets current route identity override stale staged browser context", () => {
    expect(
      mergeInspectionRuntimeParams({
        staged: {
          workOrderId: "old-order",
          workOrderLineId: "old-line",
          templateId: "old-template",
          vehicleType: "truck",
        },
        route: {
          workOrderId: "current-order",
          workOrderLineId: "current-line",
          templateId: "current-template",
        },
      }),
    ).toEqual({
      workOrderId: "current-order",
      workOrderLineId: "current-line",
      templateId: "current-template",
      vehicleType: "truck",
    });
  });
});
