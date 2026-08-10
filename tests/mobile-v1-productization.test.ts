import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260810225000_mobile_v1_productization.sql",
);
const hardeningMigration = read(
  "supabase/migrations/20260810225100_mobile_v1_dispatch_followup_hardening.sql",
);
const shell = read("features/mobile/service/MobileServiceShell.tsx");
const replay = read("features/shared/lib/offline/replay.ts");
const intakeApi = read("app/api/mobile/service/intake/route.ts");
const intakeUi = read("features/mobile/service/RapidServiceIntake.tsx");
const setupUi = read("features/mobile/service/MobileServiceSetup.tsx");
const closeoutApi = read(
  "app/api/mobile/service/closeout/[workOrderId]/route.ts",
);
const closeoutUi = read("features/mobile/service/MobileServiceCloseout.tsx");
const followupApi = read("app/api/mobile/service/followups/route.ts");
const followupUi = read("features/mobile/service/MobileServiceFollowup.tsx");
const followupQueue = read(
  "features/mobile/service/MobileServiceFollowupQueue.tsx",
);
const access = read("features/mobile/service/server/access.ts");
const tiles = read("features/mobile/config/mobile-tiles.ts");

describe("Mobile V1 productization", () => {
  it("keeps the canonical role intact while adding explicit field execution capability", () => {
    expect(migration).toContain(
      "create table if not exists public.mobile_field_operators",
    );
    expect(migration).toContain("public.mobile_is_field_operator");
    expect(migration).toContain("sync_mobile_field_operator_resource");
    expect(migration).toContain("public.dispatch_can_execute");
    expect(migration).not.toContain("update public.profiles\n  set role");
    expect(setupUi).toContain("I perform field work");
    expect(setupUi).toContain("your owner/admin role does not change");
    expect(tiles).toContain('roles: ["mechanic", "lead_hand", "foreman"]');
    expect(tiles).toContain('roles: ["owner", "admin"]');
  });

  it("uses one rapid intake to create canonical customer, vehicle, booking and visit records", () => {
    expect(intakeApi).toContain("mobile_create_service_call_atomic");
    expect(migration).toContain("insert into public.customers");
    expect(migration).toContain("insert into public.vehicles");
    expect(migration).toContain("insert into public.bookings");
    expect(migration).toContain("'service_mode', 'mobile'");
    expect(migration).toContain("'quoted_price', p_quoted_price");
    expect(migration).not.toContain("insert into public.work_orders(");
    expect(intakeUi).toContain(
      "Capture the conversation, not a work-order form.",
    );
    expect(intakeUi).toContain("Save call · ETA");
    for (const field of [
      "customerName",
      "phone",
      "vehicle",
      "address",
      "concern",
      "etaMinutes",
      "quotedPrice",
    ]) {
      expect(intakeUi).toContain(field);
    }
  });

  it("configures solo/mobile/both operation, team dispatch, and canonical truck inventory", () => {
    expect(migration).toContain(
      "create table if not exists public.mobile_service_settings",
    );
    expect(migration).toContain("service_model in ('shop','mobile','both')");
    expect(migration).toContain("insert into public.stock_locations");
    expect(migration).toContain("insert into public.service_vehicles");
    expect(setupUi).toContain("Customers come to us");
    expect(setupUi).toContain("We go to customers");
    expect(setupUi).toContain("Both");
    expect(setupUi).toContain("Solo operator");
    expect(setupUi).toContain("Truck carries inventory");
    expect(setupUi).toContain("Use dispatch/team assignment");
    expect(setupUi).toContain("dispatchEnabled: soloMode ? false : dispatchEnabled");
    expect(hardeningMigration).toContain("v_auto_assign boolean := false");
    expect(hardeningMigration).toContain(
      "coalesce(ms.solo_mode, false) or not coalesce(ms.dispatch_enabled, true)",
    );
    expect(hardeningMigration).toContain("when v_auto_assign then v_profile.id");
  });

  it("queues ordered field transitions offline and rejects stale state at replay", () => {
    expect(shell).toContain("runMutationWithOfflineQueue");
    expect(shell).toContain('actionType: "service-visit:transition"');
    expect(shell).toContain('orderKey: `service-visit:${visit.id}`');
    expect(shell).toContain("dependsOn");
    expect(shell).toContain("Field status changes are queued in order");
    expect(replay).toContain('"service-visit:transition"');
    expect(replay).toContain(
      "/api/mobile/service-visits/${visitId}/transition",
    );
    expect(migration).toContain(
      "mobile_replay_service_visit_transition_atomic",
    );
    expect(migration).toContain("SERVICE_VISIT_STATE_CHANGED");
    expect(migration).toContain("v_visit.status <> lower(p_from_status)");
  });

  it("keeps field payment on the existing invoice, Stripe and payment-ledger contracts", () => {
    expect(closeoutUi).toContain("Invoice → payment → receipt → gone.");
    expect(closeoutUi).toContain('fetch("/api/invoices/finalize"');
    expect(closeoutUi).toContain("<RecordManualPayment");
    expect(closeoutApi).toContain("createConnectedAccountInvoiceCheckout");
    expect(closeoutApi).toContain('source: "staff_invoice_payment"');
    expect(closeoutApi).toContain("payment_receipts");
    expect(access).toContain("canFieldOperatorAccessWorkOrder");
    expect(access).toContain('.eq("assigned_user_id", access.profile.id)');
  });

  it("captures future work off today's invoice and keeps it actionable", () => {
    expect(migration).toContain(
      "create table if not exists public.mobile_service_followups",
    );
    expect(migration).toContain("mobile_create_service_followup_atomic");
    expect(hardeningMigration).toContain(
      "mobile_service_followups_scoped_select",
    );
    expect(followupUi).toContain("Keeps it off today's invoice.");
    expect(followupUi).toContain("Quote later");
    expect(followupUi).toContain("Contact later");
    expect(followupUi).toContain("Monitor");
    expect(followupUi).toContain(
      "The current repair and invoice are unchanged.",
    );
    expect(followupApi).toContain('.eq("status", "open")');
    expect(followupQueue).toContain("Opportunities captured in the field");
    expect(tiles).toContain('href: "/mobile/service/followups"');
  });

  it("ships every Mobile V1 route used by the field flow", () => {
    for (const path of [
      "app/mobile/service/new/page.tsx",
      "app/mobile/service/setup/page.tsx",
      "app/mobile/service/followups/page.tsx",
      "app/mobile/service/followup/[workOrderId]/page.tsx",
      "app/mobile/service/closeout/[workOrderId]/page.tsx",
      "app/api/mobile/service/intake/route.ts",
      "app/api/mobile/service/settings/route.ts",
      "app/api/mobile/service/followups/route.ts",
      "app/api/mobile/service-visits/[id]/transition/route.ts",
      "app/api/mobile/service/closeout/[workOrderId]/route.ts",
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });
});
