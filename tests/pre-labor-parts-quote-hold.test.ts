import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createPreLaborPartsQuoteHoldOperationKey,
  hasActivePartsWaitingSignal,
  isCanonicalPreLaborPartsQuoteHold,
  shouldRetainPendingPreLaborPartsQuoteHold,
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
    expect(
      hasActivePartsWaitingSignal({
        approval_state: "approved",
        status: "waiting_parts",
        hold_reason: "Awaiting parts quote",
      }),
    ).toBe(true);
  });

  it("uses the active parts predicate for AI blocked evidence", () => {
    const evidenceBuilder = readFileSync(
      "features/ai/server/domains/workOrders/buildWorkOrderEvidenceSnapshot.ts",
      "utf8",
    );

    expect(evidenceBuilder).toContain(
      'status === "awaiting_parts" || hasActivePartsWaitingSignal(line)',
    );
    expect(evidenceBuilder).not.toContain(
      'normalize(line.hold_reason).includes("part")',
    );
  });

  it("derives one operation key per durable line-state version", () => {
    const line = {
      id: "line-1",
      updated_at: "2026-08-30T11:00:00.000Z",
    };

    expect(createPreLaborPartsQuoteHoldOperationKey(line)).toBe(
      createPreLaborPartsQuoteHoldOperationKey({ ...line }),
    );
    expect(
      createPreLaborPartsQuoteHoldOperationKey({
        ...line,
        updated_at: "2026-08-30T12:00:00.000Z",
      }),
    ).not.toBe(createPreLaborPartsQuoteHoldOperationKey(line));
    expect(
      createPreLaborPartsQuoteHoldOperationKey({ id: "line-1" }),
    ).toBeNull();
    expect(
      createPreLaborPartsQuoteHoldOperationKey({
        id: "line-1",
        created_at: "2026-08-30T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("releases a queued UI hold when refreshed state advances", () => {
    const line = {
      id: "line-1",
      approval_state: "pending",
      status: "awaiting_approval",
      hold_reason: null,
      updated_at: "2026-08-30T11:00:00.000Z",
    };

    expect(
      shouldRetainPendingPreLaborPartsQuoteHold(
        line,
        "2026-08-30T11:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      shouldRetainPendingPreLaborPartsQuoteHold(
        { ...line, updated_at: "2026-08-30T12:00:00.000Z" },
        "2026-08-30T11:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      shouldRetainPendingPreLaborPartsQuoteHold(
        {
          ...line,
          status: "on_hold",
          hold_reason: "Awaiting parts quote",
        },
        line.updated_at,
      ),
    ).toBe(false);
    expect(
      shouldRetainPendingPreLaborPartsQuoteHold(undefined, line.updated_at),
    ).toBe(false);
  });

  it("reuses the durable line-state key after remount", () => {
    const mobileClient = readFileSync(
      "features/work-orders/mobile/MobileWorkOrderClient.tsx",
      "utf8",
    );

    expect(mobileClient).toContain(
      "createPreLaborPartsQuoteHoldOperationKey(lineState)",
    );
    expect(mobileClient).toContain(
      "partsHoldOperationKeysRef.current.set(",
    );
    expect(mobileClient).toContain(
      "expectedLineUpdatedAt: identity.expectedLineUpdatedAt",
    );
    expect(mobileClient).toContain(
      "existingIdentity?.expectedLineUpdatedAt === expectedLineUpdatedAt",
    );
    expect(mobileClient).toContain(
      "shouldRetainPendingPreLaborPartsQuoteHold(",
    );
    expect(mobileClient).toContain("[approvalPending, fetchAll]");
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
    expect(partsBoundary).toContain(
      "coalesce(v_line.line_type::text, 'job') = 'info'",
    );
    expect(partsBoundary).toContain("Info lines are non-actionable.");
    const canonicalReplay = partsBoundary.indexOf(
      "A refreshed client can legitimately carry a different operation key",
    );
    const lineMutation = partsBoundary.indexOf(
      "update public.work_order_lines\n  set status = 'on_hold'",
    );
    const activityMutation = partsBoundary.indexOf(
      "insert into public.activity_logs",
    );
    expect(canonicalReplay).toBeGreaterThan(-1);
    expect(canonicalReplay).toBeLessThan(lineMutation);
    expect(canonicalReplay).toBeLessThan(activityMutation);
    expect(partsBoundary).toContain(
      "lower(trim(coalesce(v_line.hold_reason, ''))) = 'awaiting parts quote'",
    );
    expect(partsBoundary).toContain("'idempotent', true");
    expect(partsBoundary).toContain(
      "v_line.updated_at is distinct from p_expected_line_updated_at",
    );
    expect(partsBoundary).toContain("PARTS_QUOTE_HOLD_STALE");
    expect(partsBoundary).toContain(
      "Fence that key with a no-op receipt so a lost",
    );
    const replayReceipt = partsBoundary.indexOf(
      "insert into public.workforce_operation_keys(",
      canonicalReplay,
    );
    expect(replayReceipt).toBeGreaterThan(canonicalReplay);
    expect(replayReceipt).toBeLessThan(activityMutation);
    expect(migration).toContain(
      "PARTS_QUOTE_HOLD_PENDING: approval-pending parts work cannot be punched.",
    );
  });
});
