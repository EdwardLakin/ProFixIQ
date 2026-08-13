import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyRepairEvent,
  createEmptyRepairContext,
} from "@/features/copilot/technician/session/reduceRepairContext";
import {
  REPAIR_EVENT_TYPES,
  type RepairSessionEvent,
} from "@/features/copilot/technician/session/types";

const migration = [
  "supabase/migrations/20260813212500_technician_copilot_private_session_storage.sql",
  "supabase/migrations/20260813212510_technician_copilot_private_event_ledger.sql",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

function event(seq: number, eventType: string): RepairSessionEvent {
  return {
    id: `event-${seq}`,
    repairSessionId: "session-1",
    eventSeq: seq,
    eventType,
    source: "voice",
    payload: {},
    occurredAt: `2026-08-13T21:${String(seq).padStart(2, "0")}:00.000Z`,
  };
}

describe("Technician CoPilot repair-session foundation", () => {
  it("stores session memory outside canonical public work-order tables", () => {
    expect(migration).toContain("create schema if not exists copilot");
    expect(migration).toContain("create table if not exists copilot.repair_sessions");
    expect(migration).toContain("create table if not exists copilot.repair_session_events");
    expect(migration).toContain("create table if not exists copilot.repair_session_event_context");
    expect(migration).not.toContain("alter table public.work_orders");
    expect(migration).not.toContain("alter table public.work_order_lines");
  });

  it("anchors the session to canonical ProFixIQ entities", () => {
    expect(migration).toContain("references public.shops(id)");
    expect(migration).toContain("references public.profiles(id)");
    expect(migration).toContain("references public.work_orders(id)");
    expect(migration).toContain("references public.work_order_lines(id)");
    expect(migration).toContain("references public.vehicles(id)");
    expect(migration).toContain("references public.service_visits(id)");
    expect(migration).toContain("repair_sessions_one_active_per_technician_idx");
  });

  it("provides ordered event history and operation receipts", () => {
    expect(migration).toContain("unique (repair_session_id, event_seq)");
    expect(migration).toContain("operation_id uuid not null unique");
    expect(migration).toContain("origin in ('voice', 'ui', 'system', 'offline', 'integration', 'copilot')");
    expect(migration).toContain("octet_length(details::text) <= 262144");
  });

  it("defines the evidence vocabulary without a fixed voice-command vocabulary", () => {
    expect(REPAIR_EVENT_TYPES).toContain("observation.recorded");
    expect(REPAIR_EVENT_TYPES).toContain("measurement.recorded");
    expect(REPAIR_EVENT_TYPES).toContain("dtc.observed");
    expect(REPAIR_EVENT_TYPES).toContain("evidence.attached");
    expect(REPAIR_EVENT_TYPES).toContain("component.removed");
    expect(REPAIR_EVENT_TYPES).toContain("component.installed");
  });

  it("folds lifecycle events in strict sequence", () => {
    let state = createEmptyRepairContext({ repairSessionId: "session-1", mode: "shop" });
    state = applyRepairEvent(state, event(1, "session.started"));
    state = applyRepairEvent(state, event(2, "session.paused"));

    expect(state.status).toBe("paused");
    expect(state.lastEventSeq).toBe(2);
    expect(state.contextVersion).toBe(2);

    const replay = applyRepairEvent(state, event(2, "session.closed"));
    expect(replay).toBe(state);
    expect(() => applyRepairEvent(state, event(4, "session.closed"))).toThrow(
      "Repair event sequence gap",
    );
  });
});
