import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const regressedBoundary = read(
  "supabase/migrations/20260811184927_field_service_access_boundary.sql",
);
const repairedBoundary = read(
  "supabase/migrations/20260825190000_restore_field_visit_execution_assignment.sql",
);
const committedRetryRepair = read(
  "supabase/migrations/20260828222444_repair_dispatch_committed_retry.sql",
);
const runtime = read("tests/mobile/field-visit-execution-boundary.runtime.sql");
const lockingRuntime = read(
  "tests/mobile/field-visit-execution-locking.runtime.sh",
);

describe("Field Service Visit execution boundary", () => {
  it("restores manager-or-assigned execution without weakening Field access", () => {
    expect(regressedBoundary).toContain(
      "visit.mode = 'mobile'\n          and public.mobile_actor_has_field_service_access",
    );
    expect(repairedBoundary).toContain(
      "public.mobile_actor_has_field_service_access",
    );
    expect(repairedBoundary).toContain("public.dispatch_can_manage");
    expect(repairedBoundary).toContain(
      "assigned_profile.id = p_assigned_user_id",
    );
    expect(repairedBoundary).toContain("assigned_profile.shop_id = p_shop_id");
    expect(repairedBoundary).toContain("p_visit_mode <> 'mobile'");
    expect(repairedBoundary).toContain("set search_path = ''");
    expect(repairedBoundary).toContain(
      "private.dispatch_visit_actor_can_execute",
    );
    expect(repairedBoundary).toContain(
      "private.dispatch_lock_service_visit_for_execution",
    );
    expect(repairedBoundary).toContain("for update of visit");
  });

  it("keeps direct callers on the established ACL while denying unassigned actors", () => {
    expect(repairedBoundary).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(repairedBoundary).toContain("to authenticated, service_role");

    for (const rpc of [
      "dispatch_visit_history",
      "dispatch_transition_service_visit_atomic",
      "mobile_replay_service_visit_transition_atomic",
    ]) {
      expect(runtime).toContain(rpc);
    }

    expect(runtime).toContain(
      "Unassigned Field operator read another visit history",
    );
    expect(runtime).toContain("Cross-shop Field operator read visit history");
    expect(runtime).toContain(
      "Assigned Field operator failed the execution predicate",
    );
    expect(runtime).toContain(
      "Field dispatch manager failed the execution predicate",
    );
    expect(runtime).toContain(
      "Assigned Shop technician lost established execution access",
    );
    expect(runtime).toContain(
      "Shop dispatch manager lost established execution access",
    );
    expect(runtime).toContain(
      "Denied Field execution created an idempotency receipt",
    );
  });

  it("serializes transition authorization with concurrent reassignment", () => {
    expect(lockingRuntime).toContain("field-visit-reassign-a");
    expect(lockingRuntime).toContain("field-visit-transition-b");
    expect(lockingRuntime).toContain("'dispatched', null, null, null,");
    expect(lockingRuntime).toContain(
      "Former assignee transitioned a concurrently reassigned visit",
    );
    expect(lockingRuntime).toContain(
      "fa250000-0000-4000-8000-000000000012|scheduled|1",
    );
  });

  it("recovers only exact actor-bound committed retries before mutable authorization", () => {
    expect(committedRetryRepair).toContain("v_actor_profile_id");
    expect(committedRetryRepair).toContain("_request_hash_version");
    expect(committedRetryRepair).toContain("_request_hash");
    expect(committedRetryRepair).toContain("_mobile_request_hash");
    expect(committedRetryRepair).toContain("pg_advisory_xact_lock");
    expect(committedRetryRepair).toContain(
      "SERVICE_VISIT_OPERATION_KEY_CONFLICT",
    );

    const receiptLookup = committedRetryRepair.indexOf(
      "from public.scheduler_operation_keys operation",
    );
    const mutableAuthorization = committedRetryRepair.indexOf(
      "from private.dispatch_lock_service_visit_for_execution",
    );
    expect(receiptLookup).toBeGreaterThan(-1);
    expect(mutableAuthorization).toBeGreaterThan(receiptLookup);

    expect(runtime).toContain(
      "Committed direct retry did not return the original receipt",
    );
    expect(runtime).toContain(
      "Committed mobile retry did not return the original receipt",
    );
    expect(runtime).toContain(
      "Changed direct payload reused a committed operation key",
    );
    expect(runtime).toContain(
      "Changed mobile payload reused a committed operation key",
    );
    expect(runtime).toContain(
      "Revoked Field operator created a fresh direct transition",
    );
    expect(runtime).toContain(
      "Revoked Field operator created a fresh mobile transition",
    );
    expect(runtime).toContain(
      "Cross-shop actor recovered another tenant receipt",
    );
    expect(runtime).toContain(
      "Committed retries duplicated Service Visit transition events",
    );
    expect(runtime).toContain(
      "Committed retries created duplicate transition receipts",
    );
  });
});
