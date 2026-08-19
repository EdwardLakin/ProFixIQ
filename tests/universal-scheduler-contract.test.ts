import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const foundation = read(
  "supabase/migrations/20260810024500_mobile_service_foundation.sql",
);
const cutover = read(
  "supabase/migrations/20260810031500_universal_scheduler_cutover.sql",
);
const hardening = read(
  "supabase/migrations/20260810032000_universal_scheduler_hardening.sql",
);
const newShopCapacity = read(
  "supabase/migrations/20260810032500_scheduler_new_shop_capacity.sql",
);
const security = read(
  "supabase/migrations/20260810033000_universal_scheduler_security_and_rebalance.sql",
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
const assignResourceRoute = read(
  "app/api/scheduling/events/[id]/resource/route.ts",
);

describe("Universal Scheduler cutover", () => {
  it("keeps the mobile visit domain separate from the scheduler replacement", () => {
    expect(foundation).toContain("create table if not exists public.service_addresses");
    expect(foundation).toContain("create table if not exists public.service_visits");
    expect(foundation).not.toContain("scheduling_reservations_no_overlap");
    expect(cutover).toContain("UNIVERSAL SCHEDULER CUTOVER");
    expect(cutover).toContain("alter column work_order_id drop not null");
    expect(cutover).toContain("add column if not exists booking_id");
  });

  it("replaces shop-wide overlap with resource reservations", () => {
    expect(cutover).toContain("create table if not exists public.scheduling_resources");
    expect(cutover).toContain("create table if not exists public.scheduling_events");
    expect(cutover).toContain("create table if not exists public.scheduling_reservations");
    expect(cutover).toContain("scheduling_reservations_no_overlap");
    expect(cutover).toContain("resource_id with =");
    expect(cutover).toContain("tstzrange(starts_at, ends_at, '[)') with &&");
    expect(cutover).toContain(
      "alter table public.bookings drop constraint if exists bookings_no_active_overlap",
    );
  });

  it("provides backward-compatible capacity plus named shop and mobile resources", () => {
    expect(cutover).toContain("'default-capacity'");
    expect(cutover).toContain(
      "resource_type in ('capacity','bay','technician','service_vehicle')",
    );
    expect(cutover).toContain("create table if not exists public.service_vehicles");
    expect(cutover).toContain("stock_location_id uuid references public.stock_locations");
    expect(cutover).toContain("sync_service_vehicle_scheduling_resource");
    expect(cutover).toContain("sync_profile_scheduling_resource");
    expect(newShopCapacity).toContain("shops_sync_default_scheduling_resource");
    expect(security).toContain("scheduler_rebalance_fallback_reservations");
  });

  it("keeps bookings and work orders as compatibility projections of scheduler state", () => {
    expect(cutover).toContain("bookings_sync_universal_scheduler");
    expect(cutover).toContain("sync_booking_to_scheduler");
    expect(cutover).toContain("set scheduled_at = new.starts_at");
    expect(cutover).toContain("expected_completion_at = new.ends_at");
    expect(portalRequestStart).toContain('rpc("portal_request_start_atomic"');
  });

  it("routes legacy booking commands through one atomic scheduler command", () => {
    expect(cutover).toContain("scheduler_apply_booking_command_atomic");
    expect(cutover).toContain(
      "create or replace function public.apply_portal_booking_command_atomic",
    );
    expect(cutover).toContain(
      "select public.scheduler_apply_booking_command_atomic",
    );
    expect(createBooking).toContain(
      'rpc(\n    "apply_portal_booking_command_atomic"',
    );
    expect(staffBooking).toContain(
      'rpc("apply_portal_booking_command_atomic"',
    );
    expect(agentReschedule).toContain(
      'rpc(\n    "apply_portal_booking_command_atomic"',
    );
    expect(agentReschedule).not.toContain('.from("bookings")\n    .update');
    expect(legacyStaffCreate).toContain(
      "allowRoles: ROLE_GROUPS.schedulerBookingWriters",
    );
    expect(legacyStaffCreate).not.toContain("canManageScheduling");
  });

  it("uses one availability engine for portal validation and slot discovery", () => {
    expect(publicAvailability).toContain("getSchedulingAvailability");
    expect(publicAvailability).not.toContain('.from("bookings")');
    expect(availability).toContain("scheduler_availability_snapshot");
    expect(availability).toContain("availableResourceIds");
    expect(validation).toContain("validateSchedulingSlot");
    expect(createBooking).toContain("validateSchedulingSlot");
    expect(hardening).toContain("created_actor_mode");
  });

  it("preserves old callers while removing old scheduling semantics", () => {
    expect(legacyStaffCreate).toContain("legacyStaffOperationKey");
    expect(staffBooking).toContain(
      'action: "reschedule" | "cancel" | "confirm" | "complete"',
    );
    expect(shopAssistantScheduling).toContain(
      "shop_assistant_reschedule_booking_atomic",
    );
    expect(cutover).toContain(
      "create or replace function public.shop_assistant_reschedule_booking_atomic",
    );
    expect(cutover).toContain(
      "v_scheduler := public.scheduler_apply_booking_command_atomic",
    );
  });

  it("exposes canonical resource, event, assignment, and availability APIs", () => {
    expect(resourceRoute).toContain("scheduler_list_resources");
    expect(resourceRoute).toContain("scheduler_upsert_resource");
    expect(eventsRoute).toContain("scheduler_list_events");
    expect(assignResourceRoute).toContain(
      "scheduler_assign_event_resource_atomic",
    );
    expect(security).toContain("scheduler_assign_event_resource_atomic");
    expect(read("app/api/scheduling/availability/route.ts")).toContain(
      "getSchedulingAvailability",
    );
  });

  it("keeps scheduling records shop-scoped and actor-bound", () => {
    expect(cutover).toContain(
      "alter table public.scheduling_resources enable row level security",
    );
    expect(cutover).toContain(
      "alter table public.scheduling_events enable row level security",
    );
    expect(cutover).toContain(
      "alter table public.scheduling_reservations enable row level security",
    );
    expect(cutover).toContain("grant select on public.scheduling_resources");
    expect(cutover).toContain("scheduler_same_shop");
    expect(security).toContain("scheduler_actor_matches");
    expect(security).toContain(
      "Scheduling actor does not match the authenticated caller.",
    );
  });
});
