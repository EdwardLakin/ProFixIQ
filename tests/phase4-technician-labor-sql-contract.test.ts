import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const core = read("supabase/migrations/20260714050000_phase4_atomic_technician_labor.sql");
const coordinated = read("supabase/migrations/20260714050100_phase4_coordinated_labor_and_postcheck.sql");

describe("Phase 4 technician labor SQL contract", () => {
  it("uses tenant-scoped operation-key uniqueness", () => {
    expect(core).toContain("unique (shop_id, operation_name, operation_key)");
    expect(core).toContain("workforce_operation_keys");
  });

  it("locks line, technician, shift, assignments, and labor rows before mutation", () => {
    expect(core).toContain("from public.work_order_lines wol");
    expect(core).toContain("for update");
    expect(core).toContain("from public.work_order_line_technicians wolt");
    expect(core).toContain("from public.work_order_line_labor_segments seg");
    expect(core).toContain("from public.tech_shifts ts");
  });

  it("rejects cross-shop and null-shop open shifts", () => {
    expect(core).toContain("SHIFT_SHOP_MISMATCH");
    expect(core).toContain("ts.shop_id is null or ts.shop_id <> p_shop_id");
    expect(core).toContain("ts.shop_id = p_shop_id");
  });

  it("enforces Phase 2 financial locks for assignment and labor", () => {
    expect(core.match(/work_order_is_financially_locked/g)?.length).toBeGreaterThanOrEqual(2);
    expect(core).toContain("FINANCIALLY_LOCKED");
  });

  it("keeps the multi-tech table canonical and the primary column synchronized", () => {
    expect(core).toContain("insert into public.work_order_line_technicians");
    expect(core).toContain("assigned_tech_id = p_technician_id");
    expect(core).toContain("additive_multi_tech_primary_mirror");
  });

  it("makes line state, labor segments, mirrors, inspection finalization, and audit one transaction", () => {
    expect(core).toContain("create or replace function public.apply_job_punch_transition_atomic");
    expect(core).toContain("insert into public.work_order_line_labor_segments");
    expect(core).toContain("update public.work_order_line_labor_segments");
    expect(core).toContain("punched_in_at = v_earliest");
    expect(core).toContain("update public.inspections");
    expect(core).toContain("insert into public.activity_logs");
  });

  it("serializes concurrent starts and prevents overlapping labor", () => {
    expect(core).toContain("Technician already has active labor on this line");
    expect(core).toContain("Technician already has an active job punch");
    expect(core).toContain("p_allow_concurrent");
  });

  it("pauses all coordinated labor inside one database transaction", () => {
    expect(coordinated).toContain("pause_all_active_technician_labor_atomic");
    expect(coordinated).toContain("perform 1");
    expect(coordinated).toContain("apply_job_punch_transition_atomic");
    expect(coordinated).toContain("source_event_id");
  });

  it("installs a fail-fast compatibility postcheck", () => {
    expect(coordinated).toContain("labor segment column contract");
    expect(coordinated).toContain("Phase 4 technician labor postcheck failed");
    expect(coordinated).toContain("Phase 4 technician labor lifecycle postcheck passed");
  });
});
