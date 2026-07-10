import { describe, expect, it } from "vitest";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

type Row = Record<string, any>;

class Query {
  filters: Record<string, any> = {};
  singleMode = false;
  maybe = false;
  order() { return this; }
  limit() { return this; }
  eq(k: string, v: any) { this.filters[k] = v; return this; }
  neq(k: string, v: any) { this.filters[`neq:${k}`] = v; return this; }
  not(k: string, _op: string, v: any) { this.filters[`not:${k}`] = v; return this; }
  is(k: string, v: any) { this.filters[k] = v; return this; }
  in(k: string, v: any[]) { this.filters[k] = v; return this; }
  constructor(private db: FakeSupabase, private table: string, private op: "select" | "update" | "insert", private payload?: any) {}
  select() { return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.maybe = true; return this; }
  then(resolve: any, reject: any) { return Promise.resolve(this.execute()).then(resolve, reject); }
  execute() { return this.db.execute(this.table, this.op, this.payload, this.filters, this.singleMode || this.maybe); }
}

class FakeSupabase {
  lines: Row[] = [];
  shifts: Row[] = [];
  segments: Row[] = [];
  inserts: Record<string, Row[]> = {};
  updates: Array<{ table: string; payload: Row }> = [];
  from(table: string) { return { select: () => new Query(this, table, "select"), update: (p: any) => new Query(this, table, "update", p), insert: (p: any) => new Query(this, table, "insert", p) }; }
  execute(table: string, op: string, payload: any, filters: Record<string, any>, single: boolean) {
    if (op === "insert") { const rows = Array.isArray(payload) ? payload : [payload]; this.inserts[table] = [...(this.inserts[table] ?? []), ...rows]; if (table === "work_order_line_labor_segments") this.segments.push(...rows.map((r, i) => ({ id: `inserted-${i + 1}`, ...r, ended_at: null }))); return { data: null, error: null }; }
    const rows = table === "work_order_lines" ? this.lines : table === "tech_shifts" ? this.shifts : table === "work_order_line_labor_segments" ? this.segments : [];
    const match = (r: Row) => Object.entries(filters).every(([k, v]) => k.startsWith("neq:") ? r[k.slice(4)] !== v : Array.isArray(v) ? v.includes(r[k]) : v === null ? r[k] == null : r[k] === v);
    if (op === "select") { const found = rows.filter(match); return { data: single ? (found[0] ?? null) : found, error: null }; }
    if (op === "update") { this.updates.push({ table, payload }); rows.filter(match).forEach((r) => Object.assign(r, payload)); return { data: single ? (rows.find(match) ?? null) : null, error: null }; }
    return { data: null, error: null };
  }
}

const baseLine = (status: string): Row => ({ id: "line-1", work_order_id: "wo-1", status, approval_state: "approved", punchable: true, assigned_tech_id: "tech-1", shop_id: "shop-1", punched_in_at: null, punched_out_at: null, hold_reason: status === "on_hold" ? "Waiting for parts" : null, cause: "Cause", correction: "Correction", labor_time: 1, line_type: "job" });

describe("applyJobPunchTransition hold lifecycle", () => {
  it("places in-progress work on hold, closes the active segment, and preserves hold reason", async () => {
    const db = new FakeSupabase();
    db.lines = [{ ...baseLine("in_progress"), punched_in_at: "2026-07-10T17:00:00.000Z" }];
    db.segments = [{ id: "seg-1", shop_id: "shop-1", technician_id: "tech-1", work_order_id: "wo-1", work_order_line_id: "line-1", started_at: "2026-07-10T17:00:00.000Z", ended_at: null }];

    const result = await applyJobPunchTransition({ supabase: db as any, lineId: "line-1", action: "pause", technicianId: "tech-1", options: { pause: { holdReason: "Waiting for parts" } } });

    expect(result.ok).toBe(true);
    expect(db.lines[0].status).toBe("on_hold");
    expect(db.lines[0].hold_reason).toBe("Waiting for parts");
    expect(db.segments[0].ended_at).toBeTruthy();
    expect(db.lines[0].punched_out_at).toBeTruthy();
  });

  it("releases an on-hold line to awaiting without starting labor or setting punched_in_at", async () => {
    const db = new FakeSupabase();
    db.lines = [baseLine("on_hold")];

    const result = await applyJobPunchTransition({ supabase: db as any, lineId: "line-1", action: "resume", technicianId: "manager-1", options: { resume: { toAwaiting: true } } });

    expect(result.ok).toBe(true);
    expect(db.lines[0].status).toBe("awaiting");
    expect(db.lines[0].hold_reason).toBeNull();
    expect(db.lines[0].punched_in_at).toBeNull();
    expect(db.inserts.work_order_line_labor_segments ?? []).toHaveLength(0);
  });

  it("explicit start after release creates a segment and moves to in_progress", async () => {
    const db = new FakeSupabase();
    db.lines = [baseLine("awaiting")];
    db.shifts = [{ id: "shift-1", shop_id: "shop-1", user_id: "tech-1", status: "active", start_time: "2026-07-10T16:00:00.000Z", end_time: null }];

    const result = await applyJobPunchTransition({ supabase: db as any, lineId: "line-1", action: "start", technicianId: "tech-1" });

    expect(result.ok).toBe(true);
    expect(db.lines[0].status).toBe("in_progress");
    expect(db.lines[0].punched_in_at).toBeTruthy();
    expect(db.inserts.work_order_line_labor_segments).toHaveLength(1);
    expect(db.inserts.work_order_line_labor_segments[0].technician_id).toBe("tech-1");
  });
});
