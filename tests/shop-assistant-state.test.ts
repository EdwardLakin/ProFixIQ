import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stateBuilder = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);
const stateCache = readFileSync(
  "features/shop-assistant/server/state/shopStateCache.ts",
  "utf8",
);
const stateDatabase = readFileSync(
  "features/shop-assistant/server/state/database.ts",
  "utf8",
);
const stateTypes = readFileSync(
  "features/shop-assistant/server/state/types.ts",
  "utf8",
);
const snapshotDatabaseTypes = readFileSync(
  "shared/types/types/supabase-shop-assistant.ts",
  "utf8",
);
const snapshotMigration = readFileSync(
  "supabase/migrations/20260721190000_shop_assistant_state_snapshots.sql",
  "utf8",
);
const stateRoute = readFileSync(
  "app/api/shop-assistant/state/route.ts",
  "utf8",
);
const stateHook = readFileSync(
  "features/shop-assistant/hooks/useShopAssistantState.ts",
  "utf8",
);
const dashboard = readFileSync(
  "features/shop-assistant/components/ShopAssistantDashboard.tsx",
  "utf8",
);
const alertList = readFileSync(
  "features/shop-assistant/components/ShopAlertList.tsx",
  "utf8",
);
const suggestionList = readFileSync(
  "features/shop-assistant/components/ShopSuggestionList.tsx",
  "utf8",
);
const mobileContinuity = readFileSync(
  "features/mobile/navigation/mobile-route-continuity.ts",
  "utf8",
);
const mobilePage = readFileSync("app/mobile/assistant/page.tsx", "utf8");
const desktopPage = readFileSync("app/assistant/page.tsx", "utf8");

describe("shop assistant live state contracts", () => {
  it("builds the required shop-wide metrics without an LLM", () => {
    expect(stateBuilder).toContain("openWorkOrders");
    expect(stateBuilder).toContain("stalledWorkOrders");
    expect(stateBuilder).toContain("overdueApprovals");
    expect(stateBuilder).toContain("delayedParts");
    expect(stateBuilder).toContain("idleTechnicians");
    expect(stateBuilder).toContain("readyToInvoice");
    expect(stateBuilder).toContain("todaysBookings");
    expect(stateBuilder).not.toContain("getOpenAIClient");
  });

  it("maps proactive alerts for stalled work, approvals, parts, idle capacity, and invoices", () => {
    expect(stateBuilder).toContain("work_order_waiting_too_long");
    expect(stateBuilder).toContain("work_order_on_hold_too_long");
    expect(stateBuilder).toContain("approval_waiting");
    expect(stateBuilder).toContain("parts_delivery_overdue");
    expect(stateBuilder).toContain("technician_idle");
    expect(stateBuilder).toContain("invoice_ready");
    expect(stateBuilder).toContain("dedupeAlerts");
  });

  it("gates suggestions and service-role alerts through canonical actor capabilities", () => {
    expect(stateBuilder).toContain("capabilities.canAuthorizeQuotes");
    expect(stateBuilder).toContain("capabilities.canManageParts");
    expect(stateBuilder).toContain("capabilities.canAssignWork");
    expect(stateBuilder).toContain("capabilities.canManageBilling");
    expect(stateBuilder).toContain("capabilities.canManageScheduling");
    expect(stateBuilder).toContain("FINANCIAL_ALERT_CODES");
    expect(stateBuilder).toContain("WORK_ORDER_ALERT_CODES");
    expect(stateBuilder).toContain("WORKFORCE_ALERT_CODES");
    expect(stateBuilder).toContain("SHOP_AGGREGATE_ALERT_CODES");
    expect(stateBuilder).toContain("optimization_pricing_normalization");
    expect(stateBuilder).toContain("optimization_missed_revenue");
    expect(stateBuilder).toContain("capabilities.canViewFinancials");
    expect(stateBuilder).toContain("notificationVisibleToActor");
    expect(stateBuilder).toContain("return capabilities.canViewShopWideData");
  });

  it("serves server-owned cached state through an authenticated no-store route", () => {
    expect(stateRoute).toContain("requireShopAssistantActor");
    expect(stateRoute).toContain("getOrRefreshShopState");
    expect(stateCache).toContain("buildShopState");
    expect(stateTypes).toContain("SHOP_ASSISTANT_STATE_TTL_MS = 90_000");
    expect(stateCache).toContain(
      "const DEFAULT_TTL_MS = SHOP_ASSISTANT_STATE_TTL_MS",
    );
    expect(stateCache).toContain("roleMatches");
    expect(stateCache).toContain("createShopAssistantStateAdminClient");
    expect(snapshotMigration).toContain(
      "revoke insert, update, delete",
    );
    expect(snapshotMigration).toContain("to service_role");
    expect(stateRoute).toContain('"cache-control": "private, no-store, max-age=0"');
  });

  it("keeps snapshot storage and invalidation fully typed", () => {
    expect(snapshotDatabaseTypes).toContain("ShopAssistantStateSnapshotsTable");
    expect(snapshotDatabaseTypes).toContain("shop_assistant_state_snapshots");
    expect(snapshotDatabaseTypes).toContain(
      "invalidate_shop_assistant_state_snapshots",
    );
    expect(stateDatabase).toContain("createClient<ShopAssistantDatabase>");
    expect(stateCache).toContain("ShopAssistantStateSnapshotRow");
    expect(stateCache).toContain("import type { Json }");
    expect(stateCache).not.toContain("SupabaseClient<any>");
    expect(stateCache).not.toContain("as unknown as AssistantDb");
  });

  it("bounds stale fallback and never reuses an invalidated projection", () => {
    expect(stateTypes).toContain("SHOP_ASSISTANT_MAX_STALE_MS");
    expect(stateCache).toContain("canUseStaleFallback");
    expect(stateCache).toContain("nowMs - expiresAtMs <= SHOP_ASSISTANT_MAX_STALE_MS");
    expect(stateCache).toContain("!existing?.invalidated_at");
    expect(stateCache).toContain("if (canUseStaleFallback && existingState)");
  });

  it("invalidates every actor snapshot after a successful shop mutation", () => {
    expect(stateCache).toContain("invalidate_shop_assistant_state_snapshots");
    expect(snapshotMigration).toContain(
      "function public.invalidate_shop_assistant_state_snapshots",
    );
    expect(snapshotMigration).toContain("security definer");
    expect(snapshotMigration).toContain("where shop_id = p_shop_id");
    expect(snapshotMigration).toContain("p_actor_user_id");
  });

  it("refreshes while visible instead of appending duplicate dashboard cards", () => {
    expect(stateHook).toContain("REFRESH_INTERVAL_MS");
    expect(stateHook).toContain("document.visibilityState");
    expect(stateHook).toContain("setState(payload.state)");
    expect(stateHook).not.toContain("setState((current) => [");
  });

  it("loads the live dashboard before a prompt on desktop and mobile", () => {
    expect(dashboard).toContain("ShopStateMetricGrid");
    expect(dashboard).toContain("ShopAlertList");
    expect(dashboard).toContain("ShopSuggestionList");
    expect(desktopPage).toContain("<ShopAssistantDashboard");
    expect(mobilePage).toContain("<ShopAssistantDashboard");
  });

  it("keeps alert and suggestion navigation on mobile-native routes", () => {
    expect(alertList).toContain("resolveMobileHref");
    expect(alertList).toContain('pathname.startsWith("/mobile")');
    expect(suggestionList).toContain("resolveMobileHref");
    expect(mobileContinuity).toContain('pathname.startsWith("/quote-review")');
    expect(mobileContinuity).toContain('pathname.startsWith("/billing")');
  });
});
