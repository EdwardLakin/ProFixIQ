import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260811160152_mobile_v1_end_to_end_repair_hardening.sql",
);
const access = read("features/mobile/service/server/access.ts");
const shell = read("features/mobile/service/MobileServiceShell.tsx");
const transitionApi = read(
  "app/api/mobile/service-visits/[id]/transition/route.ts",
);

describe("Mobile V1 post-merge end-to-end hardening", () => {
  it("keeps assigned canonical technicians authorized only through their assigned Service Visit", () => {
    expect(access).toContain("actor.canPerformAssignedWork");
    expect(access).toContain("fieldAuthorized");
    expect(access).toContain('.eq("work_order_id", workOrderId)');
    expect(access).toContain('.eq("assigned_user_id", access.profile.id)');
  });

  it("allows only the stamped canonical rapid-intake booking insert", () => {
    expect(migration).toContain("tg_op = 'INSERT'");
    expect(migration).toContain("mobile_can_manage_work_orders(new.shop_id, auth.uid())");
    expect(migration).toContain("new.created_by = public.dispatch_actor_profile_id");
    expect(migration).toContain("'rapid_mobile_intake'");
    expect(migration).toContain("'created_actor_mode'");
    expect(migration).toContain("'staff'");
    expect(migration).toContain("Booking does not belong to the current customer");
  });

  it("re-authorizes Mobile operation keys before cached results can escape", () => {
    expect(migration).toContain("private.mobile_create_service_call_v1_core");
    expect(migration).toContain("private.mobile_materialize_visit_wo_v1_core");
    expect(migration).toContain("private.mobile_create_followup_v1_core");
    expect(migration).toContain("private.mobile_update_followup_v1_core");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE: operation key belongs to another actor");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE: operation key belongs to another Service Visit");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE: operation key belongs to another work order");
  });

  it("auto-assigns solo/no-dispatch field work without coupling ownership to mobile mode", () => {
    expect(migration).toContain("public.mobile_is_field_operator(p_shop_id, v_profile.id)");
    expect(migration).toContain("coalesce(ms.solo_mode, false)");
    expect(migration).toContain("not coalesce(ms.dispatch_enabled, true)");
    expect(migration).toContain("and sv.assigned_user_id is null");
    expect(migration).not.toContain("v_mode = 'mobile'\n      and public.mobile_is_field_operator");
  });

  it("requires the canonical WO before work/completion in UI, online dispatch, and replay", () => {
    expect(shell).toContain("workOrderRequired");
    expect(shell).toContain("Create work order first");
    expect(shell).toContain("Create the work order before starting or completing repair.");
    expect(migration).toContain("v_to in ('working', 'completed')");
    expect(migration).toContain("A linked work order is required before starting or completing repair.");
    expect(migration).toContain("mobile_replay_service_visit_transition_atomic");
    expect(transitionApi).toContain("workOrderRequired");
    expect(transitionApi).toContain("Create the work order before starting or completing repair.");
  });

  it("materializes one assigned executable job line from the intake concern", () => {
    expect(migration).toContain("insert into public.work_order_lines");
    expect(migration).toContain("v_concern");
    expect(migration).toContain("'diagnosis'");
    expect(migration).toContain("'awaiting'");
    expect(migration).toContain("approval_state");
    expect(migration).toContain("'approved'");
    expect(migration).toContain("v_visit.assigned_user_id");
    expect(migration).toContain("insert into public.work_order_line_technicians");
    expect(migration).toContain("initialWorkOrderLineId");
  });
});
