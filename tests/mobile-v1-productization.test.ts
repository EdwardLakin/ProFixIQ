import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260810225000_mobile_v1_productization.sql",
);
const hardeningMigration = read(
  "supabase/migrations/20260810225100_mobile_v1_dispatch_followup_hardening.sql",
);
const codexHardening = read(
  "supabase/migrations/20260811020000_mobile_v1_codex_review_hardening.sql",
);
const identityHardening = read(
  "supabase/migrations/20260811020100_mobile_v1_rapid_intake_identity_hardening.sql",
);
const secondReviewHardening = read(
  "supabase/migrations/20260811020300_mobile_v1_second_codex_review_hardening.sql",
);
const shell = read("features/mobile/service/MobileServiceShell.tsx");
const mutations = read("features/shared/lib/offline/mutations.ts");
const replay = read("features/shared/lib/offline/replay.ts");
const transitionApi = read(
  "app/api/mobile/service-visits/[id]/transition/route.ts",
);
const intakeApi = read("app/api/mobile/service/intake/route.ts");
const settingsApi = read("app/api/mobile/service/settings/route.ts");
const intakeUi = read("features/mobile/service/RapidServiceIntake.tsx");
const handoffUi = read("features/mobile/service/MobileServiceCallHandoff.tsx");
const workOrderHandoffApi = read(
  "app/api/mobile/service-visits/[id]/work-order/route.ts",
);
const setupUi = read("features/mobile/service/MobileServiceSetup.tsx");
const closeoutApi = read(
  "app/api/mobile/service/closeout/[workOrderId]/route.ts",
);
const closeoutUi = read("features/mobile/service/MobileServiceCloseout.tsx");
const manualPayment = read(
  "features/invoices/components/RecordManualPayment.tsx",
);
const followupApi = read("app/api/mobile/service/followups/route.ts");
const followupStatusApi = read("app/api/mobile/service/followups/[id]/route.ts");
const followupUi = read("features/mobile/service/MobileServiceFollowup.tsx");
const followupQueue = read(
  "features/mobile/service/MobileServiceFollowupQueue.tsx",
);
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const mobileNav = read("components/layout/MobileBottomNav.tsx");
const access = read("features/mobile/service/server/access.ts");
const tiles = read("features/mobile/config/mobile-tiles.ts");

