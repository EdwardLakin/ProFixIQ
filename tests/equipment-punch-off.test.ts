import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { describePunchOff, PunchOffSchema } from "@/features/equipment/dispatch/lib/punchOff";

const LINE = "00000000-0000-4000-8000-000000000001";
const sql = readFileSync("supabase/migrations/20261017200000_equipment_punch_off_line.sql", "utf8");

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
    const two = { lineClosed: false, remaining: [...one.remaining, { technicianId: "b", state: "on_hold" as const }] };
    expect(describePunchOff(two)).toMatch(/2 other technicians are/);
  });
});

describe("punch-off migration contract", () => {
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
