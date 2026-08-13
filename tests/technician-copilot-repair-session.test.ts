import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyRepairEvent,
  createEmptyRepairContext,
  reduceRepairEvents,
} from "@/features/copilot/technician/session/reduceRepairContext";
import type { RepairSessionEvent } from "@/features/copilot/technician/session/types";

const migration = readFileSync(
  "supabase/migrations/20260813212500_technician_copilot_repair_sessions.sql",
  "utf8",
);

function event(
  eventSeq: number,
  eventType: string,
  payload: Record<string, unknown> = {},
): RepairSessionEvent {
  return {
    id: `event-${eventSeq}`,
    repairSessionId: "session-1",
    eventSeq,
    eventType,
    source: "voice",
    payload,
    occurredAt: `2026-08-13T21:${String(eventSeq).padStart(2, "0")}:00.000Z`,
  };
}

describe("Technician CoPilot repair-session foundation", () => {
  it("ships a dark additive schema without replacing canonical work-order truth", () => {
    expect(migration).toContain("create table if not exists public.repair_sessions");
    expect(migration).toContain("create table if not exists public.repair_session_events");
    expect(migration).toContain("create table if not exists public.repair_context_snapshots");
    expect(migration).toContain("references public.work_orders(id)");
    expect(migration).toContain("references public.work_order_lines(id)");
    expect(migration).toContain("references public.service_visits(id)");
    expect(migration).not.toContain("alter table public.work_orders add column");
    expect(migration).not.toContain("alter table public.work_order_lines add column");
  });

  it("keeps technician sessions tenant-scoped, role-scoped, and non-destructive", () => {
    expect(migration).toContain("public.profixiq_workforce_profile_id()");
    expect(migration).toContain("public.profixiq_current_role()");
    expect(migration).toContain("('mechanic', 'lead_hand', 'foreman')");
    expect(migration).toContain("Repair session work order must belong to the same shop");
    expect(migration).toContain("Repair session line must belong to the same work order and shop");
    expect(migration).toContain("Repair session vehicle must match the work order vehicle");
    expect(migration).toContain("Repair session service visit must match the shop and work order");
    expect(migration).toContain("alter table public.repair_sessions enable row level security");
    expect(migration).not.toContain("grant delete on table public.repair_sessions");
    expect(migration).not.toContain("grant select, insert, update, delete on table public.repair_sessions");
  });

  it("serializes active repair context and makes event replay exactly-once", () => {
    expect(migration).toContain("repair_sessions_one_active_per_technician_idx");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("repair_session_events_idempotency_unique");
    expect(migration).toContain("for update;");
    expect(migration).toContain("repair_session_append_event");
    expect(migration).toContain("last_event_seq = v_event.event_seq");
    expect(migration).toContain("context_version = rs.context_version + 1");
    expect(migration).toContain("REPAIR_SESSION_EVENT_CANONICAL_WRITER_REQUIRED");
    expect(migration).toContain("REPAIR_SESSION_IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("'reason', 'session_switch'");
    expect(migration).toContain("format('auto-pause:%s:%s'");
    expect(migration).toContain("REPAIR_SESSION_INTERNAL_EVENT_SOURCE_REQUIRED");
    expect(migration).toContain("or v_event_type like 'session.%'");
    expect(migration).toContain("or v_event_type like 'action.%'");
  });

  it("requires canonical lifecycle writers instead of allowing raw session mutation", () => {
    expect(migration).toContain("REPAIR_SESSION_CANONICAL_WRITER_REQUIRED");
    expect(migration).toContain("repair_session_start_or_resume");
    expect(migration).toContain("repair_session_transition");
    expect(migration).toContain("repair_session_write_snapshot");
    expect(migration).toContain("set_config('app.repair_session_writer', '1', true)");
    expect(migration).toContain("set_config('app.repair_event_writer', '1', true)");
    expect(migration).toContain("set_config('app.repair_snapshot_writer', '1', true)");
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("grant select on table public.repair_context_snapshots");
    expect(migration).not.toContain("grant select, insert on table public.repair_context_snapshots\n  to authenticated");
  });

  it("hydrates lifecycle context from session start/resume events", () => {
    const state = reduceRepairEvents(
      createEmptyRepairContext({ repairSessionId: "session-1", mode: "shop" }),
      [
        event(1, "session.started", { mode: "field", currentTask: "Road test" }),
        event(2, "session.paused", { status: "paused" }),
        event(3, "session.resumed", { mode: "field", currentTask: "Inspect driveline" }),
      ],
    );

    expect(state.status).toBe("active");
    expect(state.mode).toBe("field");
    expect(state.currentTask).toBe("Inspect driveline");
  });

  it("builds deterministic repair memory from ordered evidence events", () => {
    const state = reduceRepairEvents(
      createEmptyRepairContext({ repairSessionId: "session-1", mode: "shop" }),
      [
        event(1, "session.started", { mode: "shop", currentTask: "Initial road test" }),
        event(2, "complaint.recorded", { complaint: "Vibration at highway speed" }),
        event(3, "task.changed", { task: "Inspect driveline" }),
        event(4, "observation.recorded", {
          text: "Rear U-joint has play",
          component: "U-joint",
          location: "rear",
        }),
        event(5, "measurement.recorded", {
          label: "Signal voltage",
          value: "4.8",
          unit: "V",
          component: "speed sensor",
        }),
        event(6, "dtc.observed", { code: "p0720", module: "TCM" }),
        event(7, "component.removed", {
          component: "brake caliper",
          location: "left front",
        }),
        event(8, "action.pending", {
          key: "request-u-joint",
          action: "Request rear U-joint",
        }),
      ],
    );

    expect(state.status).toBe("active");
    expect(state.currentTask).toBe("Inspect driveline");
    expect(state.complaint).toBe("Vibration at highway speed");
    expect(state.observations[0]?.text).toBe("Rear U-joint has play");
    expect(state.measurements[0]).toMatchObject({ value: "4.8", unit: "V" });
    expect(state.dtcs[0]?.code).toBe("P0720");
    expect(state.components["left front:brake caliper"]?.state).toBe("removed");
    expect(state.pendingActions["request-u-joint"]?.action).toBe("Request rear U-joint");
    expect(state.lastEventSeq).toBe(8);
    expect(state.contextVersion).toBe(8);
  });

  it("remembers teardown/reassembly state instead of relying on transcript history", () => {
    let state = createEmptyRepairContext({
      repairSessionId: "session-1",
      mode: "field",
    });

    state = applyRepairEvent(
      state,
      event(1, "component.removed", {
        component: "wheel",
        location: "left front",
      }),
    );
    state = applyRepairEvent(
      state,
      event(2, "component.removed", {
        component: "caliper",
        location: "left front",
      }),
    );
    state = applyRepairEvent(
      state,
      event(3, "component.installed", {
        component: "caliper",
        location: "left front",
      }),
    );

    expect(state.components["left front:wheel"]?.state).toBe("removed");
    expect(state.components["left front:caliper"]?.state).toBe("installed");
  });

  it("ignores replayed events but fails closed on a missing event sequence", () => {
    const initial = createEmptyRepairContext({
      repairSessionId: "session-1",
      mode: "shop",
    });
    const first = applyRepairEvent(initial, event(1, "task.changed", { task: "Road test" }));
    const replay = applyRepairEvent(first, event(1, "task.changed", { task: "Wrong replay" }));

    expect(replay).toBe(first);
    expect(replay.currentTask).toBe("Road test");
    expect(() =>
      applyRepairEvent(first, event(3, "observation.recorded", { text: "Skipped seq 2" })),
    ).toThrow("Repair event sequence gap");
  });
});
