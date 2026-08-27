import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20260825223000_enforce_job_punch_assignment.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("job-punch authorization boundary", () => {
  it("limits the grantable execution capability to assignable technician roles", () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("'work_order.job.execute'");
    expect(migration).toContain("'mechanic', 'allow'");
    expect(migration).toContain("'lead_hand', 'allow'");
    expect(migration).toContain("'foreman', 'allow'");
    expect(migration).not.toContain("'parts', 'allow'");
    expect(migration).not.toContain("'advisor', 'allow'");
    expect(migration).toContain(
      "create or replace function private.enforce_job_execution_capability_target()",
    );
    expect(migration).toContain(
      "Job execution can only be delegated to an assignable technician role.",
    );
    expect(migration).toContain(
      "private.resolve_workspace_profile_capability(\n    v_technician_profile_id",
    );
  });

  it("keeps the mutation core private behind caller, tenant, and assignment checks", () => {
    const migration = read(MIGRATION);
    const wrapper = migration.slice(
      migration.indexOf(
        "create or replace function public.apply_job_punch_transition_atomic(",
      ),
    );

    expect(migration).toContain("rename to apply_job_punch_transition_core");
    expect(migration).toContain(
      "revoke all on function private.apply_job_punch_transition_core(",
    );
    expect(wrapper).toContain("v_actor_profile_id <> v_technician_profile_id");
    expect(wrapper).toContain("line.shop_id = p_shop_id");
    expect(wrapper).toContain("for update");
    expect(wrapper).toContain("v_line.assigned_tech_id in (");
    expect(wrapper).toContain("v_line.assigned_to in (");
    expect(wrapper).toContain("public.work_order_line_technicians");
    expect(wrapper).toContain("v_cleanup_pause_requested");
    expect(wrapper).toContain("and p_preserve_line_status");
    expect(wrapper).toContain("and p_allow_concurrent");
    expect(wrapper).toContain("work_order.assignment.manage");
    expect(wrapper).toContain("v_can_coordinate_cleanup");
    expect(wrapper).toContain("segment.ended_at is null");
    expect(wrapper).toContain("from public.workforce_operation_keys operation");
    expect(wrapper).toContain(
      "v_existing_actor_user_id is distinct from v_core_actor_user_id",
    );
    expect(wrapper).toContain("JOB_PUNCH_OPERATION_CONFLICT");
    expect(wrapper).toContain("private.apply_job_punch_transition_core(");
    expect(
      wrapper.indexOf("from public.workforce_operation_keys operation"),
    ).toBeLessThan(wrapper.indexOf("v_line.assigned_tech_id in ("));
    expect(wrapper.indexOf("work_order.job.execute")).toBeLessThan(
      wrapper.indexOf("private.apply_job_punch_transition_core("),
    );
    expect(migration).toMatch(
      /revoke insert, update, delete\s+on table public\.work_order_line_labor_segments\s+from authenticated/i,
    );
    expect(migration).toContain("labor segments remain browser-writable");
  });

  it("delegates receipt-aware authorization ordering to the atomic transition", () => {
    const helper = read(
      "features/work-orders/server/authorizeJobPunchTransition.ts",
    );
    expect(helper).toContain("requireShopScopedApiAccess()");
    expect(helper).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(helper).toContain("delegate that ordered decision");

    for (const action of ["start", "pause", "resume", "finish"]) {
      const route = read(`app/api/work-orders/lines/[id]/${action}/route.ts`);
      expect(route).toContain("await requireJobPunchActorAccess(id)");
      expect(route).toContain("technicianId: access.profile.id");
      expect(route).toContain("actorUserId: access.authUserId");
      expect(route).not.toContain("createServerSupabaseRoute");
    }
  });

  it("does not depend on financially restricted repair-line RLS before the RPC", () => {
    const transition = read(
      "features/work-orders/server/applyJobPunchTransition.ts",
    );

    expect(transition).toContain("shopId: string");
    expect(transition).toContain("actorUserId: string");
    expect(transition).not.toContain('.from("work_order_lines")');
    expect(transition).toContain("p_shop_id: shopId");
    expect(transition).toContain("p_actor_user_id: actorUserId");
    expect(transition).toContain('error.code === "42501"');
  });

  it("drives every reachable job-punch surface from the effective capability", () => {
    const desktop = read(
      "features/work-orders/components/workorders/FocusedJobModal.tsx",
    );
    const mobile = read("features/work-orders/mobile/MobileFocusedJob.tsx");
    const mobileWorkOrder = read(
      "features/work-orders/mobile/MobileWorkOrderClient.tsx",
    );
    const techQueue = read("features/work-orders/components/TechJobScreen.tsx");
    const standaloneMobile = read("app/mobile/jobs/[lineId]/page.tsx");

    expect(desktop).toContain("canExecuteJob: boolean");
    expect(desktop).toContain("actorAssignedToLine?: boolean");
    expect(desktop).toContain("actorAssignedToLine ?? serverActorAssigned");
    expect(desktop).toContain("canCompleteJob={canExecuteJob}");
    expect(mobile).toContain("canExecuteJob: boolean");
    expect(mobile).toContain("actorAssignedToLine?: boolean");
    expect(mobile).toContain("{canExecuteJob && line && (");
    expect(mobile).toContain("canCompleteJob={canExecuteJob}");
    expect(mobileWorkOrder).toContain(
      "WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs",
    );
    expect(mobileWorkOrder).toContain("canExecuteJob={canExecuteJobs}");
    expect(techQueue).toContain(
      "WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs",
    );
    expect(techQueue).toContain("executableLineIds.has(job.id)");
    expect(standaloneMobile).toContain(
      "WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs",
    );
    expect(standaloneMobile).toContain("canExecuteJob={canExecuteJob}");
  });

  it("executes the adversarial SQL matrix during clean replay", () => {
    const workflow = read(".github/workflows/supabase-clean-replay-audit.yml");
    const runtime = read("tests/security/job-punch-authorization.runtime.sql");

    expect(workflow).toContain(
      "-f tests/security/job-punch-authorization.runtime.sql",
    );
    expect(runtime).toContain("Mechanic executed an unassigned repair line.");
    expect(runtime).toContain("Mechanic executed a cross-Shop repair line.");
    expect(runtime).toContain(
      "Parts inherited job execution without a capability override.",
    );
    expect(runtime).toContain(
      "Parts received a job-execution override despite being non-assignable.",
    );
    expect(runtime).toContain(
      "Revoked authenticated self cleanup did not close only active labor",
    );
    expect(runtime).toContain(
      "Revoked service scheduled-shift cleanup did not close Lead Hand labor",
    );
    expect(runtime).toContain(
      "Assignment manager did not close another technician",
    );
    expect(runtime).toContain(
      "Non-manager used coordinated cleanup for another technician",
    );
    expect(runtime).toContain(
      "Original actor lost a committed receipt after technician reassignment.",
    );
    expect(runtime).toContain(
      "A different actor claimed an existing job-punch receipt.",
    );
    expect(runtime).toContain(
      "Authenticated callers can bypass the job punch RPC with direct labor writes.",
    );
  });
});
