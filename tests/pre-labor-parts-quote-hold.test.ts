import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getSessionMatchedOfflineScope: vi.fn(),
  runMutationWithOfflineQueue: vi.fn(),
}));

import { getQueuedPartsQuoteHoldIdentity } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import {
  hasActivePartsWaitingSignal,
  isCanonicalPreLaborPartsQuoteHold,
} from "@/features/work-orders/lib/preLaborPartsQuoteHold";

describe("pre-labor parts quote hold identity", () => {
  it("requires the exact pending hold state", () => {
    expect(
      isCanonicalPreLaborPartsQuoteHold({
        approval_state: "pending",
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
      }),
    ).toBe(true);
    expect(
      isCanonicalPreLaborPartsQuoteHold({
        approval_state: "pending",
        status: "on_hold",
        hold_reason: "Department approval",
      }),
    ).toBe(false);
  });

  it("stops treating the exact hold as active after a direct portal decline", () => {
    const directlyDeclined = {
      approval_state: "declined",
      status: "on_hold",
      hold_reason: "Awaiting parts quote",
    };

    expect(isCanonicalPreLaborPartsQuoteHold(directlyDeclined)).toBe(false);
    expect(hasActivePartsWaitingSignal(directlyDeclined)).toBe(false);
    expect(
      hasActivePartsWaitingSignal({
        approval_state: "approved",
        status: "waiting_parts",
        hold_reason: "Waiting for backordered parts",
      }),
    ).toBe(true);
  });

  it("recovers the original operation key only from the matching durable queue entry", () => {
    const payload = {
      lineId: "line-1",
      action: "pause",
      operationKey: "parts-key-1",
      body: {
        transitionIntent: "parts_quote_hold",
        operationKey: "parts-key-1",
      },
    };

    expect(
      getQueuedPartsQuoteHoldIdentity({
        actionType: "job:punch-transition",
        clientMutationId: "pre_labor_parts_quote_hold:parts-key-1",
        payload,
      }),
    ).toEqual({ lineId: "line-1", operationKey: "parts-key-1" });
    expect(
      getQueuedPartsQuoteHoldIdentity({
        actionType: "job:punch-transition",
        clientMutationId: "job_punch:pause:parts-key-1",
        payload,
      }),
    ).toBeNull();
  });

  it("hydrates the component refs from the scoped pending queue after remount", () => {
    const mobileClient = readFileSync(
      "features/work-orders/mobile/MobileWorkOrderClient.tsx",
      "utf8",
    );

    expect(mobileClient).toContain("hydrateOfflineMutationQueue().then(refresh)");
    expect(mobileClient).toContain("listPendingMutations({");
    expect(mobileClient).toContain("getQueuedPartsQuoteHoldIdentity(mutation)");
    expect(mobileClient).toContain(
      "partsHoldOperationKeysRef.current.set(",
    );
    expect(mobileClient).toContain("partsHoldPendingRef.current.add(");
  });

  it("rejects legacy punch mirrors and labor statuses at both SQL boundaries", () => {
    const migration = readFileSync(
      "supabase/migrations/20260830044000_add_staff_line_decision_boundary.sql",
      "utf8",
    );
    const staffStart = migration.indexOf(
      "create or replace function public.apply_staff_line_decision_atomic",
    );
    const partsStart = migration.indexOf(
      "create or replace function public.apply_pre_labor_parts_quote_hold_atomic",
    );
    const staffBoundary = migration.slice(staffStart, partsStart);
    const partsBoundary = migration.slice(partsStart);

    for (const boundary of [staffBoundary, partsBoundary]) {
      expect(boundary).toContain("v_line.punched_in_at is not null");
      expect(boundary).toContain("v_line.punched_out_at is not null");
      expect(boundary).toMatch(/'active', 'in_progress'/);
    }
  });
});
