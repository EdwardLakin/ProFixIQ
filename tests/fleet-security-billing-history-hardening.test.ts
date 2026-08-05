import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260805185619_fleet_security_billing_history_hardening.sql",
);
const customerIndexMigration = read(
  "supabase/migrations/20260805200003_index_fleet_customer_account.sql",
);

describe("Fleet security, billing, and history hardening", () => {
  it("binds portal mutations to authenticated actors", () => {
    expect(migration).toContain("apply_portal_quote_decision_atomic");
    expect(migration).toContain("v_actor_user_id uuid := auth.uid()");
    expect(migration).toContain("f.customer_id = v_work_order.customer_id");
    expect(migration).toContain("fm.user_id = v_actor_user_id");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("links Fleet requests to a canonical same-shop customer", () => {
    const fleetPrograms = read("app/fleet/programs/page.tsx");

    expect(migration).toContain("add column if not exists customer_id uuid");
    expect(migration).toContain("ensure_fleet_customer_account_trigger");
    expect(migration).toContain("c.shop_id = new.shop_id");
    expect(migration).toContain("alter column customer_id set not null");
    expect(migration).toContain("v_fleet.customer_id");
    expect(migration).toContain(
      "p.role in ('owner', 'admin', 'manager', 'advisor')",
    );
    expect(migration).toContain(
      "Structured request lines must match the request scope",
    );
    expect(customerIndexMigration).toContain("on public.fleets (customer_id)");
    expect(fleetPrograms).toContain(
      'type FleetCreateInsert = Omit<FleetInsert, "customer_id">',
    );
    expect(fleetPrograms).toContain(".insert(insertPayload as FleetInsert)");
  });

  it("requires assigned drivers and derives their identity from the profile", () => {
    const route = read("app/api/fleet/pretrip/route.ts");
    const page = read("app/portal/fleet/pretrip/[unitId]/page.tsx");
    const form = read("features/fleet/components/PretripForm.tsx");

    expect(route).toContain('.from("fleet_dispatch_assignments")');
    expect(route).toContain('.eq("driver_profile_id", actor.userId)');
    expect(route).toContain(
      "profile.full_name?.trim() || profile.email?.trim()",
    );
    expect(page).toContain("(!actor.isInternal && !assignment)");
    expect(form).toContain("readOnly");
    expect(form).toContain('aria-readonly="true"');
    expect(form).not.toContain("driverName,");
  });

  it("keeps shop navigation separate and bases history on finalized invoices", () => {
    const layout = read("app/fleet/layout.tsx");
    const tiles = read("features/shared/config/tiles.ts");
    const history = read("app/api/fleet/units/[unitId]/workspace/route.ts");

    expect(layout).toContain("if (!actor.isInternal)");
    expect(layout).toContain('"/portal/fleet"');
    expect(tiles).toContain('roles: ["owner", "admin", "manager", "advisor"]');
    expect(history).toContain('.from("invoice_versions")');
    expect(history).toContain('"issued", "partially_paid", "paid"');
    expect(history).toContain(
      "completedAt: isTerminal ? iso(row.updated_at) : null",
    );
    expect(history).not.toContain("completedAt: iso(row.paid_at)");
  });
});
