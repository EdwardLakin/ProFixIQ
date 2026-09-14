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

  it("is readable by operations-facing staff roles, unlike the shadow-mode blocker table", () => {
    expect(migration).toContain("grant select on table public.appointment_preparations to authenticated");
    expect(migration).toContain("create policy appointment_preparations_staff_read");
    expect(migration).toContain("public.is_shop_member_v2(shop_id)");
    expect(migration).toContain("public.profixiq_current_role() in (");
  });

  it("still restricts writes to the service role", () => {
    expect(migration).toContain(
      "revoke all on table public.appointment_preparations from anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.appointment_preparations to service_role",
    );
  });

  it("resolves rather than deletes a preparation whose booking is no longer upcoming", () => {
    expect(migration).toContain(
      "appointment_preparations_resolved_requires_timestamp_chk",
    );
    expect(syncModule).toContain('status: "resolved"');
    expect(syncModule).not.toMatch(/\.delete\(\)/);
  });

  it("reuses the existing deferred/declined history logic instead of re-implementing it", () => {
    expect(buildModule).toContain("loadDeferredWorkHistoryForVehicle(");
    expect(deferredHistoryRoute).toContain("loadDeferredWorkHistoryForVehicle(");
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

  it("is surfaced inside ProFix Operations (the shop-assistant dashboard), not a standalone page", () => {
    expect(dashboard).toContain("AppointmentPreparationList");
    expect(dashboard).toContain("useAppointmentPreparations");
  });
});
