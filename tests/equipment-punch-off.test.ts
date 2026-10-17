import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CloseLineSchema, describePunchOff, PunchOffSchema } from "@/features/equipment/dispatch/lib/punchOff";

const LINE = "00000000-0000-4000-8000-000000000001";
const sql = readFileSync("supabase/migrations/20261017035542_equipment_punch_off_line.sql", "utf8");

describe("punch-off request", () => {
  it("needs only a line id; cause and correction are optional", () => {
    expect(PunchOffSchema.safeParse({ lineId: LINE }).success).toBe(true);
    expect(PunchOffSchema.safeParse({ lineId: "nope" }).success).toBe(false);
  });

  it("refuses a client-supplied technician or shop", () => {
    expect(PunchOffSchema.safeParse({ lineId: LINE, technicianId: LINE }).success).toBe(false);
    expect(PunchOffSchema.safeParse({ lineId: LINE, shopId: LINE }).success).toBe(false);
  });
});

describe("punch-off messaging", () => {
  it("tells the last technician the line is complete", () => {
    expect(describePunchOff({ lineClosed: true, remaining: [] })).toMatch(/line is complete/);
  });
  it("says who is still on the job otherwise", () => {
    const one = { lineClosed: false, remaining: [{ technicianId: "a", state: "running" as const }] };
    expect(describePunchOff(one)).toMatch(/1 other technician is/);
    const two = { lineClosed: false, remaining: [...one.remaining, { technicianId: "b", state: "running" as const }] };
    expect(describePunchOff(two)).toMatch(/2 other technicians are/);
  });
});

describe("office close request", () => {
  it("requires a written reason", () => {
    expect(CloseLineSchema.safeParse({ lineId: LINE }).success).toBe(false);
    expect(CloseLineSchema.safeParse({ lineId: LINE, reason: "  " }).success).toBe(false);
    expect(CloseLineSchema.safeParse({ lineId: LINE, reason: "Forgot to punch off" }).success).toBe(true);
  });
  it("refuses a client-supplied technician", () => {
    expect(CloseLineSchema.safeParse({ lineId: LINE, reason: "abc", technicianId: LINE }).success).toBe(false);
  });
});

describe("office close migration contract", () => {
  it("is service-role only, authorizes office itself and records the reason", () => {
    expect(sql).toMatch(/revoke all on function public\.equipment_close_line_atomic[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.equipment_close_line_atomic[\s\S]*to service_role/);
    expect(sql).toContain("dispatch_can_manage(p_shop_id, p_actor_user_id)");
    expect(sql).toContain("'reason', v_reason");
  });
  it("keeps the product boundary the private core skips", () => {
    expect(sql).toContain("profixiq_shop_has_product_access(p_shop_id, 'shop')");
  });
  it("shares the per-line lock with punch-off", () => {
    expect(sql.match(/equipment_punch_off_line:/g)?.length).toBe(2);
  });
});

describe("punch-off migration contract", () => {
  it("only running technicians block closing", () => {
    expect(sql).toMatch(/s2\.ended_at is null/);
    expect(sql).not.toContain("on_hold");
  });
  it("wraps the canonical punch transition instead of changing it", () => {
    expect(sql).toContain("apply_job_punch_transition_atomic");
    expect(sql).not.toMatch(/create or replace function public\.apply_job_punch_transition_atomic/);
  });
  it("is service-role only", () => {
    expect(sql).toMatch(/revoke all on function public\.equipment_punch_off_line_atomic[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.equipment_punch_off_line_atomic[\s\S]*to service_role/);
  });
  it("serializes per line and is idempotent per operation key", () => {
    expect(sql).toContain("equipment_punch_off_line:");
    expect(sql).toContain("scheduler_operation_keys");
    expect(sql).toContain("EQUIPMENT_PUNCH_OFF_OPERATION_KEY_CONFLICT");
  });
  it("preserves line status when a non-final technician punches off", () => {
    expect(sql).toMatch(/'pause'[\s\S]*'punched_off', p_notes, true/);
  });
});

describe("review-fix migration", () => {
  const fix = readFileSync("supabase/migrations/20261017041800_equipment_punch_off_review_fixes.sql", "utf8");
  it("persists the technician note", () => {
    expect(fix).toContain("equipment_punch_off_note");
  });
  it("keeps the approval fences in the office override", () => {
    expect(fix).toContain("LINE_APPROVAL_PENDING");
    expect(fix).toContain("PARTS_QUOTE_HOLD_PENDING");
  });
  it("stays service-role only", () => {
    expect(fix).toMatch(/revoke all on function public\.equipment_close_line_atomic[\s\S]*from public, anon, authenticated/);
    expect(fix).toMatch(/grant execute on function public\.equipment_punch_off_line_atomic[\s\S]*to service_role/);
  });
});
