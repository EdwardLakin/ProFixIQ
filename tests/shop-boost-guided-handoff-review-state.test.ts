import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapInstantAnalysisToGuidedOnboarding } from "@/features/onboarding-v2/guided/instantAnalysisHandoff";
import type { ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => makeFakeAdmin(state.db),
}));

// Minimal in-memory stand-in for the PostgREST builder, covering only the calls
// the handoff makes: select/eq/order/limit/maybeSingle, insert(...).select().single(),
// awaited insert, and update(...).eq(...) chains.
function makeFakeAdmin(db: FakeDb) {
  return {
    from(table: string) {
      const rows = (db[table] ??= []);
      const filters: Array<[string, unknown]> = [];
      let mode: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let inserted: Row[] = [];

      const matching = () => rows.filter((row) => filters.every(([key, value]) => row[key] === value));
      const execute = () => {
        if (mode === "update") {
          for (const row of matching()) Object.assign(row, patch);
          return { data: null, error: null };
        }
        if (mode === "insert") return { data: inserted, error: null };
        return { data: matching(), error: null };
      };

      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return builder;
        },
        insert: (values: Row | Row[]) => {
          mode = "insert";
          inserted = (Array.isArray(values) ? values : [values]).map((value) => {
            const row = { id: randomUUID(), ...value };
            rows.push(row);
            return row;
          });
          return builder;
        },
        update: (values: Row) => {
          mode = "update";
          patch = values;
          return builder;
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        single: async () => ({
          data: mode === "insert" ? (inserted[0] ?? null) : (matching()[0] ?? null),
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(execute()).then(resolve, reject),
      };
      return builder;
    },
  };
}

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_ID = "33333333-3333-4333-8333-333333333333";
const INTAKE_ID = "44444444-4444-4444-8444-444444444444";

function summary(byDomain: Record<string, { success: number; review: number; failed: number }>) {
  const values = Object.values(byDomain);
  return {
    customersImported: byDomain.customers?.success ?? 0,
    vehiclesImported: byDomain.vehicles?.success ?? 0,
    workOrdersImported: byDomain.history?.success ?? 0,
    invoicesImported: byDomain.invoices?.success ?? 0,
    partsImported: byDomain.parts?.success ?? 0,
    completionState: "PARTIAL_FAILURE",
    rowResults: {
      byDomain,
      reviewCount: values.reduce((total, value) => total + value.review, 0),
      failedCount: values.reduce((total, value) => total + value.failed, 0),
    },
  } as unknown as ShopBoostImportSummary;
}

function step(stepKey: string) {
  return state.db.guided_onboarding_steps.find((row) => row.step_key === stepKey);
}

function sessionRow() {
  return state.db.guided_onboarding_sessions[0];
}

describe("instant analysis handoff keeps steps with pending review in progress", () => {
  beforeEach(() => {
    state.db = {
      guided_onboarding_sessions: [],
      guided_onboarding_steps: [],
      guided_onboarding_events: [],
    };
  });

  const handoff = (importSummary: ShopBoostImportSummary, uploadedDatasets = ["customers", "vehicles", "history"]) =>
    mapInstantAnalysisToGuidedOnboarding({
      shopId: SHOP_ID,
      userId: USER_ID,
      demoId: DEMO_ID,
      intakeId: INTAKE_ID,
      uploadedDatasets: uploadedDatasets as Parameters<
        typeof mapInstantAnalysisToGuidedOnboarding
      >[0]["uploadedDatasets"],
      importSummary,
    });

  it("completes clean datasets and leaves datasets with review or failed rows in progress", async () => {
    const result = await handoff(
      summary({
        customers: { success: 8, review: 2, failed: 0 },
        vehicles: { success: 10, review: 0, failed: 0 },
        history: { success: 5, review: 0, failed: 1 },
      }),
    );

    expect(result.redirectTo).toBe(`/dashboard/onboarding-v2/${result.sessionId}`);

    expect(step("vehicles")).toMatchObject({ status: "completed" });
    expect(step("vehicles")?.completed_at).toBeTruthy();

    expect(step("customers")).toMatchObject({ status: "in_progress", completed_at: null });
    expect(step("customers")?.answer).toMatchObject({ reviewCount: 2, reviewPhasePending: true });
    expect(step("vehicle_history")).toMatchObject({ status: "in_progress", completed_at: null });
    expect(step("vehicle_history")?.answer).toMatchObject({ failedCount: 1, reviewPhasePending: true });

    // Datasets that were not uploaded are untouched.
    expect(step("invoices")).toMatchObject({ status: "not_started" });

    // The session routes the owner back to the first unfinished step.
    expect(sessionRow()).toMatchObject({ status: "active", current_step_key: "customers" });
  });

  it("completes everything uploaded when no rows need review", async () => {
    await handoff(
      summary({
        customers: { success: 8, review: 0, failed: 0 },
        vehicles: { success: 10, review: 0, failed: 0 },
      }),
      ["customers", "vehicles"],
    );

    expect(step("customers")).toMatchObject({ status: "completed" });
    expect(step("vehicles")).toMatchObject({ status: "completed" });
    expect(step("customers")?.answer).toMatchObject({ reviewPhasePending: false });
    expect(sessionRow()).toMatchObject({ status: "active", current_step_key: "vehicle_history" });
  });

  it("does not reopen a step the owner already completed when the handoff is replayed", async () => {
    const importSummary = summary({
      customers: { success: 8, review: 2, failed: 0 },
      vehicles: { success: 10, review: 0, failed: 0 },
    });

    await handoff(importSummary, ["customers", "vehicles"]);
    expect(step("customers")).toMatchObject({ status: "in_progress" });

    // Owner resolves the review items and completes the step.
    Object.assign(step("customers") as Row, { status: "completed", completed_at: "2026-10-06T00:00:00.000Z" });

    // The activate route can reuse a persisted summary and call the handoff again.
    await handoff(importSummary, ["customers", "vehicles"]);

    expect(step("customers")).toMatchObject({ status: "completed" });
    expect(state.db.guided_onboarding_sessions).toHaveLength(1);
    expect(state.db.guided_onboarding_steps.filter((row) => row.step_key === "customers")).toHaveLength(1);
  });

  it("records the mapping event with the pending-review flag", async () => {
    await handoff(
      summary({
        customers: { success: 8, review: 2, failed: 0 },
      }),
      ["customers"],
    );

    expect(state.db.guided_onboarding_events).toHaveLength(1);
    expect(state.db.guided_onboarding_events[0]).toMatchObject({
      event_type: "instant_analysis_mapped",
      payload: { reviewPhasePending: true, uploadedDatasets: ["customers"] },
    });
  });
});
