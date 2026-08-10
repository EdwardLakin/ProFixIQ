import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260810024500_mobile_service_foundation.sql",
);
const availability = read("features/scheduling/server/availability.ts");
const validation = read("features/scheduling/server/validateBookingSlot.ts");
const publicAvailability = read("app/api/portal/availability/route.ts");
const createBooking = read("features/portal/server/createPortalBooking.ts");
const staffBooking = read("app/api/portal/bookings/[id]/route.ts");
const legacyStaffCreate = read("app/api/portal/book/route.ts");
const agentReschedule = read("features/agent/tools/rescheduleBooking.ts");
const shopAssistantScheduling = read(
  "features/shop-assistant/server/tools/domains/scheduling.ts",
);
const portalRequestStart = read("app/api/portal/request/start/route.ts");
const resourceRoute = read("app/api/scheduling/resources/route.ts");
const eventsRoute = read("app/api/scheduling/events/route.ts");

describe("Universal Scheduler cutover", () => {
  it("replaces shop-wide overlap with resource reservations", () => {
    expect(migration).toContain("create table if not exists public.scheduling_resources");
    expect(migration).toContain("create table if not exists public.scheduling_events");
    expect(migration).toContain("create table if not exists public.scheduling_reservations");
    expect(migration).toContain("scheduling_reservations_no_overlap");
    expect(migration).toContain("resource_id with =");
    expect(migration).toContain("tstzrange(starts_at, ends_at, '[)') with &&");
    expect(migration).toContain("alter table public.bookings drop constraint if exists bookings_no_active_overlap");
  });

  it("provides backward-compatible capacity plus named shop and mobile resources", () => {
    expect(migration).toContain("'default-capacity'");
    expect(migration).toContain("resource_type in ('capacity','bay','technician','service_vehicle')");
    expect(migration).toContain("create table if not exists public.service_vehicles");
    expect(migration).toContain("stock_location_id uuid references public.stock_locations");
    expect(migration).toContain("sync_service_vehicle_scheduling_resource");
    expect(migration).toContain("sync_profile_scheduling_resource");
  });

  it("keeps bookings and work orders as compatibility projections of scheduler state", () => {
    expect(migration).toContain("bookings_sync_universal_scheduler");
    expect(migration).toContain("sync_booking_to_scheduler");
    expect(migration).toContain("set scheduled_at = new.starts_at");
    expect(migration).toContain("expected_completion_at = new.ends_at");
    expect(portalRequestStart).toContain('rpc("portal_request_start_atomic"');
  });

  it("routes legacy booking commands through one atomic scheduler command", () => {
    expect(migration).toContain("scheduler_apply_booking_command_atomic");
    expect(migration).toContain("create or replace function public.apply_portal_booking_command_atomic");
    expect(migration).toContain("select public.scheduler_apply_booking_command_atomic");
    expect(createBooking).toContain('rpc(\n    "apply_portal_booking_command_atomic"');
    expect(staffBooking).toContain('rpc("apply_portal_booking_command_atomic"');
    expect(agentReschedule).toContain('rpc(\n    "apply_portal_booking_command_atomic"');
    expect(agentReschedule).not.toContain('.from("bookings")\n    .update');
  });

  it("uses one availability engine for portal validation and slot discovery", () => {
    expect(publicAvailability).toContain("getSchedulingAvailability");
    expect(publicAvailability).not.toContain('.from("bookings")');
    expect(availability).toContain("scheduler_availability_snapshot");
    expect(availability).toContain("availableResourceIds");
    expect(validation).toContain("validateSchedulingSlot");
    expect(createBooking).toContain("validateSchedulingSlot");
  });

  it("preserves old callers while removing old scheduling semantics", () => {
    expect(legacyStaffCreate).toContain("legacyStaffOperationKey");
    expect(staffBooking).toContain('action: "reschedule" | "cancel" | "confirm" | "complete"');
    expect(shopAssistantScheduling).toContain("shop_assistant_reschedule_booking_atomic");
    expect(migration).toContain("create or replace function public.shop_assistant_reschedule_booking_atomic");
    expect(migration).toContain("v_scheduler := public.scheduler_apply_booking_command_atomic");
  });

  it("exposes canonical resource, event, and internal availability APIs", () => {
    expect(resourceRoute).toContain("scheduler_list_resources");
    expect(resourceRoute).toContain("scheduler_upsert_resource");
    expect(eventsRoute).toContain("scheduler_list_events");
    expect(read("app/api/scheduling/availability/route.ts")).toContain(
      "getSchedulingAvailability",
    );
  });

  it("keeps scheduling records shop-scoped and command-owned", () => {
    expect(migration).toContain("alter table public.scheduling_resources enable row level security");
    expect(migration).toContain("alter table public.scheduling_events enable row level security");
    expect(migration).toContain("alter table public.scheduling_reservations enable row level security");
    expect(migration).toContain("grant select on public.scheduling_resources, public.scheduling_events, public.scheduling_reservations to authenticated");
    expect(migration).toContain("scheduler_same_shop");
  });
});
