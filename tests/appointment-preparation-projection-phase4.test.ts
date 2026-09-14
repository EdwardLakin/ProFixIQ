import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationFile = readdirSync("supabase/migrations").find((name) =>
  name.endsWith("_appointment_preparations.sql"),
);
if (!migrationFile) {
  throw new Error("appointment_preparations migration not found");
}
const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8");
const syncModule = readFileSync(
  "features/operations/server/syncAppointmentPreparations.ts",
  "utf8",
);
const buildModule = readFileSync(
  "features/operations/server/appointmentPreparation/buildAppointmentPreparations.ts",
  "utf8",
);
const cronRoute = readFileSync(
  "app/api/internal/appointment-preparations/route.ts",
  "utf8",
);
const readRoute = readFileSync(
  "app/api/shop-assistant/appointment-preparations/route.ts",
  "utf8",
);
const deferredHistoryRoute = readFileSync(
  "app/api/work-orders/deferred-history/route.ts",
  "utf8",
);
const dashboard = readFileSync(
  "features/shop-assistant/components/ShopAssistantDashboard.tsx",
  "utf8",
);
const vercelConfig = readFileSync("vercel.json", "utf8");

describe("Phase 4 — appointment preparation projection", () => {
  it("is a dedicated table scoped to shop, booking, vehicle and customer", () => {
    expect(migration).toContain(
      "create table if not exists public.appointment_preparations",
    );
    expect(migration).toContain(
      "references public.bookings(id) on delete cascade",
    );
    expect(migration).toContain("unique (booking_id)");
  });

  it("is not directly readable by any application role, so pricing redaction cannot be bypassed", () => {
    // Staff-facing pricing redaction (canViewSellPricing) lives in the read
    // route, not in RLS. If the table itself granted authenticated select,
    // a caller could query it directly and see unredacted deferred/menu
    // pricing regardless of their own financial access. So — like Phase 3's
    // shadow-mode blocker table — this one grants nothing to authenticated
    // at all; the read route is the only staff-facing path to it.
    expect(migration).not.toMatch(/grant select .* to authenticated/);
    expect(migration).not.toMatch(/create policy/);
    expect(migration).toContain(
      "revoke all on table public.appointment_preparations from anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.appointment_preparations to service_role",
    );
  });

  it("indexes the nullable vehicle/customer foreign keys", () => {
    expect(migration).toContain(
      "create index if not exists appointment_preparations_vehicle_idx",
    );
    expect(migration).toContain(
      "create index if not exists appointment_preparations_customer_idx",
    );
  });

  it("resolves rather than deletes a preparation whose booking is no longer upcoming", () => {
    expect(migration).toContain(
      "appointment_preparations_resolved_requires_timestamp_chk",
    );
    expect(syncModule).toContain('status: "resolved"');
    expect(syncModule).not.toMatch(/\.delete\(\)/);
  });

  it("excludes a booking already converted to a work order, not just cancelled/completed ones", () => {
    expect(syncModule).toContain("work_order_id");
    expect(syncModule).toContain("if (row.work_order_id) return false;");
  });

  it("pages through the full booking window instead of a single Data-API-capped read", () => {
    expect(syncModule).toContain("BOOKING_PAGE_SIZE");
    expect(syncModule).toMatch(/for \(let from = 0;.*range\(from, from \+ BOOKING_PAGE_SIZE/s);
  });

  it("uses the deferred/declined history logic without touching the pre-existing route's contract", () => {
    expect(buildModule).toContain("loadDeferredWorkHistoryForVehicle(");
    // The additive-first change control in AGENTS.md requires a shared
    // refactor of the pre-existing deferred-history route to land as its
    // own compatible-integration PR, not be bundled inside this feature —
    // so the route keeps its own original, untouched implementation for now.
    expect(deferredHistoryRoute).not.toContain("loadDeferredWorkHistoryForVehicle");
    expect(deferredHistoryRoute).toContain("async function loadVehicleQuoteHistory(");
  });

  it("reuses the existing menu-repair-item matcher instead of a new fuzzy-matching heuristic", () => {
    expect(buildModule).toContain("findMenuRepairItemForWorkOrderLine(");
  });

  it("never creates repair findings, approvals, orders, or punchable work", () => {
    for (const source of [syncModule, buildModule, cronRoute]) {
      expect(source).not.toMatch(
        /\.from\(\s*["'](work_order_lines|part_requests|purchase_orders|approvals)["']\)\s*\.\s*(insert|update|upsert|delete)/,
      );
    }
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(cronRoute).toContain("requireInternalApiSecret");
    expect(cronRoute).toContain("INTERNAL_CRON_SECRET");
    expect(cronRoute).toContain("CRON_SECRET");
  });

  it("is scheduled hourly, offset from the other internal observability crons", () => {
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/appointment-preparations",\s*\n\s*"schedule":\s*"52 \* \* \* \*"/,
    );
  });

  it("the staff-facing read route redacts pricing for roles without sell-pricing access, like deferred history already does", () => {
    expect(readRoute).toContain("canViewSellPricing");
    expect(readRoute).toContain("redactDeferredItemPricing");
  });

  it("the read route queries with the service-role client, not the RLS-scoped one the table denies", () => {
    expect(readRoute).toContain("createAdminSupabase()");
    expect(readRoute).toContain('.eq("shop_id", access.profile.shop_id)');
  });

  it("is surfaced inside ProFix Operations (the shop-assistant dashboard), not a standalone page", () => {
    expect(dashboard).toContain("AppointmentPreparationList");
    expect(dashboard).toContain("useAppointmentPreparations");
  });
});