describe("Mobile V1 productization", () => {
  it("keeps canonical roles intact while making explicit field operators schedulable and discoverable through verified access", () => {
    expect(migration).toContain(
      "create table if not exists public.mobile_field_operators",
    );
    expect(migration).toContain("public.mobile_is_field_operator");
    expect(migration).not.toContain("update public.profiles\n  set role");
    expect(codexHardening).toContain("mobile_dispatch_profile_eligible");
    expect(codexHardening).toContain(
      "or public.mobile_is_field_operator(p_shop_id, p.id)",
    );
    expect(codexHardening).toContain(
      "create or replace function public.dispatch_board_snapshot",
    );
    expect(codexHardening).toContain("'fieldOperator'");
    expect(codexHardening).toContain(
      "if tg_op = 'DELETE' then return old; end if;",
    );
    expect(setupUi).toContain("I perform field work");
    expect(setupUi).toContain("your owner/admin role does not change");
    expect(tiles).toContain('href: "/mobile/service"');
    expect(tiles).toContain("roles: ALL_MOBILE_ROLES");
    expect(tiles.match(/href: "\/mobile\/service"/g)).toHaveLength(1);
    expect(mobileNav).toContain("fieldAccess?.canAccessFieldService");
    expect(mobileNav).toContain("fieldAccess?.canConfigure");
    expect(mobileNav).toContain(
      'tile.href !== "/mobile/service" || fieldServiceHref',
    );
  });

  it("uses rapid intake without unsafe identity, locale, or service-mode inference", () => {
    expect(intakeApi).toContain("mobile_create_service_call_atomic");
    expect(migration).toContain("insert into public.customers");
    expect(migration).toContain("insert into public.vehicles");
    expect(migration).toContain("insert into public.bookings");
    expect(migration).not.toContain("insert into public.work_orders(");
    expect(identityHardening).toContain(
      "Phone is the only implicit customer identity",
    );
    expect(identityHardening).not.toContain(
      "lower(trim(coalesce(c.name, ''))) = lower(trim(p_customer_name))",
    );
    expect(identityHardening).toContain("VEHICLE_PLATE_OWNERSHIP_CONFLICT");
    expect(identityHardening).toContain(
      "select lower(trim(coalesce(s.country, 'US'))) into v_shop_country",
    );
    expect(identityHardening).toContain("v_currency := 'USD'");
    expect(identityHardening).toContain("v_country_code := 'CA'");
    expect(secondReviewHardening).toContain("v_config_model = 'both'");
    expect(secondReviewHardening).toContain("v_mode := v_config_model");
    expect(secondReviewHardening).toContain("'service_mode', v_mode");
    expect(secondReviewHardening).toContain("'shop', 'scheduled'");
    expect(intakeApi).toContain('p_currency: ""');
    expect(intakeApi).toContain("p_service_mode: body.serviceMode ?? null");
    expect(intakeApi).not.toContain('|| "CAD"');
    expect(intakeUi).toContain(
      "Capture the conversation, not a work-order form.",
    );
    expect(intakeUi).toContain("configuredServiceModel");
    expect(intakeUi).toContain("We go there");
    expect(intakeUi).toContain("Customer comes here");
    expect(intakeUi).toContain('serviceMode === "shop" || address.trim().length > 0');
    expect(intakeUi).toContain("Save call · ETA");
    expect(intakeUi).toContain("/mobile/service/call/");
  });

  it("provides an explicit booking-to-work-order handoff before repair for canonical work-order creators", () => {
    expect(codexHardening).toContain(
      "mobile_materialize_service_visit_work_order_atomic",
    );
    expect(secondReviewHardening).toContain("mobile_can_manage_work_orders");
    expect(secondReviewHardening).toContain(
      "'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'",
    );
    expect(codexHardening).toContain("update public.bookings");
    expect(workOrderHandoffApi).toContain(
      "mobile_materialize_service_visit_work_order_atomic",
    );
    expect(handoffUi).toContain("Service call saved");
    expect(handoffUi).toContain("Start repair");
    expect(shell).toContain("Create work order & start repair");
  });

  it("configures solo/mobile/both operation without adopting unrelated service vehicles", () => {
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
    expect(hardeningMigration).toContain("v_auto_assign boolean := false");
    expect(codexHardening).toContain("mobile_normalize_service_settings");
    expect(codexHardening).toContain(
      "mobile_reconcile_service_vehicle_setting",
    );
    expect(secondReviewHardening).toContain(
      "coalesce(sv.capabilities, '{}'::jsonb) @> '{\"mobile_v1\":true}'::jsonb",
    );
    expect(settingsApi).toContain('.contains("capabilities", { mobile_v1: true })');
  });

  it("chains every queued field transition and rejects stale ABA replay by version", () => {
    expect(shell).toContain("runMutationWithOfflineQueue");
    expect(shell).toContain('actionType: "service-visit:transition"');
    expect(shell).toContain('orderKey: `service-visit:${visit.id}`');
    expect(shell).toContain("hydrateOfflineMutationQueue");
    expect(shell).toContain("listPendingMutations");
    expect(shell).toContain("expectedVersion: Number(visit.version ?? 0)");
    expect(mutations).toContain("const dependencyPending");
    expect(mutations).toContain('dependency.status !== "synced"');
    expect(replay).toContain('"service-visit:transition"');
    expect(replay).toContain("expectedVersion");
    expect(transitionApi).toContain("p_expected_version: expectedVersion");
    expect(codexHardening).toContain("SERVICE_VISIT_VERSION_CHANGED");
    expect(codexHardening).toContain("v_visit.version <> p_expected_version");
  });

  it("resumes queued completion into closeout and keeps the payment sheet inside a phone viewport", () => {
    expect(shell).toContain("PENDING_CLOSEOUT_CACHE_KEY");
    expect(shell).toContain(
      "pendingCloseoutKey(boundScope.userId, boundScope.shopId)",
    );
    expect(shell).toContain("resumePendingCloseout");
    expect(shell).toContain("mutationId: result.mutationId");
    expect(shell).toContain("Visit completion is saved offline");
    expect(shell).toContain("/mobile/service/closeout/");
    expect(closeoutUi).toContain("Invoice → payment → receipt → gone.");
    expect(closeoutUi).toContain('fetch("/api/invoices/finalize"');
    expect(closeoutUi).toContain("mobileViewportSafe");
    expect(manualPayment).toContain("mobileViewportSafe?: boolean");
    expect(manualPayment).toContain("fixed inset-x-3 bottom-");
    expect(manualPayment).toContain("100dvh");
    expect(closeoutApi).toContain("createConnectedAccountInvoiceCheckout");
    expect(closeoutApi).toContain('purpose: "staff_invoice_payment"');
    expect(closeoutApi).toContain("payment_receipts");
    expect(access).toContain("canFieldOperatorAccessWorkOrder");
    expect(access).toContain('.eq("assigned_user_id", access.profile.id)');
  });

  it("keeps field recommendations assigned-scoped while service staff can action the canonical follow-up lifecycle inside Field", () => {
    expect(migration).toContain(
      "create table if not exists public.mobile_service_followups",
    );
    expect(hardeningMigration).toContain(
      "mobile_service_followups_scoped_select",
    );
    expect(codexHardening).toContain("mobile_guard_service_followup_insert");
    expect(secondReviewHardening).toContain("mobile_can_manage_followups");
    expect(secondReviewHardening).toContain(
      "Converted work order must match the follow-up customer and vehicle.",
    );
    expect(followupUi).toContain("Keeps it off today's invoice.");
    expect(followupApi).toContain('.eq("status", "open")');
    expect(followupStatusApi).toContain(
      "mobile_update_service_followup_status_atomic",
    );
    expect(followupQueue).toContain('updateStatus(item, "quoted")');
    expect(followupQueue).toContain('updateStatus(item, "dismissed")');
    expect(followupQueue).toContain("Opportunities captured in the field");
    expect(fieldShell).toContain('label: "Follow-ups"');
    expect(fieldShell).toContain('href: "/mobile/service/followups"');
    expect(tiles).not.toContain('href: "/mobile/service/followups"');
  });

  it("ships every Mobile V1 route used by the field flow", () => {
    for (const path of [
      "app/mobile/service/new/page.tsx",
      "app/mobile/service/setup/page.tsx",
      "app/mobile/service/followups/page.tsx",
      "app/mobile/service/followup/[workOrderId]/page.tsx",
      "app/mobile/service/call/[visitId]/page.tsx",
      "app/mobile/service/closeout/[workOrderId]/page.tsx",
      "app/api/mobile/service/intake/route.ts",
      "app/api/mobile/service/settings/route.ts",
      "app/api/mobile/service/followups/route.ts",
      "app/api/mobile/service/followups/[id]/route.ts",
      "app/api/mobile/service-visits/[id]/transition/route.ts",
      "app/api/mobile/service-visits/[id]/work-order/route.ts",
      "app/api/mobile/service/closeout/[workOrderId]/route.ts",
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });
});
